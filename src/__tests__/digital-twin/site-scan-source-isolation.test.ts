import {readFileSync} from 'node:fs';
import {describe,it,expect} from 'vitest';
const file=(path:string)=>readFileSync('src/'+path,'utf8');

describe('site scan versus OEM engineering CAD source isolation',()=>{
  it('limits draft model catalogues and legacy asset-model lists to authorized managers',()=>{
    const catalog=file('app/api/smart-anatomy/models/route.ts');
    const legacy=file('app/api/asset-models/route.ts');
    expect(catalog).toContain('...(manager?{}:{isActive:true})');
    expect(catalog).toContain('canAccessPlantStrict(scope,asset.plantId)');
    expect(catalog).toContain("sourceOrigin:provenance.sourceOrigin");
    expect(legacy).toContain('...(manager ? {} : { isActive: true })');
  });
  it('never offers site-scan exterior geometry as source-backed OEM exploded CAD',()=>{
    const cad=file('components/digital-twin/PrivateCadUploader.tsx');
    const explorer=file('components/digital-twin/MachineVisualExplorer.tsx');
    expect(cad).toContain("model.sourceOrigin !== 'site-owned-scan'");
    expect(cad).toContain("'/api/smart-anatomy/models?assetId='");
    expect(explorer).toContain('<SiteScanPanel assetId={asset.id} components={components}');
    expect(explorer).toContain('value="site-scan"');
  });
  it('disables explosion and live IoT claims for visual-only site scans',()=>{
    const viewer=file('components/digital-twin/DigitalTwinViewer.tsx');
    const toolbar=file('components/digital-twin/TwinToolbar.tsx');
    expect(viewer).toContain('!scanMode && <ExplodedView');
    expect(viewer).toContain('!isIllustrativeDemo && !scanMode && <IoTOverlayLayer');
    expect(viewer).toContain('allowExplosion={!scanMode}');
    expect(toolbar).toContain('allowExplosion && <ExplodeSliderPopup');
  });
  it('uses approved real machine component links rather than invented scan mesh BOM',()=>{
    const commission=file('app/api/smart-anatomy/models/[id]/commission/route.ts');
    const hotspot=file('app/api/smart-anatomy/scans/[id]/hotspots/route.ts');
    expect(commission).toContain("claimOrigin === 'site-owned-scan'");
    expect(commission).toContain('tx.siteScanHotspot.findMany');
    expect(commission).toContain("return {status:'scan-hotspots-missing' as const}");
    expect(hotspot).toContain("isApproved:false,createdById:session.userId");
    expect(hotspot).toContain('comp.assetId');
  });
});
