import { randomUUID, createHash } from 'node:crypto';
import { writeFile, unlink } from 'node:fs/promises';
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession, hasPermission, isAdmin } from '@/lib/auth';
import { getPlantScope, canAccessPlantStrict } from '@/lib/plant-scope';
import { inspectSelfContainedGlb, MAX_PRIVATE_CAD_UPLOAD_BYTES } from '@/lib/smart-anatomy/validate-glb';
import { validateOfflineCadEvidence } from '@/lib/smart-anatomy/offline-cad-evidence';
import { validateOemSourceIdentity } from '@/lib/smart-anatomy/oem-identity';
import { validateSiteScanCapture } from '@/lib/smart-anatomy/site-scan';
import { assertPrivateCadStorageReady, privateCadFilePath, privateCadStorageRoot } from '@/lib/smart-anatomy/private-cad-storage';
import { MultipartUploadError, MAX_CAD_MULTIPART_OVERHEAD, readBoundedMultipart } from '@/lib/smart-anatomy/limited-multipart';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const session = getSession(req);
  if (!session) return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
  if (!isAdmin(session) && !hasPermission(session, 'digital_twin.manage')) {
    return NextResponse.json({ success: false, error: 'Insufficient permissions' }, { status: 403 });
  }
  const scope = await getPlantScope(req, session);
  if (scope.denyAccess) {
    return NextResponse.json({ success: false, error: 'Access denied' }, { status: 403 });
  }

  const reportedLength = Number(req.headers.get('content-length') || '0');
  if (Number.isFinite(reportedLength) &&
      reportedLength > MAX_PRIVATE_CAD_UPLOAD_BYTES + 1024 * 1024) {
    return NextResponse.json({ success: false, error: 'CAD upload exceeds 25 MB' }, { status: 413 });
  }

  const root = privateCadStorageRoot();
  if (!root) {
    return NextResponse.json({
      success: false,
      error: 'Private CAD storage has not been configured on the server',
    }, { status: 503 });
  }

  // Never create a directory with implicit parent permissions. An operator
  // must provision owner-only persistent storage outside all public roots.
  try {
    await assertPrivateCadStorageReady(root);
  } catch {
    return NextResponse.json({
      success: false, error: 'Private CAD storage is not safely provisioned',
    }, { status: 503 });
  }

  let storedFile: string | null = null;
  try {
    // Hard cap the streamed body before calling FormData's buffering parser,
    // including when the client uses chunked transfer with no Content-Length.
    const form = await readBoundedMultipart(
      req,
      MAX_PRIVATE_CAD_UPLOAD_BYTES + MAX_CAD_MULTIPART_OVERHEAD,
    );
    const file = form.get('file');
    const assetId = String(form.get('assetId') || '');
    const name = String(form.get('name') || '').trim();
    const sourceOrigin = String(form.get('sourceOrigin') || '');
    const sourceNote = String(form.get('sourceNote') || '').trim();
    const sourceManifest = form.get('sourceManifest');
    // The OEM identity is a *source claim*, not automatically verified
    // manufacturer data in the asset register.
    const oemManufacturer = String(form.get('oemManufacturer') || '').trim();
    const oemModel = String(form.get('oemModel') || '').trim();
    const drawingRevision = String(form.get('drawingRevision') || '').trim();
    const nameplateSerial = String(form.get('nameplateSerial') || '').trim();
    let scanCapture: ReturnType<typeof validateSiteScanCapture> | null = null;
    if (sourceOrigin === 'site-owned-scan') {
      try {
        scanCapture = validateSiteScanCapture({
          method:form.get('captureMethod'), capturedAt:form.get('capturedAt'),
          device:form.get('captureDevice'),sourceUnit:form.get('sourceUnit'),
          metreScaleReference:form.get('metreScaleReference'),
          metresConfirmed:form.get('metresConfirmed') === 'true',
          visibleSurfacesOnly:form.get('visibleSurfacesOnly') === 'true',
        });
      } catch(error) {
        return NextResponse.json({success:false,
          error:error instanceof Error?error.message:'Invalid scan evidence'},{status:400});
      }
    }

    if (!file || typeof file === 'string' || !file.name.toLowerCase().endsWith('.glb') ||
        !Number.isSafeInteger(file.size) || file.size <= 0 || file.size > MAX_PRIVATE_CAD_UPLOAD_BYTES) {
      return NextResponse.json({
        success: false, error: 'Select a valid self-contained GLB file (maximum 25 MB)',
      }, { status: 400 });
    }
    if (!assetId || name.length < 3 || name.length > 160 ||
        !['licensed-oem', 'site-owned-scan', 'site-owned-design', 'original-training'].includes(sourceOrigin) ||
        sourceNote.length < 8 || sourceNote.length > 1000) {
      return NextResponse.json({
        success: false, error: 'Asset, model name and documented legal model origin are required',
      }, { status: 400 });
    }

    if (sourceOrigin === 'licensed-oem' &&
        ([oemManufacturer, oemModel, drawingRevision, nameplateSerial].some(v =>
          v.length < 2 || v.length > 140 || [...v].some(char => char.charCodeAt(0) < 32)))) {
      return NextResponse.json({
        success: false,
        error: 'Licensed OEM CAD requires documented manufacturer, exact model, drawing revision and installed machine serial',
      }, { status: 400 });
    }

    const asset = await db.asset.findUnique({
      where: { id: assetId },
      select: { id: true, plantId: true, manufacturer: true, model: true, serialNumber: true },
    });
    if (!asset) return NextResponse.json({ success: false, error: 'Asset not found' }, { status: 404 });
    if (!canAccessPlantStrict(scope, asset.plantId)) {
      return NextResponse.json({ success: false, error: 'Access denied' }, { status: 403 });
    }

    if (sourceOrigin === 'licensed-oem') {
      // Draft import permits missing registered nameplate fields, but never
      // known disagreements. Commissioning will require all fields matched.
      const identity = validateOemSourceIdentity(
        { oemManufacturer, oemModel, drawingRevision, nameplateSerial },
        asset, false,
      );
      if (!identity.valid) {
        return NextResponse.json({
          success: false, error: identity.reason,
        }, { status: 409 });
      }
    }

    const bytes = new Uint8Array(await file.arrayBuffer());
    const geometry = inspectSelfContainedGlb(bytes);
    const checksum = createHash('sha256').update(bytes).digest('hex');
    let conversionEvidence: ReturnType<typeof validateOfflineCadEvidence> | null = null;
    if (sourceManifest !== null) {
      if (typeof sourceManifest === 'string' || !sourceManifest.name.toLowerCase().endsWith('.json') ||
          sourceManifest.size > 32 * 1024 || sourceManifest.size < 20) {
        return NextResponse.json({success:false,error:'Offline CAD evidence must be a small JSON sidecar'}, {status:400});
      }
      try {
        const evidenceText = await sourceManifest.text();
        const evidence = JSON.parse(evidenceText) as unknown;
        conversionEvidence = validateOfflineCadEvidence(evidence, {
          glbSha256: checksum, glbByteLength: bytes.byteLength, sourceOrigin,
        });
      } catch {
        return NextResponse.json({
          success:false,error:'Offline CAD sidecar does not match the selected GLB and source category',
        }, {status:400});
      }
    }
    const id = randomUUID();
    const filePath = '/api/smart-anatomy/models/' + id + '/file';
    storedFile = privateCadFilePath(root, id);
    await writeFile(storedFile, bytes, { mode: 0o600, flag: 'wx' });

    try {
      const [model] = await db.$transaction([
        db.assetModel.create({
          data: {
            id, assetId, name, fileName: file.name.slice(0, 255),
            filePath, fileSize: bytes.byteLength, fileType: 'model/gltf-binary',
            format: 'glb', meshCount: geometry.meshCount,
            vertexCount: geometry.vertexCount, uploadedById: session.userId,
            // A model must not enter maintenance execution automatically.
            // It requires a separate engineer-mapped Digital Twin scene.
            isActive: false,
          },
        }),
        db.auditLog.create({
          data: {
            userId: session.userId, action: 'create',
            entityType: 'asset_model', entityId: id,
            newValues: JSON.stringify({
              assetId, sourceOrigin, sourceNote, checksum,
              sourceMachineClaim: sourceOrigin === 'licensed-oem' ? {
                oemManufacturer, oemModel, drawingRevision, nameplateSerial,
                sourceNameplateMatchAttested: false,
              } : null,
              conversionEvidence,
              scanCapture,
              sourceGeometryKind: scanCapture ? 'as-built-exterior-surfaces' : 'engineering-cad',
              status: 'awaiting-engineer-commissioning',
              ...geometry,
            }),
          },
        }),
      ]);
      return NextResponse.json({
        success: true,
        data: { id: model.id, name: model.name, filePath,
          meshCount: geometry.meshCount, vertexCount: geometry.vertexCount,
          checksum, commissioned: false },
      }, { status: 201 });
    } catch (error) {
      await unlink(storedFile).catch(() => {});
      storedFile = null;
      throw error;
    }
  } catch (error: unknown) {
    if (error instanceof MultipartUploadError) {
      if (storedFile) await unlink(storedFile).catch(() => {});
      return NextResponse.json({
        success: false, error: error.message,
      }, { status: error.status });
    }
    const message = error instanceof Error ? error.message : '';
    const isInvalid = message.startsWith('GLB ') || message.startsWith('Only glTF') ||
      message.startsWith('Invalid ') || message.startsWith('GLB cannot');
    if (storedFile) await unlink(storedFile).catch(() => {});
    if (isInvalid) {
      return NextResponse.json({ success: false, error: message }, { status: 400 });
    }
    console.error('[POST /api/smart-anatomy/models]', error);
    return NextResponse.json({ success: false, error: 'Could not save the CAD model' }, { status: 500 });
  }
}


/** Restricted source-aware model catalogue for OEM CAD and as-built site scans.
 * Ordinary plant viewers can enumerate only independently commissioned models.
 */
export async function GET(req: NextRequest) {
  const session = getSession(req);
  if (!session) return NextResponse.json({success:false,error:'Not authenticated'},{status:401});
  const manager = isAdmin(session) || hasPermission(session,'digital_twin.manage');
  if (!manager && !hasPermission(session,'digital_twin.view')) {
    return NextResponse.json({success:false,error:'Insufficient permissions'},{status:403});
  }
  const scope=await getPlantScope(req,session);
  if(scope.denyAccess) return NextResponse.json({success:false,error:'Access denied'},{status:403});
  const assetId=req.nextUrl.searchParams.get('assetId') || '';
  if(!assetId || assetId.length>100) return NextResponse.json({success:false,error:'A machine asset is required'},{status:400});
  const originFilter=req.nextUrl.searchParams.get('sourceOrigin');
  if(originFilter && !['licensed-oem','site-owned-scan','site-owned-design','original-training'].includes(originFilter)) {
    return NextResponse.json({success:false,error:'Invalid source category'},{status:400});
  }
  const asset=await db.asset.findUnique({where:{id:assetId},select:{plantId:true}});
  if(!asset || !canAccessPlantStrict(scope,asset.plantId)) {
    return NextResponse.json({success:false,error:'Machine not found in authorized plant'},{status:404});
  }
  const models=await db.assetModel.findMany({
    where:{
      assetId,
      filePath:{startsWith:'/api/smart-anatomy/models/'},
      ...(manager?{}:{isActive:true}),
    },
    select:{id:true,name:true,fileName:true,filePath:true,fileSize:true,isActive:true,
      meshCount:true,createdAt:true,uploadedById:true},
    orderBy:{createdAt:'desc'},
    take:100,
  });
  const sourceAudits=models.length ? await db.auditLog.findMany({
    where:{entityType:'asset_model',action:'create',entityId:{in:models.map(m=>m.id)}},
    select:{entityId:true,newValues:true},orderBy:{createdAt:'asc'},
  }) : [];
  const firstOrigin=new Map<string, {sourceOrigin:string;scanCapture:unknown}>();
  for(const audit of sourceAudits){
    if(firstOrigin.has(audit.entityId))continue;
    try{
      const info=JSON.parse(audit.newValues||'{}') as {
        sourceOrigin?:unknown;scanCapture?:unknown;
      };
      if(typeof info.sourceOrigin==='string' &&
         ['licensed-oem','site-owned-scan','site-owned-design','original-training'].includes(info.sourceOrigin)) {
        firstOrigin.set(audit.entityId,{sourceOrigin:info.sourceOrigin,scanCapture:info.scanCapture});
      }
    }catch{/* Invalid provenance is not an approved source. */}
  }
  const data=models.flatMap(model=>{
    const provenance=firstOrigin.get(model.id);
    if(!provenance || (originFilter && provenance.sourceOrigin!==originFilter))return [];
    return [{
      ...model, sourceOrigin:provenance.sourceOrigin,
      // Capture device and physical source notes stay manager-only.
      ...(manager?{scanCapture:provenance.scanCapture || null}:{}),
    }];
  });
  return NextResponse.json({success:true,data},{headers:{'Cache-Control':'private, no-store'}});
}
