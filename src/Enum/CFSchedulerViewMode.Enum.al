namespace CloudFactory.ProductionScheduling;

enum 91301 CF_SchedulerViewMode
{
    Extensible = false;

    value(0; Day) { Caption = 'Day'; }
    value(1; Hour) { Caption = 'Hour'; }
    value(2; Week) { Caption = 'Week'; }
    value(3; Month) { Caption = 'Month'; }
}
