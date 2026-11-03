namespace CloudFactory.ProductionScheduling;

using Microsoft.Manufacturing.Capacity;

table 91302 CF_SchedulerCapacityBuffer
{
    Caption = 'Scheduler Capacity Buffer';
    TableType = Temporary;
    DataClassification = CustomerContent;

    fields
    {
        field(1; ResourceType; Enum "Capacity Type") { Caption = 'Resource Type'; }
        field(2; ResourceNo; Code[20]) { Caption = 'Resource No.'; }
        field(3; CapacityDate; Date) { Caption = 'Capacity Date'; }
        field(4; AllocatedMinutes; Decimal) { Caption = 'Allocated Minutes'; }
        field(5; AvailableMinutes; Decimal) { Caption = 'Available Minutes'; }
        field(6; SelectedOperation; Boolean) { Caption = 'Selected Operation'; }
    }
    keys
    {
        key(PK; ResourceType, ResourceNo, CapacityDate) { Clustered = true; }
    }
}
