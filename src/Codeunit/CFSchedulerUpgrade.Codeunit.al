namespace CloudFactory.ProductionScheduling;

codeunit 91305 CF_SchedulerUpgrade
{
    Subtype = Upgrade;
    Permissions = tabledata CF_ProductionSchedulerSetup = RM;

    trigger OnUpgradePerCompany()
    var
        Setup: Record CF_ProductionSchedulerSetup;
    begin
        if Setup.Get('') then begin
            if Setup.MaximumScheduleDays = 0 then
                Setup.MaximumScheduleDays := 90;
            Setup.Modify(false);
        end;
    end;
}
