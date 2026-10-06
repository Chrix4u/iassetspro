import { PrismaClient, type Prisma } from '@prisma/client';

if (!process.env.DATABASE_URL || !/^postgres(?:ql)?:\/\//i.test(process.env.DATABASE_URL)) {
  throw new Error('DATABASE_URL must point to PostgreSQL');
}

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { createAdapter } = require('../src/lib/create-postgres-adapter');
const db = new PrismaClient({ adapter: createAdapter(process.env.DATABASE_URL) });
const dryRun = process.argv.includes('--dry-run');

type TaskDefinition = {
  taskNumber: number;
  description: string;
  taskType: 'check' | 'measure' | 'inspect' | 'lubricate' | 'record';
  estimatedMinutes: number;
  requiredParts?: Array<Record<string, string | number>>;
};

type TemplateDefinition = {
  componentCode: string;
  scheduleTitle: string;
  templateTitle: string;
  description: string;
  type: 'preventive' | 'inspection' | 'calibration';
  category: string;
  estimatedDuration: number;
  priority: 'medium' | 'high' | 'critical';
  requiredSkills: string[];
  requiredTools: string[];
  tasks: TaskDefinition[];
};

const DEFINITIONS: TemplateDefinition[] = [
  {
    componentCode: 'RP01-CMP-MOTOR',
    scheduleTitle: 'RP-01 Main Motor 1000h Inspection',
    templateTitle: 'RP-01 Main Motor 1000h Inspection Checklist',
    description: 'Equipment-specific 1000-hour inspection for the Siemens RP-01 main drive motor. Covers isolation, cooling condition, mounting, condition readings, accessible fasteners and maintenance findings.',
    type: 'inspection',
    category: 'electrical',
    estimatedDuration: 1.5,
    priority: 'high',
    requiredSkills: ['Electrical Maintenance Technician', 'Mechanical Fitter'],
    requiredTools: ['Digital Torque Wrench 40-200 Nm'],
    tasks: [
      { taskNumber: 1, taskType: 'check', estimatedMinutes: 10, description: 'Confirm the motor is in the approved maintenance state and site isolation/LOTO requirements are satisfied before inspection.' },
      { taskNumber: 2, taskType: 'inspect', estimatedMinutes: 15, description: 'Inspect motor exterior, cooling passages, fan cover, terminal enclosure exterior and surrounding area for contamination, overheating signs, damage or blocked airflow.' },
      { taskNumber: 3, taskType: 'measure', estimatedMinutes: 20, description: 'Record available motor condition readings such as temperature, vibration and operating load/current, and compare them with the site-approved normal condition baseline.' },
      { taskNumber: 4, taskType: 'inspect', estimatedMinutes: 15, description: 'Inspect motor mounting, coupling area and accessible supports for looseness, misalignment indicators, abnormal wear or movement.' },
      { taskNumber: 5, taskType: 'check', estimatedMinutes: 15, description: 'Verify accessible motor and mounting fasteners using the linked digital torque wrench and the approved equipment torque specification.' },
      { taskNumber: 6, taskType: 'record', estimatedMinutes: 15, description: 'Record readings, defects, follow-up actions and any condition that requires corrective work before return to normal service.' },
    ],
  },
  {
    componentCode: 'RP01-PRT-MTRBRG-DE',
    scheduleTitle: 'RP-01 Motor DE Bearing 2000h PM',
    templateTitle: 'RP-01 Motor DE Bearing 2000h Service',
    description: 'Condition-based 2000-hour service checklist for the SKF motor drive-end bearing. The linked SKF replacement bearing and hydraulic puller remain available when replacement is justified by inspection.',
    type: 'preventive',
    category: 'mechanical',
    estimatedDuration: 1.0,
    priority: 'high',
    requiredSkills: ['Mechanical Fitter', 'Maintenance Technician'],
    requiredTools: ['Hydraulic Bearing Puller Set'],
    tasks: [
      { taskNumber: 1, taskType: 'check', estimatedMinutes: 10, description: 'Confirm approved isolation/LOTO and inspect the drive-end bearing area before touching the assembly.' },
      { taskNumber: 2, taskType: 'inspect', estimatedMinutes: 15, description: 'Inspect bearing housing, seals, lubrication condition and surrounding area for contamination, leakage, looseness or abnormal wear.' },
      { taskNumber: 3, taskType: 'measure', estimatedMinutes: 15, description: 'Record bearing temperature and vibration/condition readings and compare with the site-approved normal operating baseline.' },
      { taskNumber: 4, taskType: 'check', estimatedMinutes: 10, description: 'Assess bearing condition and confirm linked SKF 6316 C3 replacement spare availability if condition requires planned replacement.' },
      { taskNumber: 5, taskType: 'record', estimatedMinutes: 10, description: 'Record bearing condition, operating hours, readings and any corrective/replacement recommendation.' },
    ],
  },
  {
    componentCode: 'RP01-CMP-GEARBOX',
    scheduleTitle: 'RP-01 Main Gearbox 500h Inspection',
    templateTitle: 'RP-01 Main Gearbox 500h Inspection Checklist',
    description: '500-hour inspection of the SEW-Eurodrive main reduction gearbox, including lubrication condition, leakage, mounting, alignment indicators, vibration/noise observations and findings.',
    type: 'inspection',
    category: 'mechanical',
    estimatedDuration: 1.5,
    priority: 'critical',
    requiredSkills: ['Mechanical Fitter', 'Maintenance Technician'],
    requiredTools: ['Dial Indicator with Magnetic Base'],
    tasks: [
      { taskNumber: 1, taskType: 'check', estimatedMinutes: 10, description: 'Confirm the gearbox is in the approved maintenance state and required isolation/LOTO controls are applied.' },
      { taskNumber: 2, taskType: 'inspect', estimatedMinutes: 15, description: 'Inspect gearbox casing, seals, breathers and lubricant level/condition for leakage, contamination, overheating signs or damage.' },
      { taskNumber: 3, taskType: 'measure', estimatedMinutes: 20, description: 'Record vibration, temperature and abnormal-noise observations and compare them with the site-approved condition baseline.' },
      { taskNumber: 4, taskType: 'measure', estimatedMinutes: 20, description: 'Check accessible shaft/coupling alignment or runout indicators with the linked dial indicator where the approved maintenance procedure permits.' },
      { taskNumber: 5, taskType: 'inspect', estimatedMinutes: 10, description: 'Inspect mounting points, guards, coupling area and accessible fasteners for looseness, movement or wear.' },
      { taskNumber: 6, taskType: 'record', estimatedMinutes: 15, description: 'Record lubricant condition, readings, defects and corrective actions required before the next PM cycle.' },
    ],
  },
  {
    componentCode: 'RP01-PRT-GBXBRG-IN',
    scheduleTitle: 'RP-01 Gearbox Input Bearing 1500h PM',
    templateTitle: 'RP-01 Gearbox Input Bearing 1500h Service',
    description: '1500-hour condition service for the SKF gearbox input-shaft bearing, preserving the linked critical replacement spare for condition-justified use.',
    type: 'preventive',
    category: 'mechanical',
    estimatedDuration: 1.0,
    priority: 'high',
    requiredSkills: ['Mechanical Fitter', 'Maintenance Technician'],
    requiredTools: [],
    tasks: [
      { taskNumber: 1, taskType: 'check', estimatedMinutes: 10, description: 'Confirm approved gearbox isolation/LOTO and safe access to the input-bearing area.' },
      { taskNumber: 2, taskType: 'inspect', estimatedMinutes: 15, description: 'Inspect input-bearing housing, seal area and lubrication condition for leakage, contamination, looseness or visible wear.' },
      { taskNumber: 3, taskType: 'measure', estimatedMinutes: 15, description: 'Record input-bearing temperature and vibration/condition readings and compare with the site-approved baseline.' },
      { taskNumber: 4, taskType: 'check', estimatedMinutes: 10, description: 'Assess bearing condition and confirm linked SKF NU316 ECP replacement spare availability if replacement is indicated.' },
      { taskNumber: 5, taskType: 'record', estimatedMinutes: 10, description: 'Record findings, readings, operating hours and any required corrective or replacement action.' },
    ],
  },
  {
    componentCode: 'RP01-PRT-GBXBRG-OUT',
    scheduleTitle: 'RP-01 Gearbox Output Bearing 1500h PM',
    templateTitle: 'RP-01 Gearbox Output Bearing 1500h Service',
    description: '1500-hour condition service for the SKF gearbox output-shaft bearing, preserving the linked critical replacement spare for condition-justified use.',
    type: 'preventive',
    category: 'mechanical',
    estimatedDuration: 1.0,
    priority: 'high',
    requiredSkills: ['Mechanical Fitter', 'Maintenance Technician'],
    requiredTools: [],
    tasks: [
      { taskNumber: 1, taskType: 'check', estimatedMinutes: 10, description: 'Confirm approved gearbox isolation/LOTO and safe access to the output-bearing area.' },
      { taskNumber: 2, taskType: 'inspect', estimatedMinutes: 15, description: 'Inspect output-bearing housing, seal area and lubrication condition for leakage, contamination, looseness or visible wear.' },
      { taskNumber: 3, taskType: 'measure', estimatedMinutes: 15, description: 'Record output-bearing temperature and vibration/condition readings and compare with the site-approved baseline.' },
      { taskNumber: 4, taskType: 'check', estimatedMinutes: 10, description: 'Assess bearing condition and confirm linked SKF 22220 E replacement spare availability if replacement is indicated.' },
      { taskNumber: 5, taskType: 'record', estimatedMinutes: 10, description: 'Record findings, readings, operating hours and any required corrective or replacement action.' },
    ],
  },
  {
    componentCode: 'RP01-PRT-BRG-DS',
    scheduleTitle: 'RP-01 Drive-Side Bearing 500h PM',
    templateTitle: 'RP-01 Drive-Side Bearing 500h Service',
    description: 'Equipment-specific 500-hour service for the RP-01 drive-side spherical roller bearing, preserving the commissioned checklist and linked maintenance tools.',
    type: 'preventive',
    category: 'mechanical',
    estimatedDuration: 2.5,
    priority: 'high',
    requiredSkills: ['Mechanical Fitter', 'Maintenance Technician'],
    requiredTools: ['Hydraulic Bearing Puller Set', 'Digital Torque Wrench 40-200 Nm', 'Dial Indicator with Magnetic Base'],
    tasks: [
      { taskNumber: 1, taskType: 'inspect', estimatedMinutes: 15, description: 'Inspect bearing housing, seals, fasteners and surrounding area for leaks, looseness, contamination or abnormal wear.' },
      { taskNumber: 2, taskType: 'measure', estimatedMinutes: 20, description: 'Measure bearing temperature and vibration and compare with the configured normal ranges.' },
      { taskNumber: 3, taskType: 'measure', estimatedMinutes: 30, description: 'Check shaft/cylinder runout and alignment using the dial indicator with magnetic base.' },
      { taskNumber: 4, taskType: 'lubricate', estimatedMinutes: 20, description: 'Lubricate the bearing with EP2 grease using the specified quantity and record operating hours.', requiredParts: [{ partName: 'EP2 Bearing Grease 400g Cartridge', itemCode: 'LUB-EP2-400G', quantity: 1, unit: 'cartridge' }] },
      { taskNumber: 5, taskType: 'check', estimatedMinutes: 30, description: 'Verify bearing-housing and associated fastener torque using the digital torque wrench.' },
      { taskNumber: 6, taskType: 'record', estimatedMinutes: 10, description: 'Record readings, observations, remaining-life concerns and any recommended corrective action.' },
    ],
  },
  {
    componentCode: 'RP01-CMP-INKPUMP',
    scheduleTitle: 'RP-01 Ink Pump Weekly Inspection',
    templateTitle: 'RP-01 Ink Pump Weekly Inspection Checklist',
    description: 'Weekly inspection of the Graco ink circulation pump covering isolation, leakage, hoses/connections, cycling, cleanliness and operating observations.',
    type: 'inspection',
    category: 'process',
    estimatedDuration: 0.75,
    priority: 'medium',
    requiredSkills: ['Maintenance Technician'],
    requiredTools: [],
    tasks: [
      { taskNumber: 1, taskType: 'check', estimatedMinutes: 5, description: 'Confirm the pump is in the approved inspection/maintenance state before physical checks.' },
      { taskNumber: 2, taskType: 'inspect', estimatedMinutes: 10, description: 'Inspect pump body, diaphragm area, hose connections and fittings for ink/air leakage, looseness or damage.' },
      { taskNumber: 3, taskType: 'check', estimatedMinutes: 10, description: 'Check pump cycling, unusual noise and circulation performance against the approved normal operating behavior.' },
      { taskNumber: 4, taskType: 'inspect', estimatedMinutes: 10, description: 'Inspect suction/discharge hoses and accessible strainers/lines for restriction, contamination or deterioration.' },
      { taskNumber: 5, taskType: 'record', estimatedMinutes: 10, description: 'Record leakage, circulation observations, defects and follow-up maintenance required.' },
    ],
  },
  {
    componentCode: 'RP01-PRT-PUMPSEAL',
    scheduleTitle: 'RP-01 Ink Pump Seal Monthly Inspection',
    templateTitle: 'RP-01 Ink Pump Seal Monthly Inspection Checklist',
    description: 'Monthly inspection of the Graco ink-pump diaphragm/seal kit, with the linked PTFE seal kit available for condition-justified replacement.',
    type: 'inspection',
    category: 'mechanical',
    estimatedDuration: 0.75,
    priority: 'medium',
    requiredSkills: ['Maintenance Technician'],
    requiredTools: [],
    tasks: [
      { taskNumber: 1, taskType: 'check', estimatedMinutes: 5, description: 'Confirm the pump is isolated/depressurized according to the approved site procedure before seal inspection.' },
      { taskNumber: 2, taskType: 'inspect', estimatedMinutes: 10, description: 'Inspect accessible diaphragm/seal areas for leakage, swelling, cracking, chemical attack or deformation.' },
      { taskNumber: 3, taskType: 'inspect', estimatedMinutes: 10, description: 'Inspect mating surfaces and surrounding pump body for evidence of abnormal wear or contamination.' },
      { taskNumber: 4, taskType: 'check', estimatedMinutes: 10, description: 'Assess seal condition and confirm linked Graco 1050 PTFE seal-kit availability if replacement is indicated.' },
      { taskNumber: 5, taskType: 'record', estimatedMinutes: 10, description: 'Record seal condition, leakage findings and any replacement/corrective action recommendation.' },
    ],
  },
  {
    componentCode: 'RP01-CMP-EXFAN',
    scheduleTitle: 'RP-01 Exhaust Fan Monthly PM',
    templateTitle: 'RP-01 Exhaust Fan Monthly PM Checklist',
    description: 'Monthly preventive inspection of the Ziehl-Abegg exhaust fan covering isolation, guards, impeller cleanliness, mountings, condition readings and airflow observations.',
    type: 'preventive',
    category: 'mechanical',
    estimatedDuration: 1.0,
    priority: 'high',
    requiredSkills: ['Mechanical Fitter', 'Maintenance Technician'],
    requiredTools: [],
    tasks: [
      { taskNumber: 1, taskType: 'check', estimatedMinutes: 10, description: 'Confirm approved fan isolation/LOTO before physical inspection or cleaning.' },
      { taskNumber: 2, taskType: 'inspect', estimatedMinutes: 15, description: 'Inspect guards, fan housing, mountings and accessible duct connections for damage, looseness, buildup or leakage.' },
      { taskNumber: 3, taskType: 'inspect', estimatedMinutes: 10, description: 'Inspect accessible impeller/fan surfaces for contamination, fouling or visible damage and clean only under the approved maintenance procedure.' },
      { taskNumber: 4, taskType: 'measure', estimatedMinutes: 15, description: 'Record vibration/noise and available operating condition readings and compare with the site-approved normal baseline.' },
      { taskNumber: 5, taskType: 'record', estimatedMinutes: 10, description: 'Record airflow observations, readings, defects and corrective actions required.' },
    ],
  },
  {
    componentCode: 'RP01-INS-DRYTEMP',
    scheduleTitle: 'RP-01 Dryer Temperature Probe Quarterly Calibration',
    templateTitle: 'RP-01 Dryer Temperature Probe Quarterly Calibration Checklist',
    description: 'Quarterly calibration checklist for the Endress+Hauser dryer temperature probe, including inspection, reference comparison, as-found/as-left records and calibration status.',
    type: 'calibration',
    category: 'instrumentation',
    estimatedDuration: 1.0,
    priority: 'high',
    requiredSkills: ['Instrumentation Technician'],
    requiredTools: [],
    tasks: [
      { taskNumber: 1, taskType: 'check', estimatedMinutes: 10, description: 'Confirm the instrument/process is in the approved calibration state and required isolation controls are satisfied.' },
      { taskNumber: 2, taskType: 'inspect', estimatedMinutes: 10, description: 'Inspect probe, mounting, cable and connection condition for damage, looseness, contamination or heat deterioration.' },
      { taskNumber: 3, taskType: 'measure', estimatedMinutes: 20, description: 'Compare the probe reading with an approved calibrated temperature reference across the plant calibration points/tolerance.' },
      { taskNumber: 4, taskType: 'check', estimatedMinutes: 10, description: 'Confirm calibration status/label and verify the final indicated value is within the approved plant tolerance.' },
      { taskNumber: 5, taskType: 'record', estimatedMinutes: 10, description: 'Record as-found/as-left readings, reference equipment identification, tolerance result and any corrective action.' },
    ],
  },
  {
    componentCode: 'RP01-INS-LOADCELL',
    scheduleTitle: 'RP-01 Web Tension Load Cell Quarterly Calibration',
    templateTitle: 'RP-01 Web Tension Load Cell Quarterly Calibration Checklist',
    description: 'Quarterly calibration checklist for the ABB web-tension load cell covering mechanical condition, zero/span verification, reference comparison and calibration records.',
    type: 'calibration',
    category: 'instrumentation',
    estimatedDuration: 1.0,
    priority: 'high',
    requiredSkills: ['Instrumentation Technician'],
    requiredTools: [],
    tasks: [
      { taskNumber: 1, taskType: 'check', estimatedMinutes: 10, description: 'Confirm the web-tension system is in the approved calibration/maintenance state before applying reference checks.' },
      { taskNumber: 2, taskType: 'inspect', estimatedMinutes: 10, description: 'Inspect load-cell mounting, mechanical freedom, cable routing and connections for damage, binding, looseness or contamination.' },
      { taskNumber: 3, taskType: 'measure', estimatedMinutes: 20, description: 'Verify zero and reference-load/span response using the approved calibrated reference method and plant tolerance.' },
      { taskNumber: 4, taskType: 'check', estimatedMinutes: 10, description: 'Confirm stable signal/output and final calibration status after adjustment, if adjustment was authorized.' },
      { taskNumber: 5, taskType: 'record', estimatedMinutes: 10, description: 'Record as-found/as-left values, reference identification, tolerance result and any corrective action.' },
    ],
  },
  {
    componentCode: 'RP01-INS-GUARDSW',
    scheduleTitle: 'RP-01 Guard Safety Switch Weekly Functional Test',
    templateTitle: 'RP-01 Guard Safety Switch Weekly Functional Test Checklist',
    description: 'Weekly safety-function test of the Pilz guard safety switch. The procedure verifies physical condition and expected interlock/reset behavior without bypassing the safeguard.',
    type: 'inspection',
    category: 'safety',
    estimatedDuration: 0.5,
    priority: 'critical',
    requiredSkills: ['Qualified Maintenance Technician', 'Safety-Authorized Technician'],
    requiredTools: [],
    tasks: [
      { taskNumber: 1, taskType: 'inspect', estimatedMinutes: 5, description: 'Inspect guard switch, actuator, mounting and cable condition for damage, looseness, misalignment or tampering.' },
      { taskNumber: 2, taskType: 'check', estimatedMinutes: 10, description: 'Perform the approved functional test and verify opening the guarded access produces the expected safe-state/interlock response; do not bypass the safeguard.' },
      { taskNumber: 3, taskType: 'check', estimatedMinutes: 10, description: 'Verify the approved guard-close/reset/restart sequence behaves as designed and does not permit unexpected automatic restart.' },
      { taskNumber: 4, taskType: 'record', estimatedMinutes: 5, description: 'Record pass/fail result, observed defects and any immediate safety escalation or corrective work required.' },
    ],
  },
  {
    componentCode: 'RP01-CMP-VFD',
    scheduleTitle: 'RP-01 Main Drive VFD Monthly Inspection',
    templateTitle: 'RP-01 Main Drive VFD Monthly Inspection Checklist',
    description: 'Monthly inspection of the Siemens main-drive VFD covering safe maintenance state, ventilation, external condition, diagnostics/fault history, connections where authorized and findings.',
    type: 'inspection',
    category: 'electrical',
    estimatedDuration: 1.0,
    priority: 'high',
    requiredSkills: ['Electrical Maintenance Technician'],
    requiredTools: [],
    tasks: [
      { taskNumber: 1, taskType: 'check', estimatedMinutes: 10, description: 'Confirm the VFD is in the approved maintenance state and all electrical isolation/discharge requirements are satisfied before any internal inspection.' },
      { taskNumber: 2, taskType: 'inspect', estimatedMinutes: 15, description: 'Inspect enclosure, ventilation path, filters/fans and surrounding area for dust buildup, blocked airflow, heat damage or contamination.' },
      { taskNumber: 3, taskType: 'check', estimatedMinutes: 15, description: 'Review accessible VFD diagnostics, alarm/fault history and operating status through the approved interface; record recurring or unresolved faults.' },
      { taskNumber: 4, taskType: 'inspect', estimatedMinutes: 10, description: 'Inspect accessible connections, grounding and mounting condition only where the approved electrical maintenance procedure permits.' },
      { taskNumber: 5, taskType: 'record', estimatedMinutes: 10, description: 'Record diagnostic findings, environmental condition, defects and required corrective action.' },
    ],
  },
  {
    componentCode: 'RP01-CMP-PLC',
    scheduleTitle: 'RP-01 PLC Cabinet Quarterly Inspection',
    templateTitle: 'RP-01 PLC Cabinet Quarterly Inspection Checklist',
    description: 'Quarterly inspection of the Siemens machine PLC/controller cabinet covering safe state, environment, controller diagnostics, communications, program backup/version control and findings.',
    type: 'inspection',
    category: 'controls',
    estimatedDuration: 1.5,
    priority: 'high',
    requiredSkills: ['Controls/PLC Technician', 'Electrical Maintenance Technician'],
    requiredTools: [],
    tasks: [
      { taskNumber: 1, taskType: 'check', estimatedMinutes: 10, description: 'Confirm the PLC/cabinet is in the approved inspection state and required electrical controls are satisfied before opening or touching equipment.' },
      { taskNumber: 2, taskType: 'inspect', estimatedMinutes: 15, description: 'Inspect cabinet enclosure, cooling/ventilation, cleanliness, moisture/contamination signs and visible wiring condition.' },
      { taskNumber: 3, taskType: 'check', estimatedMinutes: 20, description: 'Review controller diagnostics, hardware status, active alarms and communication health through the approved engineering/diagnostic interface.' },
      { taskNumber: 4, taskType: 'check', estimatedMinutes: 20, description: 'Verify the approved PLC program/configuration backup and version record are current; do not change logic as part of routine inspection.' },
      { taskNumber: 5, taskType: 'inspect', estimatedMinutes: 10, description: 'Inspect accessible terminal/module seating and grounding condition only where the approved electrical maintenance procedure permits.' },
      { taskNumber: 6, taskType: 'record', estimatedMinutes: 15, description: 'Record diagnostic status, backup/version reference, defects and any follow-up corrective work required.' },
    ],
  },
];

function validateDefinitions() {
  const componentCodes = new Set<string>();
  const scheduleTitles = new Set<string>();
  const templateTitles = new Set<string>();

  for (const definition of DEFINITIONS) {
    if (componentCodes.has(definition.componentCode)) {
      throw new Error(`Duplicate RP-01 PM component definition: ${definition.componentCode}`);
    }
    if (scheduleTitles.has(definition.scheduleTitle)) {
      throw new Error(`Duplicate RP-01 PM schedule definition: ${definition.scheduleTitle}`);
    }
    if (templateTitles.has(definition.templateTitle)) {
      throw new Error(`Duplicate RP-01 PM template definition: ${definition.templateTitle}`);
    }
    componentCodes.add(definition.componentCode);
    scheduleTitles.add(definition.scheduleTitle);
    templateTitles.add(definition.templateTitle);

    if (!Number.isFinite(definition.estimatedDuration) || definition.estimatedDuration <= 0) {
      throw new Error(`Invalid estimated duration for ${definition.templateTitle}`);
    }
    if (definition.tasks.length === 0) {
      throw new Error(`PM template must contain at least one task: ${definition.templateTitle}`);
    }

    const taskNumbers = new Set<number>();
    let totalTaskMinutes = 0;
    for (const task of definition.tasks) {
      if (!Number.isInteger(task.taskNumber) || task.taskNumber <= 0 || taskNumbers.has(task.taskNumber)) {
        throw new Error(`Invalid or duplicate task number in ${definition.templateTitle}: ${task.taskNumber}`);
      }
      if (!task.description.trim()) {
        throw new Error(`Blank task description in ${definition.templateTitle}: ${task.taskNumber}`);
      }
      if (!Number.isInteger(task.estimatedMinutes) || task.estimatedMinutes <= 0) {
        throw new Error(`Invalid task duration in ${definition.templateTitle}: ${task.taskNumber}`);
      }
      taskNumbers.add(task.taskNumber);
      totalTaskMinutes += task.estimatedMinutes;
    }

    if (totalTaskMinutes > definition.estimatedDuration * 60) {
      throw new Error(
        `Task minutes exceed template duration for ${definition.templateTitle}: ${totalTaskMinutes} > ${definition.estimatedDuration * 60}`,
      );
    }
  }
}

async function upsertTemplate(
  tx: Prisma.TransactionClient,
  plannerId: string,
  definition: TemplateDefinition,
) {
  let template = await tx.pmTemplate.findFirst({
    where: { title: definition.templateTitle },
    orderBy: { createdAt: 'asc' },
    select: { id: true },
  });

  const templateData = {
    description: definition.description,
    type: definition.type,
    category: definition.category,
    estimatedDuration: definition.estimatedDuration,
    priority: definition.priority,
    requiredSkills: definition.requiredSkills.length > 0 ? JSON.stringify(definition.requiredSkills) : null,
    requiredTools: definition.requiredTools.length > 0 ? JSON.stringify(definition.requiredTools) : null,
    isActive: true,
  };

  if (template) {
    await tx.pmTemplate.update({ where: { id: template.id }, data: templateData });
  } else {
    template = await tx.pmTemplate.create({
      data: {
        ...templateData,
        title: definition.templateTitle,
        createdById: plannerId,
      },
      select: { id: true },
    });
  }

  const canonicalTaskIds: string[] = [];
  for (const task of definition.tasks) {
    const existingTask = await tx.pmTemplateTask.findFirst({
      where: { templateId: template.id, taskNumber: task.taskNumber },
      orderBy: { id: 'asc' },
      select: { id: true },
    });
    const taskData = {
      description: task.description,
      taskType: task.taskType,
      requiredParts: task.requiredParts ? JSON.stringify(task.requiredParts) : null,
      estimatedMinutes: task.estimatedMinutes,
      sortOrder: task.taskNumber,
      isActive: true,
    };

    if (existingTask) {
      await tx.pmTemplateTask.update({ where: { id: existingTask.id }, data: taskData });
      canonicalTaskIds.push(existingTask.id);
    } else {
      const createdTask = await tx.pmTemplateTask.create({
        data: {
          ...taskData,
          templateId: template.id,
          taskNumber: task.taskNumber,
        },
        select: { id: true },
      });
      canonicalTaskIds.push(createdTask.id);
    }
  }

  await tx.pmTemplateTask.updateMany({
    where: {
      templateId: template.id,
      isActive: true,
      id: { notIn: canonicalTaskIds },
    },
    data: { isActive: false },
  });

  return template.id;
}

async function main() {
  validateDefinitions();

  const result = await db.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(
      'SELECT pg_advisory_xact_lock(hashtext($1))',
      'iassetspro:commission-rp01-pm-templates',
    );

    const asset = await tx.asset.findUnique({
      where: { assetTag: 'UAT-RP-001' },
      select: { id: true, assetTag: true, name: true },
    });
    if (!asset) throw new Error('UAT-RP-001 is missing');

    const planner = await tx.user.findFirst({
      where: { OR: [{ username: 'uat_planner' }, { username: 'admin' }] },
      orderBy: { username: 'asc' },
      select: { id: true, username: true },
    });
    if (!planner) throw new Error('No planner/admin user available for RP-01 PM template commissioning');

    const validatedTargets: Array<{ definition: TemplateDefinition; scheduleId: string }> = [];
    let templatesExisting = 0;
    let templatesMissing = 0;

    for (const definition of DEFINITIONS) {
      const component = await tx.componentRegistry.findUnique({
        where: { componentCode: definition.componentCode },
        select: { id: true, assetId: true },
      });
      if (!component || component.assetId !== asset.id) {
        throw new Error(`Missing RP-01 component on ${asset.assetTag}: ${definition.componentCode}`);
      }

      const schedule = await tx.pmSchedule.findFirst({
        where: {
          assetId: asset.id,
          componentId: component.id,
          title: definition.scheduleTitle,
        },
        select: { id: true },
      });
      if (!schedule) throw new Error(`Missing RP-01 PM schedule: ${definition.scheduleTitle}`);

      const preexistingTemplate = await tx.pmTemplate.findFirst({
        where: { title: definition.templateTitle },
        orderBy: { createdAt: 'asc' },
        select: { id: true },
      });
      if (preexistingTemplate) templatesExisting++;
      else templatesMissing++;

      validatedTargets.push({ definition, scheduleId: schedule.id });
    }

    if (dryRun) {
      return {
        dryRun: true,
        assetTag: asset.assetTag,
        assetName: asset.name,
        commissionedBy: planner.username,
        definitions: DEFINITIONS.length,
        templatesExisting,
        templatesMissing,
        schedulesMatched: validatedTargets.length,
        schedulesLinked: 0,
      };
    }

    let schedulesLinked = 0;
    for (const { definition, scheduleId } of validatedTargets) {
      const templateId = await upsertTemplate(tx, planner.id, definition);
      await tx.pmSchedule.update({
        where: { id: scheduleId },
        data: {
          templateId,
          estimatedDuration: definition.estimatedDuration,
        },
      });
      schedulesLinked++;
    }

    return {
      dryRun: false,
      assetTag: asset.assetTag,
      assetName: asset.name,
      commissionedBy: planner.username,
      definitions: DEFINITIONS.length,
      templatesCreated: templatesMissing,
      templatesUpdated: templatesExisting,
      schedulesMatched: validatedTargets.length,
      schedulesLinked,
    };
  }, {
    maxWait: 10_000,
    timeout: 120_000,
  });

  console.log(JSON.stringify(result, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
