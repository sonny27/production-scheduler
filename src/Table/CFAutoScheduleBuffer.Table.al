namespace CloudFactory.ProductionScheduling;

using Microsoft.Manufacturing.Document;

table 91304 CF_AutoScheduleBuffer
{
    Caption = 'Auto Schedule Result';
    TableType = Temporary;
    DataClassification = CustomerContent;
    fields
    {
        field(1; OperationId; Guid) { Caption = 'Operation ID'; }
        field(2; Status; Enum "Production Order Status") { Caption = 'Status'; }
        field(3; OrderNo; Code[20]) { Caption = 'Production Order No.'; }
        field(4; RoutingReferenceNo; Integer) { Caption = 'Routing Reference No.'; }
        field(5; RoutingNo; Code[20]) { Caption = 'Routing No.'; }
        field(6; SequenceNo; Integer) { Caption = 'Sequence No.'; }
        field(7; OperationNo; Code[10]) { Caption = 'Operation No.'; }
        field(8; PriorityDate; Date) { Caption = 'Priority Date'; }
        field(9; Scheduled; Boolean) { Caption = 'Saved'; }
        field(10; Confirmed; Boolean) { Caption = 'Still Confirmed'; }
        field(11; Result; Text[2048]) { Caption = 'Result'; }
        field(12; StartDateTime; DateTime) { Caption = 'Final Start'; }
        field(13; EndDateTime; DateTime) { Caption = 'Final Finish'; }
        field(14; DraftRevision; Integer) { Caption = 'Draft Revision'; }
    }
    keys
    {
        key(PK; OperationId) { Clustered = true; }
        key(Priority; PriorityDate, OrderNo, Status, RoutingReferenceNo, RoutingNo, SequenceNo, OperationNo) { }
    }
}
