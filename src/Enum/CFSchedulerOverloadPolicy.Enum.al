namespace CloudFactory.ProductionScheduling;

enum 91300 CF_SchedulerOverloadPolicy
{
    Extensible = false;

    value(0; WarnAndConfirm)
    {
        Caption = 'Warn and confirm';
    }
    value(1; Block)
    {
        Caption = 'Block new or increased overload';
    }
}
