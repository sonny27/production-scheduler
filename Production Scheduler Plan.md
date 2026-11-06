# Production Scheduler - Phase One Plan and Market Comparison

Research date: 3 November 2026.

Status: implementation now uses **persistent draft scenarios (version 2.0.1)**. Section 26 is authoritative for scheduling, capacity replacement and commits; section 27 defines exclusive unscheduled/timeline placement and quiet drag/drop. Sections 15-25 record earlier releases; their immediate-write/BC-calculated drag and Auto Schedule descriptions are historical, not the current workflow. This document distinguishes the original specification from implementation decisions.

## 1. Executive recommendation

Build a production scheduling board inside Business Central using an AL control add-in. Display production routing operations against work centres and machine centres, expose daily capacity/load, and let planners adjust an independent named draft. Draft calculations use manufacturing calendars without writing BC. Standard BC manufacturing recalculation is invoked only by **Commit to BC**, and a differing result rolls back the complete order.

The original phase-one recommendation was a visual layer over BC calculation. The later user-approved scenario requirement necessarily introduces a deliberately restricted draft calculator, not an advanced planning and scheduling optimiser.

The market comparison supports this boundary:

- Insight Works Graphical Scheduler demonstrates the value of basic visual date adjustment and operation details [S1].
- NETRONIC Visual Production Scheduler (VPS) combines operations, resources, capacity loads, and manual visual scheduling close to standard Business Central logic [S2].
- Dime.Scheduler's production integration explicitly routes scheduling changes back through Business Central's production routing engine [S3].
- NETRONIC Visual Advanced Production Scheduler (VAPS) adds capacity-aware scheduling assistance, materials, priorities, and alternative machines. Those are useful future capabilities, not phase-one requirements [S2].

The design is original. Public product descriptions and the supplied screenshots inform requirements; proprietary source implementation has not been inspected or copied.

## 2. Confirmed requirements and proposed defaults

### Confirmed by the user

| Area | Requirement |
|---|---|
| Hosting | Business Central page with a control add-in, implemented in this project |
| Data | Production orders, represented by their routing operations |
| Hierarchy | Work centres are departments; machine centres appear underneath |
| Unscheduled work | Show above the timeline |
| Meaning of unscheduled | Not explicitly planner-confirmed, even if Business Central has already calculated dates |
| Scheduling | Set/drag start in a persistent scenario; BC is unchanged until explicit commit |
| Routing propagation | Recalculate following steps inside the draft; validate against BC at commit |
| Status defaults | Company setup with multi-selection; scheduler users can change current defaults/selections and refresh |
| Setup object | `CF_ProductionSchedulerSetup` |
| Overload behaviour | Configurable default in setup |
| Capacity display | Hours on the board, minutes in details |
| Calendars | Use existing calculated capacity calendars |
| Resource lanes | Work-centre summary, separate direct-work-centre lane, child machine-centre lanes |
| Totals | Do not add a summary to its children |
| AL object naming | `CF_PascalCase` |
| Custom field naming | PascalCase without spaces, for example `WorkCenterNo` |
| Third-party naming | No reference-vendor object prefix in new code, identifiers, or documentation |

### Recommended initial defaults, not additional confirmed decisions

- View period: 14 days.
- Initial production statuses: Firm Planned and Released.
- Overload policy: `WarnAndConfirm`.
- Simulated orders: not selected initially.
- Screen selection changes are session-level; only an explicit setup/save-defaults action changes company defaults.
- Default capacity scope includes Firm Planned and Released, plus additional non-simulated statuses selected for planning. Hiding bars with order/item filters must not remove their competing load.

The recommendations above should be approved or adjusted before implementation; they are not hard-coded business assumptions.

## 3. Existing project and reusable patterns

- [Project manifest](app.json): Business Central application 29, AL runtime 18, object range 91300-91599.
- The source folder was empty at initial inspection; it now contains the independent production scheduler.
- The comparison scheduler dependency has been removed from the manifest. The supplied package remains in the symbol cache as a reference, not a runtime dependency.
- The neighbouring [Service Scheduler control add-in](../Service%20Scheduler/src/ControlAddIn/ServiceOrderSchedule/Service%20Order%20Schedule%20AddIn.ControlAddIn.al) demonstrates an AL/JavaScript control-ready handshake, JSON payload delivery, and events back to AL.
- Its [scheduler page](../Service%20Scheduler/src/Page/Service%20Order%20Schedule.Page.al) demonstrates refresh, selection, and drilldown.

Reuse the architectural pattern, not the service scheduling business rules. Production scheduling must not directly shift paired dates without manufacturing recalculation, use one global working calendar, or identify operations by order number alone.

## 4. Internet-based comparison

### Evidence boundaries

The following is a comparison of documented capabilities, not a product evaluation, licence quotation, or claim of feature parity. "Not established" means the reviewed source did not establish the capability; it does not mean the product lacks it. General platform features must not be assumed to apply identically to production routing.

### Product comparison

| Product | Documented capabilities in reviewed sources | Phase-one lesson |
|---|---|---|
| Insight Works Graphical Scheduler [S1] | Workstation-oriented visual production scheduling, drag-and-drop date adjustment, operation details, flexible calendar views | Prioritise a clear board, simple navigation, details, and manual adjustment |
| NETRONIC VPS [S2] | Production orders, operations, resources, capacity loads, Gantt/histogram views, identification of late operations and bottlenecks, drag-and-drop | Capacity and due-date visibility belong in a basic scheduler, but a full histogram designer is unnecessary |
| Dime.Scheduler production integration [S3] | Routing-line planning, resources from work/machine centres, status-based visual indicators, changes validated and recalculated by the Business Central routing engine | Use operation-level identity, standard resources, status colours, and server-side recalculation |
| Dime.Scheduler broader platform [S4] | Filtering/grouping, capacity/workload reporting, profiles, integrations, mobile features, and broader optimisation assistance | Useful future ideas; mobile, maps, workforce optimisation, and integration hubs are not production phase-one prerequisites |
| NETRONIC VAPS [S2] | Scheduling against available capacity, consideration of materials, alternative machines and priorities, manual control with scheduling automation | Explicitly defer advanced planning assistance rather than promising it through daily utilisation indicators |

### Feature-by-feature phase-one decision

| Capability | Market evidence | Phase one | Reason or limitation |
|---|---|---|---|
| Resource timeline and operation bars | [S1], [S2], [S3] | Include | Core visual scheduling surface |
| Work-centre/machine-centre hierarchy | Standard BC hierarchy [S5]; production resources [S3] | Include | Matches the user's operating model |
| Start-date entry and horizontal drag | [S1], [S2], [S3] | Include | Two interfaces to the same validated scheduling action |
| Finish and dependency recalculation | Explicit BC engine integration [S3] | Include | Avoid a conflicting scheduling engine |
| Daily available/allocated/remaining hours | Capacity visibility [S2], [S4]; standard BC model [S5] | Include | Show overload and spare capacity |
| Basic overdue/late indication | Late-operation visibility [S2] | Include | Flag incomplete work past its schedule and orders finishing after due date; do not equate every intermediate operation ending after an internal target with order lateness |
| Operation details and drilldown | [S1]; standard routing integration [S3] | Include | Planner can inspect quantities, dates, and routing |
| Filters, grouping, day/week navigation | Calendar views [S1]; filtering/grouping [S4] | Include, basic | No custom saved-view designer initially |
| Top unconfirmed-work panel | User requirement; exact vendor-equivalent semantics not established | Include | Persistent planner confirmation is a project-specific workflow |
| Configurable overload warning/block | User requirement; vendor-equivalent policy not established | Include | Daily validation, not a full finite scheduler |
| Cross-machine reassignment | Alternative-machine handling documented for VAPS [S2] | Defer | Requires eligibility, routing, costing, and capacity validation |
| Resizing to change operation effort | Not required by the agreed scope | Exclude | Bar length must follow calculated production effort |
| Automatic next-free-slot search | Capacity-aware assistance [S2] | Defer | Daily totals alone cannot identify valid interval slots |
| Material availability and shortage-aware placement | VAPS [S2] | Defer | Not implied by available machine hours |
| Automatic priority sequencing/optimisation | Advanced scheduling assistance [S2] | Defer | Requires explicit scheduling objectives and constraints |
| What-if scenarios and publishable alternative plans | Not established by reviewed sources | Defer | Avoid introducing a second production planning database |
| Shop-floor execution, mobile, maps, external integrations | Broader platform features [S4] | Exclude | Separate business scope |

### Conclusion

The closest phase-one category is a basic visual production scheduler, comparable in purpose to Graphical Scheduler or VPS and to Dime.Scheduler's routing visualisation approach. It is not a VAPS replacement. A daily overload block is a useful guard but is not proof that every overlapping operation can execute within each shift.

## 5. Screen and planner workflow

### Layout

```text
Toolbar: Start Date | Days | Statuses | Work Centre | Search | Refresh
Navigation: Today | Previous | Next | Day | Week

Unscheduled / Awaiting Planner Confirmation
  Order | Item | Operation | Resource | Existing Dates | Reason | Schedule

Timeline and daily capacity indicators
  Work Centre: Assembly                     [summary only]
    Direct Work Centre Operations           [operations assigned to this WC]
    Machine Centre: Electrical Wiring
    Machine Centre: Manual Assembly
  Work Centre: Machining                    [summary only]
    Direct Work Centre Operations
    Machine Centre: CNC
    Machine Centre: Drilling

Selected operation details / warnings / affected operations
```

### Display rules

1. One bar represents one production order routing operation, not the whole order.
2. Bar identity uses the complete routing key: status, order number, routing reference number, routing number, and operation number.
3. Use distinct resource IDs for work centres and machine centres even when their numbers match.
4. Work-centre headers summarise; they are not additional independently schedulable machines.
5. Direct-work-centre operations stay on the direct lane. Never assign them to a child machine just to render them.
6. Include operations overlapping the visible date window, including those starting before it.
7. Fetch the unconfirmed-work panel independently of valid timeline dates, so missing-date operations do not disappear.
8. Explain blocked resources, missing routing/calendar data, and orders without operations as exceptions.
9. Keep overlapping bars distinguishable with stacking. Do not conceal overload by drawing bars over each other.
10. Use simple status colours, an independent confirmation indicator, and an overload/late legend.
11. Shade non-working intervals per resource. Do not compress time globally using a single department's shift pattern.
12. Selection shows order/item, operation, status, resource, quantity, setup/run values and units, calculated start/finish, due date, and available/allocated minutes.
13. Double-click or an explicit action opens the standard order/routing page with the correct filters.

### Basic scheduling flow

1. Load setup defaults and current Business Central data.
2. Review unconfirmed operations and existing load.
3. Select an operation and enter a start date/time, or move an existing bar horizontally.
4. Validate on the server and invoke standard manufacturing recalculation.
5. Show the authoritative finish and affected operations.
6. Apply overload policy before persisting a successful result.
7. Store confirmation and reload the chart and capacity.

Moving a bar, entering a date, and scheduling from the top panel must use one server-side implementation.

## 6. Planner confirmation and "unscheduled" state

Business Central often assigns dates when an order is refreshed. Missing dates alone therefore cannot implement the requested top-panel workflow.

Create persistent confirmation state per operation, separate from temporary display buffers. Suggested fields are `PlannerConfirmed`, `ConfirmedStartDateTime`, `ConfirmedEndDateTime`, `ConfirmedResourceType`, and `ConfirmedResourceNo`, alongside the operation identity.

Rules:

- No confirmation record means awaiting confirmation.
- Existing operations initially appear as awaiting confirmation.
- Confirming without moving is supported if current scheduling data is valid.
- Confirmed state survives page refresh and reopening.
- Compare current scheduling inputs and results with the confirmed snapshot; resource/date or relevant effort changes make confirmation stale.
- Standard recalculation that moves another confirmed operation flags that operation for review.
- Status changes and routing regeneration must not accidentally transfer confirmation to an unrelated/recreated operation. Test this explicitly.
- Opening or refreshing a page never confirms work or writes manufacturing data.
- Missing data cannot be made valid merely by setting a confirmation flag.

Important: planner confirmation is not Business Central capacity allocation. Unconfirmed operations can already consume capacity through standard capacity-need records. Include that load, explain it in the legend, and do not delete/recreate standard capacity entries just to move an item into the top panel.

## 7. Capacity, utilisation, and routing effort

### 7.1 Authoritative sources

| Information | Standard source |
|---|---|
| Order identity/status/due date | Production Order |
| Item/quantity and line context | Prod. Order Line |
| Operation, resource, dates, setup/run effort | Prod. Order Routing Line |
| Daily allocated production load | Prod. Order Capacity Need |
| Calculated working intervals/effective availability | Calendar Entry |
| Resource hierarchy, unit, efficiency, capacity, blocked state | Work Center and Machine Center |
| Posted actual capacity | Capacity Ledger Entry, through standard manufacturing calculations where possible |

Read source records; do not maintain a parallel capacity ledger.

### 7.2 Available capacity

Use calculated Calendar Entries over the requested period. Conceptually, the standard calculation is:

```text
TotalCapacity =
    ShiftDurationInResourceUnits * (Capacity - AbsenceCapacity)

EffectiveCapacity =
    TotalCapacity * Efficiency / 100
```

Business Central applies its calendar rounding. Read stored effective capacity instead of applying capacity/efficiency a second time.

Illustrations for an eight-hour working interval:

| Capacity | Efficiency | Effective availability |
|---:|---:|---:|
| 1 | 100% | 480 minutes / 8 hours |
| 3 | 100% | 1,440 minutes / 24 resource-hours |
| 2 | 80% | 768 minutes / 12.8 resource-hours |

Twenty-four resource-hours do not mean a 24-hour shift; they can mean three concurrent units working for eight hours.

Missing calendar entries must generate a warning, not a fabricated eight-hour day. Calendar generation and absence maintenance remain standard Business Central responsibilities.

### 7.3 Units

Normalize arithmetic to minutes and display hours, with minutes available in details. Use standard capacity-unit conversion; never infer units from the spelling of a unit code.

Calendar capacity and capacity-need quantities are interpreted in the applicable work-centre unit. Machine-centre demand uses its parent work-centre unit. Setup/run values can have their own units and must be converted separately.

### 7.4 Allocated load and utilisation

Use standard production capacity needs and reconcile against standard load pages with identical resource/date/status filters. The reviewed standard FlowFields sum `Allocated Time` and exclude `Requested Only` entries. Do not introduce extra filtering without proving why it is correct.

```text
AllocatedMinutes = sum(standard allocated capacity converted to minutes)
RemainingMinutes = AvailableMinutes - AllocatedMinutes
UtilisationPercent = AllocatedMinutes / AvailableMinutes * 100
```

- Zero availability and positive load: explicit overload; percentage is not applicable.
- Zero availability and zero load: non-working/no capacity.
- Preserve negative remaining capacity; do not clamp it to zero.
- Visual item/order searches do not reduce the competing demand used for validation.
- Clearly show which statuses the capacity totals include.
- Simulated demand must be separate and labelled: standard simulated allocated-time behaviour must not be presented as reliable committed load or as zero estimated effort.
- Do not spread load uniformly over an operation's elapsed date range. Read its daily capacity-need distribution.
- Do not subtract posted capacity twice. Standard allocated-time calculation already incorporates posted/distributed capacity logic.

### 7.5 Work-centre and machine-centre aggregation

The work-centre standard load can include both direct operations and its machine-centre operations. A consolidated work-centre calendar already represents child machine-centre capacity [S5].

Show:

- Work-centre summary with its standard availability/load semantics.
- Direct-work-centre lane with only directly assigned operations and load.
- Child machine-centre lanes with their individual allocations and calendars.

Never sum the parent summary with its children. The direct lane is not an extra capacity pool. For consolidated calendars, do not invent independent direct-lane availability. Flag mixed direct-work-centre scheduling on consolidated resources for setup review; use standard resource constraints rather than silently assuming independent pools.

Independent calendars and consolidated calendars must both be tested. Always reconcile the displayed parent summary to standard work-centre load, not an improvised sum of all visible rows.

### 7.6 Setup/run load is not elapsed bar duration

For a simplified unposted operation, after unit conversion:

```text
RunLoad approximately equals Quantity * RunTime / LotSize
SetupLoad approximately equals SetupTime * ApplicableConcurrentCapacity
```

These are explanatory examples, not replacement calculation algorithms.

For example, 10 units, 15 minutes run time per unit, lot size 1, and 20 minutes setup at concurrent capacity 1 give 170 resource-minutes before other adjustments.

Concurrency and efficiency alter working duration. Non-working intervals, queue/wait/move times, routing sequence, scrap, posted output, send-ahead quantities, and capacity constraints can further affect dates or needs [S5], [S6].

Therefore:

- Read calculated dates for bar placement.
- Read standard allocated needs for productive load.
- Do not infer load from bar width.
- Do not treat every minute of waiting or overnight elapsed time as productive capacity consumption.

## 8. Safe scheduling and overload policy

### Standard calculation path

Use supported field validation and manufacturing recalculation. The local base application shows:

- [Routing date-time validation](../../Microsoft%20Base%20App%2029/src/Manufacturing/Document/ProdOrderRoutingLine.Table.al) dispatches through date/time validation.
- The same table's `CalcStartingEndingDates` method recalculates routing sequence/dates and related production context.
- [Calculate Routing Line](../../Microsoft%20Base%20App%2029/src/Manufacturing/Routing/CalculateRoutingLine.Codeunit.al) creates capacity needs and accounts for posted capacity.

Verify the precise invocation against version 29 before implementation. Do not assume `Modify` alone, or setting a date-time without validation, reproduces standard scheduling.

### Update requirements

1. Accept a complete operation identity and requested start, not client-calculated effort/load.
2. Re-read records, detect stale edits, and validate access/status/resource.
3. Reject finished operations and unsupported editing cases with an explicit reason.
4. Let Business Central calculate finish and propagate related operations.
5. Check every affected resource/date, including effects beyond the visible chart window.
6. Apply overload policy to the resulting schedule.
7. Persist scheduling and planner confirmation atomically.
8. Return authoritative results; reject/restore the visual drag on failure.

Use an explicit date/time contract across AL and JavaScript. Midnight is valid; missing dates are not. Verify browser/session time zones and daylight-saving transitions.

### Policies

| Policy | Behaviour |
|---|---|
| `WarnAndConfirm` | Show affected resource/date, available hours, allocated hours, and excess; save only after explicit acceptance |
| `Block` | Reject an edit creating or worsening daily overload on an affected resource/date; allow an improvement to an already overloaded plan and report the remaining overload |

Existing unrelated overload must not block an unrelated repair. Under `Block`, unchanged overload on affected dates is reported but is not alone grounds to reject an otherwise valid change.

No automatic next-free-slot search is included.

Implementation gate: prove that rejected recalculation rolls back all manufacturing changes, and that warning/acceptance can be implemented without hidden commits or locks held across a user dialog. If a separate preview/retry is needed, discard preview writes and re-read/recalculate on acceptance to detect concurrent changes. Do not use database writes inside a try function as a rollback strategy.

Daily overload checks do not prove interval-level feasibility. Preserve standard constrained-resource behaviour, but do not advertise a new universal finite-capacity engine.

## 9. Setup and screen overrides

Create a company singleton table and setup page, both named `CF_ProductionSchedulerSetup` in their respective object types.

| Field | Type/purpose | Proposed initial value |
|---|---|---|
| `PrimaryKey` | Singleton key | Fixed key |
| `DefaultViewDays` | Positive integer | 14 |
| `DefaultViewMode` | `CF_SchedulerViewMode` enum: Hour, Day, Week, Month | Day |
| `IncludePlanned` | Boolean | No |
| `IncludeFirmPlanned` | Boolean | Yes |
| `IncludeReleased` | Boolean | Yes |
| `IncludeSimulated` | Boolean | No |
| `OverloadPolicy` | `CF_SchedulerOverloadPolicy` enum | `WarnAndConfirm` |

Expose status selection as one multi-select picker; the Boolean fields are the simple persisted representation, not a requirement to expose four disconnected switches. Do not store a locale-dependent comma-separated caption list.

Scheduler behaviour:

- Initialise from setup.
- Allow users to change visible status selections and refresh.
- Reject an empty selection with a clear message.
- Changing screen selections does not silently overwrite company defaults.
- Provide an explicit setup/save-defaults action.
- Finished orders are outside phase-one scheduling.
- Keep overload policy company-controlled in phase one; any later user override requires a deliberate permission/design decision.

## 10. AL and control add-in design

```text
CF_ProductionScheduler
  -> CF_ProductionSchedulerMgt
     -> Standard manufacturing records
     -> Temporary display buffers
     -> JSON payload
  -> CF_ProductionSchedulerAddIn
     -> Resource timeline / top panel / capacity indicators
     -> User intent events back to AL
```

### Proposed objects

Allocate IDs from 91300-91599 after checking actual project use. The names below are proposed, not already-created objects.

| Name | Type | Responsibility |
|---|---|---|
| `CF_ProductionScheduler` | Page | Scheduler options, control host, selection/drilldown |
| `CF_ProductionSchedulerSetup` | Table and page | Company defaults |
| `CF_ProductionSchedulerMgt` | Codeunit | Data assembly and validated scheduling |
| `CF_ProductionSchedulerAddIn` | Control add-in | JavaScript/CSS lifecycle and events |
| `CF_SchedulerResourceBuffer` | Temporary table | Work/machine hierarchy |
| `CF_SchedulerOperationBuffer` | Temporary table | Operations and confirmation/exception display |
| `CF_SchedulerCapacityBuffer` | Temporary table | Resource/date availability and load |
| `CF_ProductionScheduleState` | Table | Persistent operation confirmation snapshot |
| `CF_SchedulerOverloadPolicy` | Enum | `WarnAndConfirm`, `Block` |
| `CF_SchedulerView` | Permission set | Scheduler read access |
| `CF_SchedulerPlanner` | Permission set | Confirmation/setup writes and scheduling entry point; standard manufacturing permissions are also required |

Add a small status-selection helper only if required by the standard multi-select UI approach. Keep calculations in one management codeunit initially; split only when responsibilities genuinely require it.

All custom identifiers must follow the agreed naming. Captions can contain spaces. Existing Microsoft identifiers remain unchanged.

### Control contract

Suggested procedures/events:

- `LoadSchedule`: resources, operations, unconfirmed items, daily capacity, current selections, warnings, and server version information.
- `ControlReady`.
- `OperationSelected`.
- `OperationOpenRequested`.
- `OperationStartChangeRequested`.

JavaScript presents data and requests changes. AL owns permissions, calculations, validation, and persistence. User-visible strings must originate from localisable AL labels or a localised payload.

Package a pinned, licence-compatible timeline library and notices, rather than relying on a public runtime CDN. The neighbouring project uses `vis-timeline`; verify its suitability/licensing before reuse. No paid scheduling library or external scheduling service is assumed.

## 11. Scope boundaries

### Included

- Basic timeline, hierarchy, top unconfirmed panel, filters, navigation, and drilldown.
- Per-operation planning and persistent confirmation.
- Daily capacity/load/remaining/utilisation with explicit warnings.
- Due-date and status visibility.
- Manual start-date entry and horizontal drag.
- Standard propagation of routing calculations.
- Company defaults and current-screen overrides.
- Error handling, concurrency checks, and server-authoritative rendering.

### Deferred

- Cross-resource dragging and alternative-resource selection.
- Effort editing through resize.
- Custom split/merge operations, sequence optimisation, and next-slot search.
- Material-aware scheduling, purchase/subcontract coordination, and delivery promises.
- Full histogram designer, custom saved views, scenarios, and separate plan publishing.
- Mobile/MES/shop-floor data collection, maps, and integration hubs.

Existing parallel/send-ahead/subcontracting routings must not be damaged. Display available standard data; explicitly reject unsupported edits rather than silently applying a simplified routing model.

## 12. Implementation stages and acceptance gates

| Stage | Deliverable | Gate |
|---|---|---|
| 1. Foundation | Setup, naming, permissions, independent dependency configuration | Builds against target symbols; setup persists |
| 2. Read-only board | Hierarchy, operations, top panel, details, drilldown | Complete operation identity; correct overlap filtering; no manufacturing writes |
| 3. Capacity | Calendar availability, allocations, units, warnings | Reconciles with standard load pages; no double counting |
| 4. Scheduling action | Set start, standard recalculation, confirmation, overload policy | All-or-nothing updates; correct dependency propagation |
| 5. Drag interaction | Horizontal drag calling stage 4 path | Same result as date-entry action; rejected drag restores truth |
| 6. Verification | AL tests, focused UI checks, updated user/developer documentation | All acceptance scenarios below pass |

Build the non-drag scheduling action before enabling drag. Do not maintain a separate calculation path for dragging.

### Required acceptance scenarios

1. Setup multi-select defaults load; screen changes refresh without rewriting defaults.
2. Firm Planned and Released operations display distinctly; statuses with identical order numbers do not collide.
3. A multi-line/multi-operation order has distinct bars using the complete routing identity.
4. Work and machine centres with matching numbers do not collide.
5. Direct work-centre operations remain distinct from child machine-centre work.
6. Unconfirmed operations with valid dates appear above the chart while their BC load still counts.
7. Orders without routing, missing-date operations, and missing-calendar resources are explicit exceptions.
8. Confirmation survives reopening and becomes stale after relevant external/resource/date/effort changes.
9. Routing regeneration and status transitions do not incorrectly inherit confirmation.
10. Eight hours at capacity 3, efficiency 100%, shows 24 resource-hours, not eight.
11. Eight hours at capacity 2, efficiency 80%, shows 12.8 resource-hours.
12. Hours/minutes/other supported capacity units convert correctly.
13. Consolidated parent capacity is not added to child capacity; independent-calendar cases reconcile separately.
14. Existing posted capacity is not subtracted twice.
15. Resource/date/status totals agree with standard BC load under identical filters.
16. Hiding an order's bar does not remove its competing demand.
17. Zero capacity with positive demand is visibly overloaded, not 0% utilised.
18. Moving an operation recalculates finish, related operations, and daily allocations; effects outside the viewport count.
19. `WarnAndConfirm` cancel leaves no writes; acceptance revalidates current data.
20. `Block` rejects new/worsened overload and allows genuine improvement to an overloaded plan.
21. Two planners editing the same operation produce an explicit stale-data response, not lost changes.
22. Finished/blocked/unsupported edits fail clearly and restore the authoritative chart.
23. An operation starting before the window and finishing inside it remains visible.
24. Midnight, overnight work, breaks, holidays/absence, mixed shifts, session/browser time zones, and daylight-saving boundaries are correct.
25. Payload size/query limits are explicit. Never silently omit data: show a clear instruction to narrow the range when a limit is exceeded.
26. Read-only users can view but cannot schedule; mutation permissions are enforced in AL.
27. All new objects/fields follow naming rules; the independent extension builds against Business Central 29.

Performance thresholds and representative order/resource volumes must be agreed before performance sign-off; do not invent an unverified response-time guarantee.

## 13. Remaining implementation decisions

These are the remaining targeted questions, not blockers to documenting the plan:

1. Approve the proposed initial status selection, 14-day period, and `WarnAndConfirm` default.
2. Confirm the committed-load status scope: recommended Firm Planned + Released, with any additional selected non-simulated planning statuses added rather than hidden competing load removed.
3. Confirm whether phase one must allow editing complex parallel/send-ahead/subcontract operations or display them read-only initially.
4. Confirm scheduler entry points: search plus Released/Firm Planned Production Order actions is recommended.
5. Provide representative production order/resource counts and the largest normal date window for performance acceptance.

No additional approval is needed merely to keep the Markdown document current; implementation choices should be resolved before enabling manufacturing writes.

## 14. Source register

All web sources below were checked on 3 November 2026. Features are paraphrased from the pages, not verified by installing the products. No product pricing/licensing comparison is implied.

| ID | Source | Used for |
|---|---|---|
| S1 | [Insight Works - Graphical Scheduler](https://dmsiworks.com/apps/graphical-scheduler) | Basic workstation visualisation, manual adjustment, operation details, calendar views |
| S2 | [NETRONIC - Visual scheduler comparison](https://www.netronic.com/visual-scheduler-comparison) | VPS/VAPS scope distinction, capacity visibility, late operations, advanced materials/alternatives/automation |
| S3 | [Dime.Scheduler - Production Orders](https://docs.dimescheduler.com/integrations/bc/modules/production) | Routing-line planning, work/machine resources, status indication, BC validation/recalculation |
| S4 | [Dime.Scheduler - Features](https://www.dimescheduler.com/features) | General filtering, grouping, workload reporting and broader-platform features; not proof of manufacturing-specific optimisation |
| S5 | [Microsoft Learn - Set up work centers and machine centers](https://learn.microsoft.com/en-us/dynamics365/business-central/production-how-to-set-up-work-and-machine-centers) | Hierarchy, units, efficiency, capacity, consolidated calendars, standard finite/infinite scheduling context |
| S6 | [Microsoft Learn - Create routings](https://learn.microsoft.com/en-us/dynamics365/business-central/production-how-to-create-routings) | Per-order setup, quantity-related run effort, concurrency, routing context |

### Local implementation evidence

- [Calendar Entry table](../../Microsoft%20Base%20App%2029/src/Manufacturing/Capacity/CalendarEntry.Table.al): capacity and efficiency calculation.
- [Work Center table](../../Microsoft%20Base%20App%2029/src/Manufacturing/WorkCenter/WorkCenter.Table.al): calendar/load FlowFields and requested-only exclusion.
- [Machine Center Load Lines page](../../Microsoft%20Base%20App%2029/src/Manufacturing/MachineCenter/MachineCenterLoadLines.Page.al): available, allocated, remaining, and utilisation calculation.
- [Shop Calendar Management codeunit](../../Microsoft%20Base%20App%2029/src/Manufacturing/Capacity/ShopCalendarManagement.Codeunit.al): capacity-unit time factors.
- [Prod. Order Routing Line table](../../Microsoft%20Base%20App%2029/src/Manufacturing/Document/ProdOrderRoutingLine.Table.al): date-time validation and routing recalculation.
- [Prod. Order Capacity Need table](../../Microsoft%20Base%20App%2029/src/Manufacturing/Document/ProdOrderCapacityNeed.Table.al): operation-level allocated needs.
- [Calculate Routing Line codeunit](../../Microsoft%20Base%20App%2029/src/Manufacturing/Routing/CalculateRoutingLine.Codeunit.al): generation/distribution of capacity needs and posted-capacity adjustments.

## 15. Implemented phase one

### Entry points and setup

- Search Business Central for **Production Scheduler** or **Production Scheduler Setup**.
- Released and Firm Planned production order cards also expose a Production Scheduler action, filtered to that order.
- Setup defaults are Day view, 14 days, Firm Planned + Released, and Warn and Confirm.
- The status picker is a standard temporary **List** page in lookup mode with selection checkboxes. A repeater on a StandardDialog is not supported by the web client and is deliberately not used.
- View options remain session-level. Use Setup to change company defaults, or Load Defaults to reload them into the current view.
- Assign `CF_SchedulerView` for viewing, or `CF_SchedulerPlanner` for scheduling/setup. Planners also require the normal Business Central manufacturing permissions; the extension does not elevate their rights to standard manufacturing tables.
- Read-only opening does not insert setup or confirmation records. Setup is first persisted when its administration page is opened by an authorised user.

### Implemented object map

| Type / ID | Name | Source |
|---|---|---|
| Page 91300 | `CF_ProductionScheduler` | [Scheduler page](src/Page/CFProductionScheduler.Page.al) |
| Table / Page 91300 / 91301 | `CF_ProductionSchedulerSetup` | [Setup table](src/Table/CFProductionSchedulerSetup.Table.al), [setup page](src/Page/CFProductionSchedulerSetup.Page.al) |
| Table 91301 | `CF_ProductionScheduleState` | [Confirmation state](src/Table/CFProductionScheduleState.Table.al) |
| Table 91302 | `CF_SchedulerCapacityBuffer` | [Temporary capacity snapshot](src/Table/CFSchedulerCapacityBuffer.Table.al) |
| Table 91303 / Page 91302 | Status buffer / picker | [Status picker](src/Page/CFSchedulerStatuses.Page.al) |
| Codeunit 91300 | `CF_ProductionSchedulerMgt` | [Payload, identity, dates, drilldown](src/Codeunit/CFProductionSchedulerMgt.Codeunit.al) |
| Codeunit 91301 | `CF_SchedulerCapacity` | [Capacity calculations and comparison](src/Codeunit/CFSchedulerCapacity.Codeunit.al) |
| Codeunit 91302 | `CF_ProductionScheduleChange` | [Transactional scheduling](src/Codeunit/CFProductionScheduleChange.Codeunit.al) |
| Enum 91300 | `CF_SchedulerOverloadPolicy` | [Overload policy](src/Enum/CFSchedulerOverloadPolicy.Enum.al) |
| Control add-in | `CF_ProductionSchedulerAddIn` | [Control contract](src/ControlAddIn/CFProductionSchedulerAddIn.ControlAddIn.al) |
| Permission sets 91300 / 91301 | `CF_SchedulerView` / `CF_SchedulerPlanner` | [Viewer](src/PermissionSet/CFSchedulerView.PermissionSet.al), [planner](src/PermissionSet/CFSchedulerPlanner.PermissionSet.al) |

All AL objects use namespace `CloudFactory.ProductionScheduling` and the requested object/field naming. Permission-set names are shortened because AL limits those identifiers to 20 characters. File names follow CodeCop's object-type suffix convention.

### Implementation decisions relative to the specification

1. **No third-party timeline dependency.** The basic board uses packaged JavaScript/CSS, native DOM, Pointer Events, CSS sticky labels, and a small tested civil-time module. No CDN, npm runtime dependency, or external scheduling service is needed. This replaces the earlier tentative timeline-library recommendation and keeps the first version self-contained.
2. **Resource/operation projections use JSON directly.** Separate resource and operation temporary tables were unnecessary. A temporary capacity table is used for transactional before/after comparison, and a temporary status table backs the picker.
3. **Operation identity is the routing record SystemId.** It uniquely addresses the full standard routing key without delimiter collisions. Regenerated records receive new IDs and do not inherit old confirmation.
4. **Confirmation is conservative.** It stores the routing row version plus the identities/versions of matching production lines. Any change to those records invalidates confirmation, including some changes unrelated to scheduling; this favours explicit planner review over stale approval.
5. **Capacity scope is fixed and clearly labelled:** all Planned, Firm Planned and Released orders, including hidden/unconfirmed orders. Simulated orders are view-only and excluded from committed load. This is intentionally more conservative than tying safety checks to visible status filters.
6. **Unconfirmed operations appear in the top panel and as dashed bars when valid dates overlap the view.** This makes their existing capacity allocation visible without claiming they are planner-confirmed.
7. **Search filters only the display.** The client-side order/item/operation search does not change capacity numbers.
8. **Complex orders are view-only:** parallel routing, send-ahead quantities, subcontracting, and manually fixed routing operations. Explicit reasons and standard routing drilldown are provided. Standard finite-resource behaviour remains under Business Central, not a new custom engine.
9. **Daily resource totals, not additional pools.** Direct-work-centre lanes show direct load only. Parent capacity is not duplicated as direct-lane availability. Consolidated calendars retain standard work-centre semantics.
10. **Drag changes only start.** Horizontal movement snaps the delta to 15 minutes. The original start precision is preserved. Date entry supports an exact start request. No resizing or cross-resource drag is enabled.

### Control add-in lifecycle and current API patterns

- Startup, refresh and recreate scripts use an idempotent initialise routine.
- Old DOM listeners are cancelled with `AbortController` on re-render/recreation.
- Calls use `InvokeExtensibilityMethod(name, arguments, false, successCallback, errorCallback)`: mutations are not silently skipped when BC is busy.
- Only one client request is in flight at a time; mutation buttons and dragging are blocked while waiting.
- Browser bars do not become authoritative on drop. They are restored while the server request runs and replaced by a server-reloaded payload.
- Failed requests show an explicit alert and disable further mutation until refresh.
- Labels come from AL labels in the payload. Dynamic content is written with `textContent`, not HTML interpolation.
- Date/time strings are BC-session civil timestamps, without browser timezone conversion. Midnight is handled explicitly. UTC coordinates in the JavaScript core are arithmetic coordinates only, not a claim that the BC session uses UTC.
- Keyboard-accessible buttons and date entry provide a non-drag scheduling route. The control supports narrow layouts and horizontal scrolling.

Current Microsoft references:

- [Control add-in object](https://learn.microsoft.com/en-us/dynamics365/business-central/dev-itpro/developer/devenv-control-addin-object)
- [InvokeExtensibilityMethod and completion/error callbacks](https://learn.microsoft.com/en-us/dynamics365/business-central/dev-itpro/developer/methods/devenv-invokeextensibility-method)
- [Codeunit.Run transaction semantics](https://learn.microsoft.com/en-us/dynamics365/business-central/dev-itpro/developer/methods-auto/codeunit/codeunit-run-method)

### Transaction and overload handling

The page uses Boolean-returning `Codeunit.Run` as a transaction boundary. The mutation method uses `CommitBehavior::Error` to reject explicit commits during recalculation. It rechecks current routing/order/line versions, validates resource and routing eligibility, and calls standard `Validate("Starting Date-Time", ...)`.

The worker snapshots standard committed demand before and after the change, including dates outside the visible window. It checks daily allocations at machine level and work-centre summary level.

- Block rejects a newly overloaded or worsened resource-day. It does not prevent an improvement to an already overloaded plan.
- Warn and Confirm first raises a controlled overload result, rolling back the transaction. Only then does the page ask for confirmation, outside the failed transaction.
- Acceptance retries from fresh source data. The warning report includes exact capacity-minute values, so changes hidden by rounded hours cannot be silently accepted.
- A changed overload report on retry is rejected with a refresh/retry message.
- Standard routing and planner confirmation are saved in the same successful transaction.
- The selected order's changed operation count is reported and the board is reloaded. Other operations whose source versions changed become unconfirmed.

No manufacturing writes occur in try functions. The two try functions only parse input or build a read-only payload.

### Safety limits

The basic implementation rejects an oversized view or validation rather than returning a partial schedule:

- 1-366 visible calendar days, independent of the Auto Schedule horizon.
- At most 200 resource rows, including summary/direct rows.
- At most 3,000 routing/order records scanned and 1,000 operations displayed.
- At most 6,000 calendar intervals and 50,000 capacity-need entries per rendered resource in the display period.
- At most 50,000 committed capacity-need entries in a scheduling snapshot.
- At most 30 overloaded resource-days in a confirmation report.

Capacity snapshot validation currently scans company-wide committed needs to catch propagated changes outside the viewport. This is deliberately bounded but needs performance testing with representative company data before use on a large installation.

### Validation completed locally

- Isolated AL compilation against the supplied Microsoft version 29 symbols succeeded.
- CodeCop and UICop were run. The unsupported dialog repeater and other reported code/UI issues were corrected.
- [Automated JavaScript tests](tests/schedulerCore.test.js): 44 passing tests covering civil dates, midnight/leap days, invalid dates, time-zone-independent arithmetic, viewport overlap, bar stacking, utilisation/zero capacity, capacity examples, drag snapping, date entry, object/field naming, packaged assets, all four timeline scales, nested calendar-header boundaries, bounded range navigation, compressed weekday-specific Hour windows, routing-link identities, unplanned-drop coordinates, calendar-based non-working-day filtering, full six-month/year displays, document-focus links, current-time positioning and problem-step filtering.
- Run locally with `node --test .\tests\schedulerCore.test.js`.
- The [browser fixture](tests/schedulerFixture.html) uses the actual packaged control scripts with a mocked BC bridge and clearly labelled test data.
- Browser checks passed for rendering, overlapping tracks, a bar crossing the visible boundary, safe text rendering, date-entry event payloads, authoritative refresh, hierarchy collapse/expand, day/week mode, search with unchanged capacity totals, failed-request disabling, horizontal drag and control recreation without duplicate controls.

The fixture does not calculate real manufacturing dates. Its successful callbacks are not evidence that Business Central database scheduling/rollback tests have passed.

### Sandbox release gates - not yet executed

The extension was built, not published. Before using it for live scheduling:

1. Publish to an authorised sandbox and assign the correct scheduler and manufacturing permissions.
2. Verify setup status multi-selection and company/session defaults in the BC web client.
3. Reconcile resource/day load with standard load pages for Planned + Firm Planned + Released, including partial posting and consolidated calendars.
4. Schedule a simple serial order and inspect routing dates, related operations, components and capacity needs.
5. Test Warn and Confirm acceptance/cancellation, Block rejection, and injected calculation errors; verify routing, components, capacity needs and confirmation state all roll back together on failure.
6. Test two users, stale routing/line versions and competing capacity edits.
7. Test reservations, standard constrained resources and installed subscribers. Explicit commits in the recalculation path are rejected, but external extensions and implicit codeunit commits need tenant-specific verification.
8. Verify session time zones and daylight-saving transitions against actual BC date/time values.
9. Measure the bounded scans with realistic data and review required limits.

These are deployment acceptance gates, not claims of completed runtime validation.

## 16. Default and session timeline views

The setup table now has `DefaultViewMode`, backed by enum 91301 `CF_SchedulerViewMode`. It supports Hour, Day, Week and Month. Day uses ordinal zero so existing setup records retain the previous default without a data migration.

- Set **Default View** on Production Scheduler Setup to choose the initial scale.
- Change **View** in **Schedule Options** or use the control's **Hour / Day / Week / Month** buttons to switch the current session.
- The AL page and control stay synchronised through `ViewModeChanged` and the `viewMode` payload value. Refresh, scheduling reloads and control recreation preserve the current session selection.
- **Load Defaults** restores the saved setup view. Session changes never modify the setup record.
- Hour displays **Week / Day / Hour** header rows. Day, Week and Month display **Month / Week / Day** header rows at progressively more compact scales. Weeks start on Monday; weeks crossing a month boundary are split beneath the corresponding month so all three rows align.
- Work-centre summaries use expand/collapse chevrons. Direct work-centre and machine-centre lanes are indented beneath their parent with a vertical hierarchy guide; capacity values and resource relationships are unchanged.
- **Days** controls the loaded date window (1-366 days from version 1.5); changing scale does not silently change that range or production dates.
- Capacity remains daily in every scale. Compact monthly cells retain full minute/hour details in their tooltips; they are not monthly or hourly capacity allocations.

The automated suite now includes view-scale widths/tick counts, partial-week boundaries, leap-year month lengths, year rollover and hourly civil-time grouping. Browser-fixture checks verified a Month startup payload, switching through all four modes, unchanged capacity/date ranges, and preservation of the session view on control recreation. AL compilation with CodeCop and UICop passed without diagnostics; the updated package has not been published.

Hierarchy follow-up checks verified the child-row indentation, expand/collapse, three header levels in every view, unchanged capacity and operations, and alignment over the maximum 62-day window (1,488 hourly ticks). Header cells use absolute civil-time positions to avoid accumulating browser rounding errors between levels. These are local browser-fixture checks, not live Business Central validation.

## 17. Full-page scheduler layout

- The Card page contains only the control add-in so Business Central can honour `VerticalStretch`. The promoted **Schedule Options** action opens [CF_SchedulerOptions](src/Page/CFSchedulerOptions.Page.al), a StandardDialog containing the existing view, start date, days, status picker, work-centre lookup and production-order lookup.
- **OK** validates and applies the options, then refreshes. **Cancel** leaves the current session unchanged. Neither path writes company defaults. Existing navigation, refresh, setup and drilldown actions remain available.
- The control fills its iframe. A flexible board replaces the fixed 510-pixel height cap and takes the remaining height after the top panel and operation details. Small windows retain a usable minimum board height with outer scrolling rather than clipping controls.
- Short date ranges stretch across the available width. Longer ranges preserve each view's minimum scale and scroll horizontally inside the board. Date headers, daily capacity, working intervals and bars share the same width; drag calculations use the rendered lane width.
- The browser fixture exposes `fixture.assertLayout()` for checks after viewport resizing and view changes. Live Business Central checks must still verify host stretching, dialog OK/Cancel, lookups, status selection and viewer-role access.

Local validation passed: 17 Node tests, JavaScript syntax checking and an 18-object AL build with CodeCop/UICop and no diagnostics. Browser layout checks passed for all four views at 1600x1200, 960x720 and 480x400 CSS-pixel viewports, plus 62-day ranges with vertical scrolling, sticky headers/labels and selected-operation details. At 1600x1200 the Day board grew to 839 pixels high instead of stopping at 510. Scaled drag arithmetic was checked against the rendered lane width; native pointer injection did not reach the shared browser page, so end-to-end drag and live BC host behaviour remain sandbox checks.

Reference: [Microsoft VerticalStretch property](https://learn.microsoft.com/en-us/dynamics365/business-central/dev-itpro/developer/properties/devenv-verticalstretch-property) documents the single-control Card-page requirement. The Card page is retained instead of UserControlHost because the latter does not support the scheduler's toolbar actions.

## 18. Auto Schedule and bounded range navigation (version 1.1)

This approved follow-up extends the original manual-only phase-one scope; it does not add material planning, alternative-resource selection or optimisation.

### Setup and usage

- **Auto Schedule Method**: **BC Finite Capacity (Serial)** (default), or **Standard Forward**.
- **Auto Schedule Priority**: **Earliest Due Date** (default; undated orders last), or **Production Order No.** Operations within each routing use the forward sequence as a secondary sort.
- **Maximum Schedule Days**: 1-365, default 90. From version 1.5 the visible window can contain up to 366 days independently; this setting still caps Auto Schedule.
- **Auto Schedule** is promoted on the scheduler page. It collects unconfirmed, unfinished operations matching the current status/work-centre/order filters. Search text remains display-only.
- A confirmation displays candidate count, method, priority and the actual date bounds, and explicitly warns about related changes and partial completion. Nothing is scheduled when the confirmation is declined.
- Earliest start is the current scheduler window start, adjusted for preceding routing completion. The upper bound is the end of the anchored navigation horizon. Moving the slider to the right reduces the remaining scheduling range.
- The bottom slider previews dates while moving and requests a server reload on release (or keyboard change). Default-view Previous/Next actions stay within the same display horizon. From version 1.5, complete preset/document windows have no smaller slider slice; Previous/Next shift the whole period and re-anchor it. Today, Specific Date, Load Defaults and accepted Schedule Options also re-anchor it. Setup changes refresh planning settings without replacing the current status filters.

### Scheduling mechanics and safety

- [CF_AutoSchedule](src/Codeunit/CFAutoSchedule.Codeunit.al) builds a temporary queue, then uses the existing transactional change worker for each operation. Each successful `Codeunit.Run` commits independently; failed attempts roll back their own routing/capacity/state changes, leaving earlier successes saved.
- Finite mode binds [CF_SchedulerFiniteScope](src/Codeunit/CFSchedulerFiniteScope.Codeunit.al) only for the current worker invocation/order. Its standard `Calculate Routing Line.OnBeforeGetConstrainedSetup` subscriber supplies constrained-resource calculation parameters for the assigned resource and parent work centre. It does **not** create or change persisted constrained-resource configuration.
- Standard BC finite loading searches setup/run-time gaps using calculated calendar intervals and existing capacity-need start/end timestamps, not chart bar width or daily-total approximations. It retains BC's **serial constrained-resource semantics**, including when capacity exceeds one; this is not parallel-capacity packing or a globally optimal schedule.
- Existing critical-load percentages are retained; default constraints use 100% and zero overload dampening. Standard Forward retains normal BC constrained-resource behaviour where the company already configured it.
- The worker preserves the existing locks, optimistic version check, standard routing validation/propagation and commit guard. Automatic mode rechecks confirmation and setup. It validates the selected and date-changed related operations against the horizon; capacity generation beyond its end also fails explicitly.
- Finite mode rejects affected daily overload even if company policy normally permits warnings. Standard Forward follows the configured Block/Warn policy, using the existing rollback-before-confirmation/retry approach.
- Existing eligibility restrictions still apply: simulated, finished, blocked/missing resources, parallel routings, send-ahead quantities, subcontracting and manually fixed routings are skipped or rejected with reasons.
- Limits: at most 3,000 routing records scanned and 100 unconfirmed operations per run; existing resource/payload and 50,000 capacity-need snapshot bounds remain. Exceeding the preparation bounds aborts before any scheduling.
- Each attempt rechecks its scope and eligibility. Related routing changes can invalidate an earlier confirmation; the results page rereads final starts/finishes and shows **Saved** separately from **Still Confirmed**, with an explicit review message when they differ.
- Results are temporary and remain available in the results dialog, not a persistent audit log. Errors are shown per operation; unusually long messages are explicitly marked as truncated.
- From version **1.4.1.0**, unsaved result lines (`Saved = false`, including failed, skipped or cancelled attempts) use Business Central's red **Attention** style across the order, status, operation, final dates and result text. Successfully saved lines retain normal styling even when later routing changes invalidate their confirmation; their existing review message remains.

### Deployment and validation

- Version raised to **1.1.0.0**. [CF_SchedulerUpgrade](src/Codeunit/CFSchedulerUpgrade.Codeunit.al) initializes a zero Maximum Schedule Days to 90 on existing company setup records during data upgrade. New records use the field's InitValue. Other setup values are preserved.
- Deploy the 1.1 package through the normal extension **upgrade** workflow, not schema synchronization alone. A zero/invalid horizon produces an actionable setup error instead of silently using an unbounded range.
- Planner permissions include the automatic worker, scoped subscriber, temporary results and read access to standard constrained-resource configuration. Manufacturing permissions are still required; none are elevated for production-order writes.
- Local checks: 18 Node tests, browser slider navigation to both ends of a 90-day range across year rollover, return to the original operations/capacity, all four views across three viewport sizes, one-day disabled-slider behaviour and explicit bridge-failure handling. These are not database scheduling tests.
- The final 1.1.0.0 package compiled with 25 AL objects and CodeCop/UICop without diagnostics. It has not been published or run against Business Central production data.

**Required Business Central sandbox checks before operational use:**

1. Upgrade an existing 1.0 installation: confirm the new horizon is 90 and other setup/status values remain unchanged.
2. Verify action permissions, candidate filters, due-date/order-number priority, Cancel and the 100-operation preparation limit.
3. Use a single-capacity resource with occupied 08:00-10:00 and 12:00-14:00 intervals: confirm a one-hour eligible operation uses a real free interval, not an overlapping daily allocation. Repeat across lunch breaks, non-working days, setup/run splits and existing lower critical-load percentages.
4. Validate machine-centre and parent work-centre load, capacity greater than one (serial semantics), posted consumption and direct work-centre operations.
5. Force a no-fit/calendar error after an earlier success: verify only the failed attempt rolls back, the earlier success remains, and both outcomes appear in results.
6. Exercise Standard Forward under Block and Warn, including declined warnings and a capacity change between confirmation and retry.
7. Verify related routing propagation, final confirmation invalidation, horizon enforcement, concurrent planners, reservations and tenant subscribers; verify scoped finite behaviour does not leak into later manual changes.
8. Check the slider and Previous/Next/Today/Options/Load Defaults in the real BC host, including changing Maximum Schedule Days while the scheduler is open.

## 19. Weekday-specific Hour view times (version 1.2)

- Production Scheduler Setup has separate **Start Time / End Time** fields for **Monday through Sunday**, under **Hour View Display Times**. Every day, including Saturday and Sunday, defaults to **07:00-18:00**.
- End must be later than start on the same day. Overnight or zero-length display windows are rejected explicitly. Partial hours and seconds are supported.
- These are **display settings only**. They do not change resource calendars, daily capacity totals, production dates, or the Auto Schedule search rules. Day, Week and Month views remain unchanged.
- Hour view compresses the hidden overnight spans. Week/day headers, hourly ticks, daily capacity cells, working-time shading, today markers and operation bars use the same visible-time projection. Days with different configured durations have proportional widths.
- Entirely off-hours operations are counted in an explanatory message, with guidance to use Day view. Unconfirmed operations remain in the top panel. Partially visible bars retain their actual dates in details/tooltips.
- Hourly dragging maps displayed time back to civil time, skipping hidden nights and retaining the existing 15-minute snap. A clipped bar whose actual start is outside the visible intervals must be scheduled through its date-entry details instead; its tooltip explains why. Drops outside the displayed intervals show a warning and make no request.
- Changing Setup and returning to the board reloads the times without replacing session statuses or the selected view.
- Version **1.2.0.0** includes a data upgrade that initializes previously absent (both zero) weekday time pairs to 07:00-18:00, preserving already configured nonzero pairs and other setup values. New setup records use field defaults. Deploy through the normal extension upgrade workflow.
- Local validation includes all seven weekday mappings, partial-hour cells, differing day widths, off-hours clipping, cross-night drag coordinates, seconds preservation, invalid-window rejection, DST-independent civil-time arithmetic and unchanged non-hour views. Browser checks verify hourly headers, capacity alignment, off-hours notices and the manual-entry alternative for clipped starts.
- Live Business Central upgrade, setup editing/validation, session time-zone formatting and real pointer dragging remain sandbox checks before operational use.

## 20. Operation hover details (version 1.2.1)

- Hover over an operation bar or an unscheduled operation to open a structured **Prod. Order Routing Line** card. Keyboard focus also opens it; Escape dismisses it.
- The card shows operation number/description, actual starting and ending date-times, status, production order number, previous/next operation numbers, resource, due date and planner confirmation. Dates retain Business Central session wall time without browser time-zone conversion.
- Each associated production order line has its own line number, item number, description, quantity and unit of measure. Shared routings show all matching lines rather than implying that the first item represents the entire operation.
- Setup/run effort and scheduling restrictions are included. Hour-view clipped starts retain the manual scheduling guidance. Blank predecessor/successor values display as a dash; no routing sequence is inferred.
- Captions come from standard AL field/table captions or extension labels. Hover reads the existing payload and sends no server requests or manufacturing writes.
- The card stays inside the control's viewport, flips above the bar when necessary and scrolls for long content. It remains open while the pointer moves onto it, and closes on selection, drag start, board scrolling, resize or refresh. Existing click-to-select and double-click-to-open-routing behaviour is unchanged.
- Browser regression checks are reusable through `fixture.assertHoverDetails()` in [the UI fixture](tests/schedulerFixture.html). Bring the fixture to the foreground and press Tab before running the check so the browser enables keyboard focus styling. It checks field values, multiple production lines, literal rendering of markup, keyboard/Escape support, hover persistence/dismissal, viewport containment, touch behaviour and absence of bridge requests.
- The package version is **1.2.1.0**. Live Business Central host behaviour and production-data field values still require sandbox validation before deployment.

## 21. Selected-order routing links and unplanned drops (version 1.3)

### Agreed behaviour

- Show routing arrows **only for the selected production order/status**, once at least one operation in that order is planner-confirmed. Dropping an unplanned step onto the timeline schedules and confirms it after successful Business Central validation. Existing Schedule start, Confirm and Auto Schedule confirmations also qualify.
- Clicking a timeline bar or an unplanned step selects it with a **gold highlight** and updates the routing arrows. Selection is preserved through refreshed data and view changes while the operation still exists in the payload.
- Blue curved arrows run from a predecessor's finish to its successor's start. AL resolves the actual Next/Previous Operation No. filters using the full status/order/routing-reference/routing-number identity and exports operation SystemIds. No sequence is guessed from operation numbers or dates; parallel branches are displayed without making parallel operations editable.
- The confirmed-step check includes the order's operations outside the current resource/date filter. It is cached per order within the payload build. Arrows themselves only connect rendered endpoints; the board reports links hidden by dates, Hour windows, search or collapsed rows. Hidden steps are not bypassed with invented direct links.
- Arrows remain aligned with bars after changing view, expanding/collapsing resources, filtering, resizing or scrolling. They do not intercept clicks or dragging.

### Dragging from unplanned

- Drag an editable step from the top list onto **its existing assigned resource row**. Work-centre summary rows and other resources are not valid targets; resource reassignment is intentionally unsupported.
- A vertical preview shows the requested start. Drops use the visible time projection in every view, snap to the nearest 15-minute clock time and stay inside the displayed interval. Partial-hour boundaries are respected; hidden nights are skipped in Hour view.
- The drop uses the existing `OperationStartChangeRequested` event and transactional scheduling worker. Business Central calculates finish/dependency changes and applies the same version, permissions, capacity, warning/rollback and eligibility checks as manual Schedule start.
- There is no optimistic date/confirmation update. The authoritative server refresh removes a successfully confirmed step from the unplanned list and updates its links. Rejected/failed requests retain authoritative data and show the existing error flow.
- Invalid target rows show guidance; invalid drops make no scheduling request. Read-only, busy or stale operations cannot begin a drop. Keyboard and touch users can continue selecting a step and using Schedule start.

### Verification and deployment

- Core tests cover selected-order gating, status/routing identity isolation, branch/deduplication handling, missing endpoints and drop coordinates across all four scales.
- `fixture.assertRoutingLinks()` in [the UI fixture](tests/schedulerFixture.html) verifies endpoint geometry, highlighting, filtering/collapse, view changes, valid/invalid drops, server-refreshed confirmation, read-only behaviour and failure handling. The fixture simulates the server response; it does not validate real manufacturing transactions.
- Local checks passed: 28 Node tests, a clean AL build with CodeCop/UICop, browser interaction checks across all four views at desktop/small viewport sizes, resize alignment and visual arrow/highlight inspection. Drop handlers were exercised using DOM drag events. Native mouse injection in the shared browser produced no pointer/drag events, so physical drag-and-drop remains a live-host validation gate.
- Package version: **1.3.0.0**. Validate real Business Central drag/drop hosting, routing filter resolution, capacity rejection, warning cancellation, propagated routing changes and confirmation invalidation in a sandbox before operational deployment.

## 22. Hide non-working days (version 1.4)

- The scheduler action bar offers **Hide Non-working Days**, replaced by **Show All Days** while hiding is active. The setting is session-only: opening a new scheduler or choosing Load Defaults restores all days. Changing view, range or Schedule Options retains the current hide/show choice.
- A day remains visible when **any resource in the current Schedule Options scope has positive calendar capacity**. This uses calculated effective available capacity, not remaining capacity, so fully booked working days are not hidden. Weekends can remain visible when worked; weekday holidays can be hidden when every scoped resource is closed.
- The calendar scope is independent of text search and collapsed rows. It includes the work centres and machine centres in the current resource scope. Intraday breaks are not removed by this action; Hour view still applies its configured weekday display times.
- All four scales compress hidden days consistently across date headers, capacity cells, operation bars, working-time shading, routing arrows and drag/drop coordinates. Today is not drawn on a different day when its date is hidden.
- These are display changes only. Production dates, confirmation states, calendar records, daily capacity values and Auto Schedule rules are unchanged. The selected date range and bottom navigator still measure calendar days, not the number of visible working days.
- A notice reports hidden days, matching operations entirely on those days, and hidden days with allocated load. Partially visible operations retain their actual dates; starts outside the visible periods must be changed through Schedule start instead of dragging a clipped bar.
- If every day is closed, the board explicitly says **No working days in this date range** and points to Show All Days, Schedule Options and calendar calculation. Unplanned operations, selected details and navigation remain available; no fabricated working day or drop target is inserted.
- Local verification includes 34 Node tests, a clean CodeCop/UICop build, and the reusable `fixture.assertNonWorkingDays()` browser check in [the UI fixture](tests/schedulerFixture.html). Tests cover mixed resource calendars, working weekends, closed holidays, load on closed days, all four views, hidden operation notices, link alignment, empty calendars and full restoration without changing scheduling data.
- Package version: **1.4.0.0**. Live Business Central action visibility/session behaviour and real calendar data remain sandbox checks before deployment; the existing native drag/drop validation gate still applies.

## 23. Document zoom and personal date presets (version 1.5)

### Date View actions

- **Zoom to Document** uses the selected routing step to identify the exact production-order number **and status**. It clears the work-centre and client text filters, expands resources and shows all of that order's routing steps, including finished steps as read-only. Only used resource lanes and their work-centre parents are loaded. Other orders remain included in capacity totals.
- The date frame covers the earliest valid routing start through the last occupied day without a 62-day truncation; an operation ending at midnight does not add an unused following day. Day/Week/Month scale is selected for the span and the complete timeline fits the board width. Non-working days are temporarily shown so they cannot conceal document steps.
- Actual predecessor/successor links are shown in document focus even before planner confirmation. The selected step remains highlighted. Finished steps are not offered as unplanned work. This does not infer a linear sequence or bypass a hidden routing step.
- If no routing steps have valid dates, the existing period is retained with an explicit notice; undated unfinished steps remain in the unplanned list. A document spanning more than 366 days, or exceeding the operation/resource limits, raises an error rather than showing a partial document.
- **Restore Previous View** restores the pre-zoom dates, scale, filters, non-working-day choice, selection, client search, collapsed resources and board scroll position. Repeated zooms retain the original restoration point. It does not undo manufacturing changes made while focused.
- **Change Preset** opens the user's preset list. Built-in toolbar choices are **Today** (one day, Hour), **Next 2 Weeks** (Day), **Next 3 Months**, **Next 6 Months**, and **Upcoming Year** (Month). All start from actual **today**, not the Business Central work date.
- Months and years use BC date formulas, not fixed 90/180/365-day approximations. The calculated end is exclusive: a six-month preset beginning 1 January 2028 includes every day through 30 June 2028 (182 days); the year includes 366 days.
- **Specific Date** moves the current period to a chosen start while retaining its length, filters and scale. **Undo Date Change** provides one-level undo of dates/scale, not document/resource filters. Use Restore Previous View to leave a document focus and recover all prior context.
- Presets retain existing document/resource/status filters and the non-working-day choice. Only Zoom to Document explicitly clears conflicting filters. A long range does not imply showing excluded orders.
- Fitted overviews hide crowded day/capacity text, retaining month/week structure, calendar cells, overload colours and full hover/accessible descriptions. Choosing Hour/Day/Week/Month afterwards exits fitted mode for readable horizontal scrolling, without changing the loaded period.

### Personal relative presets

- [CF_SchedulerDatePreset](src/Table/CFSchedulerDatePreset.Table.al) stores presets per user and company, with code, name, display order, start/end date formulas, scale and fit preference. Both formulas are relative to today; the end is exclusive.
- **Save Date Preset** preserves calendar-month/year formulas when the current window still matches them. Other windows are saved as relative day offsets, not fixed dates. The save dialog permits formula changes and rejects duplicate codes and invalid ranges.
- **Manage My Date Presets** supports create/edit/delete/order. Standard presets are initialized when opening the preset picker, management page or save dialog for a user with no presets. Deleting all presets causes the standard set to be created on the next such opening. Merely opening the scheduler does not create presets or write manufacturing data.
- The list enforces the current owner filter and table triggers reject writes/renames/deletes for another owner. Viewer permissions include personal-preset management but do not grant manufacturing modifications. This UI/trigger ownership mechanism is not a claim of database row-level security against other extensions or privileged access.
- Company defaults are not overwritten by presets, zoom or ordinary date changes. Existing setup records do not need preset migration.

### Display range versus scheduling horizon

- Default View Days and Schedule Options allow 1-366 days. Default navigation spans the larger of that visible period and Maximum Schedule Days. A preset or document focus displays its entire requested period.
- Auto Schedule still uses `RangeStartDate + MaximumScheduleDays - 1` as its last allowed date, starting at the visible start. In a default navigable window, moving the slider consumes part of that same horizon. Presets and document zoom re-anchor the horizon but never increase its configured length. For example, a six-month display with Maximum Schedule Days = 90 still permits at most 90 days of automatic scheduling.
- A one-day preset also does not reduce the configured Auto Schedule horizon to one day; the confirmation always shows the actual scheduling bounds. Worker-side horizon validation and the 100-candidate limit are unchanged.
- Long display payloads aggregate calendar capacity and committed demand once per resource/date range rather than querying each day separately. Status/order display filters never filter competing capacity demand. Direct work-centre lanes remain load-only; their capacity is not counted twice.
- Capacity cells use the same absolute date positions as headers, avoiding cumulative pixel rounding across a year. Client date-position lookups are precomputed once per board.

### Validation and deployment

- Package **1.5.0.0** adds six AL objects (31 total). AL compilation with CodeCop and UICop passed without warnings or errors; 38 Node tests and JavaScript syntax checks passed.
- [The browser fixture](tests/schedulerFixture.html) includes `fixture.assertDateViews()` for full six-month and leap-year rendering, fitted width, routing links before confirmation, finished-step presentation, search/collapse restoration and absence of manufacturing requests during display transitions.
- Date-view checks and existing routing, non-working-day, hover and layout regressions passed at 1600x1200, 960x720 and 480x400 CSS pixels. Browser focus emulation was used to keep the shared hidden tab responsive; this does not replace physical drag/drop testing in Business Central.
- These are local compiler/core/UI checks, not Business Central database tests. Before deployment, verify real action menus, per-user/per-company preset persistence and ownership, localized date formulas and month-end boundaries, undo/restore in the BC host, order/status resource filtering, aggregation against standard capacity totals, and an Auto Schedule run with a six-month display and a shorter configured horizon.
- Test large real calendars and capacity-need volumes before using annual views broadly. Safety limits raise explicit errors rather than truncating results. Existing native drag/drop and transactional scheduling sandbox gates remain.
- The package has not been published by the assistant.

## 24. Current-time indicator (version 1.5.1)

- A thin red vertical line replaces the old midnight/today marker. It runs continuously through the sticky date header, work-centre summaries, capacity strips and operation rows. The header's left column shows the current date and time.
- AL supplies the actual `CurrentDateTime()` converted to the **Business Central session's wall time**, matching routing timestamps. The browser does not substitute its own time zone, work date or screenshot time.
- The control requests a new timestamp every minute and on returning to a visible tab. This small read-only event updates the marker without rebuilding operations or reloading capacity. Busy requests and active drags defer the clock refresh. Refresh/recreation clears the previous timer.
- A new server timestamp handles midnight and daylight-saving transitions without accumulating a fixed browser-side UTC offset. The line uses the shared timeline projection in Hour/Day/Week/Month, fitted overviews and compressed non-working-day views.
- If now is outside the visible range, an excluded day or an Hour-view display window, no line is drawn; it is never snapped to a different visible time. The header clock remains available whenever a timeline is displayed. All-closed empty views have no line.
- The line ignores pointer events, stays behind sticky resource labels and does not change order dates, confirmation or capacity. Connection/rendering failures use the existing explicit error state and remove the marker rather than leaving a misleading active indicator.
- Local verification: clean AL build with CodeCop/UICop; 41 passing Node tests; `fixture.assertCurrentTime()` and date-view, routing, non-working-day and hover regressions at 1600x1200, 960x720 and 480x400 CSS pixels. Current-time checks cover alignment, full-height coverage, non-interference with pointer input, in-place updates and hiding out-of-range/off-hours times.
- Package **1.5.1.0** is built but not published. Verify the minute refresh, session time-zone conversion and tab/host lifecycle in Business Central before deployment.
- A timed browser-fixture check also confirmed one automatic clock request and an updated line after the minute interval, with no duplicate requests from repeated rendering.

## 25. Problem-step borders and display filtering (version 1.6)

### Appearance and usage

- Steps with detected scheduling problems use a **red border with a neutral white fill**, rounded corners and a subtle neutral hover state, rather than a solid red task bar. This applies to timeline bars and the unplanned list. Unconfirmed timeline bars retain their dashed border; the selected step keeps its gold selection outline without losing its red problem border.
- Hover cards and selected-step details list the reported reasons. The unplanned card shows the first reason; its hover card shows the complete list. Rendering uses text content, not HTML.
- **Schedule Options > Include Problem Steps** is enabled by default. Turn it off to hide problem bars and unplanned cards. A notice reports the hidden count. Hidden selected steps no longer expose their details/actions, and routing arrows never invent a bypass around hidden operations.
- This is **display-only**: resource rows, calendars, capacity totals, order dates, confirmation states and Auto Schedule eligibility are unchanged. Auto Schedule can still try to resolve hidden problem steps; its tooltip and confirmation explicitly state this.
- The choice lasts for the current scheduler session and is retained by date presets and date undo. Load Defaults includes problems again. Zoom to Document temporarily includes them to show the full routing; Restore Previous View restores the former choice.

### Problem detection

- Existing scheduling restrictions and data issues contribute diagnostics: blocked/missing/mismatched resources, missing/invalid routing dates, missing calculated capacity needs, zero routing effort, missing production lines and unsupported/manual routing cases. An unfinished step ending before today or an order finishing after its due date is also marked.
- Finished/simulated status **alone** is not a problem. Finished routing steps are not marked late or missing capacity merely because they are historical or no longer carry demand. Simulated steps do not undergo committed-capacity checks, but genuine date/resource diagnostics and lateness remain applicable.
- Capacity checks use positive, committed **Prod. Order Capacity Need** allocations for that exact routing step, not every calendar day between its start and finish. A closed weekend with no allocation is not itself a problem.
- On an allocated date, zero/non-positive effective available capacity produces a no-capacity problem. Allocated minutes exceeding available minutes by more than `0.001` produce an overload problem. Fully utilized but not overloaded capacity is not an error.
- Machine-centre steps check both their assigned machine and parent work centre. Direct work-centre steps use the work centre's real available capacity and total load, **not** the load-only direct lane's zero available value. Competing Planned/Firm Planned/Released demand remains included regardless of display filters.
- Checks include allocation dates outside the displayed period. The current view's daily totals are reused in a temporary cache; other resource/day totals are queried once and cached. For each resource and capacity-problem type, the first encountered affected date is reported to avoid repeating the same reason for every setup/run allocation.
- Steps without positive allocations remain problems because capacity calculation is missing. Where the routing dates are valid, the absence of working calendar capacity throughout that period is also reported. A midnight finish does not include an unused following date.
- Undated allocations and allocations assigned to a different resource than the routing are flagged explicitly. Detection is bounded at 50,000 positive allocation entries across displayed operations; exceeding the limit raises an error instead of returning partially classified steps.
- This remains a **daily-capacity** diagnostic, not a new intraday finite-slot, material-shortage or routing optimiser. Existing fatal configuration/data errors still stop payload generation explicitly; they are not replaced with fabricated capacity figures.

### Validation and deployment

- Package **1.6.0.0**, still 31 AL objects. CodeCop/UICop compilation passed cleanly; 44 Node tests and JavaScript syntax checks passed.
- [The browser fixture](tests/schedulerFixture.html) adds `fixture.assertProblemSteps()`: red borders/neutral fills, hover reasons, gold selection coexistence, hiding/restoring both surfaces, unchanged capacity and manufacturing data, hidden-link counts, resolved-problem refresh and all-problem empty views. Checks and existing date/routing/calendar/clock/hover regressions passed in all scales at 1600x1200, 960x720 and 480x400 CSS pixels.
- Native BC verification remains required: zero-capacity and overloaded allocation days; parent-only overload; direct work-centre demand; weekend gaps with no allocation; allocations outside the viewport; missing needs and blocked resources; finished/simulated cases; option cancellation, zoom/restore and Auto Schedule with problems hidden. Compare diagnostics against standard capacity pages and verify that correcting a problem removes its border after refresh.
- Built, not published. Browser fixtures do not validate real database capacity calculations.

## 26. Shared draft scenarios and explicit Commit to BC (version 2.0)

### Confirmed behaviour

- Multiple named scenarios, **shared within the current company**, with concurrent-edit checks.
- Draft routing, metadata and allocations persist in separate tables. Dragging, manual start edits, confirming existing dates and Auto Schedule write **only the draft**.
- Moving an operation recalculates following operations in the same routing identity, respecting predecessor finishes. An edit and its downstream changes succeed or fail together.
- The promoted toolbar action **Commit Entire Schedule to BC** processes **every changed order in the active scenario** in one batch, including orders hidden by status, date, work-centre, document, problem or text filters. Its confirmation states this explicitly. Unchanged orders are not rewritten.
- Each production order commits atomically. A failed order rolls back; the batch records the failure and continues with other orders.
- Changes to the BC order, lines, routing, components or capacity needs since import block that draft order. Reset/replan rather than silently overwrite the new BC state.
- BC-calculated dates must match every draft routing step, and daily operation allocations must agree within `0.001` minutes. A difference rolls back the whole order instead of accepting a different schedule.

### First use and right-click actions

1. Open **Scenarios**, create a code/description and select it. Scenarios are not automatically populated.
2. Set **Schedule Options**, then **Import Orders**. New matching orders are copied with **all their routing steps**, even steps on resources outside the filter. Existing drafts are never overwritten by Import Orders.
3. Optionally select **Default Scenario** in Production Scheduler Setup. With no default, the first available scenario opens; with no scenarios, the board explains how to start.
4. Plan by drag/drop, selected-step start entry, or Auto Schedule. The heading identifies the active scenario. Schedule Details reads the draft routing table and shows draft dates beside the BC dates captured at import.
5. After scheduling the orders, choose **Commit Entire Schedule to BC**, confirm the batch, then inspect **Commit to BC Results**. Use the right-click **Commit This Order to BC** action for just one order. Successful orders refresh their own baseline and clear uncommitted changes. Other scenarios remain independent and will detect the resulting BC conflict on refresh.

Right-click a timeline bar or unplanned step, or use **Shift+F10 / Context Menu key**:

| Action | Behaviour |
|---|---|
| Schedule Details | Read the selected order's routing from the draft table |
| Edit Draft Start | Enter a start and recalculate following draft steps |
| Zoom to Document | Fit the draft order's dates and show its linked steps |
| Reset Order Draft from BC | Confirm discarding this order's draft and copy its current BC state |
| Commit This Order to BC | Apply the same atomic/conflict-checked commit to this order only |
| Open Production Order | Open the native BC document, without implicitly committing the draft |

The menu is viewport-clamped and keyboard navigable, returns focus on Escape, and closes on selection, outside click, scrolling, resize, refresh or error. Unavailable mutation actions are disabled. The current-time timer does not interrupt an open menu.

### Data and isolation

| Object | Purpose |
|---|---|
| [CF_ScheduleScenario](src/Table/CFScheduleScenario.Table.al) | Company-shared scenario identity and write serialization |
| [CF_ScheduleDraftOrder](src/Table/CFScheduleDraftOrder.Table.al) | Full BC baseline token, order revision, import/commit timestamps and dirty flag |
| [CF_ScheduleDraftOperation](src/Table/CFScheduleDraftOperation.Table.al) | Draft dates, resource/routing identity, effort, dependencies and frozen detail payload |
| [CF_ScheduleDraftAllocation](src/Table/CFScheduleDraftAllocation.Table.al) | Actual draft calendar intervals and allocated minutes |
| [CF_DraftScheduleChange](src/Codeunit/CFDraftScheduleChange.Codeunit.al) | Isolated calendar calculation and transactional draft edits |
| [CF_ProductionScheduleChange](src/Codeunit/CFProductionScheduleChange.Codeunit.al) | Explicit, whole-order BC commit worker; no longer an immediate-edit worker |

- Draft operations retain the source routing SystemId and the full status/order/reference/routing/operation identity. Metadata in hover/details comes from the imported snapshot, not a fresh live routing read.
- Writes serialize through the scenario header. Requests also check the order revision and operation row version, preventing another planner's unseen edits from being overwritten.
- Auto Schedule captures revisions before confirmation and advances them only for changes made by its own successful workers. External intervening changes are rejected.
- Baselines include record IDs and row versions, so inserted/deleted routing, line, component and capacity records are detected as well as modifications. Import checks for changes during the snapshot and aborts inconsistent imports.
- Refresh reloads the scenario and live competing load; it **does not reset/reimport** a draft. Reset is explicit and confirmed. An order removed from BC or moved to another status cannot be reset under its old identity; import the current status into a fresh scenario or retain the old scenario for review.
- This release retains the current baseline and last-commit time, not an immutable scenario history/audit journal. Nonempty scenarios cannot be renamed or deleted through the scenario page.

### Draft calculation and supported scope

- The standard BC routing calculator uses persistent routing/capacity records. Passing it a temporary input record does not isolate those writes. Draft calculation therefore never calls that calculator or performs live-write/restore experiments.
- For the supported serial case, effort is the already-calculated, positive setup/run demand captured from BC in minutes, including BC's quantity/lot-size calculation. Scheduling distributes that demand across positive manufacturing-calendar intervals using their efficiency, skipping closed periods and preserving allocation dates.
- **Initial draft restrictions:** one concurrent capacity, no queue/wait/move time, no parallel/send-ahead/subcontracting/manual-fixed routing, and no partially consumed/distributed or inconsistent demand. Such orders remain visible with explicit restrictions, not approximate editable schedules. Missing demand requires a BC refresh followed by draft reset.
- Calendar intervals must be non-overlapping, positive, and provide at least one capacity after absences. Finished downstream steps, missing/cyclic/inconsistent dependencies and exhausted horizons reject the entire edit.
- **Draft Forward** uses available working calendar time and the configured daily overload policy.
- **Draft Finite Capacity (Serial)** additionally avoids occupied intervals from this scenario and competing BC orders. It conservatively reserves the parent work centre across its machines; it is not parallel packing or optimisation.
- Hour-view display windows and hidden-day settings are display-only and do not alter calculations. Manual downstream recalculation and Auto Schedule remain bounded by Maximum Schedule Days, independently of long display presets.
- BC recalculation at commit can still differ because of manufacturing settings, rounding, changed calendars or other extensions. Date/allocation equality checks are intentional safety gates; they report failure rather than forcing stored draft dates directly into BC fields.

### Capacity, problems and permissions

- Visible load = competing live BC demand **excluding imported operations in this scenario**, plus this scenario's allocations. Baseline BC load and draft load are never added together for the same operation. Other scenarios contribute no load.
- Resource summaries retain machine-centre-to-parent aggregation; direct work-centre lanes do not add another pool of available capacity. Daily diagnostic caching and scan limits remain in use.
- Draft allocations drive overload/no-capacity diagnostics, including allocation dates outside the viewport. BC conflicts are reported as problems and disable edits/commit until reset. Hide Problem Steps remains display-only.
- `CF_SchedulerView` reads scenarios and draft details.
- `CF_SchedulerPlanner` creates/imports/edits drafts and runs draft Auto Schedule; it no longer grants the BC commit worker or planner-confirmation writes.
- **Assign `CF_SchedulerCommit` explicitly** to authorised committers, together with the required standard manufacturing permissions. It includes the planner role. The extension does not elevate standard BC write permissions.
- Upgrading does not automatically copy orders or grant commit rights. Existing live planner-confirmation records are retained and recognised during import when their versions still match.

### Validation and sandbox release gates

- Version **2.0.0.1** makes the entire-schedule toolbar action explicit and adds a source-contract regression covering its promoted placement, all-changed-orders scope, commit permissions and separate single-order action. Transaction behaviour remains per order, not all-or-nothing across the scenario.
- Version **2.0.0.0** contains **42 AL objects**. CodeCop/UICop compilation passed cleanly; **48 Node tests** and JavaScript syntax checks passed. All eight browser helpers passed at **1600x1200, 960x720 and 480x400** CSS pixels.
- The browser fixture adds `fixture.assertContextMenu()` covering all six versioned AL requests, timeline/unplanned entries, keyboard behaviour, permissions, clamping, stale-state dismissal, scenario selection isolation and safe text rendering.
- Node source-contract tests guard the separation of draft and commit entry points, commit checks, permissions and event wiring. These checks are **not** database or transaction tests.
- Before release, run the following in a BC sandbox with the extension and standard manufacturing permissions:
  1. Import an order into scenarios A and B. Change A, close/reopen the page, and verify persisted draft dates/allocations, unchanged B, and unchanged BC routing, components and capacity needs.
  2. Check setup/run demand, efficiency, split working intervals, closed weekends, predecessor constraints, downstream propagation, missing calendars and horizon rollback. Confirm unsupported cases are visibly blocked.
  3. Compare daily totals against `live competing demand + active draft demand`, including parent/direct rows, hidden orders and dates outside the viewport.
  4. In two sessions, edit the same order, reset while an edit is pending, and change an Auto Schedule candidate after confirmation. The stale requests must fail without overwriting the first planner.
  5. Change BC order/line/routing/component/capacity data after import, including inserts/deletes. Commit must refuse the order and retain its draft.
  6. Commit a matching simple serial order, checking standard routing, dependent component dates, capacity needs and refreshed baseline. Introduce a recalculation mismatch in a multi-step order and verify **every BC write rolls back**.
  7. Commit a batch containing successful and failing orders. Verify independent successful commits, full failure messages, retained failed drafts, and that hidden changed orders were included as stated.
  8. Verify Warn/Block overload policies, declining warnings, changing capacity during confirmation, and view/planner/committer permissions.
  9. Recheck native control-add-in drag/drop, right-click, modal actions, company switching, long ranges and document zoom/restore.
- The package is built locally, **not published**. Browser mocks and compilation do not validate native BC database concurrency, manufacturing recalculation or transaction rollback.

## 27. Exclusive placement and quiet individual-step dragging (version 2.0.1)

- **User-confirmed rule:** unscheduled steps appear only in the top section, even when imported BC dates already exist. Once a step is marked scheduled in the draft, it moves to the lower timeline and disappears from the top section. A step never appears in both sections.
- This rule applies in Hour/Day/Week/Month views and document focus. Finished steps remain historical timeline entries, never unscheduled cards. Scheduled steps outside the visible dates/hours remain scheduled and do not reappear at the top.
- Placement changes only after the authoritative AL refresh. Pending/in-flight or failed drops do not optimistically remove an unscheduled step. Downstream recalculation does not itself mark an unconfirmed following step scheduled; it remains at the top until scheduled explicitly or by Auto Schedule.
- Individual editable timeline steps can be dragged **horizontally on their assigned resource** to change the draft start, using the existing 15-minute snapping and compressed calendar projection. Resource reassignment is not added. The server still recalculates following routing steps in the draft as agreed.
- Mouse/pen/touch dragging keeps a visible drag state. Escape, pointer cancellation or lost pointer capture cancels the gesture without submitting a change; events from another pointer cannot move or finish the active drag. Clipped starts and read-only steps retain their existing restrictions/manual-entry guidance.
- Successful drag/drop, start edits and confirmation of existing dates refresh **without a success message box**. Overload confirmations, invalid drops, conflicts, failed calculations and refresh errors still appear. Auto Schedule and Commit batch results remain available.
- Capacity totals and stored dates are unchanged by this display split. Hidden-day/hour notices count timeline operations only; routing links show actual scheduled/finished endpoints and report hidden endpoints rather than inventing links through unscheduled steps.
- Regression coverage includes exclusive placement in all four views and document focus, authoritative top-to-bottom transfer, individual timeline requests, cancellation, read-only steps, and the absence of the AL success popup while preserving warnings/errors. Browser pointer-handler tests stub native pointer capture for synthetic events; real-device control-add-in dragging remains a BC sandbox check.
- Validation: clean CodeCop/UICop build of **42 AL objects**, **52 Node tests** and syntax checks passed. All **nine browser helpers** passed at 1600x1200, 960x720 and 480x400 CSS pixels. A trusted browser mouse drag also emitted exactly one versioned start-change request without capture stubbing.
- Package **2.0.1.0** is built, not published. Browser tests use a mocked AL bridge; native BC scheduling and modal behaviour still require sandbox verification.

## 28. Civil-time drag validation fix (version 29.0.1.3)

- Fixed AL civil-time serialization to replace space padding with zeroes, following the Base App's `Outlook Synch. Type Conv.` time-formatting pattern. Single-digit hours must serialize as `08:15:00`, not ` 8:15:00`; otherwise the strict input round-trip check rejects valid drag requests.
- The shared formatter also serves operation dates, calendar windows and the current-time line. Midnight handling, strict date/time validation and BC session-wall-time semantics are unchanged.
- Added a source-contract check for the AL formatter/validator and client drag tests for all 96 quarter-hour times in a day. These checks do not execute the AL runtime; verify morning, afternoon and midnight drops in a BC sandbox after installing the updated package.
- Validation: all **54 Node tests** passed; **42 AL objects** compiled cleanly with CodeCop/UICop. Package **29.0.1.3** is built locally, not published.

## 29. Compact scheduler window (version 29.0.1.4)

- Moved the static draft/capacity explanation, time-zone instructions, colour legend and drag guidance into **Actions > How to Use Scheduler**. Routing links remain visible on the timeline; their textual counts remain available to screen readers without consuming timeline space. Actual errors, warnings and hidden-operation notices are retained.
- **Schedule Options > Display Options** provides independent **Show Search**, **Show Display Range** and **Show Selected Step Details** switches. All default off when opening the scheduler and remain selected for that page session. These are display preferences, not company setup or changes to scheduling data.
- Hiding search clears its text filter, including after restoring a document view. The empty unscheduled section collapses automatically; matching unscheduled steps remain visible at the top. The flex layout gives reclaimed space to the timeline.
- Hover details, right-click actions, routing selection and Date View navigation remain usable with the optional panels hidden. Clipped-drag guidance now points to the always-available right-click Edit Draft Start action.
- Validation: **56 Node tests**, JavaScript syntax checks and a clean CodeCop/UICop build of **42 AL objects** passed. All **ten browser helpers** passed at 1600x1200, 960x720 and 480x400 CSS pixels, covering all eight optional-panel combinations, default-off behaviour, clearing hidden search, empty-unscheduled collapse, retained warnings/errors and existing interactions. The empty compact timeline occupies at least 70% of the fixture window at each size.
- Package **29.0.1.4** is built, not published. Browser tests use a mock bridge; native BC hosting and the Actions help/options dialogs still require sandbox verification.

## 30. Daily utilisation fill (version 29.0.1.5)

- Removed grey non-working-time/weekend and alternating capacity-strip backgrounds. Empty day cells and operation lanes stay white; resource hierarchy is retained with indentation, borders and bold department labels.
- Loaded day cells show a muted grey fill from left to right, proportional to allocated minutes divided by available daily minutes: 80 of 100 fills 80%; exactly 100% fills the full cell. The fill covers both the capacity strip and the operation lane, behind operation bars, links and selection.
- Overloaded days use a full light-red background, including positive demand with no available capacity. The existing 0.001-minute overload tolerance is preserved. Empty zero-capacity days stay white.
- Fill represents aggregate daily utilisation, not a calendar interval or operation start time. It uses the same scenario-aware totals as the capacity figures, including competing/hidden demand; text search and problem visibility do not change it.
- Direct work-centre lanes compare their direct load with the parent work-centre availability without creating a second capacity pool. Parent summary cells continue to include direct and machine demand. Tooltips explain this distinction; the Actions help legend describes the new colours.
- Date alignment uses the existing shared axis in Hour/Day/Week/Month, including hidden-day compression. This is display-only; scheduling, working calendars and capacity calculations are unchanged.
- Validation: **57 Node tests**, JavaScript syntax checks and a clean CodeCop/UICop build of **42 AL objects** passed. All **eleven browser helpers** passed at 1600x1200, 960x720 and 480x400 CSS pixels. Fill checks cover 0%, 80%, 100%, overload, zero-capacity demand, direct-lane parent availability, search independence and compressed-day alignment in all four views.
- Package **29.0.1.5** is built locally, not published. Native BC hosting remains a sandbox verification step.

## 31. Bottom-up utilisation fill (version 29.0.1.6)

- Replaced the previous left-to-right fill with bottom-to-top fill, like water rising in a glass. At 80% utilisation the lower 80% of each loaded day box is grey and the upper 20% remains white.
- Capacity strips and operation lanes use the same vertical fill. Empty cells remain white; overloads remain fully light red. Capacity calculations, operation positioning and interactions are unchanged.
- Browser regression assertions now require the bottom-to-top gradient as well as the exact fill percentage.
- Validation: **57 Node tests**, fixture syntax checks and the **42-object CodeCop/UICop build** passed. Bottom-up fill checks passed in all four views, including compressed days, at three viewport sizes. Package **29.0.1.6** is built locally, not published.

## 32. Weekend display toggle (version 29.0.1.7)

- Added **Date View > Hide Weekends / Show Weekends**, with weekends initially shown. Saturday and Sunday are hidden regardless of working capacity; the existing Hide Non-working Days filter applies independently. When both filters are enabled, only working weekdays remain.
- Uses the shared compressed date axis for headers, capacity fill, operation bars, routing links, current-time markers and drag/drop in all four views. Weekend-only periods show an empty-calendar notice. Hidden operations/load are counted in a notice rather than being moved to the unscheduled section.
- Display-only: no dates, calendars or capacity allocations change. The toggle is kept in the current page session and captured/restored with document-view state. Show Weekends does not disable Hide Non-working Days.
- Zoom to Document temporarily shows all days, including weekends, so the complete routing is visible. Restore Previous View restores the previous weekend setting.
- Validation: **59 Node tests**, JavaScript syntax checks and the **42-object CodeCop/UICop build** passed. All **twelve browser helpers** passed at three viewport sizes, including all four weekend/non-working-day combinations in every view, working weekends, restoring hidden operations, aligned capacity fill and weekend-only windows. Package **29.0.1.7** is built locally, not published; native BC action hosting remains a sandbox check.

## 33. Straight timeline grid boundaries (version 29.0.1.8)

- Replaced the per-lane repeating gradient with one full-height, pointer-transparent grid layer. Its bordered cells use exactly the same percentage positions, widths and right-border styling as the smallest date-header cells.
- This removes independently rasterised gradient spacing/left-edge versus right-border offsets and gaps caused by rows taller than their capacity strip. Lines now span every resource row continuously, including department and direct-operation rows.
- Removed separate capacity-cell borders so there is only one body grid, above utilisation shading and below operations/routing links. Day/hour alignment, scrolling, compressed dates and fitted views share the same axis; no scheduling data changes.
- Validation: **60 Node tests**, JavaScript syntax checks and the **42-object CodeCop/UICop build** passed. All **thirteen browser helpers** passed at three viewport sizes. The new alignment helper checks **32 combinations per viewport** (four views, fitted/scrolling widths and both day filters), including horizontal scrolling, collapsed rows and varied resource-label heights. Header/body boundary coordinates agree within 0.1 CSS pixels.
- Package **29.0.1.8** is built locally, not published. Native BC hosting remains a sandbox verification step.

## 34. Non-obscuring operation hover details (version 29.0.1.9)

- Tooltip placement now measures available space above and below its operation, chooses a side that fits (or the larger side), and limits the tooltip height to that space. Long details scroll within the tooltip instead of being clamped across the operation.
- An eight-pixel gap keeps the operation visible and clickable. Existing tooltip hover persistence, scrolling, keyboard accessibility and pointer-down dismissal are retained.
- Browser checks assert non-overlap, viewport containment and operation hit-testing with a long multi-line tooltip at top, middle and bottom positions.
- Validation: **60 Node tests**, JavaScript syntax checks and the **42-object CodeCop/UICop build** passed. Focused hover, context-menu and individual-drag browser helpers passed at three viewport sizes. Package **29.0.1.9** is built locally, not published; native BC hosting remains a sandbox verification step.

## 35. Optional working-only operation bars (version 29.0.1.10)

- Added company setup **Exclude Non-working Hours**, off by default for both new and existing setups, preserving the existing elapsed-duration display. Enable it to draw each operation only where its assigned resource's positive-capacity calendar intersects the operation's draft start/finish.
- Working portions remain at their actual dates with gaps between them: Friday 15:45–16:00 and Monday 08:00–08:04 render as two pieces of the same 19-working-minute operation. This does not pack time into one misleading continuous bar.
- Overlapping/adjacent calendar windows are merged to avoid duplicate pieces. Each operation retains one layout track, identity, selection, context menu and draft-start request. Routing arrows connect the last visible piece to the first visible piece of the following step. Dragging a piece previews all pieces; cancellation restores all pieces.
- Hour display windows, hidden weekends/non-working days and view clipping still apply. If no working portion is visible despite the operation's elapsed span being visible, show a small dashed marker with explicit hover guidance rather than fabricating a full-duration bar. Its manual/context actions remain available.
- The display option is reloaded from setup on refresh; it does not change routing dates, work minutes, allocations, Auto Schedule or BC commit rules. No upgrade reset is needed because the Boolean defaults false.
- Validation: **63 Node tests**, JavaScript syntax checks and the **42-object CodeCop/UICop build** passed. All **14 browser helpers** passed at 1600×1200, 960×720 and 480×400, including split endpoints, dragging/cancellation, missing-calendar guidance and existing interactions. Package **29.0.1.10** is built locally, not published. Setup persistence and control-add-in hosting still require verification in a BC sandbox.

## 36. Continuous daily utilisation fill (version 29.0.1.11)

- Fixed horizontal gaps in grey utilisation shading: the capacity-number strip and operation lane previously started separate bottom-up fills. Each resource/day now has one background spanning the entire resource box, with transparent foreground layers.
- The single fill rises from the bottom according to daily utilisation, including rows enlarged by wrapped resource labels. Empty days remain white; overload remains full light red. Capacity figures, operation bars and interactions are unchanged.
- Validation: **63 Node tests**, syntax checks and the **42-object CodeCop/UICop build** passed. Seven focused browser helpers passed at three viewport sizes, covering full-box fill at 20%, 50%, 80%, 100%, overload and zero capacity, tall labels, compressed dates, grid alignment, dragging, routing links and hover details. Package **29.0.1.11** is built locally, not published.

## 37. Calm Blue date headers (version 29.0.1.12)

- Applied the selected Calm Blue palette by date unit: month `#DCE7F4`, week `#ECF2F9`, day/hour `#F8FAFD`, with dark text `#263E59`. The fixed capacity heading uses the week tint.
- Colours follow semantic units in all four views rather than header-row position. The white timeline, operation colours, grey utilisation fill and light-red overload display remain unchanged.
- Validation: **63 Node tests**, fixture syntax check and the **42-object CodeCop/UICop build** passed. Browser checks verified exact header colours and layout in all four views and reran continuous utilisation-fill coverage. Package **29.0.1.12** is built locally, not published.

## 38. Light-purple current-time line (version 29.0.1.13)

- Changed the vertical current-time line to light purple `#B39DDB`, retaining its two-pixel width, position and pointer transparency. Warning colours and the current-time text are unchanged.
- Validation: current-time browser checks passed in all four views, including exact line colour, live movement and hidden/out-of-range handling. Fixture syntax and the 42-object CodeCop/UICop build passed. Package **29.0.1.13** is built locally, not published.

## 39. Single scheduler heading (version 29.0.1.14)

- Removed the duplicate Production Scheduler heading inside the control add-in. The native BC page title remains; the scenario name and Hour/Day/Week/Month controls are retained. The timeline region keeps its accessible name.
- Validation: compact-display and layout browser checks passed at desktop and small viewport sizes, including retained controls and accessible region name. JavaScript syntax checks and the 42-object CodeCop/UICop build passed. Package **29.0.1.14** is built locally, not published.

## 40. Retaining the viewport after moves (version 29.0.1.15)

- Fixed accepted draft moves resetting the timeline to the left: ordinary payload redraws now retain horizontal/vertical timeline scroll and the focused operation or board, without scrolling during focus restoration. Operation selection and routing links remain intact.
- Preservation applies only within the same scenario, date range and time scale. Intentional date/view changes retain their existing reset behaviour; Zoom to Document and Restore Previous View retain their explicit state handling.
- Validation: **63 Node tests**, JavaScript syntax checks and the **42-object CodeCop/UICop build** passed. Accepted-move viewport/focus, individual dragging, split working portions and date-view/restore browser regressions passed at three screen sizes. The viewport regression moves an operation while scrolled in both directions and checks its persisted selection, keyboard focus and visibility. Package **29.0.1.15** is built locally, not published; native BC hosting remains a sandbox verification step.

## 41. Consistent sequencing, locks and scenario lifecycle (version 29.0.2.0)

This section supersedes earlier descriptions of manual moves bypassing finite-slot search and always packing all successors together.

### Opening and importing

- Opening/refreshing displays saved scenario dates without silently importing or replanning. BC baseline conflicts and changed calculated calendars (including parent work-centre calendars for machine operations) are reported; draft dates are not overwritten. Older imports without calendar snapshots are explicitly reported as unverified until reset.
- **Import Orders** copies current BC dates and allocations only for new matching orders; existing draft orders remain unchanged.
- **Import and Auto Schedule** imports the same way, then offers scheduling only for the newly imported orders. Cancelling scheduling retains the imported BC dates.
- Date/view/filter settings are remembered per company/scenario for the current BC session; client viewport state is independently scoped to the user/company/scenario and matching date window. This is not a permanent personal default across unrelated browser sessions.

### Selection and locks

- Ctrl+click toggles multiple operations. **Select Routing Chain**, **Select Following Steps** and **Clear Operation Selection** manage the set. Selection is by logical operation, including all visible working-time fragments.
- **Lock Selected Positions** fixes valid scheduled, unfinished operations and their draft allocations. Lock state is separate from scheduling confirmation. **Unlock Selected Positions** permits replanning again. No group dragging is implied by multiple selection.
- Locked operations are reservations, never silently shifted. A dependency conflict with a locked step rejects the entire affected chain; unlock explicitly before proceeding. Locks survive reopening and successful BC commit; explicit reset discards them.

### Scheduling and saving

- Manual moves and automatic scheduling use the configured calendar-only or finite-capacity policy. Required work is preserved and actual assigned resource calendars govern scheduling; Hour-view display windows do not change resource calendars.
- Manual moves preserve existing successor positions when dependency constraints still fit. Moving earlier does not automatically close downstream gaps. An unlocked conflicting successor is pushed forward; a locked conflicting successor blocks the change.
- Finite search respects assigned-resource concurrent capacity and the parent work-centre's effective daily work budget. Sibling machines are not blanket-blocked by each other's occupied intervals. Manual search reserves unchanged successors conservatively; it does not speculate that future reservations will be released, so some moves can finish later or fail rather than perform backtracking.
- **Schedule Unscheduled** plans unscheduled routing chains around scheduled/locked reservations. **Replan Unlocked Operations** explicitly rebuilds unlocked work; locked work remains fixed.
- Batch scheduling processes routing chains rather than repeatedly rescheduling each suffix for every operation. Priority is deterministic and failures are reported per chain; earlier successful chains remain saved.
- Accepted changes save automatically to the shared draft, not BC. Saving/saved/error status is displayed. Existing version/baseline checks and atomic per-order BC commit verification remain required.
- Automatic planning confirms its scope, mode and policy before applying and reports final dates, failures and late finishes afterward. This is not a date-by-date dry-run proposal preview; that separate simulation capability is not included in this release.
- **Undo Last Draft Change** restores the last successful manual move/confirmation or lock change, including affected linked steps, in the current open scheduler. It validates expected order revisions, current BC baseline and calendars before restoring. Revisions continue increasing rather than resurrecting old client tokens. Import, reset, automatic planning and commit clear this page-session undo history.

### Reset

- **Reset Scheduler to BC Dates** affects every order already in the active scenario, including hidden/filtered orders. A confirmation states count, scope, lock removal and loss of draft changes.
- Reset reimports current BC routing dates and allocations, clears locks, refreshes baselines, does not import unrelated new orders and never writes BC. All affected orders reset together or none do; missing/deleted/ineligible BC orders are explicit errors, not silently skipped.
- Existing **Reset Order Draft from BC** remains available for a single order. Scenario-wide reset is deliberately not undoable.

### Verification boundary

- Validation: **78 Node tests** (including AL source-contract safeguards), JavaScript syntax checks and the **45-object CodeCop/UICop build** passed with no compiler errors or warnings. All **16 browser regression helpers** passed independently at 1600x1200, 960x720 and 480x400 CSS pixels, including multi-selection, lock requests/icons/edit guards, draft feedback, session restoration, accepted-drag viewport retention, split bars and existing capacity/date-view behaviour. Helpers are reloaded between runs to isolate intentionally retained selection/collapse state.
- Package **29.0.2.0** is built locally, not published. No commit or push was performed.
- Native manufacturing recalculation, contention, effective-capacity behaviour and BC-hosted control-add-in persistence require sandbox validation before deployment. JavaScript fixtures and AL source-contract tests are not native AL execution tests.

## 42. Optional automatic capacity bypass (version 29.0.2.1)

- Enable **Production Scheduler Setup > Automatic Scheduling > Auto Schedule Bypass Capacity** to ignore occupied resource slots and parent daily capacity budgets during automatic planning. Default is off for new and existing setups.
- Applies to **Schedule Unscheduled**, **Replan Unlocked Operations** and **Import and Auto Schedule**. When enabled, automatic planning can save overlapping/overloaded draft operations even with the normal overload policy set to Block, without per-chain capacity prompts. The batch confirmation explicitly shows the bypass setting, and successful results identify that capacity checks were bypassed. Overload shading and capacity totals remain visible.
- Assigned-resource and parent working calendars, positive available calendar capacity, required work, routing order, locked positions, baseline/version validation and Maximum Schedule Days remain enforced. This is not a way to schedule outside working calendars or bypass unsupported routing restrictions (such as concurrent operation capacities or queue/wait/move times).
- Manual moves/confirmations and **Commit to BC** retain their normal capacity policy. An overloaded draft is not permission to commit overload or mismatched dates into BC. Changes to the method/bypass setting after batch confirmation reject the affected chain rather than silently changing policy.
- Validation: **81 Node tests** (including three new bypass source-contract checks), whitespace checks and the **45-object CodeCop/UICop build** passed with no compiler errors or warnings. Package **29.0.2.1** is built locally, not published. Actual scheduling transactions still require BC sandbox validation.
