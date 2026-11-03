namespace CloudFactory.ProductionScheduling;

using Microsoft.Manufacturing.Document;

table 91303 CF_SchedulerStatusBuffer
{
    Caption = 'Scheduler Status Selection';
    TableType = Temporary;
    DataClassification = CustomerContent;

    fields
    {
        field(1; Status; Enum "Production Order Status") { Caption = 'Status'; }
        field(2; Selected; Boolean) { Caption = 'Selected'; }
    }
    keys
    {
        key(PK; Status) { Clustered = true; }
    }
}
