namespace CloudFactory.ProductionScheduling;

using Microsoft.Manufacturing.Capacity;
using Microsoft.Manufacturing.Document;

codeunit 91310 CF_DraftFiniteSlots
{
    procedure Initialize(Draft: Record CF_ScheduleDraftOperation; ScenarioCode: Code[20]; FirstDate: Date; LastDate: Date; Finite: Boolean; Excluded: List of [Guid])
    var
        Need: Record "Prod. Order Capacity Need";
        Allocation: Record CF_ScheduleDraftAllocation;
        Capacity: Codeunit CF_SchedulerCapacity;
        StartValue: DateTime;
        EndValue: DateTime;
        Units: Decimal;
    begin
        TempEvents.Reset();
        TempEvents.DeleteAll();
        Selected := Draft;
        UseFinite := Finite;
        SweepTime := 0DT;
        ResourceLoad := 0;
        Clear(ParentLoads);
        Clear(ParentAvailability);
        if not Finite then
            exit;
        Capacity.SetCommittedFilter(Need);
        Need.SetRange("Work Center No.", Draft.WorkCenterNo);
        Need.SetRange(Date, FirstDate, LastDate);
        Need.SetFilter("Allocated Time", '>0');
        if Need.FindSet() then
            repeat
                Guard();
                if not OverlayDrafts.ReplacesNeed(ScenarioCode, Need) then begin
                    StartValue := CreateDateTime(Need.Date, Need."Starting Time");
                    EndValue := OverlayDrafts.IntervalEnd(Need.Date, Need."Starting Time", Need."Ending Time");
                    Units := 0;
                    if (Need.Type = Draft.ResourceType) and (Need."No." = Draft.ResourceNo) then begin
                        Units := Need."Concurrent Capacities";
                        if Units <= 0 then
                            Units := Occupation(Need.Type, Need."No.", StartValue, EndValue,
                                Capacity.Minutes(Need."Allocated Time", Need."Work Center No."));
                    end;
                    AddInterval(StartValue, EndValue, Units, Capacity.Minutes(Need."Allocated Time", Need."Work Center No."));
                end;
            until Need.Next() = 0;
        Allocation.SetRange(ScenarioCode, ScenarioCode);
        Allocation.SetRange(WorkCenterNo, Draft.WorkCenterNo);
        Allocation.SetRange(CapacityDate, FirstDate, LastDate);
        Allocation.SetRange(Status, Allocation.Status::Planned, Allocation.Status::Released);
        if Allocation.FindSet() then
            repeat
                Guard();
                if not Excluded.Contains(Allocation.OperationId) then begin
                    Units := 0;
                    if (Allocation.ResourceType = Draft.ResourceType) and (Allocation.ResourceNo = Draft.ResourceNo) then
                        Units := Occupation(Allocation.ResourceType, Allocation.ResourceNo,
                            Allocation.StartDateTime, Allocation.EndDateTime, Allocation.Minutes);
                    AddInterval(Allocation.StartDateTime, Allocation.EndDateTime, Units, Allocation.Minutes);
                end;
            until Allocation.Next() = 0;
    end;

    procedure Window(Calendar: Record "Calendar Entry"; Cursor: DateTime; var WindowEnd: DateTime; var WorkLimit: Decimal): Boolean
    var
        Parent: Record "Calendar Entry";
        Drafts: Codeunit CF_ScheduleDraftMgt;
        Capacity: Codeunit CF_SchedulerCapacity;
        ParentStart: DateTime;
        ParentEnd: DateTime;
        PriorEnd: DateTime;
        ParentCapacity: Decimal;
        Count: Integer;
    begin
        if UseFinite then begin
            TempEvents.Reset();
            TempEvents.SetCurrentKey("Capacity Type", "No.", "Starting Date-Time", "Ending Date-Time", "Absence Capacity");
            TempEvents.SetFilter("Starting Date-Time", '>%1&<=%2', SweepTime, Cursor);
            if TempEvents.FindSet() then
                repeat
                    Guard();
                    ResourceLoad += TempEvents.Capacity;
                until TempEvents.Next() = 0;
            SweepTime := Cursor;
            TempEvents.SetFilter("Starting Date-Time", '>%1', Cursor);
            if TempEvents.FindFirst() then
                if TempEvents."Starting Date-Time" < WindowEnd then
                    WindowEnd := TempEvents."Starting Date-Time";
        end;
        // BC constrains parent effective daily work across direct and machine needs.
        // Sibling machines are not exclusive users of one work-centre time interval.
        Parent.SetCurrentKey("Capacity Type", "No.", Date, "Starting Time");
        Parent.SetRange("Capacity Type", Parent."Capacity Type"::"Work Center");
        Parent.SetRange("No.", Selected.WorkCenterNo);
        Parent.SetRange(Date, DT2Date(Cursor));
        PriorEnd := 0DT;
        if Parent.FindSet() then
            repeat
                Guard();
                Count += 1;
                if Count > 6000 then
                    Error(CalendarErr);
                ParentStart := CreateDateTime(Parent.Date, Parent."Starting Time");
                ParentEnd := Drafts.IntervalEnd(Parent.Date, Parent."Starting Time", Parent."Ending Time");
                if (ParentEnd <= ParentStart) or (ParentStart < PriorEnd) then
                    Error(CalendarErr);
                PriorEnd := ParentEnd;
                if (ParentStart <= Cursor) and (ParentEnd > Cursor) then begin
                    ParentCapacity := (Parent.Capacity - Parent."Absence Capacity") * Parent.Efficiency / 100;
                    if ParentEnd < WindowEnd then
                        WindowEnd := ParentEnd;
                end else
                    if (ParentStart > Cursor) and (ParentStart < WindowEnd) then
                        WindowEnd := ParentStart;
            until Parent.Next() = 0;
        if WindowEnd <= Cursor then
            Error(CalendarErr);
        WorkLimit := 0;
        if UseFinite then begin
            if not ParentAvailability.Get(Calendar.Date, WorkLimit) then begin
                WorkLimit := Capacity.Available("Capacity Type"::"Work Center", Selected.WorkCenterNo, Calendar.Date);
                ParentAvailability.Add(Calendar.Date, WorkLimit);
            end;
            if ParentLoads.ContainsKey(Calendar.Date) then
                WorkLimit -= ParentLoads.Get(Calendar.Date);
        end;
        exit((Calendar.Capacity - Calendar."Absence Capacity" - ResourceLoad >= 0.99999) and
             (ParentCapacity > 0) and (not UseFinite or (WorkLimit > 0.000001)));
    end;

    procedure Consume(Day: Date; Minutes: Decimal)
    var
        Total: Decimal;
    begin
        if not UseFinite then
            exit;
        if ParentLoads.Get(Day, Total) then
            ParentLoads.Set(Day, Total + Minutes)
        else
            ParentLoads.Add(Day, Minutes);
    end;

    local procedure Occupation(ResourceType: Enum "Capacity Type"; ResourceNo: Code[20]; StartValue: DateTime; EndValue: DateTime; Minutes: Decimal): Decimal
    var
        Calendar: Record "Calendar Entry";
        Drafts: Codeunit CF_ScheduleDraftMgt;
        SlotStart: DateTime;
        SlotEnd: DateTime;
        CoveredUntil: DateTime;
        EffectiveMinutes: Decimal;
    begin
        if (StartValue = 0DT) or (EndValue <= StartValue) or (Minutes <= 0) then
            Error(CalendarErr);
        CoveredUntil := StartValue;
        Calendar.SetCurrentKey("Capacity Type", "No.", Date, "Starting Time");
        Calendar.SetRange("Capacity Type", ResourceType);
        Calendar.SetRange("No.", ResourceNo);
        Calendar.SetRange(Date, DT2Date(StartValue), DT2Date(EndValue));
        if Calendar.FindSet() then
            repeat
                Guard();
                SlotStart := CreateDateTime(Calendar.Date, Calendar."Starting Time");
                SlotEnd := Drafts.IntervalEnd(Calendar.Date, Calendar."Starting Time", Calendar."Ending Time");
                if (SlotStart < EndValue) and (SlotEnd > StartValue) then begin
                    if SlotStart < StartValue then
                        SlotStart := StartValue;
                    if SlotEnd > EndValue then
                        SlotEnd := EndValue;
                    if (SlotStart <> CoveredUntil) or (Calendar.Efficiency <= 0) then
                        Error(CalendarErr);
                    EffectiveMinutes += (SlotEnd - SlotStart) / 60000 * Calendar.Efficiency / 100;
                    CoveredUntil := SlotEnd;
                end;
            until (Calendar.Next() = 0) or (CoveredUntil = EndValue);
        if (CoveredUntil <> EndValue) or (EffectiveMinutes <= 0) then
            Error(CalendarErr);
        exit(Minutes / EffectiveMinutes);
    end;

    local procedure AddInterval(StartValue: DateTime; EndValue: DateTime; Units: Decimal; Minutes: Decimal)
    begin
        if (StartValue = 0DT) or (EndValue <= StartValue) or (Minutes <= 0) then
            Error(CalendarErr);
        Consume(DT2Date(StartValue), Minutes);
        if Units > 0 then begin
            AddEvent(StartValue, Units);
            AddEvent(EndValue, -Units);
        end;
    end;

    local procedure AddEvent(Value: DateTime; Units: Decimal)
    begin
        TempEvents.Reset();
        if not TempEvents.Get("Capacity Type"::"Work Center", '', DT2Date(Value), DT2Time(Value), 0T, '') then begin
            TempEvents.Init();
            TempEvents."Capacity Type" := "Capacity Type"::"Work Center";
            TempEvents."No." := '';
            TempEvents.Date := DT2Date(Value);
            TempEvents."Starting Time" := DT2Time(Value);
            TempEvents."Ending Time" := 0T;
            TempEvents."Work Shift Code" := '';
            TempEvents."Starting Date-Time" := Value;
            TempEvents.Insert();
        end;
        TempEvents.Capacity += Units;
        TempEvents.Modify();
    end;

    local procedure Guard()
    begin
        Comparisons += 1;
        if Comparisons > 100000 then
            Error(ScanErr);
    end;

    var
        TempEvents: Record "Calendar Entry" temporary;
        Selected: Record CF_ScheduleDraftOperation;
        OverlayDrafts: Codeunit CF_ScheduleDraftMgt;
        UseFinite: Boolean;
        SweepTime: DateTime;
        ResourceLoad: Decimal;
        ParentLoads: Dictionary of [Date, Decimal];
        ParentAvailability: Dictionary of [Date, Decimal];
        Comparisons: Integer;
        CalendarErr: Label 'Finite scheduling requires valid, non-overlapping resource and parent calendars and allocation intervals covered by those calendars. No draft changes were saved.';
        ScanErr: Label 'Finite scheduling exceeded 100,000 interval comparisons. Narrow the planning horizon.';
}
