/** Planner notification is intentionally IN-APP/WEBSOCKET ONLY.
 * A corrective draft must not force paid SMS/email before explicit opt-in.
 */
export interface PlannerInspectionAlert {
  userId: string;
  type: 'asset_condition';
  title: string;
  message: string;
  entityType: 'work_order';
  entityId: string;
  actionUrl: string;
}

export function createPlannerInspectionAlert(input: {
  plannerId: string | null;
  workOrderId: string;
  woNumber: string;
  assetName: string;
  partCode: string;
  inspectionName: string;
  equipmentState: 'running' | 'standstill' | null;
  result: 'fail' | 'needs_attention';
  reading: string | null;
  unit?: string | null;
}): PlannerInspectionAlert | null {
  if (!input.plannerId) return null;
  const value = input.reading === null ? 'qualitative observation' :
    input.reading + (input.unit ? ' ' + input.unit : '');
  return {
    userId: input.plannerId,
    type: 'asset_condition',
    title: 'Inspection defect: ' + input.woNumber + ' awaiting planner review',
    message: 'Machine ' + input.assetName + ', part ' + input.partCode +
      ', check ' + input.inspectionName + ' (' + (input.equipmentState || 'state unrecorded') +
      '): ' + input.result.replace('_', ' ') + ', reading ' + value +
      '. Draft ' + input.woNumber + ' requires planner review; no repair has been authorized.',
    entityType: 'work_order',
    entityId: input.workOrderId,
    actionUrl: 'wo-detail?id=' + input.workOrderId,
  };
}
