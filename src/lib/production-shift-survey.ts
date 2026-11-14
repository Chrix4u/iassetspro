/** Shared, pure production-survey rules; a missing shift is never imputed as zero. */
export type ProductionSurveyInput = {
  productionDate: Date; assetId: string; shiftTemplateId: string; assetMeterId: string | null;
  outputQuantity: number; unit: string; targetQuantity: number | null; availableMinutes: number;
  breakMinutes: number; repairMinutes: number; inputDeliveryMinutes: number;
  changeoverMinutes: number; startupCleaningMinutes: number; otherMinutes: number;
  preventiveMinutes: number; notes: string | null;
};
export const STOPPAGE_FIELDS = ['breakMinutes','repairMinutes','inputDeliveryMinutes',
  'changeoverMinutes','startupCleaningMinutes','otherMinutes','preventiveMinutes'] as const;
export function surveyTotals(input: Pick<ProductionSurveyInput, typeof STOPPAGE_FIELDS[number] | 'availableMinutes' | 'outputQuantity'>) {
  const downtimeMinutes = STOPPAGE_FIELDS.reduce((sum, key) => sum + input[key], 0);
  const productiveMinutes = input.availableMinutes - downtimeMinutes;
  return {
    downtimeMinutes, productiveMinutes,
    utilizationPct: input.availableMinutes > 0 ? 100 * productiveMinutes / input.availableMinutes : null,
    speedPerMinute: productiveMinutes > 0 ? input.outputQuantity / productiveMinutes : null,
  };
}
function nonnegativeNumber(raw: unknown, label: string, maximum: number): number {
  if (raw === '' || raw === null || raw === undefined || typeof raw === 'boolean') throw new Error(label + ' is required');
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0 || value > maximum) throw new Error(label + ' must be a nonnegative finite number');
  return value;
}
export function parseProductionSurveyInput(raw: unknown): ProductionSurveyInput {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Production survey details are required');
  const body = raw as Record<string, unknown>;
  const assetId = String(body.assetId || '').trim();
  const shiftTemplateId = String(body.shiftTemplateId || '').trim();
  if (!assetId || !shiftTemplateId) throw new Error('Machine and shift must be selected');
  const dateText = String(body.productionDate || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateText)) throw new Error('Production date must be yyyy-mm-dd');
  const productionDate = new Date(dateText + 'T00:00:00.000Z');
  if (Number.isNaN(productionDate.getTime()) || productionDate.toISOString().slice(0,10) !== dateText)
    throw new Error('Production date is invalid');
  if (productionDate.getTime() > Date.now() + 86400000) throw new Error('Future shift production cannot be submitted');
  const assetMeterId = typeof body.assetMeterId === 'string' && body.assetMeterId.trim() ? body.assetMeterId.trim() : null;
  const unit = String(body.unit || '').trim();
  if (!unit || unit.length > 32 || !/^[a-zA-Z0-9°µ%/_ .-]+$/.test(unit)) throw new Error('A valid output unit is required');
  const outputQuantity = nonnegativeNumber(body.outputQuantity, 'Production output', 1e12 - 1);
  const targetQuantity = body.targetQuantity === '' || body.targetQuantity == null ? null : nonnegativeNumber(body.targetQuantity, 'Production target', 1e12 - 1);
  const availableMinutes = nonnegativeNumber(body.availableMinutes, 'Available minutes', 1440);
  if (!Number.isInteger(availableMinutes)) throw new Error('Available minutes must be a whole number');
  const stops: Record<string, number> = {};
  for (const name of STOPPAGE_FIELDS) {
    const number = nonnegativeNumber(body[name] ?? 0, name, 1440);
    if (!Number.isInteger(number)) throw new Error(name + ' must be whole minutes');
    stops[name] = number;
  }
  const downtime = Object.values(stops).reduce((sum,value)=>sum+value,0);
  if (downtime > availableMinutes) throw new Error('Stoppage minutes cannot exceed available time');
  if (outputQuantity > 0 && availableMinutes === downtime) throw new Error('Positive production needs positive productive time');
  const notes = typeof body.notes === 'string' && body.notes.trim() ? body.notes.trim().slice(0,2000) : null;
  return { productionDate,assetId,shiftTemplateId,assetMeterId,outputQuantity,unit,targetQuantity,availableMinutes,
    breakMinutes:stops.breakMinutes,repairMinutes:stops.repairMinutes,inputDeliveryMinutes:stops.inputDeliveryMinutes,
    changeoverMinutes:stops.changeoverMinutes,startupCleaningMinutes:stops.startupCleaningMinutes,
    otherMinutes:stops.otherMinutes,preventiveMinutes:stops.preventiveMinutes,notes };
}
export function reportingWeekStart(date: Date): string {
  const d = new Date(Date.UTC(date.getUTCFullYear(),date.getUTCMonth(),date.getUTCDate()));
  // The engineer's workbook groups Sunday through Saturday.
  d.setUTCDate(d.getUTCDate()-d.getUTCDay());
  return d.toISOString().slice(0,10);
}
export function allowedProductionMeter(type: string) {
  return ['production','production_output','output'].includes(type.trim().toLowerCase());
}
