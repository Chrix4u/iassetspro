'use client';

import {useCallback,useEffect,useMemo,useState} from 'react';
import {toast} from 'sonner';
import {api} from '@/lib/api';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {Label} from '@/components/ui/label';
import {Select,SelectContent,SelectItem,SelectTrigger,SelectValue} from '@/components/ui/select';
import {DigitalTwinViewer,type ApprovedCadScanOverlay} from './DigitalTwinViewer';
import type {ScanSurfacePick} from './ModelLoader';
import {
  solveCadToScanAlignment,type AlignmentLandmark,type AlignmentPoint,
} from '@/lib/smart-anatomy/cad-scan-alignment';

type CadModelOption={
  id:string;name:string;filePath:string;isActive:boolean;
  sourceOrigin:'licensed-oem'|'site-owned-design';
};
type SavedAlignment={
  id:string;cadModelId:string;cadModelUrl:string;isApproved:boolean;
  translation:AlignmentPoint;
  rotation:[number,number,number,number];
  rmsErrorMetres:number;maxErrorMetres:number;
  maxRelativeDistanceError:number;
  landmarks?:AlignmentLandmark[];
  reviewNote?:string;
};

const humanPoint=(p:AlignmentPoint|null)=>p?
  `${p.x.toFixed(3)}, ${p.y.toFixed(3)}, ${p.z.toFixed(3)} m`:
  'Click an identifiable feature in the viewer';

export function SiteScanAlignmentPanel({
  assetId,scanModel,canManage,onOverlayChange,onMeasurementModeChange,
}:{
  assetId:string;
  scanModel:{id:string;filePath:string;isActive:boolean};
  canManage:boolean;
  onOverlayChange:(value:ApprovedCadScanOverlay|null)=>void;
  onMeasurementModeChange:(value:boolean)=>void;
}){
  const [cadModels,setCadModels]=useState<CadModelOption[]>([]);
  const [cadModelId,setCadModelId]=useState('');
  const [record,setRecord]=useState<SavedAlignment|null>(null);
  const [reload,setReload]=useState(0);
  const [fetching,setFetching]=useState(false);
  const [saving,setSaving]=useState(false);
  const [reviewing,setReviewing]=useState(false);
  const [aligning,setAligning]=useState(false);
  const [pairs,setPairs]=useState<AlignmentLandmark[]>([]);
  const [label,setLabel]=useState('');
  const [scanPoint,setScanPoint]=useState<AlignmentPoint|null>(null);
  const [cadPoint,setCadPoint]=useState<AlignmentPoint|null>(null);
  const [revisionChecked,setRevisionChecked]=useState(false);
  const [scaleChecked,setScaleChecked]=useState(false);
  const [landmarksChecked,setLandmarksChecked]=useState(false);
  const [reviewNote,setReviewNote]=useState('');
  const [showOverlay,setShowOverlay]=useState(true);
  const [overlayOpacity,setOverlayOpacity]=useState(0.42);

  useEffect(()=>{
    if(!scanModel.isActive){
      // Unapproved scans have no approved CAD registration to load. Avoid
      // triggering an expected 404 toast while engineering is still mapping.
      setFetching(false);
      setRecord(null);
      onMeasurementModeChange(false);
      return;
    }
    let active=true;
    setFetching(true);
    setRecord(null);
    setPairs([]);
    setCadModelId('');
    setScanPoint(null);
    setCadPoint(null);
    setAligning(false);
    onMeasurementModeChange(false);
    const load=async()=>{
      try{
        const response=await api.get<SavedAlignment|null>(
          '/api/smart-anatomy/scans/'+encodeURIComponent(scanModel.id)+'/alignment',
        );
        if(!response.success)throw Error(response.error||'Unable to read CAD-to-scan registration');
        if(active){
          const result=response.data||null;
          setRecord(result);
          if(result){setCadModelId(result.cadModelId);setPairs(result.landmarks||[]);}
        }
      }catch(error){
        if(active)toast.error(error instanceof Error?error.message:'Cannot load registered CAD reference');
      }finally{if(active)setFetching(false);}
    };
    void load();
    return()=>{active=false;};
  },[scanModel.id,reload,onMeasurementModeChange]);

  useEffect(()=>{
    if(!canManage||!scanModel.isActive)return;
    let active=true;
    const load=async()=>{
      try{
        const [oem,site]=await Promise.all([
          api.get<CadModelOption[]>('/api/smart-anatomy/models?assetId='+
            encodeURIComponent(assetId)+'&sourceOrigin=licensed-oem'),
          api.get<CadModelOption[]>('/api/smart-anatomy/models?assetId='+
            encodeURIComponent(assetId)+'&sourceOrigin=site-owned-design'),
        ]);
        if(!oem.success||!site.success)throw Error(oem.error||site.error||'Unable to enumerate approved source CAD');
        const unique=new Map<string,CadModelOption>();
        for(const model of [...oem.data||[],...site.data||[]]){
          if(model.isActive&&model.id!==scanModel.id)unique.set(model.id,model);
        }
        if(active)setCadModels([...unique.values()]);
      }catch(error){
        if(active)toast.error(error instanceof Error?error.message:'Cannot load CAD references');
      }
    };
    void load();
    return()=>{active=false;};
  },[assetId,canManage,scanModel.id,scanModel.isActive]);

  const overlay=useMemo<ApprovedCadScanOverlay|null>(()=>
    record?.isApproved&&showOverlay?{
      cadModelUrl:record.cadModelUrl,
      translation:record.translation,rotation:record.rotation,
      opacity:overlayOpacity,
    }:null,[record,showOverlay,overlayOpacity]);
  useEffect(()=>onOverlayChange(overlay),[overlay,onOverlayChange]);

  const selectedCad=cadModels.find(x=>x.id===cadModelId)||null;
  const preview=useMemo(()=>{
    if(pairs.length<3)return {result:null,error:'Enter at least three noncollinear physical landmark pairs'};
    try{return {result:solveCadToScanAlignment(pairs).solution,error:null};}
    catch(error){return {result:null,error:error instanceof Error?error.message:'Invalid alignment reference'};}
  },[pairs]);

  const toggleMeasurement=useCallback(()=>{
    const next=!aligning;
    setAligning(next);
    onMeasurementModeChange(next);
    setScanPoint(null);setCadPoint(null);
  },[aligning,onMeasurementModeChange]);

  const addPair=()=>{
    const name=label.trim();
    if(!scanPoint||!cadPoint||name.length<5||name.length>140){
      toast.error('Name a physically identifiable point and pick it on BOTH 3D models');return;
    }
    if(pairs.length>=8||pairs.some(p=>p.label.toLowerCase()===name.toLowerCase())){
      toast.error('Use no more than eight distinct physical landmarks');return;
    }
    setPairs(value=>[...value,{label:name,cad:cadPoint,scan:scanPoint}]);
    setLabel('');setScanPoint(null);setCadPoint(null);
  };

  const saveDraft=async()=>{
    if(!canManage||!scanModel.isActive||record||!preview.result||!cadModelId||saving)return;
    setSaving(true);
    try{
      const response=await api.post('/api/smart-anatomy/scans/'+
        encodeURIComponent(scanModel.id)+'/alignment',{cadModelId,landmarks:pairs});
      if(!response.success)throw Error(response.error||'Unable to register measured correspondence');
      setAligning(false);onMeasurementModeChange(false);setReload(x=>x+1);
      toast.success('Rigid CAD-to-scan alignment registered as unapproved engineering draft');
    }catch(error){
      toast.error(error instanceof Error?error.message:'Alignment registration rejected');
    }finally{setSaving(false);}
  };

  const approveAlignment=async()=>{
    if(!canManage||!record||record.isApproved||reviewing)return;
    if(!revisionChecked||!scaleChecked||!landmarksChecked||reviewNote.trim().length<30){
      toast.error('Complete independent installed-machine, CAD revision and measured landmark review');
      return;
    }
    setReviewing(true);
    try{
      const response=await api.post('/api/smart-anatomy/scans/'+
        encodeURIComponent(scanModel.id)+'/alignment/approve',{
        cadRevisionMatched:true,scanScaleReviewed:true,
        landmarkEvidenceReviewed:true,reviewNote:reviewNote.trim(),
      });
      if(!response.success)throw Error(response.error||'Engineering review denied');
      setReload(x=>x+1);
      toast.success('Independently approved CAD-to-scan overlay for inspection only');
    }catch(error){
      toast.error(error instanceof Error?error.message:'Independent approval denied');
    }finally{setReviewing(false);}
  };

  if(!scanModel.isActive)return <div className="rounded-lg border p-3 text-sm text-muted-foreground">
    Commission the actual as-built scan and its physical part hotspots before attempting source-CAD alignment.
  </div>;

  return <div className="rounded-lg border p-3 space-y-3" data-testid="smart-anatomy-cad-scan-alignment">
    <div className="space-y-1">
      <p className="text-sm font-semibold">Source CAD ↔ Installed Machine Scan</p>
      <p className="text-xs text-muted-foreground leading-relaxed">
        Match 3–8 unique real physical features that exist in both an approved
        engineering CAD model and this approved site scan. The transform is rigid:
        CAD is not scaled, stretched, generated or claimed to reproduce undocumented internal parts.
      </p>
    </div>
    {fetching&&<p className="text-xs text-muted-foreground">Loading engineering registration…</p>}
    {record&&<div className="rounded-md border p-3 space-y-2">
      <p className={`text-sm font-semibold ${record.isApproved?'text-emerald-700':'text-amber-700'}`}>
        {record.isApproved?'Approved visual registration':'Unapproved CAD-to-scan draft · independent engineer required'}
      </p>
      <p className="text-xs text-muted-foreground">
        Rigid landmark RMS: {record.rmsErrorMetres.toFixed(4)} m ·
        maximum discrepancy: {record.maxErrorMetres.toFixed(4)} m.
        These metrics are not machine safety tolerances.
      </p>
      {record.isApproved&&<div className="flex flex-wrap items-center gap-3 text-xs">
        <label className="inline-flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={showOverlay}
            onChange={e=>setShowOverlay(e.target.checked)}/>
          Superimpose registered OEM/source CAD (visual inspection)
        </label>
        <label className="flex items-center gap-2">
          CAD overlay transparency
          <input type="range" min="0.15" max="0.75" step="0.05"
            value={overlayOpacity} onChange={e=>setOverlayOpacity(Number(e.target.value))}/>
          {Math.round(overlayOpacity*100)}%
        </label>
      </div>}
      {record.reviewNote&&<p className="text-xs text-muted-foreground">
        Independent engineering evidence: {record.reviewNote}
      </p>}
    </div>}
    {canManage&&!record&&<div className="space-y-3">
      <div className="space-y-1">
        <Label>Independently approved source CAD for the exact installed machine</Label>
        <Select value={cadModelId||'_none_'} onValueChange={v=>{
          setCadModelId(v==='_none_'?'':v);setPairs([]);setScanPoint(null);setCadPoint(null);
        }}><SelectTrigger className="min-w-0"><SelectValue placeholder="Choose approved CAD revision"/></SelectTrigger>
          <SelectContent>
            <SelectItem value="_none_">Select exact manufacturer/site engineering model</SelectItem>
            {cadModels.map(x=><SelectItem key={x.id} value={x.id}>
              {x.name} · {x.sourceOrigin==='licensed-oem'?'licensed OEM CAD':'site-owned engineering CAD'}
            </SelectItem>)}
          </SelectContent>
        </Select>
        {!cadModels.length&&<p className="text-xs text-amber-700">
          No commissioned engineering CAD is registered for this machine.
          Obtain authentic authorized CAD and approve its source before alignment.
        </p>}
      </div>
      {!!selectedCad&&<Button type="button" size="sm" variant="outline"
        onClick={toggleMeasurement}>
        {aligning?'Close landmark pickers':'Pick matching physical 3D reference landmarks'}
      </Button>}
      {aligning&&selectedCad&&<div className="space-y-3">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          <div className="min-w-0 space-y-1">
            <p className="text-xs font-semibold">Installed machine scan · select reference point</p>
            <div className="rounded-md border overflow-hidden">
              <DigitalTwinViewer modelUrl={scanModel.filePath} scanMode
                showToolbar={false} showSceneTree={false} showInfoPanel={false}
                enableRealtime={false} bindings={[]} height="330px"
                onScanSurfacePick={(v:ScanSurfacePick)=>setScanPoint(v.position)}/>
            </div>
            <p className="text-xs text-muted-foreground font-mono">{humanPoint(scanPoint)}</p>
          </div>
          <div className="min-w-0 space-y-1">
            <p className="text-xs font-semibold">Verified engineering CAD · select SAME physical feature</p>
            <div className="rounded-md border overflow-hidden">
              <DigitalTwinViewer modelUrl={selectedCad.filePath}
                showToolbar={false} showSceneTree={false} showInfoPanel={false}
                enableRealtime={false} bindings={[]} height="330px"
                onScanSurfacePick={(v:ScanSurfacePick)=>setCadPoint(v.position)}/>
            </div>
            <p className="text-xs text-muted-foreground font-mono">{humanPoint(cadPoint)}</p>
          </div>
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_auto] sm:items-end">
          <div className="space-y-1"><Label>Physical feature / measured landmark name</Label>
            <Input value={label} onChange={e=>setLabel(e.target.value)}
              placeholder="e.g. installed motor front mounting-hole centre"/>
          </div>
          <Button size="sm" type="button" disabled={!cadPoint||!scanPoint||pairs.length>=8}
            onClick={addPair}>Add landmark pair</Button>
        </div>
      </div>}
      {!!pairs.length&&<div className="space-y-2">
        <p className="text-xs font-semibold">{pairs.length} matched physical references</p>
        {pairs.map((item,index)=><div key={index}
          className="flex flex-wrap items-center justify-between gap-2 border-b pb-1 text-xs">
          <span>{index+1}. {item.label}</span>
          <Button variant="ghost" size="sm" onClick={()=>setPairs(x=>x.filter((_,i)=>i!==index))}>
            Remove
          </Button>
        </div>)}
      </div>}
      <p className={`text-xs ${preview.result?'text-emerald-700':'text-amber-700'}`}>
        {preview.result
          ? `Geometry checks pass: RMS ${preview.result.rmsErrorMetres.toFixed(4)} m,
              maximum discrepancy ${preview.result.maxErrorMetres.toFixed(4)} m,
              scale-distance error ${(preview.result.maxRelativeDistanceError*100).toFixed(2)}%.
              A second engineer must still inspect and approve actual source correspondence.`
          : preview.error}
      </p>
      <Button type="button" disabled={!preview.result||!selectedCad||saving}
        onClick={()=>void saveDraft()}>
        {saving?'Saving evidence…':'Save measured CAD-to-scan draft'}
      </Button>
    </div>}
    {canManage&&record&&!record.isApproved&&<div className="space-y-2 rounded-md border border-amber-500/40 p-3">
      <p className="text-sm font-semibold">Independent engineer registration review</p>
      <label className="flex cursor-pointer items-start gap-2 text-xs">
        <input type="checkbox" checked={revisionChecked}
          onChange={e=>setRevisionChecked(e.target.checked)}/>
        Physically inspected the exact installed machine identity and corresponding approved OEM drawing revision
      </label>
      <label className="flex cursor-pointer items-start gap-2 text-xs">
        <input type="checkbox" checked={scaleChecked}
          onChange={e=>setScaleChecked(e.target.checked)}/>
        Independently verified CAD and scanner dimensions from measured real-world references; no scale fitting
      </label>
      <label className="flex cursor-pointer items-start gap-2 text-xs">
        <input type="checkbox" checked={landmarksChecked}
          onChange={e=>setLandmarksChecked(e.target.checked)}/>
        Independently checked all landmarks, overlap and residuals against the actual machine
      </label>
      <Input value={reviewNote} onChange={e=>setReviewNote(e.target.value)}
        aria-label="Independent engineering alignment review"
        placeholder="Drawing revision, physical measurement and landmark inspection evidence"/>
      <Button type="button" disabled={reviewing||!revisionChecked||!scaleChecked||
        !landmarksChecked||reviewNote.trim().length<30}
        onClick={()=>void approveAlignment()}>
        {reviewing?'Recording approval…':'Approve rigid CAD overlay for inspection'}
      </Button>
      <p className="text-xs text-muted-foreground">
        The registration author, site-scan uploader and CAD uploader cannot approve their own correspondence.
        Alignment is for visual comparison only, not for mechanical safety decisions.
      </p>
    </div>}
    {!record&&!canManage&&<p className="text-xs text-muted-foreground">
      No independently approved spatial CAD registration is available for this scan.
    </p>}
  </div>;
}
