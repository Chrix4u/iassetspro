import { describe, expect, it } from 'vitest';
import {
  assistanceRequestReason,
  assignmentDeclineReason,
  downtimeReason,
  handoverReason,
  materialRequestReason,
  pauseReason,
  toolRequestReason,
  waitingStateReason,
} from '@/lib/technician-reason-defaults';

describe('technician reason defaults', () => {
  const wo = { woNumber: 'WO-202609-0042', title: 'Replace pump bearing' };

  it('derives resource reasons from actual work-order and selected resource data', () => {
    expect(materialRequestReason({ ...wo, itemName: '6205 Bearing' }))
      .toBe('6205 Bearing required to execute WO-202609-0042 — Replace pump bearing');
    expect(toolRequestReason({ ...wo, toolName: 'Torque Wrench' }))
      .toBe('Torque Wrench required to execute WO-202609-0042 — Replace pump bearing');
    expect(assistanceRequestReason({ ...wo, trade: 'Electrician' }))
      .toBe('Additional Electrician support required to execute WO-202609-0042 — Replace pump bearing');
  });

  it('derives operational reasons from selected state and shift data', () => {
    expect(waitingStateReason({ ...wo, targetStatus: 'waiting_parts' }))
      .toContain('Waiting for required parts / materials');
    expect(waitingStateReason({ ...wo, targetStatus: 'waiting_tools' }))
      .toContain('Waiting for required tools');
    expect(handoverReason({ ...wo, fromShift: 'morning', toShift: 'afternoon' }))
      .toBe('Shift handover from morning to afternoon for WO-202609-0042 — Replace pump bearing');
    expect(downtimeReason({ ...wo, category: 'unplanned', assetName: 'Pump P-101' }))
      .toBe('Unplanned downtime recorded for Pump P-101 during WO-202609-0042 — Replace pump bearing');
  });

  it('keeps decline and pause reasons meaningful without technician typing', () => {
    expect(assignmentDeclineReason(wo))
      .toBe('Technician declined assignment for WO-202609-0042 — Replace pump bearing');
    expect(pauseReason(wo))
      .toBe('Technician temporarily paused execution of WO-202609-0042 — Replace pump bearing');
  });
});
