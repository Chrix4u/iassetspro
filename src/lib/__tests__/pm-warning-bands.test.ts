import { describe, expect, it } from 'vitest';
import {
  automaticMeasurementOutcome, evaluateInspectionResult, parseInspectionLimits,
} from '@/lib/pm-inspection';
import {
  actionListLimitJson, parseActionListParameters,
} from '@/lib/pm-action-list-parameters';

const configured = JSON.stringify({
  min: 50, max: 100, warningMin: 60, warningMax: 85, unit: '°C',
});

describe('engineer-approved PM warning bands', () => {
  it('auto-classifies passing, attention and failed readings using two tiers', () => {
    for (const reading of ['60', '75', '85']) {
      expect(automaticMeasurementOutcome(reading, configured)).toBe('pass');
    }
    for (const reading of ['50', '59.9', '85.1', '100']) {
      expect(automaticMeasurementOutcome(reading, configured)).toBe('needs_attention');
    }
    for (const reading of ['49.9', '100.1']) {
      expect(automaticMeasurementOutcome(reading, configured)).toBe('fail');
    }
  });

  it('preserves binary Pass/Fail behavior for older thresholds without warnings', () => {
    const legacy = JSON.stringify({ min: 50, max: 70, unit: '°C' });
    expect(automaticMeasurementOutcome('65', legacy)).toBe('pass');
    expect(automaticMeasurementOutcome('100', legacy)).toBe('fail');
    expect(automaticMeasurementOutcome('not a number', legacy)).toBeNull();
  });

  it('server-side evaluation never accepts a client OK through a warning band', () => {
    const limits = parseInspectionLimits(configured);
    const warning = evaluateInspectionResult('measurement', '90', 'pass', limits);
    expect(warning.outcome).toBe('needs_attention');
    expect(warning.isAlarm).toBe(true);
    const failed = evaluateInspectionResult('measurement', '110', 'pass', limits);
    expect(failed.outcome).toBe('fail');
    expect(failed.isAlarm).toBe(true);
    expect(evaluateInspectionResult('measurement', '75', 'pass', limits).isAlarm).toBe(false);
  });

  it('rejects invalid warning bands and visual parameters with numeric warnings', () => {
    const base = { key: 'temperature', name: 'Bearing temperature', method: 'measurement',
      min: 50, max: 100, unit: '°C', acceptance: '' };
    expect(() => parseActionListParameters([{ ...base, warningMin: 49 }])).toThrow(/inside|warning/i);
    expect(() => parseActionListParameters([{ ...base, warningMax: 101 }])).toThrow(/inside|warning/i);
    expect(() => parseActionListParameters([{ ...base, warningMin: 90, warningMax: 80 }])).toThrow(/warning/i);
    expect(() => parseActionListParameters([{
      key: 'corrosion', name: 'Corrosion', method: 'visual', unit: '',
      min: null, max: null, warningMax: 2, acceptance: 'No visible pitting',
    }])).toThrow(/visual/i);
  });

  it('retains warning bounds in approved stored ranges, without breaking legacy data', () => {
    const [item] = parseActionListParameters([{
      key: 'temperature', name: 'Bearing temperature', method: 'measurement',
      min: 50, max: 100, warningMin: 60, warningMax: 85, unit: '°C', acceptance: '',
    }]);
    expect(parseInspectionLimits(actionListLimitJson(item))).toMatchObject({
      min: 50, max: 100, warningMin: 60, warningMax: 85, unit: '°C',
    });
    const legacy = parseInspectionLimits(JSON.stringify({min:50,max:100,unit:'°C'}));
    expect(legacy).toEqual({min:50,max:100,unit:'°C'});
  });

  it('ignores invalid legacy warning band data instead of escalating from broken config', () => {
    const invalid = JSON.stringify({min:50,max:100,warningMin:20,warningMax:110,unit:'°C'});
    expect(parseInspectionLimits(invalid)).toEqual({min:50,max:100,unit:'°C'});
    expect(automaticMeasurementOutcome('75', invalid)).toBe('pass');
  });
});
