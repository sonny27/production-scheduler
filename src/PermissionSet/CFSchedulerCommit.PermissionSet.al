namespace CloudFactory.ProductionScheduling;

permissionset 91302 CF_SchedulerCommit
{
    Assignable = true;
    Caption = 'Production Scheduler Commit';
    IncludedPermissionSets = CF_SchedulerPlanner;
    Permissions =
        tabledata CF_ProductionScheduleState = RIMD,
        codeunit CF_ProductionScheduleChange = X,
        page CF_ScheduleCommitResults = X;
}
