namespace CloudFactory.ProductionScheduling;

using Microsoft.Manufacturing.Capacity;

permissionset 91301 CF_SchedulerPlanner
{
    Assignable = true;
    Caption = 'Production Scheduler Planner';
    IncludedPermissionSets = CF_SchedulerView;
    Permissions =
        tabledata CF_ProductionSchedulerSetup = RIMD,
        tabledata CF_ScheduleScenario = RIMD,
        tabledata CF_ScheduleDraftOrder = RIMD,
        tabledata CF_ScheduleDraftOperation = RIMD,
        tabledata CF_ScheduleDraftAllocation = RIMD,
        tabledata "Capacity Constrained Resource" = R,
        table "Capacity Constrained Resource" = X,
        page CF_ProductionSchedulerSetup = X,
        codeunit CF_DraftScheduleChange = X,
        page CF_EditDraftStart = X,
        codeunit CF_AutoSchedule = X,
        codeunit CF_SchedulerFiniteScope = X,
        table CF_AutoScheduleBuffer = X,
        page CF_AutoScheduleResults = X;
}
