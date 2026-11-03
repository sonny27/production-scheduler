namespace CloudFactory.ProductionScheduling;

enum 91302 CF_AutoScheduleMethod
{
    Extensible = false;
    value(0; FiniteCapacity) { Caption = 'Draft Finite Capacity (Serial)'; }
    value(1; StandardForward) { Caption = 'Draft Forward'; }
}
