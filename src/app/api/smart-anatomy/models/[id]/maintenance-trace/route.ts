import { createHash, timingSafeEqual } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession, hasPermission, isAdmin } from '@/lib/auth';
import { canAccessPlantStrict, getPlantScope } from '@/lib/plant-scope';
import {
  assertPrivateCadStorageReady, privateCadFilePath, privateCadStorageRoot,
} from '@/lib/smart-anatomy/private-cad-storage';
import { auditedGlbMeshPaths } from '@/lib/smart-anatomy/mesh-source-paths';
import { MAX_PRIVATE_CAD_UPLOAD_BYTES } from '@/lib/smart-anatomy/validate-glb';

export const runtime = 'nodejs';

/**
 * Read-only evidence for a specific plant's CAD-to-maintenance links.
 * Does not issue work orders, alter PM due dates, or treat visual suggestions
 * as registered machine parts. Every returned path must come from the
 * original checksum-verified source GLB and the same machine's registry.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = getSession(req);
  if (!session) return NextResponse.json({success:false,error:'Not authenticated'}, {status:401});
  if (!isAdmin(session) && !hasPermission(session,'digital_twin.view') &&
      !hasPermission(session,'digital_twin.manage')) {
    return NextResponse.json({success:false,error:'Insufficient permissions'}, {status:403});
  }
  const scope = await getPlantScope(req,session);
  if (scope.denyAccess) {
    return NextResponse.json({success:false,error:'Plant access denied'}, {status:403});
  }

  try {
    const { id } = await params;
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
      return NextResponse.json({success:false,error:'Invalid CAD identifier'}, {status:400});
    }
    const model = await db.assetModel.findUnique({
      where: {id},
      select: {
        id:true,assetId:true,name:true,filePath:true,fileSize:true,isActive:true,
        uploadedById:true,
        asset:{select:{plantId:true,assetTag:true,name:true}},
      },
    });
    if (!model || model.filePath !== '/api/smart-anatomy/models/'+id+'/file') {
      return NextResponse.json({success:false,error:'Private CAD model not found'}, {status:404});
    }
    if (!canAccessPlantStrict(scope,model.asset.plantId)) {
      return NextResponse.json({success:false,error:'Plant access denied'}, {status:403});
    }

    const [source, withdrawal, review] = await Promise.all([
      db.auditLog.findFirst({
        where:{entityType:'asset_model',entityId:id,action:'create'},
        select:{newValues:true},orderBy:{createdAt:'asc'},
      }),
      db.auditLog.findFirst({
        where:{entityType:'asset_model',entityId:id,action:'withdraw'},
        select:{id:true},
      }),
      db.auditLog.findFirst({
        where:{entityType:'asset_model',entityId:id,action:'update'},
        select:{newValues:true},orderBy:{createdAt:'desc'},
      }),
    ]);
    let checksum: string | null = null;
    let sourceOrigin: string | null = null;
    try {
      const proof = JSON.parse(source?.newValues || '{}') as {
        checksum?: unknown; sourceOrigin?: unknown;
      };
      if (typeof proof.checksum === 'string' && /^[a-f0-9]{64}$/i.test(proof.checksum)) {
        checksum = proof.checksum;
      }
      if (typeof proof.sourceOrigin === 'string') sourceOrigin = proof.sourceOrigin;
    } catch {
      // Missing or corrupt source proof is never eligible for maintenance trace.
    }
    if (!checksum) {
      return NextResponse.json({success:false,error:'Original CAD source attestation missing'}, {status:409});
    }

    const root = privateCadStorageRoot();
    if (!root) {
      return NextResponse.json({success:false,error:'Private CAD storage not configured'}, {status:503});
    }
    try { await assertPrivateCadStorageReady(root); }
    catch {
      return NextResponse.json({success:false,error:'Private CAD storage not safely provisioned'}, {status:503});
    }
    let sourcePaths: Set<string>;
    try {
      const bytes = await readFile(privateCadFilePath(root,id));
      if (bytes.byteLength !== model.fileSize ||
          bytes.byteLength > MAX_PRIVATE_CAD_UPLOAD_BYTES ||
          !timingSafeEqual(createHash('sha256').update(bytes).digest(),
            Buffer.from(checksum,'hex'))) {
        throw new Error('CAD integrity mismatch');
      }
      sourcePaths = auditedGlbMeshPaths(bytes);
    } catch {
      return NextResponse.json({
        success:false,error:'The CAD geometry does not match its source-attestation fingerprint',
      },{status:409});
    }

    let approved = false;
    try {
      const record=JSON.parse(review?.newValues || '{}') as {
        independentEngineerReview?: unknown; reviewedById?: unknown;
      };
      approved = record.independentEngineerReview===true &&
        typeof record.reviewedById==='string' &&
        record.reviewedById !== model.uploadedById;
    } catch { /* treat invalid engineering review as unapproved */ }

    const bindings = await db.assetMeshBinding.findMany({
      where:{modelId:id,assetId:model.assetId,componentId:{not:null}},
      select: {
        id:true,meshName:true,meshPath:true,componentId:true,
        component: {
          select: {
            id:true,assetId:true,componentCode:true,name:true,componentType:true,
            pmSchedules:{
              where:{isActive:true},
              select:{id:true,title:true,frequencyType:true,frequencyValue:true,
                nextDueDate:true,priority:true},
              take:100,
            },
            sparePartLinks:{
              select:{id:true,sparePartCode:true,sparePartName:true,
                quantityRequired:true,inventoryItemId:true,
                inventoryItem:{select:{id:true,plantId:true,itemCode:true,name:true,currentStock:true}}},
              take:100,
            },
            toolRequirements:{
              select:{id:true,toolCode:true,toolName:true,quantityRequired:true,toolId:true},
              take:100,
            },
            workOrderComponents:{
              select:{
                id:true,
                workOrder:{select:{id:true,assetId:true,plantId:true,
                  woNumber:true,title:true,status:true,type:true}},
              },
              take:100,
            },
          },
        },
      },
      orderBy:{meshPath:'asc'},
      take:5001,
    });
    if (bindings.length>5000) {
      return NextResponse.json({
        success:false,error:'CAD mapping exceeds the verified inspection report limit',
      },{status:409});
    }
    const paths=new Set<string>();
    const entries: Array<Record<string, unknown>>=[];
    for (const binding of bindings) {
      const component=binding.component;
      if (!component || component.assetId!==model.assetId || !binding.meshPath ||
          !sourcePaths.has(binding.meshPath) || paths.has(binding.meshPath)) {
        return NextResponse.json({
          success:false,error:'Registered CAD mapping is incomplete, duplicated or does not belong to the source machine',
        },{status:409});
      }
      if (component.sparePartLinks.some(link=>link.inventoryItem &&
          link.inventoryItem.plantId!==model.asset.plantId) ||
          component.workOrderComponents.some(link=>
            (link.workOrder.plantId && link.workOrder.plantId!==model.asset.plantId) ||
            (link.workOrder.assetId && link.workOrder.assetId!==model.assetId))) {
        return NextResponse.json({
          success:false,error:'Maintenance trace references a different plant or installed machine',
        },{status:409});
      }
      paths.add(binding.meshPath);
      entries.push({
        sourceMeshPath:binding.meshPath,
        sourceMeshLabel:binding.meshName,
        registeredComponent:{id:component.id,code:component.componentCode,
          name:component.name,type:component.componentType},
        pmSchedules:component.pmSchedules,
        spareParts:component.sparePartLinks.map(part=>({
          linkId:part.id,code:part.sparePartCode,name:part.sparePartName,
          quantityRequired:part.quantityRequired,inventoryItemId:part.inventoryItemId,
          currentStock:part.inventoryItem?.currentStock ?? null,
        })),
        tools:component.toolRequirements.map(tool=>({
          requirementId:tool.id,code:tool.toolCode,name:tool.toolName,
          quantityRequired:tool.quantityRequired,toolId:tool.toolId,
        })),
        workOrders:component.workOrderComponents.map(link=>({
          id:link.workOrder.id,woNumber:link.workOrder.woNumber,
          title:link.workOrder.title,status:link.workOrder.status,type:link.workOrder.type,
        })),
      });
    }

    return NextResponse.json({
      success:true,
      data:{
        asset:{id:model.assetId,tag:model.asset.assetTag,name:model.asset.name},
        model:{id:model.id,name:model.name,sourceOrigin,
          sha256:checksum,geometryVerified:true,
          engineeringStatus:withdrawal?'withdrawn':model.isActive && approved?'approved':'awaiting-review',
          physicalMaintenanceProcedureApproved:false},
        mapping:{sourceMeshCount:sourcePaths.size,
          registeredLinkedMeshCount:entries.length,visualOnlyMeshCount:sourcePaths.size-entries.length},
        entries,
        disclaimer:'CAD geometry and existing maintenance links only. No work order, inspection or PM operation is created or approved by this report.',
      },
    },{headers:{'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
  } catch (error) {
    console.error('[GET /api/smart-anatomy/models/:id/maintenance-trace]',error);
    return NextResponse.json({success:false,error:'Could not verify CAD-to-maintenance trace'}, {status:500});
  }
}
