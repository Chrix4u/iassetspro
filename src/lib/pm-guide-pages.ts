/** Verified PM navigation and help content, shared by UI and AI route. */
export interface PmGuidePage {
  title: string;
  purpose: string;
  steps: string[];
  related: string[];
}
export const PM_GUIDE_PAGES: Record<string, PmGuidePage> = {
  'pm-schedules': {
    title: 'PM Schedules',
    purpose: 'Create and manage calendar-based or meter-based maintenance schedules for machines, assemblies and components.',
    steps: ['Find the machine or part in the schedule list.', 'Choose Add PM Schedule to assign tasks and frequency.', 'Review due and overdue assignments before creating work orders.'],
    related: ['pm-inspections', 'pm-machine-planning', 'pm-calendar'],
  },
  'pm-inspections': {
    title: 'Inspection Readings',
    purpose: 'See each machine once. Within it, inspection tasks contain all assigned components, with acceptance limits, latest results and overdue status.',
    steps: ['Search for and select one machine.', 'Expand the task groups and find the relevant component.', 'Review the range and due date, then select Record to enter the actual reading.'],
    related: ['pm-action-lists', 'pm-inspection-exceptions', 'pm-scheduled-inspections'],
  },
  'pm-action-lists': {
    title: 'Action Lists',
    purpose: 'Generate and print machine inspection Action Lists for Running or Standstill inspections, then transcribe the completed measurements.',
    steps: ['Select one machine and Running or Standstill.', 'Generate the Action List, then print the blank A4 inspection sheet.', 'After field inspection, select its reference and enter the handwritten measurements before saving.'],
    related: ['pm-inspections', 'pm-inspection-exceptions', 'pm-scheduled-inspections'],
  },
  'pm-scheduled-inspections': {
    title: 'Scheduled Inspection Tasks',
    purpose: 'View calendar- and meter-based inspection assignments organized by machine, then inspection task, then assigned part.',
    steps: ['Choose one machine.', 'Search for a particular task or component.', 'Select View to inspect the exact due basis, part and equipment state.'],
    related: ['pm-schedules', 'pm-inspections', 'pm-calendar'],
  },
  'pm-machine-planning': {
    title: 'Machine Planning & Work Bundles',
    purpose: 'Combine due machine-part tasks into approved Running, Standstill or Shutdown work bundles by planning window.',
    steps: ['Select one machine and the planning window.', 'Review tasks due for each equipment state.', 'Create the appropriate work bundle and follow completion status.'],
    related: ['pm-forward-planning', 'pm-schedules', 'pm-compliance'],
  },
  'pm-forward-planning': {
    title: 'Forward Planning & Conflicts',
    purpose: 'Compare upcoming maintenance demand across machines, and detect scheduling conflicts or resource bottlenecks.',
    steps: ['Select your forward planning period.', 'Review due and upcoming work across the portfolio.', 'Resolve conflicts before allocating or bundling work.'],
    related: ['pm-machine-planning', 'pm-compliance', 'pm-calendar'],
  },
  'pm-compliance': {
    title: 'PM Compliance',
    purpose: 'Measure completed, overdue and missed maintenance at plant, department and machine level.',
    steps: ['Select the reporting time window.', 'Compare plant/department completion and overdue rates.', 'Open the affected machine to review overdue cycles and corrective follow-ups.'],
    related: ['pm-forward-planning', 'pm-inspection-exceptions', 'pm-machine-planning'],
  },
  'pm-inspection-exceptions': {
    title: 'Inspection Exceptions',
    purpose: 'Review abnormal or incomplete inspections and outstanding corrective work orders, even after later measurements pass.',
    steps: ['Filter by outcome, follow-up and date.', 'Review abnormal values and linked work orders.', 'Escalate through the existing planner/verification workflow; do not manually clear unresolved defects.'],
    related: ['pm-inspections', 'pm-action-lists', 'pm-compliance'],
  },
  'pm-tasks': {
    title: 'Task Library',
    purpose: 'Maintain reusable industrial maintenance and inspection task definitions.',
    steps: ['Find or create a reusable task.', 'Set the task type and technical instructions.', 'Assign tasks to the relevant machine components through PM Schedules.'],
    related: ['pm-schedules', 'pm-scheduled-inspections', 'pm-templates'],
  },
  'pm-templates': {
    title: 'PM Templates',
    purpose: 'Create reusable task sets for common inspection and maintenance procedures.',
    steps: ['Choose or create a template.', 'Add or review its task checklist.', 'Use the template when configuring maintenance schedules.'],
    related: ['pm-tasks', 'pm-schedules'],
  },
  'pm-triggers': {
    title: 'PM Triggers',
    purpose: 'Review and configure relevant PM trigger inputs without adding a third event frequency type.',
    steps: ['Select the source or schedule.', 'Review configured trigger inputs and thresholds.', 'Keep PM schedule cadence time-based or meter/usage-based.'],
    related: ['pm-schedules', 'pm-machine-planning'],
  },
  'pm-calendar': {
    title: 'PM Calendar',
    purpose: 'Display due and scheduled maintenance by date, and navigate to the exact PM schedule.',
    steps: ['Choose the calendar period.', 'Select a planned or overdue maintenance entry.', 'Open its schedule for details or editing, subject to permissions.'],
    related: ['pm-schedules', 'pm-forward-planning'],
  },
};
export const PM_GUIDE_PAGE_IDS = Object.keys(PM_GUIDE_PAGES);
