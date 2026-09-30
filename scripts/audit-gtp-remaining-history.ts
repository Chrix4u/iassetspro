import fs from 'node:fs';
import { db } from '../src/lib/db';

type Row=[string,string,string,string,string,string,string,string,string,string,string,string,string,string,string,string];
const payload=JSON.parse(fs.readFileSync('/tmp/gtp_remaining.json','utf8')) as {sha256:string;rows:Row[]};
const norm=(v:unknown)=>String(v??'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim().replace(/\s+/g,' ');
const date=(v:string)=>{ if(!String(v||'').trim()) return null; const s=String(v).trim(); const iso=/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(s)?s.replace(' ','T')+'Z':s; const d=new Date(iso); return Number.isNaN(d.getTime())?null:d; };

async function main(){
 const plant=await db.plant.findUnique({where:{code:'GTP-UAT'},select:{id:true}});
 if(!plant) throw new Error('GTP-UAT missing');
 const assets=await db.asset.findMany({where:{plantId:plant.id,category:{code:'GTP-MACHINE-UAT'},isActive:true},select:{id:true,assetTag:true,name:true,specification:true}});
 const byCode=new Map<string,Array<{id:string;assetTag:string;name:string;priority:number|null}>>();
 for(const a of assets){
   let s:any={}; try{s=JSON.parse(a.specification||'{}')}catch{}
   const code=String(s.legacyCode||'').trim(); if(!code) continue;
   const arr=byCode.get(code)||[]; arr.push({id:a.id,assetTag:a.assetTag,name:a.name,priority:Number.isFinite(Number(s.legacyPriority))?Number(s.legacyPriority):null}); byCode.set(code,arr);
 }
 const blocked:any[]=[]; const warnings:any[]=[]; const ready:any[]=[];
 for(const r of payload.rows){
   const [wo,type,reported,desc,codeRaw,equip,trade,start,status,end,priority]=r;
   const code=String(codeRaw||'').trim(); const issues:string[]=[]; let asset:any=null;
   if(!code) issues.push('missing_machine_code');
   else {
     const candidates=byCode.get(code)||[];
     if(!candidates.length) issues.push('unmatched_machine_code');
     else if(candidates.length===1) asset=candidates[0];
     else {
       const exact=candidates.filter(a=>norm(a.name)===norm(equip)&&Number(priority)===a.priority);
       if(exact.length===1) asset=exact[0];
       else {
         const byName=candidates.filter(a=>norm(a.name)===norm(equip));
         if(byName.length===1) asset=byName[0]; else issues.push('ambiguous_machine_code');
       }
     }
   }
   const reportedAt=date(reported);
   if(!reportedAt) issues.push('missing_or_invalid_reported_time');
   const startAt=date(start), endAt=date(end);
   const warn:string[]=[];
   if(String(start||'').trim()&&!startAt) warn.push('invalid_start_time');
   if(String(end||'').trim()&&!endAt) warn.push('invalid_completion_time');
   const item={wo,type,code,equipment:equip,priority,reported,start,end,assetId:asset?.id||null,assetTag:asset?.assetTag||null,issues,warnings:warn};
   if(issues.length) blocked.push(item); else ready.push(item);
   if(warn.length) warnings.push(item);
 }
 const current=await db.workOrder.findMany({where:{woNumber:{startsWith:'GTP-WO-'}},select:{woNumber:true}});
 const existing=new Set(current.map(x=>x.woNumber));
 const collisions=ready.filter(r=>existing.has('GTP-WO-'+r.wo)).map(r=>r.wo);
 const result={
   sourceSha256:payload.sha256,total:payload.rows.length,canonicalAssets:assets.length,
   ready:ready.length,blocked:blocked.length,warnings:warnings.length,existingHistoricalWos:current.length,collisions:collisions.length,
   blockedRows:blocked,warnRows:warnings.slice(0,50),
   typeCounts:Object.fromEntries(['Corrective','Preventive'].map(t=>[t,payload.rows.filter(r=>r[1]===t).length]))
 };
 fs.writeFileSync('/tmp/gtp_remaining_audit.json',JSON.stringify(result,null,2));
 console.log(JSON.stringify(result,null,2));
}
main().finally(()=>db.$disconnect());