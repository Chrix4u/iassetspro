import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession, hasPermission, isAdmin } from '@/lib/auth';
import { canAccessPlantStrict, getPlantScope } from '@/lib/plant-scope';
import { createAuditLog } from '@/lib/audit';

async function getSparePartComponent(request:NextRequest,session:NonNullable<ReturnType<typeof getSession>>,id:string) {
  const scope=await getPlantScope(request,session);
  if(scope.denyAccess)return {error:NextResponse.json({success:false,error:'Plant access denied'},{status:403})} as const;
  const component=await db.componentRegistry.findUnique({where:{id},select:{id:true,asset:{select:{plantId:true}}}});
  if(!component)return {error:NextResponse.json({success:false,error:'Component not found'},{status:404})} as const;
  if(!canAccessPlantStrict(scope,component.asset?.plantId))
    return {error:NextResponse.json({success:false,error:'Plant access denied'},{status:403})} as const;
  return {component} as const;
}
const optionalNumber=(value:unknown):number|null=>{
  if(value==null||value==='')return null;
  if(typeof value!=='number'&&(typeof value!=='string'||!value.trim()))return NaN;
  return Number(value);
};

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = getSession(request);
    if (!session) {
      return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
    }

    if (!hasPermission(session, 'digital_twin.view') && !isAdmin(session)) {
      return NextResponse.json({ success: false, error: 'Insufficient permissions' }, { status: 403 });
    }

    const { id } = await params;
    const access=await getSparePartComponent(request,session,id);
    if('error' in access)return access.error;
    const component=access.component;

    const spareParts = await db.componentSparePart.findMany({
      // Never disclose inventory from another plant through a stale link.
      where: { componentId: id, OR:[
        {inventoryItemId:null},
        ...(component.asset?.plantId?[{inventoryItem:{plantId:component.asset.plantId}}]:[]),
      ] },
      include: {
        inventoryItem: {
          select: { id: true, itemCode: true, name: true, currentStock: true, unitOfMeasure: true, unitCost: true, location: true },
        },
      },
      orderBy: { sparePartName: 'asc' },
    });

    return NextResponse.json({ success: true, data: spareParts });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to load spare parts';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = getSession(request);
    if (!session) {
      return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
    }

    if (!hasPermission(session, 'digital_twin.manage') && !isAdmin(session)) {
      return NextResponse.json({ success: false, error: 'Insufficient permissions' }, { status: 403 });
    }

    const { id } = await params;
    const access=await getSparePartComponent(request,session,id);
    if('error' in access)return access.error;
    const component=access.component;
    const body = await request.json();
    const { inventoryItemId, sparePartName, sparePartCode, quantityRequired, unitCost, leadTimeDays, criticality, notes } = body;

    if (typeof sparePartName!=='string'||!sparePartName.trim()) {
      return NextResponse.json({ success: false, error: 'sparePartName is required' }, { status: 400 });
    }
    const quantity=optionalNumber(quantityRequired)??1;
    const cost=optionalNumber(unitCost);
    const lead=optionalNumber(leadTimeDays);
    if(!Number.isInteger(quantity)||quantity<1||quantity>2147483647||
      (cost!==null&&(!Number.isFinite(cost)||cost<0))||
      (lead!==null&&(!Number.isInteger(lead)||lead<0||lead>2147483647))){
      return NextResponse.json({success:false,error:'Quantity must be a positive integer; cost and lead time must be non-negative (lead time in whole days)'},{status:400});
    }

    // Validate inventoryItemId if provided
    if (inventoryItemId) {
      const item = await db.inventoryItem.findUnique({ where: { id: inventoryItemId } });
      if (!item) {
        return NextResponse.json({ success: false, error: 'Inventory item not found' }, { status: 404 });
      }
      if(!component.asset?.plantId||item.plantId!==component.asset.plantId){
        return NextResponse.json({success:false,error:'Inventory item belongs to a different plant'},{status:400});
      }
      if(!item.isActive){
        return NextResponse.json({success:false,error:'Inventory item is inactive'},{status:400});
      }
    }

    if (inventoryItemId) {
      const duplicate = await db.componentSparePart.findFirst({
        where: { componentId: id, inventoryItemId },
        select: { id: true },
      });
      if (duplicate) {
        return NextResponse.json(
          { success: false, error: 'This inventory item is already linked to the component' },
          { status: 409 },
        );
      }
    }

    const sparePart = await db.componentSparePart.create({
      data: {
        componentId: id,
        inventoryItemId:inventoryItemId||null,
        sparePartName:sparePartName.trim(),
        sparePartCode: sparePartCode || '',
        quantityRequired:quantity,
        unitCost:cost,
        leadTimeDays:lead,
        criticality: criticality || 'medium',
        notes,
      },
      include: {
        inventoryItem: { select: { id: true, itemCode: true, name: true, currentStock: true, unitOfMeasure: true } },
      },
    });

    await createAuditLog(
      session.userId,
      'component_spare_part',
      'create',
      sparePart.id,
      { newValues: { componentId: id, sparePartName, sparePartCode } },
    );

    return NextResponse.json({ success: true, data: sparePart }, { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to add spare part';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = getSession(request);
    if (!session) {
      return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
    }
    if (!hasPermission(session, 'digital_twin.manage') && !isAdmin(session)) {
      return NextResponse.json({ success: false, error: 'Insufficient permissions' }, { status: 403 });
    }

    const { id: componentId } = await params;
    const access=await getSparePartComponent(request,session,componentId);
    if('error' in access)return access.error;
    const { searchParams } = new URL(request.url);
    const sparePartId = searchParams.get('sparePartId');
    if (!sparePartId) {
      return NextResponse.json({ success: false, error: 'sparePartId is required' }, { status: 400 });
    }

    const link = await db.componentSparePart.findFirst({
      where: { id: sparePartId, componentId },
    });
    if (!link) {
      return NextResponse.json({ success: false, error: 'Component spare-part link not found' }, { status: 404 });
    }

    await db.componentSparePart.delete({ where: { id: sparePartId } });
    await createAuditLog(
      session.userId,
      'component_spare_part',
      'delete',
      sparePartId,
      { oldValues: { componentId, inventoryItemId: link.inventoryItemId, sparePartCode: link.sparePartCode } },
    );

    return NextResponse.json({ success: true, data: { deleted: true } });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to remove spare-part link';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
