import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession, hasPermission, isAdmin } from '@/lib/auth';
import { getPlantScope, canAccessPlantStrict } from '@/lib/plant-scope';

// Planners see a minimal directory of active workers assigned to the plant.
export async function GET(request: NextRequest) {
  const session = getSession(request);
  if (!session) return NextResponse.json({success:false,error:'Not authenticated'},{status:401});
  if (!isAdmin(session) && !hasPermission(session,'production_surveys.plan'))
    return NextResponse.json({success:false,error:'Planner permission required'},{status:403});
  try {
    const plantId = new URL(request.url).searchParams.get('plantId');
    if (!plantId) return NextResponse.json({success:false,error:'Plant is required'},{status:400});
    const scope = await getPlantScope(request,session);
    if (scope.denyAccess || !canAccessPlantStrict(scope,plantId))
      return NextResponse.json({success:false,error:'Forbidden'},{status:403});
    const users = await db.user.findMany({where:{status:'active',plantAccess:{some:{plantId}}},
      select:{id:true,fullName:true,staffId:true,username:true},orderBy:{fullName:'asc'},take:501});
    if (users.length>500) return NextResponse.json({success:false,error:'More than 500 users; narrow the roster through user administration'},{status:422});
    return NextResponse.json({success:true,data:users});
  } catch(error) {
    return NextResponse.json({success:false,error:error instanceof Error?error.message:'Unable to load workers'},{status:500});
  }
}
