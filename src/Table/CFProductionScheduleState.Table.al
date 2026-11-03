namespace CloudFactory.ProductionScheduling;

table 91301 CF_ProductionScheduleState
{
    Caption = 'Production Schedule State';
    DataClassification = CustomerContent;

    fields
    {
        field(1; OperationId; Guid)
        {
            Caption = 'Operation ID';
        }
        field(2; RoutingVersion; BigInteger)
        {
            Caption = 'Routing Version';
        }
        field(3; LineVersion; Text[2048])
        {
            Caption = 'Line Version';
        }
        field(4; PlannerConfirmed; Boolean)
        {
            Caption = 'Planner Confirmed';
        }
        field(5; ConfirmedAt; DateTime)
        {
            Caption = 'Confirmed At';
        }
        field(6; ConfirmedBy; Guid)
        {
            Caption = 'Confirmed By';
            DataClassification = EndUserPseudonymousIdentifiers;
        }
    }
    keys
    {
        key(PK; OperationId) { Clustered = true; }
    }
}
