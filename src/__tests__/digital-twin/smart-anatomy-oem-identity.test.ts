import { describe, it, expect } from 'vitest';
import { validateOemSourceIdentity } from '@/lib/smart-anatomy/oem-identity';

const claim = {
  oemManufacturer: 'Siemens',
  oemModel: 'S100-M2',
  drawingRevision: 'DWG-001 Rev B',
  nameplateSerial: 'SN-2026-045',
};
const asset = {
  manufacturer: 'SIEMENS',
  model: 's100-m2',
  serialNumber: 'sn-2026-045',
};

describe('exact source-backed OEM CAD machine identity', () => {
  it('matches all installed asset nameplate identifiers without certifying manufacturer rights', () => {
    const match=validateOemSourceIdentity(claim,asset);
    expect(match.valid).toBe(true);
    expect(match.reason).toContain('engineer provenance review');
  });
  it('prevents approving incomplete or another machine’s manufacturer CAD', () => {
    expect(validateOemSourceIdentity({...claim,oemModel:'S100-M3'},asset).valid).toBe(false);
    expect(validateOemSourceIdentity({...claim,nameplateSerial:'SN-OTHER'},asset).valid).toBe(false);
    expect(validateOemSourceIdentity({...claim,drawingRevision:''},asset).valid).toBe(false);
    expect(validateOemSourceIdentity(claim,{...asset,model:null}).valid).toBe(false);
    expect(validateOemSourceIdentity(claim,{...asset,serialNumber:null}).valid).toBe(false);
  });
  it('allows an uncommissioned CAD candidate only if no known nameplate field conflicts', () => {
    expect(validateOemSourceIdentity(claim,{manufacturer:null,model:null,serialNumber:null},false).valid).toBe(true);
    expect(validateOemSourceIdentity(claim,{manufacturer:'Another OEM',model:null,serialNumber:null},false).valid).toBe(false);
    expect(validateOemSourceIdentity(claim,{manufacturer:null,model:'S100-M2',serialNumber:null},false).valid).toBe(true);
  });
  it('does not accept missing OEM serial, unit separator injection, or absent variant', () => {
    expect(validateOemSourceIdentity({...claim,nameplateSerial:undefined},asset).valid).toBe(false);
    expect(validateOemSourceIdentity({...claim,oemManufacturer:'Fake\u0000OEM'},asset).valid).toBe(false);
    expect(validateOemSourceIdentity({...claim,oemModel:'A'},asset).valid).toBe(false);
  });
});
