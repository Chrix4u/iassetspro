/** Verified PM help text shared with the on-page guide and the AI assistance endpoint.
 * This describes existing workflows; it does not authorize operational actions. */
export interface PmGuidePage {
  title: string;
  purpose: string;
  steps: string[];
  related: string[];
  sections?: Array<{ heading: string; body: string }>;
}
export const PM_GUIDE_PAGES: Record<string, PmGuidePage> = {
  'pm-schedules': {
    title: 'PM Schedules',
    purpose: 'The master register of preventive maintenance assignments. It connects a machine or technical part to reusable work tasks and their due rules.',
    steps: [
      'Choose Add PM Schedule, select the asset and confirm whether the assignment is for the whole machine or a specific part.',
      'In Step 1, add one or more tasks from the Task Library (or load a task template). You can add more tasks without losing those already selected.',
      'In Step 2, configure the appropriate cadence for each task and save. Check upcoming and overdue work before bundling or generating work orders.',
    ],
    sections: [
      { heading: 'What is the difference from Scheduled Checks?', body: 'PM Schedules is the broader source of assignments, including inspection and maintenance work. Scheduled Checks concentrates on inspection assignments, grouped by machine and task, so inspectors can identify exactly what is due on each part.' },
      { heading: 'Example', body: 'A printing machine can have weekly bearing vibration measurements, monthly lubrication, and a separate motor inspection. Each task can have its own technical target, due state and maintenance instructions.' },
      { heading: 'Important', body: 'A saved schedule does not mean work is complete. Completion and verification remain separate, and due dates should follow the approved maintenance lifecycle.' },
    ],
    related: ['pm-scheduled-inspections', 'pm-machine-planning', 'pm-calendar'],
  },
  'pm-inspections': {
    title: 'Inspection Readings',
    purpose: 'The inspection measurement register: choose one machine, then examine each inspection task and every part assigned to it.',
    steps: ['Choose a machine by name or code.', 'Find an inspection task, such as Bearing Temperature, and review all its assigned parts.', 'Compare each part’s acceptance range, due date, last result and recorded date; use Record to enter a real measurement.'],
    sections: [
      { heading: 'How to read a row', body: 'The part code identifies the inspection point location, acceptance defines the allowed range, schedule shows the due cadence, and latest result is the last saved measurement or sight observation.' },
      { heading: 'Example', body: 'A Bearing Temperature inspection may show the drive-side and non-drive-side bearings together rather than repeating the machine name in separate cards.' },
      { heading: 'If a value is abnormal', body: 'Record the actual value and findings. Review follow-up in Inspection Exceptions; corrective work orders remain subject to existing authorization and verification.' },
    ],
    related: ['pm-action-lists', 'pm-inspection-exceptions', 'pm-scheduled-inspections'],
  },
  'pm-action-lists': {
    title: 'Action Lists',
    purpose: 'Produce a printable, machine-specific field inspection sheet and later capture the technician’s handwritten observations.',
    steps: ['Choose the machine and the Running or Standstill inspection state.', 'Generate and print the Action List, showing tasks, assigned parts and parameter entry fields.', 'When the sheet returns, transcribe actual measurements, inspector details and observations; save each inspection carefully.'],
    sections: [
      { heading: 'Why use paper?', body: 'The inspection can continue in a workshop or production area without a phone or stable connection. The signed paper sheet remains useful evidence.' },
      { heading: 'Important', body: 'Entering measurements after a field visit is not the same as completing a corrective work order. Abnormal outcomes must be followed up using the established maintenance workflow.' },
    ],
    related: ['pm-inspections', 'pm-inspection-exceptions', 'pm-scheduled-inspections'],
  },
  'pm-scheduled-inspections': {
    title: 'Scheduled Inspection Tasks (Scheduled Checks)',
    purpose: 'A focused view of inspection tasks already assigned to machine parts. Each row represents a specific inspection assignment, not a new PM schedule.',
    steps: ['Select one machine using the searchable selector.', 'Read the task heading and the parts underneath it. The same task may be assigned to several bearings, motors or other components.', 'Check the equipment state, calendar due date or meter basis, and whether each assignment is upcoming, due or overdue. Select View for full assignment details.'],
    sections: [
      { heading: 'Is this every PM schedule?', body: 'No. PM Schedules is the full register for preventive maintenance. Scheduled Checks lists scheduled inspection work and organizes it by the inspection task and relevant parts of the selected machine.' },
      { heading: 'What does “upcoming” mean?', body: 'The assignment is not yet overdue according to the stored due rule. It does not mean the inspection has already happened, and it does not authorize opening a work order by itself.' },
      { heading: 'Practical example', body: 'The task “Measure RMS vibration velocity in mm/s” may apply to an output shaft bearing and an electric motor bearing. Both show under the same task, but each has its own code and next due information. “Running” tells the technician the inspection is expected while the machine operates under approved conditions.' },
      { heading: 'What next?', body: 'Use Action Lists to prepare a printed field sheet, Inspection Readings to enter results, and Inspection Exceptions to review abnormal findings. Use PM Schedules to change the assignment itself.' },
    ],
    related: ['pm-schedules', 'pm-inspections', 'pm-action-lists'],
  },
  'pm-machine-planning': {
    title: 'Machine Planning & Work Bundles',
    purpose: 'A machine-level planning workspace for turning separate due maintenance tasks into a coordinated executable package.',
    steps: ['Select a machine and the appropriate planning window.', 'Review technical parts, their assigned PM tasks, expected duration and equipment state (Running, Standstill or Shutdown).', 'Group compatible work into a work bundle for planning; then follow the usual assignment, authorization, execution and completion workflow.'],
    sections: [
      { heading: 'What is a work bundle?', body: 'A bundle is a coordinated collection of tasks that can be worked on in the same maintenance opportunity. It reduces repeated setup, downtime and resource conflicts; it is not proof that any work was completed.' },
      { heading: 'Why are there different operating states?', body: 'An operating inspection might need the machine running at an approved speed. Lubrication or replacement may require standstill or shutdown and site-specific isolation procedures. Never change an equipment state solely to fill a bundle.' },
      { heading: 'Example', body: 'If a conveyor has a due bearing inspection, a lubrication task and a guarded replacement task, the planner can review which can occur in one approved stop and which must remain a separate running inspection.' },
      { heading: 'Technical part and activity fields', body: 'The technical part identifies exactly where work occurs. The task is the required job, PM is its planned maintenance assignment, and activity or equipment mode describes how the task is performed. Review each before generating or assigning work.' },
    ],
    related: ['pm-forward-planning', 'pm-schedules', 'pm-compliance'],
  },
  'pm-forward-planning': {
    title: 'PM Forward Planning',
    purpose: 'A portfolio view of maintenance demand ahead of time, designed to help planners anticipate due work and scheduling conflicts across machines.',
    steps: ['Choose the planning period and applicable filters.', 'Examine which machines and technical parts have due or upcoming tasks and assess readiness.', 'Investigate overlapping work, limited resources and shutdown opportunities before scheduling or bundling.'],
    sections: [
      { heading: 'How is this different from Machine Work Bundles?', body: 'Forward Planning looks across several machines or future periods to see total workload and risks. Machine Work Bundles narrows down to one machine to package compatible jobs.' },
      { heading: 'Example', body: 'Three machines may require standstill maintenance in the same week while sharing one specialist technician. Forward Planning can expose the overlap before the team commits to dates.' },
      { heading: 'What does it not do?', body: 'An upcoming task shown here is not automatically a completed, approved, or staffed work order. Review resource availability and approval status before committing.' },
    ],
    related: ['pm-machine-planning', 'pm-compliance', 'pm-calendar'],
  },
  'pm-compliance': {
    title: 'Maintenance Compliance',
    purpose: 'The management reporting view for understanding whether planned preventive maintenance is being completed as required across plants, departments and machines.',
    steps: ['Select the reporting window and plant or department where available.', 'Compare scheduled, completed and overdue maintenance, including machines needing attention.', 'Investigate overdue or missed items and use the planning workspaces to arrange follow-up, with existing approval controls.'],
    sections: [
      { heading: 'What is maintenance compliance?', body: 'It measures adherence to the maintenance plan. A task counts as compliant only according to the system’s completion and verification rules, not merely because it was scheduled or bundled.' },
      { heading: 'Why do managers need it?', body: 'It highlights departments with recurrent overdue work, machines with many missed interventions and areas where maintenance planning needs attention.' },
      { heading: 'Example', body: 'If a department has 20 required PM activities in a reporting period and only 15 are verified complete, managers investigate the remaining five, rather than assuming that all 20 were done.' },
      { heading: 'Interpreting figures safely', body: 'Always check the selected dates, plant scope, and what the report includes. Completion and overdue counts are not the same as machine reliability or a guarantee of future uptime.' },
    ],
    related: ['pm-forward-planning', 'pm-inspection-exceptions', 'pm-machine-planning'],
  },
  'pm-inspection-exceptions': {
    title: 'Inspection Exceptions',
    purpose: 'The follow-up register for failed, abnormal, conditional or unmeasurable inspections, including historical findings that may still require corrective action.',
    steps: ['Filter by machine, inspection outcome, operating state, corrective work-order status and date.', 'Scan the compact result table. Select View to see measurements, limits, findings, inspector information, paper evidence and linked work orders.', 'Open the machine from the detail view or follow the corrective work-order approval and verification process.'],
    sections: [
      { heading: 'Why retain old exceptions?', body: 'A later passing measurement does not automatically close an earlier defect or its corrective work order. History remains available for an audit and for planner review.' },
      { heading: 'Not measurable is not the same as failed', body: 'If an instrument reading could not be taken, the correct follow-up may be arranging an approved reinspection rather than diagnosing a broken part.' },
      { heading: 'Example', body: 'A bearing vibration above the site limit is saved with the actual mm/s reading, date and machine part. View shows the configured limit and any linked corrective work order.' },
    ],
    related: ['pm-inspections', 'pm-action-lists', 'pm-compliance'],
  },
  'pm-tasks': {
    title: 'Task Library',
    purpose: 'A reusable library of standardized industrial maintenance and inspection instructions.',
    steps: ['Search or create a reusable task and record the exact work instructions.', 'Specify the task type, technical requirements and estimated duration.', 'Add it to appropriate assets or parts through PM Schedules.'],
    sections: [{ heading: 'Task versus schedule', body: 'A Task Library record defines what should be done. A PM Schedule assigns that task to an asset or part and defines when it is due. Changing one library task does not mean all related maintenance has been performed.' }],
    related: ['pm-schedules', 'pm-scheduled-inspections', 'pm-templates'],
  },
  'pm-templates': {
    title: 'PM Templates',
    purpose: 'Reuse approved collections of PM tasks across similar machines or components.',
    steps: ['Choose a suitable template or create one.', 'Review the technical instructions and task composition.', 'Load it into a new PM assignment and confirm the tasks and due rules before saving.'],
    sections: [{ heading: 'When to use a template', body: 'A template can standardize similar equipment maintenance without repeatedly typing identical task sets. Verify applicability to each machine before using it.' }],
    related: ['pm-tasks', 'pm-schedules'],
  },
  'pm-triggers': {
    title: 'PM Triggers',
    purpose: 'Review configured trigger sources associated with PM activity and whether each trigger is active. The PM Schedule itself still uses the approved time/calendar or meter/usage frequency basis.',
    steps: ['Search and filter the trigger register by type or active state.', 'Switch between cards and compact table view depending on the number of records.', 'Use Activate, Edit or Delete only when authorized, reviewing the trigger configuration and affected PM schedule.'],
    sections: [
      { heading: 'Triggers versus schedule frequency', body: 'The trigger register may contain time, meter, condition or production source configurations. These are technical trigger sources, not a new Event/Condition choice in the PM Schedule frequency selector. The engineer-requested two frequency bases remain calendar and usage/meter.' },
      { heading: 'What does Active mean?', body: 'Active is the saved enablement state of that trigger. It does not prove that a job has run, a work order has opened, or maintenance has been completed.' },
    ],
    related: ['pm-schedules', 'pm-machine-planning'],
  },
  'pm-calendar': {
    title: 'PM Calendar',
    purpose: 'A date-oriented view for seeing when work is due and moving between calendar entries and their PM schedules.',
    steps: ['Choose the month, week or date interval offered by the calendar.', 'Review scheduled or overdue entries.', 'Open the related schedule to examine assignments, due rules and next actions.'],
    sections: [{ heading: 'Calendar versus Forward Planning', body: 'The calendar emphasizes due dates on the timeline; Forward Planning is for comparing future workloads, machine readiness and potential scheduling conflicts.' }],
    related: ['pm-schedules', 'pm-forward-planning'],
  },
};
export const PM_GUIDE_PAGE_IDS = Object.keys(PM_GUIDE_PAGES);
