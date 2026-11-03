namespace CloudFactory.ProductionScheduling;

enum 91303 CF_AutoSchedulePriority
{
    Extensible = false;
    value(0; DueDate) { Caption = 'Earliest Due Date'; }
    value(1; OrderNo) { Caption = 'Production Order No.'; }
}
