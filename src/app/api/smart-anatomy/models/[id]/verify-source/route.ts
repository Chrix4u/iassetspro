import { createHash, timingSafeEqual } from 'node:crypto';
import { open } from 'node:fs/promises';
import { constants } from 'node:fs';
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession, hasPermission, isAdmin } from '@/lib/auth';
import { canAccessPlantStrict, getPlantScope } from '@/lib/plant-scope';
import {
  assertPrivateCadStorageReady, privateCadFilePath, privateCadStorageRoot,
} from '@/lib/smart-anatomy/private-cad-storage';
import { MAX_PRIVATE_CAD_UPLOAD_BYTES } from '@/lib/smart-anatomy/validate-glb';
import {
  MAX_CAD_MULTIPART_OVERHEAD, MultipartUploadError, readBoundedMultipart,
} from '@/lib/smart-anatomy/limited-multipart';

export const runtime = 'nodejs';

const sha256 = (data: Uint8Array) => createHash('sha256').update(data).digest();
const hash64 = /^[0-9a-f]{64}$/i;

/**
 * Verify retained original STEP/IGES/BREP bytes against immutable conversion
 * evidence. Requires a DIFFERENT authorized engineer in the source plant.
 *
 * The file bytes are held transiently to compute a hash; never published,
 * saved, submitted to a cloud AI provider, or interpreted as executable CAD.
 * A matching source SHA256 does NOT prove it is genuinely OEM-authorized.
 */
export async function POST(
  req: NextRequest,
  {params}: {params: Promise<{id:string}>},
) {
  const session = getSession(req);
  if (!session) return NextResponse.json({success:false,error:'Not authenticated'}, {status:401});
  if (!isAdmin(session) && !hasPermission(session,'digital_twin.manage')) {
    return NextResponse.json({success:false,error:'Insufficient permissions'}, {status:403});
  }
  const scope = await getPlantScope(req,session);
  if (scope.denyAccess) return NextResponse.json({success:false,error:'Access denied'}, {status:403});

  try {
    const {id} = await params;
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
      return NextResponse.json({success:false,error:'Invalid CAD identifier'}, {status:400});
    }
    const model = await db.assetModel.findUnique({
      where:{id},
      select:{
        id:true,assetId:true,filePath:true,fileSize:true,isActive:true,uploadedById:true,
        asset:{select:{plantId:true}},
      },
    });
    if (!model || model.filePath !== '/api/smart-anatomy/models/' + id + '/file') {
      return NextResponse.json({success:false,error:'Private CAD not found'}, {status:404});
    }
    if (!canAccessPlantStrict(scope,model.asset.plantId)) {
      return NextResponse.json({success:false,error:'Access denied'}, {status:403});
    }
    if (!model.uploadedById || model.uploadedById === session.userId) {
      return NextResponse.json({
        success:false,error:'Original source requires a reviewer independent from the CAD uploader',
      },{status:409});
    }
    if (model.isActive) return NextResponse.json({
      success:false,error:'Approved CAD source is immutable; upload and review a new model revision',
    },{status:409});

    const sourceAudit = await db.auditLog.findFirst({
      where:{entityType:'asset_model',entityId:id,action:'create'},
      orderBy:{createdAt:'asc'},
      select:{newValues:true},
    });
    let source: {
      checksum?: unknown;
      conversionEvidence?: {
        sourceSha256?: unknown;
        sourceByteLength?: unknown;
        sourceFileName?: unknown;
        sourceOrigin?: unknown;
        glbSha256?: unknown;
      };
    };
    try {
      source=JSON.parse(sourceAudit?.newValues || '{}');
    } catch {
      return NextResponse.json({success:false,error:'Invalid immutable CAD source provenance'}, {status:409});
    }
    const origin=source.conversionEvidence;
    if (!origin || !hash64.test(String(origin.sourceSha256 || '')) ||
        !hash64.test(String(origin.glbSha256 || '')) ||
        typeof origin.sourceFileName !== 'string' || origin.sourceFileName.length > 255 ||
        !Number.isSafeInteger(origin.sourceByteLength) ||
        Number(origin.sourceByteLength) < 20 ||
        Number(origin.sourceByteLength) > MAX_PRIVATE_CAD_UPLOAD_BYTES ||
        String(source.checksum).toLowerCase() !== String(origin.glbSha256).toLowerCase()) {
      return NextResponse.json({
        success:false,error:'Model has no matching offline original-source conversion evidence',
      },{status:409});
    }
    const withdrawn = await db.auditLog.findFirst({
      where:{entityType:'asset_model',entityId:id,action:'withdraw'},
      select:{id:true},
    });
    if (withdrawn) return NextResponse.json({
      success:false,error:'CAD revision was withdrawn and cannot be reverified',
    },{status:409});

    const root=privateCadStorageRoot();
    if (!root) return NextResponse.json({success:false,error:'CAD storage not configured'}, {status:503});
    try { await assertPrivateCadStorageReady(root); }
    catch { return NextResponse.json({success:false,error:'Private CAD storage is not safe'}, {status:503}); }

    // Check the protected GLB has not changed after its provenance was
    // recorded. A genuine source digest comparison is meaningless if the
    // installed model bytes have been silently replaced.
    const sourcePath=privateCadFilePath(root,id);
    // Bound the protected file before any read and never follow a source
    // symlink. A damaged/replaced file must not allocate an unbounded buffer.
    const handle=await open(sourcePath,
      constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    let glb:Buffer;
    try {
      const info=await handle.stat();
      if (!info.isFile() || info.size !== model.fileSize ||
          info.size > MAX_PRIVATE_CAD_UPLOAD_BYTES || info.size <= 0) {
        return NextResponse.json({success:false,error:'Stored CAD binary size or type mismatch'}, {status:409});
      }
      glb=await handle.readFile();
      const afterwards=await handle.stat();
      if (afterwards.size !== info.size || afterwards.mtimeMs !== info.mtimeMs) {
        return NextResponse.json({success:false,error:'Stored CAD file changed during verification'}, {status:409});
      }
    } finally {
      await handle.close();
    }
    if (glb.length !== model.fileSize || glb.length > MAX_PRIVATE_CAD_UPLOAD_BYTES ||
        !timingSafeEqual(sha256(glb),Buffer.from(String(origin.glbSha256),'hex'))) {
      return NextResponse.json({success:false,error:'Stored CAD GLB checksum mismatch'}, {status:409});
    }

    const form=await readBoundedMultipart(req,
      MAX_PRIVATE_CAD_UPLOAD_BYTES + MAX_CAD_MULTIPART_OVERHEAD);
    const file=form.get('sourceFile');
    if (!file || typeof file === 'string' || file.size !== origin.sourceByteLength ||
        file.size > MAX_PRIVATE_CAD_UPLOAD_BYTES || file.name !== origin.sourceFileName) {
      return NextResponse.json({
        success:false,error:'Original STEP/IGES/BREP filename or byte length differs from conversion record',
      },{status:400});
    }
    const bytes=new Uint8Array(await file.arrayBuffer());
    const actualDigest=sha256(bytes);
    if (!timingSafeEqual(actualDigest,Buffer.from(String(origin.sourceSha256),'hex'))) {
      return NextResponse.json({success:false,error:'Original CAD source checksum mismatch'}, {status:409});
    }

    const verified=await db.$transaction(async tx=>{
      await tx.$queryRaw`SELECT id FROM "asset_models" WHERE id = ${id} FOR UPDATE`;
      const current=await tx.assetModel.findUnique({
        where:{id},select:{isActive:true,filePath:true},
      });
      const latestWithdrawal=await tx.auditLog.findFirst({
        where:{entityType:'asset_model',entityId:id,action:'withdraw'},
        select:{id:true},
      });
      if (!current || current.isActive || latestWithdrawal ||
          current.filePath !== model.filePath) return false;
      await tx.auditLog.create({
        data:{
          userId:session.userId,action:'source_verified',
          entityType:'asset_model',entityId:id,
          newValues:JSON.stringify({
            verifiedById:session.userId,
            uploadedById:model.uploadedById,
            independentlyComparedOriginalCadBytes:true,
            sourceSha256:actualDigest.toString('hex'),
            sourceByteLength:bytes.length,
            originalSourceStoredOnServer:false,
            claimedOemLicenceOrMachineAuthenticityVerified:false,
          }),
        },
      });
      return true;
    });
    if (!verified) return NextResponse.json({
      success:false,error:'CAD was approved or withdrawn during source verification',
    },{status:409});
    return NextResponse.json({
      success:true,data:{
        originalSourceDigestMatched:true,
        originalCadStored:false,
        manufacturerAuthenticityCertified:false,
      },
    },{headers:{'Cache-Control':'private, no-store'}});
  } catch(error) {
    if (error instanceof MultipartUploadError) return NextResponse.json({
      success:false,error:error.message,
    },{status:error.status});
    console.error('[CAD original source verify]',error);
    return NextResponse.json({success:false,error:'Could not verify original CAD source'}, {status:500});
  }
}
