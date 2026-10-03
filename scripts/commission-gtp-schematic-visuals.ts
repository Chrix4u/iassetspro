
import { db } from '../src/lib/db';

const tags = [
  'UAT-GTP-350-1-011','UAT-GTP-350-2-012','UAT-GTP-350-3-013','UAT-GTP-350-4-014','UAT-GTP-350-5-015',
  'UAT-GTP-340-6-008','UAT-GTP-312-1-027','UAT-GTP-314-1-001','UAT-GTP-309-2-002',
];

const slug=(s:string)=>s.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');

async function main(){
  const admin=await db.user.findFirst({where:{username:'admin'},select:{id:true}});
  if(!admin) throw new Error('Admin user not found');

  let commissioned=0;
  for(const tag of tags){
    const asset=await db.asset.findFirst({where:{assetTag:tag},select:{id:true,name:true,assetTag:true}});
    if(!asset) throw new Error('Missing asset '+tag);

    for(const mode of ['technical_2d','exploded'] as const){
      const suffix=mode==='technical_2d'?'technical-2d':'exploded';
      const imageUrl=`/generated-assets/gtp-visuals/${slug(asset.assetTag)}-${suffix}.svg`;
      const title=`${asset.name} — ${mode==='technical_2d'?'engineering 2D':'exploded assembly'}`;
      const description='Hierarchy-derived GTP commissioning schematic based on the registered root assemblies. This is not OEM CAD; use component drill-down for maintenance context.';

      await db.componentVisual.updateMany({
        where:{assetId:asset.id,componentId:null,visualType:mode,isPrimary:true},
        data:{isPrimary:false},
      });

      const existing=await db.componentVisual.findFirst({
        where:{assetId:asset.id,componentId:null,visualType:mode,sourceProvider:'generated_svg'},
        select:{id:true},
      });

      if(existing){
        await db.componentVisual.update({
          where:{id:existing.id},
          data:{title,description,imageUrl,thumbnailUrl:imageUrl,isPrimary:true,isActive:true,zoomLevel:0,sortOrder:0,generatedAt:new Date(),createdById:admin.id},
        });
      }else{
        await db.componentVisual.create({
          data:{assetId:asset.id,componentId:null,visualType:mode,title,description,imageUrl,thumbnailUrl:imageUrl,sourceProvider:'generated_svg',sourcePrompt:'Generated from commissioned GTP root-assembly hierarchy',zoomLevel:0,sortOrder:0,isPrimary:true,isActive:true,generatedAt:new Date(),createdById:admin.id},
        });
      }
      commissioned++;
    }
  }

  const rows=await db.componentVisual.findMany({
    where:{asset:{assetTag:{in:tags}},componentId:null,sourceProvider:'generated_svg',isActive:true},
    select:{assetId:true,visualType:true,imageUrl:true},
  });
  if(rows.length!==tags.length*2) throw new Error(`Expected ${tags.length*2} active GTP schematics, found ${rows.length}`);
  console.log(JSON.stringify({commissioned,verified:rows.length},null,2));
}

main().finally(()=>db.$disconnect());
