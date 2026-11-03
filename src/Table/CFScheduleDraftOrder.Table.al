namespace CloudFactory.ProductionScheduling;

using Microsoft.Manufacturing.Document;

table 91308 CF_ScheduleDraftOrder
{
    Caption = 'Schedule Draft Order';
    DataClassification = CustomerContent;
    fields
    {
        field(1; ScenarioCode; Code[20]) { Caption = 'Scenario'; TableRelation = CF_ScheduleScenario.Code; }
        field(2; Status; Enum "Production Order Status") { Caption = 'Status'; }
        field(3; OrderNo; Code[20]) { Caption = 'Order No.'; }
        field(4; Baseline; Blob) { Caption = 'BC Baseline'; }
        field(5; Revision; Integer) { Caption = 'Revision'; }
        field(6; Changed; Boolean) { Caption = 'Uncommitted Changes'; }
        field(7; ImportedAt; DateTime) { Caption = 'Imported At'; }
        field(8; CommittedAt; DateTime) { Caption = 'Last Committed At'; }
    }
    keys { key(PK; ScenarioCode, Status, OrderNo) { Clustered = true; } }

    procedure GetBaseline(): Text
    var
        Stream: InStream;
        Value: Text;
    begin
        CalcFields(Baseline);
        Baseline.CreateInStream(Stream, TextEncoding::UTF8);
        Stream.ReadText(Value);
        exit(Value);
    end;

    procedure SetBaseline(Value: Text)
    var
        Stream: OutStream;
    begin
        Clear(Baseline);
        Baseline.CreateOutStream(Stream, TextEncoding::UTF8);
        Stream.WriteText(Value);
    end;
}
