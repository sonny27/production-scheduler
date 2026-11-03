namespace CloudFactory.ProductionScheduling;

using Microsoft.Manufacturing.Capacity;
using Microsoft.Manufacturing.Document;

table 91310 CF_ScheduleDraftAllocation
{
    Caption = 'Schedule Draft Allocation';
    DataClassification = CustomerContent;
    fields
    {
        field(1; ScenarioCode; Code[20]) { Caption = 'Scenario'; }
        field(2; OperationId; Guid) { Caption = 'Operation ID'; }
        field(3; EntryNo; Integer) { Caption = 'Entry No.'; }
        field(4; Status; Enum "Production Order Status") { Caption = 'Status'; }
        field(5; OrderNo; Code[20]) { Caption = 'Order No.'; }
        field(6; ResourceType; Enum "Capacity Type") { Caption = 'Resource Type'; }
        field(7; ResourceNo; Code[20]) { Caption = 'Resource No.'; }
        field(8; WorkCenterNo; Code[20]) { Caption = 'Work Center No.'; }
        field(9; CapacityDate; Date) { Caption = 'Capacity Date'; }
        field(10; StartDateTime; DateTime) { Caption = 'Start'; }
        field(11; EndDateTime; DateTime) { Caption = 'Finish'; }
        field(12; Minutes; Decimal) { Caption = 'Allocated Minutes'; DecimalPlaces = 0 : 5; }
    }
    keys
    {
        key(PK; ScenarioCode, OperationId, EntryNo) { Clustered = true; }
        key(Resource; ScenarioCode, ResourceType, ResourceNo, CapacityDate) { SumIndexFields = Minutes; }
        key(Department; ScenarioCode, WorkCenterNo, CapacityDate) { SumIndexFields = Minutes; }
        key(Order; ScenarioCode, Status, OrderNo) { }
    }
}
