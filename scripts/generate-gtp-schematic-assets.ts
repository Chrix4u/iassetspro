
import fs from 'node:fs';
import path from 'node:path';
import { db } from '../src/lib/db';

const tags = [
  'UAT-GTP-350-1-011','UAT-GTP-350-2-012','UAT-GTP-350-3-013','UAT-GTP-350-4-014','UAT-GTP-350-5-015',
  'UAT-GTP-340-6-008','UAT-GTP-312-1-027','UAT-GTP-314-1-001','UAT-GTP-309-2-002',
];

const esc=(s:string)=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]||c));
const slug=(s:string)=>s.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
const short=(s:string,n=34)=>s.length>n?s.slice(0,n-1)+'…':s;

function svg(name:string, tag:string, roots:{name:string;code:string}[], exploded:boolean) {
  const w=1600,h=900,cx=800,cy=450;
  const blocks=roots.map((r,i)=>{
    const angle=(Math.PI*2*i/roots.length)-Math.PI/2;
    const radius=exploded?310:260;
    const x=cx+Math.cos(angle)*radius;
    const y=cy+Math.sin(angle)*radius;
    const bw=250,bh=72;
    const bodyX=exploded?x-bw/2:(i%2===0?80:1270);
    const bodyY=exploded?y-bh/2:130+Math.floor(i/2)*165;
    const lineX=bodyX+bw/2,lineY=bodyY+bh/2;
    return `<line x1="${cx}" y1="${cy}" x2="${lineX}" y2="${lineY}" stroke="#64748b" stroke-width="2" ${exploded?'stroke-dasharray="10 8"':''}/>
<rect x="${bodyX}" y="${bodyY}" width="${bw}" height="${bh}" rx="12" fill="#ffffff" stroke="#334155" stroke-width="2"/>
<text x="${bodyX+14}" y="${bodyY+29}" font-family="Arial,sans-serif" font-size="17" font-weight="700" fill="#0f172a">${esc(short(r.name,30))}</text>
<text x="${bodyX+14}" y="${bodyY+53}" font-family="monospace" font-size="13" fill="#64748b">${esc(r.code)}</text>`;
  }).join('\n');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
<defs><pattern id="grid" width="32" height="32" patternUnits="userSpaceOnUse"><path d="M32 0H0V32" fill="none" stroke="#e2e8f0" stroke-width="1"/></pattern></defs>
<rect width="100%" height="100%" fill="#f8fafc"/><rect width="100%" height="100%" fill="url(#grid)"/>
<text x="60" y="62" font-family="Arial,sans-serif" font-size="30" font-weight="700" fill="#0f172a">${esc(name)}</text>
<text x="60" y="94" font-family="monospace" font-size="17" fill="#475569">${esc(tag)} · ${exploded?'EXPLODED ASSEMBLY SCHEMATIC':'TECHNICAL 2D HIERARCHY SCHEMATIC'}</text>
<rect x="570" y="330" width="460" height="240" rx="28" fill="#e2e8f0" stroke="#0f172a" stroke-width="4"/>
<rect x="625" y="390" width="350" height="90" rx="18" fill="#ffffff" stroke="#334155" stroke-width="2"/>
<text x="800" y="425" text-anchor="middle" font-family="Arial,sans-serif" font-size="25" font-weight="700" fill="#0f172a">${esc(short(name,32))}</text>
<text x="800" y="460" text-anchor="middle" font-family="Arial,sans-serif" font-size="16" fill="#475569">${roots.length} commissioned root assemblies</text>
${blocks}
<text x="60" y="852" font-family="Arial,sans-serif" font-size="14" fill="#64748b">Hierarchy-derived commissioning schematic · not OEM CAD · use component drill-down for maintenance context</text>
</svg>`;
}

async function main(){
  const out=path.join(process.cwd(),'public','generated-assets','gtp-visuals');
  fs.mkdirSync(out,{recursive:true});
  for(const tag of tags){
    const asset=await db.asset.findFirst({where:{assetTag:tag},select:{id:true,name:true,assetTag:true}});
    if(!asset) throw new Error('Missing '+tag);
    const roots=await db.componentRegistry.findMany({where:{assetId:asset.id,parentId:null},orderBy:{sortOrder:'asc'},select:{name:true,componentCode:true}});
    const list=roots.map(r=>({name:r.name,code:r.componentCode}));
    for(const exploded of [false,true]){
      const mode=exploded?'exploded':'technical-2d';
      const file=`${slug(asset.assetTag)}-${mode}.svg`;
      fs.writeFileSync(path.join(out,file),svg(asset.name,asset.assetTag,list,exploded),'utf8');
      console.log(file);
    }
  }
}
main().finally(()=>db.$disconnect());
