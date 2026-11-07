namespace CloudFactory.ProductionScheduling;

using Microsoft.Manufacturing.Document;

permissionset 91302 CF_SchedulerCommit
{
    Assignable = true;
    Caption = 'Production Scheduler Commit';
    IncludedPermissionSets = CF_SchedulerPlanner;
    Permissions =
        tabledata CF_ProductionScheduleState = RIMD,
        codeunit CF_ProductionScheduleChange = X,
        codeunit CF_SchedulerOrderPromotion = X,
        codeunit "Prod. Order Status Management" = X,
        page CF_ScheduleCommitResults = X;
}
