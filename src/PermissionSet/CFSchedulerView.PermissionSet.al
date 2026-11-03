namespace CloudFactory.ProductionScheduling;

using Microsoft.Manufacturing.Capacity;
using Microsoft.Manufacturing.Document;
using Microsoft.Manufacturing.MachineCenter;
using Microsoft.Manufacturing.WorkCenter;

permissionset 91300 CF_SchedulerView
{
    Assignable = true;
    Caption = 'Production Scheduler View';
    Permissions =
        tabledata CF_ProductionSchedulerSetup = R,
        tabledata CF_ProductionScheduleState = R,
        tabledata CF_ScheduleScenario = R,
        tabledata CF_ScheduleDraftOrder = R,
        tabledata CF_ScheduleDraftOperation = R,
        tabledata CF_ScheduleDraftAllocation = R,
        tabledata CF_SchedulerDatePreset = RIMD,
        tabledata "Production Order" = R,
        tabledata "Prod. Order Line" = R,
        tabledata "Prod. Order Routing Line" = R,
        tabledata "Prod. Order Capacity Need" = R,
        tabledata "Prod. Order Component" = R,
        tabledata "Work Center" = R,
        tabledata "Machine Center" = R,
        tabledata "Calendar Entry" = R,
        tabledata "Capacity Unit of Measure" = R,
        table CF_ProductionSchedulerSetup = X,
        table CF_ProductionScheduleState = X,
        table CF_ScheduleScenario = X,
        table CF_ScheduleDraftOrder = X,
        table CF_ScheduleDraftOperation = X,
        table CF_ScheduleDraftAllocation = X,
        page CF_ScheduleScenarios = X,
        page CF_ScheduleDraftRouting = X,
        table CF_SchedulerCapacityBuffer = X,
        table CF_SchedulerStatusBuffer = X,
        table CF_SchedulerDatePreset = X,
        table CF_SchedulerViewState = X,
        page CF_ProductionScheduler = X,
        page CF_SchedulerStatuses = X,
        page CF_SchedulerOptions = X,
        page CF_SchedulerDatePresets = X,
        page CF_SaveSchedulerDatePreset = X,
        page CF_SchedulerSpecificDate = X,
        codeunit CF_SchedulerDateMgt = X,
        codeunit CF_ProductionSchedulerMgt = X,
        codeunit CF_ScheduleDraftMgt = X,
        codeunit CF_SchedulerCapacity = X;
}
