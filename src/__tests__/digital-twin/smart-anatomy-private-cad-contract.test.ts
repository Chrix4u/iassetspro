import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { privateCadFilePath, privateCadStorageRoot } from '@/lib/smart-anatomy/private-cad-storage';

const read = (path: string) => readFileSync(path, 'utf8');
const upload = read('src/app/api/smart-anatomy/models/route.ts');
const content = read('src/app/api/smart-anatomy/models/[id]/file/route.ts');
const commission = read('src/app/api/smart-anatomy/models/[id]/commission/route.ts');
const viewer = read('src/components/digital-twin/DigitalTwinViewer.tsx');
const assetExplorer = read('src/components/digital-twin/MachineVisualExplorer.tsx');
const uploader = read('src/components/digital-twin/PrivateCadUploader.tsx');

describe('Smart Anatomy protected GLB commissioning and access contracts', () => {
  it('denies model upload without explicit manage permission and matching plant membership', () => {
    expect(upload).toContain("hasPermission(session, 'digital_twin.manage')");
    expect(upload).toContain('getPlantScope(req, session)');
    expect(upload).toContain('canAccessPlantStrict(scope, asset.plantId)');
    expect(upload).toContain('inspectSelfContainedGlb(bytes)');
    expect(upload).toContain("flag: 'wx'");
    expect(upload).toContain('isActive: false');
    expect(upload).toContain('sha256');
    expect(upload).toContain('await unlink(storedFile)');
    expect(upload).toContain('sourceOrigin, sourceNote, checksum');
  });

  it('only serves source CAD after plant authorization and private path equality', () => {
    expect(content).toContain("hasPermission(session, 'digital_twin.view')");
    expect(content).toContain('canAccessPlantStrict(scope, model.asset.plantId)');
    expect(content).toContain("model.filePath !== '/api/smart-anatomy/models/' + id + '/file'");
    expect(content).toContain('privateCadFilePath(root, id)');
    expect(content).toContain("'Cache-Control': 'private, no-store, max-age=0'");
    expect(content).toContain('X-Content-Type-Options');
    expect(content).toContain('assertPrivateCadStorageReady(root)');
    expect(content).toContain("createHash('sha256')");
    expect(content).toContain('timingSafeEqual');
    expect(content).toContain("entityType: 'asset_model'");
    expect(content).not.toContain("join(process.cwd(), 'public'");
  });

  it('records explicit engineering approval but does not authorize physical disassembly', () => {
    expect(commission).toContain("hasPermission(session, 'digital_twin.manage')");
    expect(commission).toContain('componentId: { not: null }');
    expect(commission).toContain('if (!verifiedBindings.length)');
    expect(commission).toContain('importedPaths.has(binding.meshPath)');
    expect(commission).toContain('binding.component?.assetId !== model.assetId');
    expect(commission).toContain('uploadedGlbIntegrityVerified: true');
    expect(commission).toContain('originalCadFileChecksumVerified: false');
    expect(commission).not.toContain('originalSourceIntegrityVerified: true');
    expect(commission).toContain('unmappedSourceMeshCount');
    expect(commission).toContain('bindingFingerprint(lockedBindings)');
    expect(commission).toContain('model.uploadedById === session.userId');
    expect(commission).toContain('independentEngineerReview: true');
    expect(commission).toContain('sourceReviewed !== true');
    expect(commission).toContain('geometryReviewed !== true');
    expect(commission).toContain('componentMappingReviewed !== true');
    expect(commission).toContain('maintenanceProcedureApproved: false');
    expect(commission).toContain('tx.auditLog.create');
  });

  it('loads private CAD through authenticated blob URLs without leaking tenant telemetry', () => {
    expect(viewer).toContain('api.getRaw(effectiveModelUrl');
    expect(viewer).toContain('URL.createObjectURL(blob)');
    expect(viewer).toContain('URL.revokeObjectURL(objectUrl)');
    expect(viewer).toContain('const renderedModelUrl');
    expect(viewer).toContain('previewAssetModelId || currentScene?.modelId');
    expect(viewer).toContain('if (isIllustrativeDemo) return');
    expect(assetExplorer).toContain('<PrivateCadUploader assetId={asset.id}');
    expect(assetExplorer).toContain('bindings={privateBindings}');
    expect(uploader).toContain("'/api/smart-anatomy/models', form");
    expect(uploader).toContain('Approve model for visual inspection');
  });

  it('fails closed when CAD private storage is not explicitly configured', () => {
    const old = process.env.IASSETSPRO_CAD_STORAGE_ROOT;
    try {
      delete process.env.IASSETSPRO_CAD_STORAGE_ROOT;
      expect(privateCadStorageRoot()).toBeNull();
      process.env.IASSETSPRO_CAD_STORAGE_ROOT = 'relative/folder';
      expect(privateCadStorageRoot()).toBeNull();
      process.env.IASSETSPRO_CAD_STORAGE_ROOT = '/mnt/proprietary-cad';
      expect(privateCadStorageRoot()).toBe('/mnt/proprietary-cad');
      process.env.IASSETSPRO_CAD_STORAGE_ROOT = process.cwd() + '/public/private-cad';
      expect(privateCadStorageRoot()).toBeNull();
      process.env.IASSETSPRO_CAD_STORAGE_ROOT = '/mnt/proprietary-cad';
      expect(privateCadFilePath('/mnt/proprietary-cad', 'f4f9438d-5e92-499a-9abf-b66d6ba591ca'))
        .toBe('/mnt/proprietary-cad/f4f9438d-5e92-499a-9abf-b66d6ba591ca.glb');
      expect(() => privateCadFilePath('/tmp', '../../secrets')).toThrow('Invalid CAD file identifier');
    } finally {
      if (old === undefined) delete process.env.IASSETSPRO_CAD_STORAGE_ROOT;
      else process.env.IASSETSPRO_CAD_STORAGE_ROOT = old;
    }
  });
});
