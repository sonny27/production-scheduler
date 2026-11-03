namespace CloudFactory.ProductionScheduling;

using Microsoft.Manufacturing.Capacity;
using Microsoft.Manufacturing.Document;

table 91309 CF_ScheduleDraftOperation
{
    Caption = 'Schedule Draft Routing';
    DataClassification = CustomerContent;
    fields
    {
        field(1; ScenarioCode; Code[20]) { Caption = 'Scenario'; TableRelation = CF_ScheduleScenario.Code; }
        field(2; OperationId; Guid) { Caption = 'Operation ID'; }
        field(3; Status; Enum "Production Order Status") { Caption = 'Status'; }
        field(4; OrderNo; Code[20]) { Caption = 'Order No.'; }
        field(5; RoutingReferenceNo; Integer) { Caption = 'Routing Reference No.'; }
        field(6; RoutingNo; Code[20]) { Caption = 'Routing No.'; }
        field(7; OperationNo; Code[10]) { Caption = 'Operation No.'; }
        field(8; SequenceNo; Integer) { Caption = 'Sequence'; }
        field(9; ResourceType; Enum "Capacity Type") { Caption = 'Resource Type'; }
        field(10; ResourceNo; Code[20]) { Caption = 'Resource No.'; }
        field(11; WorkCenterNo; Code[20]) { Caption = 'Work Center No.'; }
        field(12; Description; Text[100]) { Caption = 'Description'; }
        field(13; StartDateTime; DateTime) { Caption = 'Draft Start'; }
        field(14; EndDateTime; DateTime) { Caption = 'Draft Finish'; }
        field(15; BaselineStart; DateTime) { Caption = 'BC Start at Import'; }
        field(16; BaselineEnd; DateTime) { Caption = 'BC Finish at Import'; }
        field(17; Confirmed; Boolean) { Caption = 'Scheduled in Draft'; }
        field(18; Changed; Boolean) { Caption = 'Uncommitted Changes'; }
        field(19; Finished; Boolean) { Caption = 'Finished'; }
        field(20; WorkMinutes; Decimal) { Caption = 'Setup and Run Minutes'; DecimalPlaces = 0 : 5; }
        field(21; PreviousOperationNo; Code[30]) { Caption = 'Previous Operation No.'; }
        field(22; NextOperationNo; Code[30]) { Caption = 'Next Operation No.'; }
        field(23; DueDate; Date) { Caption = 'Due Date'; }
        field(24; Restriction; Text[2048]) { Caption = 'Draft Calculation Restriction'; }
        field(25; Snapshot; Blob) { Caption = 'Routing Details Snapshot'; }
    }
    keys
    {
        key(PK; ScenarioCode, OperationId) { Clustered = true; }
        key(Routing; ScenarioCode, Status, OrderNo, RoutingReferenceNo, RoutingNo, OperationNo) { Unique = true; }
        key(Sequence; ScenarioCode, Status, OrderNo, RoutingReferenceNo, RoutingNo, SequenceNo, OperationNo) { }
    }

    procedure GetSnapshot(): JsonObject
    var
        Stream: InStream;
        Value: JsonObject;
    begin
        CalcFields(Snapshot);
        Snapshot.CreateInStream(Stream, TextEncoding::UTF8);
        Value.ReadFrom(Stream);
        exit(Value);
    end;

    procedure SetSnapshot(Value: JsonObject)
    var
        Stream: OutStream;
    begin
        Clear(Snapshot);
        Snapshot.CreateOutStream(Stream, TextEncoding::UTF8);
        Value.WriteTo(Stream);
    end;
}
