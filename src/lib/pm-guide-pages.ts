/** Verified PM navigation and instructional content for human and AI help. */
export interface PmGuidePage {
  title: string;
  purpose: string;
  whenToUse: string;
  details: string[];
  steps: string[];
  example: string;
  caution: string;
  related: string[];
}

export const PM_GUIDE_PAGES: Record<string, PmGuidePage> = {
  'pm-schedules': {
    title: 'PM Schedules',
    purpose: 'The master register where planners assign preventive maintenance tasks to a machine, assembly or component and define when work becomes due.',
    whenToUse: 'Use this when setting up, modifying or reviewing a maintenance obligation, not when entering an inspection reading.',
    details: [
      'A schedule connects an asset or technical part to Task Library instructions, estimated minutes, equipment state and the approved recurrence or usage basis.',
      'In Add/Edit, Step 1 selects the target and tasks. Step 2 configures each task trigger and cadence. An individual machine may have many tasks with different due states.',
      'Upcoming means not yet due; overdue means the planned due point has passed. A schedule is not proof that the work was performed.',
    ],
    steps: ['Find or choose a machine or technical part.', 'Choose Add/Edit PM Schedule, confirm the target and add Task Library tasks or a template.', 'Configure due dates or approved meter-based cadence, review tasks, then save.', 'Use the register to monitor due work and navigate to inspection or work-order planning.'],
    example: 'On Rotary Printing Machine RP-01, bearing vibration can be weekly while motor maintenance can follow operating hours. Those are separate assignments under the same machine.',
    caution: 'Do not change the frequency simply to make overdue work disappear. Confirm completion through the proper work-order and verification workflow.',
    related: ['pm-tasks', 'pm-scheduled-inspections', 'pm-machine-planning'],
  },
  'pm-inspections': {
    title: 'Inspection Readings',
    purpose: 'See each machine once, then inspect actual results by inspection task and every assigned component. This keeps the machine-first list compact while retaining part-level details.',
    whenToUse: 'Use this after a technician has measured vibration, temperature, sound or other parameters, or when reviewing the latest result for a particular machine part.',
    details: [
      'Select one machine first. Bearing Temperature is shown once as a task group; its assigned drive-side and non-drive-side bearings appear as separate part rows.',
      'Acceptance ranges are the configured thresholds, not the actual reading. The latest result and recorded date come from saved inspection records.',
      'An abnormal measurement can require corrective follow-up, while an overdue inspection indicates that its planned inspection has not yet been completed.',
    ],
    steps: ['Search for the machine by its name or code.', 'Locate the relevant inspection task and part.', 'Compare acceptance limits, next due date and previous result.', 'Select Record to save the measured value, observation, outcome and corrective recommendation.'],
    example: 'If the bearing vibration limit is 4.5 mm/s and a technician records 7.9 mm/s, the value is outside acceptance and should be reviewed for corrective action.',
    caution: 'Do not mark a failed measurement as passed simply because a later reading improved. Historical exceptions remain visible.',
    related: ['pm-action-lists', 'pm-inspection-exceptions', 'pm-scheduled-inspections'],
  },
  'pm-action-lists': {
    title: 'Action Lists',
    purpose: 'Printable, machine-specific inspection worksheets for technicians who may work without a phone or computer.',
    whenToUse: 'Use this before a field inspection and when transcribing paper measurements afterward.',
    details: [
      'Choose the machine and Running or Standstill inspection mode. The action list combines assigned task instructions with the affected technical parts.',
      'Printed sheets provide space for measured values and findings, rather than only Yes/No checkboxes.',
      'Once the technician returns, enter the actual measurements and inspector information. A printed worksheet alone does not update the maintenance history.',
    ],
    steps: ['Select the machine and inspection operating state.', 'Generate and print the A4 Action List.', 'Have the technician record actual observations and instrument readings in the field.', 'Capture the completed readings and review any exceptions and follow-up.'],
    example: 'A technician measures motor temperature and drive-side bearing vibration on the printed running-inspection sheet, then the planner records the values in the system.',
    caution: 'A standstill task must not be performed on operating equipment unless the approved safety procedure permits it.',
    related: ['pm-inspections', 'pm-inspection-exceptions', 'pm-scheduled-inspections'],
  },
  'pm-scheduled-inspections': {
    title: 'Scheduled Inspection Tasks',
    purpose: 'A focused list of the inspection tasks assigned to a selected machine, with each task grouped over its technical parts and due information.',
    whenToUse: 'Use this to understand which components need which inspections next, before issuing field checklists or reviewing overdue assignments.',
    details: [
      'This is a filtered view of inspection assignments—not the full PM Schedules register and not a list of completed readings.',
      'The page groups tasks such as RMS Bearing Vibration. Beneath a task, the output-shaft and motor bearings can each have their own due date or usage point.',
      'Upcoming means scheduled for the future. Overdue means its scheduled due point has passed. Select View to inspect the assignment details.',
    ],
    steps: ['Select a machine by name or asset code.', 'Review the grouped inspection instructions and the number of assigned parts.', 'Read each part code and due date or meter basis.', 'Use View for assignment details, PM Schedules to change cadence, or Action Lists to prepare field work.'],
    example: 'A machine showing ten scheduled assignments may contain two bearings under the same vibration task plus temperature and sight checks on other components. Ten assignments do not mean ten completed inspections.',
    caution: 'A due date is a planning target, not evidence of completed or approved maintenance.',
    related: ['pm-schedules', 'pm-inspections', 'pm-action-lists'],
  },
  'pm-machine-planning': {
    title: 'Machine Planning & Work Bundles',
    purpose: 'A machine-level workspace for combining maintenance tasks into practical work packages that can be performed together.',
    whenToUse: 'Use it when organizing technicians, tools, materials and machine downtime for a specific maintenance window.',
    details: [
      'The technical parts list shows which component carries each PM task, its type, activity and applicable operating state.',
      'The planning window helps distinguish work due now versus approaching. Running, Standstill and Shutdown bundles must respect equipment access and isolation requirements.',
      'A work bundle is a planning package of compatible jobs. It is not a declaration that the work has been completed or verified.',
    ],
    steps: ['Select the machine.', 'Review its technical parts, scheduled tasks and planning window.', 'Group compatible work by Running, Standstill or Shutdown state.', 'Create the work bundle, coordinate responsible personnel and follow its work-order completion.'],
    example: 'During a planned two-hour stop on a printing line, the planner may combine lubrication, drive-chain inspection and a bearing replacement into one standstill work bundle.',
    caution: 'Never combine tasks that require incompatible safety states just to reduce downtime.',
    related: ['pm-scheduled-inspections', 'pm-forward-planning', 'pm-compliance'],
  },
  'pm-forward-planning': {
    title: 'Forward Planning & Conflicts',
    purpose: 'A cross-machine planning view of maintenance demand over an upcoming date range, including potential scheduling or resource clashes.',
    whenToUse: 'Use this in weekly or monthly preparation meetings before assigning labor, production downtime or work-order bundles.',
    details: [
      'Unlike Machine Planning, which focuses on one asset, Forward Planning compares tasks across multiple assets and work centres.',
      'A conflict can arise when several machines require the same technician, tools or shutdown period, or when maintenance would disrupt production.',
      'The goal is to move work into a feasible approved window without losing overdue tasks or bypassing required inspections.',
    ],
    steps: ['Choose the planning period and relevant plant scope.', 'Review planned, upcoming and overdue demand.', 'Investigate conflicts, availability and task compatibility.', 'Return to Machine Planning or PM Schedules to make authorized changes.'],
    example: 'If the same electrical crew is required for two machine shutdowns on Friday, forward planning can expose the clash while there is still time to reschedule.',
    caution: 'Forecasts and provisional bundles are not work-order completion records.',
    related: ['pm-machine-planning', 'pm-compliance', 'pm-calendar'],
  },
  'pm-compliance': {
    title: 'PM Compliance',
    purpose: 'A management scorecard showing how reliably scheduled preventive maintenance was completed, with overdue exposure by plant and department.',
    whenToUse: 'Use it for maintenance performance reviews, escalation, audit readiness and identifying departments or machines that repeatedly miss due work.',
    details: [
      'Compliance compares scheduled obligations and their completion evidence within the selected reporting period. It is different from machine health or production output.',
      'A high completion rate means required work was completed; it does not automatically prove the measured equipment condition is acceptable.',
      'Overdue machines and departments needing attention help prioritize follow-up, work-order verification and planning changes.',
    ],
    steps: ['Select the reporting period, plant or department as available.', 'Review completion, overdue work and areas requiring attention.', 'Drill into the affected department or machine.', 'Confirm linked work-order and inspection evidence before reporting maintenance as compliant.'],
    example: 'If a department had 100 PM obligations and completed 92 on time, its on-time compliance would be 92% (assuming the report uses the same due-window definition). The eight missed tasks require investigation.',
    caution: 'Check the report definitions and period before comparing departments; an inspection passed today does not necessarily resolve an older missed schedule.',
    related: ['pm-inspection-exceptions', 'pm-forward-planning', 'pm-machine-planning'],
  },
  'pm-inspection-exceptions': {
    title: 'Inspection Exceptions',
    purpose: 'A paginated register of abnormal, incomplete and not-measurable inspection events, with their corrective work-order follow-up.',
    whenToUse: 'Use it to prioritize failures and unusual readings across many machines and to make sure issues do not disappear when newer measurements pass.',
    details: [
      'The compact table contains one row per recorded exception, including machine, component, inspection, result, date and corrective WO reference.',
      'Select View to inspect actual readings, configured limits, inspector, original paper-sheet details, findings and recommendations.',
      'The machine, outcome, operating state, date and corrective-WO filters help planners narrow a large plant portfolio without loading all records at once.',
    ],
    steps: ['Choose a machine or leave the filter on all authorized machines.', 'Apply outcome, corrective-WO, state and date filters.', 'Select View on the relevant row.', 'Review the measurement and linked corrective WO, then follow the approval and verification workflow.'],
    example: 'A bearing vibration of 7.9 mm/s with an accepted limit of 4.5 mm/s remains in the exception history even if the next reading later passes.',
    caution: 'Not measurable is not automatically a mechanical failure; arrange an approved repeat check and distinguish it from a confirmed failed reading.',
    related: ['pm-inspections', 'pm-action-lists', 'pm-compliance'],
  },
  'pm-tasks': {
    title: 'Task Library',
    purpose: 'Reusable, standardized technical instructions used when assigning maintenance or inspection tasks.',
    whenToUse: 'Use this to keep common inspections and maintenance procedures consistent across many machines.',
    details: ['A library task describes the work. Assigning it to a particular component and recurrence creates a schedule obligation.', 'Instructions can be reused across multiple asset parts; do not create a new library task for every repeated machine assignment.'],
    steps: ['Search the library for an appropriate existing task.', 'Review its technical description, type and safety requirements.', 'Create or update the task where authorized.', 'Use Add Task from Library in PM Schedules to attach it to a machine or part.'],
    example: 'A standardized bearing RMS vibration check can be assigned to dozens of bearings with different acceptance thresholds.',
    caution: 'Changing shared task instructions may affect how many assets are inspected; verify the scope.',
    related: ['pm-schedules', 'pm-scheduled-inspections', 'pm-templates'],
  },
  'pm-templates': {
    title: 'PM Templates',
    purpose: 'Reusable sets of Task Library instructions for standard groups of maintenance activities.',
    whenToUse: 'Use when similar machine types need a consistent starting task package.',
    details: ['Templates save repetitive setup, but each machine or component still needs its own approved assignment and due basis.', 'Adding a template is a preparation step; review its tasks before saving a schedule.'],
    steps: ['Find or create the appropriate maintenance template.', 'Review the included Task Library instructions.', 'Load it into the PM Schedule editor.', 'Confirm the asset target, cadence and operating state for each task.'],
    example: 'A standard electric motor template may contain temperature, sound, bearing condition and terminal inspection tasks.',
    caution: 'Do not apply a template without checking manufacturer requirements for the actual installed machine.',
    related: ['pm-tasks', 'pm-schedules'],
  },
  'pm-triggers': {
    title: 'PM Triggers',
    purpose: 'A separate control for runtime activation rules linked to approved PM schedules, including meter, condition and production-count sources.',
    whenToUse: 'Use this to review or manage additional authoritative equipment signals that activate work, rather than changing the basic time/usage cadence.',
    details: [
      'The underlying PM schedule still owns its normal time-based or meter/usage-based frequency. Runtime condition and production sources are not an extra schedule frequency type.',
      'The triggers table or grid displays active state and the relevant threshold. Activate, edit and delete actions require appropriate permissions.',
      'A condition rule should not repeatedly generate duplicate work orders while an alarm remains continuously active; recovery is required before a new transition.',
    ],
    steps: ['Search by schedule, machine or department.', 'Toggle between compact Table and Grid views.', 'Inspect trigger type, threshold, source and active state.', 'Use Edit or Activate/Deactivate where your role permits.'],
    example: 'An approved temperature threshold may start corrective review when an authoritative reading crosses the limit; regular weekly PM inspection still has its own due date.',
    caution: 'Never enable a condition trigger on an unverified sensor or set an unsafe threshold to bypass preventive maintenance.',
    related: ['pm-schedules', 'pm-machine-planning'],
  },
  'pm-calendar': {
    title: 'PM Calendar',
    purpose: 'A date-oriented overview of upcoming and overdue maintenance tasks.',
    whenToUse: 'Use for coordinating the sequence of work across days or weeks.',
    details: ['The calendar displays due work by date; it does not automatically complete tasks.', 'Selecting an entry can take the planner to its schedule or assignment details.'],
    steps: ['Choose the calendar month or week.', 'Review due and overdue entries.', 'Select an entry to inspect its machine and maintenance task.', 'Use schedules or machine work bundles for authorized changes.'],
    example: 'A maintenance planner may review next week to arrange standstill work before Friday production shutdown.',
    caution: 'Confirm machine availability and the approved work window before changing dates.',
    related: ['pm-schedules', 'pm-forward-planning'],
  },
};
export const PM_GUIDE_PAGE_IDS = Object.keys(PM_GUIDE_PAGES);
