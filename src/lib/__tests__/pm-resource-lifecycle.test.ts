import { describe, expect, it } from 'vitest';
import { summarizePmResourceLifecycle } from '@/lib/pm-resource-lifecycle';

const materials = [
  { id: 'brg-1', label: 'Bearing 6205', aliases: ['BRG-6205'], quantity: 2 },
  { id: 'grease', label: 'Kluber grease', aliases: ['Food-grade grease'], quantity: 1 },
];

describe('PM resource lifecycle evidence', () => {
  it('does not treat planner suggested pending recommendations as submitted', () => {
    const result = summarizePmResourceLifecycle('material', materials,
      [{id: 'brg-1', label:'Bearing 6205', source:'planner_suggested',status:'pending'}], true);
    expect(result.notSubmitted).toBe(2);
    expect(result.issuedWithQuantity).toBe(0);
    expect(result.entries[0].stage).toBe('not_submitted');
  });
  it('distinguishes requested, supervisor approved and store approved', () => {
    const result = summarizePmResourceLifecycle('material',[
      {id:'a',label:'A',quantity:1},{id:'b',label:'B',quantity:1},
      {id:'c',label:'C',quantity:1},
    ],[
      {id:'a',status:'pending',source:'technician'},
      {id:'b',status:'supervisor_approved'},
      {id:'c',status:'storekeeper_approved'},
    ],true);
    expect(result.entries.map(x=>x.stage)).toEqual(
      ['requested','supervisor_approved','store_approved']);
    expect(result.issuedWithQuantity).toBe(0);
    expect(result.awaitingApproval).toBe(2);
  });
  it('reports stock reservation separately, without implying warehouse issue', () => {
    const result = summarizePmResourceLifecycle('material',[materials[0]],[
      {id:'brg-1',status:'storekeeper_approved',stockReserved:true,quantityIssued:0},
    ],true);
    expect(result.entries[0].stage).toBe('stock_reserved');
    expect(result.issuedWithQuantity).toBe(0);
  });
  it('only counts a full material issue when actual quantity meets the plan requirement', () => {
    const result = summarizePmResourceLifecycle('material',materials,[
      {id:'brg-1',status:'issued',quantityIssued:1},
      {id:'grease',status:'issued',quantityIssued:1},
    ],true);
    expect(result.entries.map(x=>x.stage)).toEqual(['partially_issued','issued']);
    expect(result.issuedWithQuantity).toBe(1);
    expect(result.partialOrUnverified).toBe(1);
  });
  it('does not equate an issued status with verified quantity when numbers are missing', () => {
    const result = summarizePmResourceLifecycle('tool',[
      {id:'torque',label:'Torque wrench',quantity:null},
    ],[{id:'torque',status:'issued',quantityIssued:null}],true);
    expect(result.entries[0].stage).toBe('issued_unverified');
    expect(result.issuedWithQuantity).toBe(0);
  });
  it('uses actual tool line-item issued counts to distinguish partial from full issue', () => {
    const result = summarizePmResourceLifecycle('tool',[
      {id:'torque',label:'Torque wrench',quantity:2},
    ],[{id:'torque',status:'issued',quantityIssued:1}],true);
    expect(result.entries[0].stage).toBe('partially_issued');
    expect(result.issuedWithQuantity).toBe(0);
  });
  it('retains rejected and returned steps as not currently available for the job', () => {
    const result = summarizePmResourceLifecycle('material',materials,[
      {id:'brg-1',status:'rejected'},
      {id:'grease',status:'returned'},
    ],true);
    expect(result.rejectedOrReturned).toBe(2);
    expect(result.issuedWithQuantity).toBe(0);
  });
  it('never invents readiness when an operational module is unavailable', () => {
    const result = summarizePmResourceLifecycle('material',[materials[0]],
      [{id:'brg-1',status:'issued',quantityIssued:2}],false);
    expect(result.entries[0].stage).toBe('module_unavailable');
    expect(result.issuedWithQuantity).toBe(0);
    expect(result.partialOrUnverified).toBe(1);
  });
  it('uses explicit name aliases only when a legacy request has no catalog ID', () => {
    const result = summarizePmResourceLifecycle('material',[materials[0]],[
      {id:null,label:'BRG-6205',status:'issued',quantityIssued:2},
    ],true);
    expect(result.entries[0].stage).toBe('issued');
  });
  it('does not confuse a different catalog item with the same label', () => {
    const result = summarizePmResourceLifecycle('material',[materials[0]],[
      {id:'another-bearing',label:'Bearing 6205',status:'issued',quantityIssued:2},
    ],true);
    expect(result.entries[0].stage).toBe('not_submitted');
    expect(result.issuedWithQuantity).toBe(0);
  });
  it('prefers an active replacement request over an older rejected one', () => {
    const result = summarizePmResourceLifecycle('material',[materials[0]],[
      {id:'brg-1',status:'rejected'},
      {id:'brg-1',status:'supervisor_approved'},
    ],true);
    expect(result.entries[0].stage).toBe('supervisor_approved');
    expect(result.rejectedOrReturned).toBe(0);
  });
  it('treats a new unrecognized status as needing investigation, not a verified issue', () => {
    const result = summarizePmResourceLifecycle('tool',[
      {id:'tool-1',label:'Tool',quantity:1},
    ],[{id:'tool-1',status:'unknown_future_state'}],true);
    expect(result.entries[0].stage).toBe('unverified');
    expect(result.issuedWithQuantity).toBe(0);
  });
  it('does not count a positive quantity issued when request is still pending', () => {
    const result = summarizePmResourceLifecycle('material',[materials[0]],[
      {id:'brg-1',status:'pending',source:'technician',quantityIssued:99},
    ],true);
    expect(result.entries[0].stage).toBe('requested');
    expect(result.issuedWithQuantity).toBe(0);
  });
});
