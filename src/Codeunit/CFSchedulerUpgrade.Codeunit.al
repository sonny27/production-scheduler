namespace CloudFactory.ProductionScheduling;

using System.Upgrade;

codeunit 91305 CF_SchedulerUpgrade
{
    Subtype = Upgrade;
    Permissions = tabledata CF_ProductionSchedulerSetup = RM;

    trigger OnUpgradePerCompany()
    var
        Setup: Record CF_ProductionSchedulerSetup;
        UpgradeTag: Codeunit "Upgrade Tag";
    begin
        if Setup.Get('') then begin
            if Setup.MaximumScheduleDays = 0 then
                Setup.MaximumScheduleDays := 90;
            if Setup.DragSnapMinutes = 0 then
                Setup.DragSnapMinutes := 15;
            if not UpgradeTag.HasUpgradeTag(FirmPlannedTag()) then
                Setup.FirmPlannedOnCommit := true;
            Setup.Modify(false);
        end;
        if not UpgradeTag.HasUpgradeTag(FirmPlannedTag()) then
            UpgradeTag.SetUpgradeTag(FirmPlannedTag());
    end;

    local procedure FirmPlannedTag(): Code[250]
    begin
        exit('CF-Scheduler-FirmPlannedOnCommit-20261107');
    end;

    [EventSubscriber(ObjectType::Codeunit, Codeunit::"Upgrade Tag", 'OnGetPerCompanyUpgradeTags', '', false, false)]
    local procedure RegisterUpgradeTag(var PerCompanyUpgradeTags: List of [Code[250]])
    begin
        PerCompanyUpgradeTags.Add(FirmPlannedTag());
    end;
}
