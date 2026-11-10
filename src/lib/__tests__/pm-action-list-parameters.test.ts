import { describe, expect, it } from 'vitest';
import { ACTION_LIST_PARAMETER_PRESETS, actionListAcceptance, actionListLimitJson, parseActionListParameters } from '@/lib/pm-action-list-parameters';
describe('Action List parameter definitions', () => {
  it('provides four sensible starting categories without supplying fake machine thresholds', () => {
    expect(ACTION_LIST_PARAMETER_PRESETS.map(x => x.key)).toEqual(['temperature','vibration','sound','corrosion']);
    expect(ACTION_LIST_PARAMETER_PRESETS.every(x => !('max' in x))).toBe(true);
  });
  it('requires real approved maximum limits for instrument checks', () => {
    const item = {key:'temperature',name:'Temperature',method:'measurement',unit:'°C',min:null,max:75};
    expect(parseActionListParameters([item])[0].max).toBe(75);
    expect(() => parseActionListParameters([{ ...item, max:null }])).toThrow(/approved/);
    expect(() => parseActionListParameters([{ ...item, max:'abc' }])).toThrow(/finite/);
    expect(() => parseActionListParameters([{ ...item, min:90 }])).toThrow(/minimum/);
    expect(JSON.parse(actionListLimitJson(parseActionListParameters([item])[0]))).toEqual({ min:null,max:75,unit:'°C' });
  });
  it('requires documented acceptance criteria for corrosion and other visual checks', () => {
    const item={key:'corrosion',name:'Corrosion',method:'visual',unit:'',min:null,max:null,acceptance:'No visible pitting'};
    expect(actionListAcceptance(actionListLimitJson(parseActionListParameters([item])[0]))).toBe('No visible pitting');
    expect(() => parseActionListParameters([{...item,acceptance:''}])).toThrow(/acceptable visual/);
    expect(() => parseActionListParameters([{...item,max:4}])).toThrow(/not numeric/);
  });
  it('rejects duplicate parameter keys and unsupported inspection methods', () => {
    const item={key:'temperature',name:'Temperature',method:'measurement',unit:'°C',min:null,max:80};
    expect(() => parseActionListParameters([item,item])).toThrow(/only once/);
    expect(() => parseActionListParameters([{...item,method:'event'}])).toThrow(/Visual or Instrument/);
  });
});
