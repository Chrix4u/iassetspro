'use client';
import {useState} from 'react';
import {Download,Upload,FileSpreadsheet,ShieldCheck,Loader2,AlertTriangle} from 'lucide-react';
import {toast} from 'sonner';
import {api} from '@/lib/api';
import {ONBOARDING_SHEETS,ONBOARDING_INSTRUCTIONS,EXAMPLE_ROWS,type SheetName} from '@/lib/asset-onboarding-workbook';
import {Button} from '@/components/ui/button';
import {Card,CardContent,CardHeader,CardTitle,CardDescription} from '@/components/ui/card';
import {Input} from '@/components/ui/input';
import {Badge} from '@/components/ui/badge';

type Payload=Partial<Record<SheetName,Array<Record<string,unknown>>>>;
type Counts={machines:number;parts:number;parameters:number;meters:number;visuals:number};
const names=Object.keys(ONBOARDING_SHEETS) as SheetName[];
export function AssetBulkOnboarding({onImported}:{onImported:()=>void}){
 const [payload,setPayload]=useState<Payload|null>(null);
 const [fileName,setFileName]=useState('');
 const [validating,setValidating]=useState(false);
 const [importing,setImporting]=useState(false);
 const [validation,setValidation]=useState<{valid:boolean;counts:Counts}|null>(null);
 const [error,setError]=useState('');
 const download=async()=>{
  try{
   const XLSX=await import('xlsx');
   const book=XLSX.utils.book_new();
   const guides=XLSX.utils.aoa_to_sheet(ONBOARDING_INSTRUCTIONS as unknown as string[][]);
   guides['!cols']=[{wch:30},{wch:105}];
   XLSX.utils.book_append_sheet(book,guides,'Instructions');
   for(const sheetName of names){
     const headers=[...ONBOARDING_SHEETS[sheetName]];
     const sheet=XLSX.utils.aoa_to_sheet([headers]);
     sheet['!cols']=headers.map(key=>({wch:key==='description'||key==='reference'?55:key==='imageUrl'?65:key==='name'||key==='machineName'?35:22}));
     sheet['!autofilter']={ref:'A1:'+XLSX.utils.encode_col(headers.length-1)+'1'};
     XLSX.utils.book_append_sheet(book,sheet,sheetName);
   }
   const examples=XLSX.utils.aoa_to_sheet([['SHEET','EXAMPLE ONLY — never import unverified data'],...names.flatMap(name=>
     EXAMPLE_ROWS[name].map(x=>[name,...x]))]);
   examples['!cols']=[{wch:20},...Array.from({length:10},()=>({wch:33}))];
   XLSX.utils.book_append_sheet(book,examples,'Examples');
   XLSX.writeFile(book,'iAssetsPro-Factory-Machine-Onboarding.xlsx',{compression:true});
  }catch(error){toast.error(error instanceof Error?error.message:'Cannot prepare workbook');}
 };
 const loadFile=async(file:File)=>{
  setPayload(null);setValidation(null);setError('');setFileName(file.name);
  if(!/\.xlsx?$/i.test(file.name)||file.size>5*1024*1024){setError('Choose an Excel workbook up to 5 MB');return;}
  try{
   const XLSX=await import('xlsx');
   const book=XLSX.read(new Uint8Array(await file.arrayBuffer()),{type:'array',cellDates:false});
   const data:Payload={};
   for(const sheetName of names){
    const sheet=book.Sheets[sheetName];
    if(!sheet){setError('Missing '+sheetName+' sheet. Use the official template.');return;}
    const matrix=XLSX.utils.sheet_to_json<Array<string|number|null>>(sheet,{header:1,raw:false,defval:'',blankrows:false});
    const headers=matrix[0]?.map(x=>String(x).trim())||[];
    const expected=[...ONBOARDING_SHEETS[sheetName]];
    if(expected.some(key=>!headers.includes(key))){
      setError(sheetName+' headers have changed. Please use the downloaded template.');return;
    }
    const rows=XLSX.utils.sheet_to_json<Record<string,unknown>>(sheet,{raw:false,defval:'',blankrows:false})
      .filter(row=>Object.values(row).some(value=>String(value??'').trim()));
    data[sheetName]=rows;
   }
   setPayload(data);
  }catch(error){setError(error instanceof Error?error.message:'Unable to read Excel file');}
 };
 const validate=async()=>{
  if(!payload)return;
  setValidating(true);setError('');setValidation(null);
  try{
   const res=await api.post<{valid:boolean;counts:Counts}>('/api/assets/onboard-bulk',{...payload,dryRun:true});
   if(!res.success||!res.data?.valid)throw Error(res.error||'Workbook validation failed');
   setValidation(res.data);
   toast.success('Validated. No machines have been created yet.');
  }catch(error){setError(error instanceof Error?error.message:'Invalid workbook');}
  finally{setValidating(false);}
 };
 const commit=async()=>{
  if(!payload||!validation)return;
  if(!window.confirm('Create '+validation.counts.machines+' machine(s), '+validation.counts.parts+
    ' hierarchy item(s), and all validated parameters, meters and visuals? This is an atomic import.'))return;
  setImporting(true);setError('');
  try{
   const res=await api.post<{counts:Counts}>('/api/assets/onboard-bulk',{...payload,dryRun:false},{timeout:120000});
   if(!res.success)throw Error(res.error||'Factory import failed');
   toast.success('Imported '+res.data?.counts.machines+' machines and their hierarchy successfully');
   setPayload(null);setValidation(null);setFileName('');onImported();
  }catch(error){setValidation(null);setError(error instanceof Error?error.message:'Import rejected; no records committed');}
  finally{setImporting(false);}
 };
 return <Card className="border border-emerald-300/60" data-testid="asset-factory-onboarding">
  <CardHeader className="pb-3"><CardTitle className="flex items-center gap-2 text-base"><FileSpreadsheet className="h-5 w-5"/>Bulk factory machine commissioning</CardTitle>
    <CardDescription>One Excel workbook creates machines, coded locations, assembly/part hierarchy, OEM inspection parameters and usage meters. Import is validated before any database changes.</CardDescription></CardHeader>
  <CardContent className="space-y-3">
   <div className="flex flex-wrap items-center gap-2">
    <Button size="sm" variant="outline" onClick={()=>void download()}><Download className="mr-1 h-4 w-4"/>Download Excel template</Button>
    <Input type="file" accept=".xlsx,.xls" aria-label="Import completed machine commissioning workbook" className="h-9 max-w-sm cursor-pointer" onChange={e=>{const f=e.target.files?.[0];if(f)void loadFile(f);}}/>
   </div>
   <p className="text-xs text-muted-foreground">All five sheets use registered codes, not guessed machine IDs. Keep the Examples sheet for guidance only; it is never imported. Photos and diagrams must be from approved sources.</p>
   {payload&&<div className="flex flex-wrap items-center gap-2 text-sm"><Badge variant="secondary">{fileName}</Badge>{names.map(name=><span key={name}>{name}: {payload[name]?.length||0}</span>)}</div>}
   {error&&<p role="alert" className="flex items-start gap-2 text-sm text-destructive"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0"/>{error}</p>}
   {validation&&<p className="flex items-center gap-1.5 text-sm text-emerald-700"><ShieldCheck className="h-4 w-4"/>Validated against plant, category, location and machine registers. Ready to import.</p>}
   <div className="flex flex-wrap gap-2">
    <Button size="sm" disabled={!payload||validating||importing} variant="outline" onClick={()=>void validate()}>{validating&&<Loader2 className="mr-1 h-4 w-4 animate-spin"/>}Validate workbook</Button>
    <Button size="sm" disabled={!validation||importing||validating} onClick={()=>void commit()}>{importing&&<Loader2 className="mr-1 h-4 w-4 animate-spin"/>}<Upload className="mr-1 h-4 w-4"/>Confirm & create machines</Button>
   </div>
  </CardContent>
 </Card>;
}
