'use client';

import {useCallback,useEffect,useMemo,useState} from 'react';
import {toast} from 'sonner';
import {api} from '@/lib/api';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {Label} from '@/components/ui/label';
import {Select,SelectContent,SelectItem,SelectTrigger,SelectValue} from '@/components/ui/select';
import {DigitalTwinViewer,type ApprovedCadScanOverlay} from './DigitalTwinViewer';
import {SiteScanAlignmentPanel} from './SiteScanAlignmentPanel';
import type {ScanOverlayHotspot,ScanSurfacePick} from './ModelLoader';

interface ScanModel {
  id:string;name:string;filePath:string;fileName:string;isActive:boolean;
  meshCount:number;uploadedById:string;
  sourceOrigin:'site-owned-scan';scanCapture?:{
    method:string;capturedAt:string;device:string;metreScaleReference:string;
  };
}
interface ScanHotspot {
  id:string;componentId:string;label:string;isApproved:boolean;
  createdById:string;reviewedById:string|null;
  positionX:number;positionY:number;positionZ:number;
  component?:{name:string;componentCode:string;lifecycleStatus:string};
}
interface Part {id:string;name:string;componentCode:string;lifecycleStatus?:string}

export function SiteScanPanel({assetId,components,canManage,onComponentSelect}:{
  assetId:string;components:Part[];canManage:boolean;
  onComponentSelect:(id:string)=>void;
}){
  const [models,setModels]=useState<ScanModel[]>([]);
  const [selectedId,setSelectedId]=useState('');
  const [markers,setMarkers]=useState<ScanHotspot[]>([]);
  const [file,setFile]=useState<File|null>(null);
  const [name,setName]=useState('');
  const [description,setDescription]=useState('');
  const [method,setMethod]=useState('photogrammetry');
  const [capturedAt,setCapturedAt]=useState(()=>new Date().toISOString().slice(0,10));
  const [device,setDevice]=useState('');
  const [sourceUnit,setSourceUnit]=useState('m');
  const [scaleReference,setScaleReference]=useState('');
  const [metresConfirmed,setMetresConfirmed]=useState(false);
  const [visibleSurfacesOnly,setVisibleSurfacesOnly]=useState(false);
  const [uploading,setUploading]=useState(false);
  const [reviewing,setReviewing]=useState(false);
  const [placing,setPlacing]=useState(false);
  const [selectedComponent,setSelectedComponent]=useState('');
  const [hotspotLabel,setHotspotLabel]=useState('');
  const [picked,setPicked]=useState<ScanSurfacePick|null>(null);
  const [saving,setSaving]=useState(false);
  const [reviewNote,setReviewNote]=useState('');
  const [physicalVerified,setPhysicalVerified]=useState(false);
  const [scaleReviewed,setScaleReviewed]=useState(false);
  const [refresh,setRefresh]=useState(0);
  const [approvedCadOverlay,setApprovedCadOverlay]=useState<ApprovedCadScanOverlay|null>(null);
  const [alignmentMeasuring,setAlignmentMeasuring]=useState(false);
  const selected=models.find(m=>m.id===selectedId)||null;

  const loadModels=useCallback(async()=>{
    try{
      const response=await api.get<ScanModel[]>('/api/smart-anatomy/models?assetId='+
        encodeURIComponent(assetId)+'&sourceOrigin=site-owned-scan');
      if(!response.success)throw Error(response.error||'Failed to list site scans');
      setModels(response.data||[]);
    }catch(error){
      toast.error(error instanceof Error?error.message:'Unable to list site scans');
      setModels([]);
    }
  },[assetId]);
  useEffect(()=>{void loadModels();},[loadModels,refresh]);
  useEffect(()=>{setSelectedId('');setMarkers([]);setPicked(null);
    setApprovedCadOverlay(null);setAlignmentMeasuring(false);
  },[assetId]);
  const loadMarkers=useCallback(async()=>{
    if(!selectedId){setMarkers([]);return;}
    try{
      const response=await api.get<ScanHotspot[]>('/api/smart-anatomy/scans/'+
        encodeURIComponent(selectedId)+'/hotspots');
      if(!response.success)throw Error(response.error||'Cannot load spatial annotations');
      setMarkers(response.data||[]);
    }catch(error){
      setMarkers([]);
      toast.error(error instanceof Error?error.message:'Cannot load scan markers');
    }
  },[selectedId]);
  useEffect(()=>{void loadMarkers();},[loadMarkers,refresh]);

  const overlay=useMemo<ScanOverlayHotspot[]>(()=>[
    ...markers.map(marker=>({
      id:marker.id,componentId:marker.componentId,label:marker.label,
      isApproved:marker.isApproved,
      position:{x:marker.positionX,y:marker.positionY,z:marker.positionZ},
    })),
    ...(picked&&selectedComponent?[{
      id:'pending-location',componentId:selectedComponent,
      label:'Unsaved · '+(hotspotLabel.trim()||'selected surface'),
      isApproved:false,position:picked.position,
    }]:[]),
  ],[markers,picked,selectedComponent,hotspotLabel]);

  const upload=async()=>{
    if(!canManage||!file||uploading)return;
    if(!file.name.toLowerCase().endsWith('.glb')||file.size>25*1024*1024||file.size<=0){
      toast.error('Choose a self-contained textured GLB no larger than 25 MB');return;
    }
    if(!metresConfirmed||!visibleSurfacesOnly||description.trim().length<8||
       scaleReference.trim().length<12){
      toast.error('Confirm measured metre scale and document the actual visible-surface scan');return;
    }
    setUploading(true);
    try{
      const form=new FormData();
      form.set('assetId',assetId);
      form.set('file',file);
      form.set('name',name.trim()||file.name);
      form.set('sourceOrigin','site-owned-scan');
      form.set('sourceNote',description.trim());
      form.set('captureMethod',method);
      form.set('capturedAt',capturedAt);
      form.set('captureDevice',device.trim());
      form.set('sourceUnit',sourceUnit);
      form.set('metreScaleReference',scaleReference.trim());
      form.set('metresConfirmed','true');
      form.set('visibleSurfacesOnly','true');
      const response=await api.post<{id:string}>('/api/smart-anatomy/models',form);
      if(!response.success||!response.data?.id)throw Error(response.error||'Site scan upload failed');
      setSelectedId(response.data.id);
      setFile(null);setName('');setDescription('');setScaleReference('');
      setMetresConfirmed(false);setVisibleSurfacesOnly(false);
      setRefresh(x=>x+1);
      toast.success('Actual exterior scan stored privately; add and independently review spatial hotspots');
    }catch(error){toast.error(error instanceof Error?error.message:'Site scan upload failed');}
    finally{setUploading(false);}
  };
  const onPick=useCallback((point:ScanSurfacePick)=>{
    if(!placing)return;
    if(!selectedComponent){
      toast.error('Select a registered assembly or part before placing a 3D marker');return;
    }
    setPicked(point);
  },[placing,selectedComponent]);
  const saveHotspot=async()=>{
    if(!picked||!selectedId||!selectedComponent||!canManage||saving)return;
    const component=components.find(item=>item.id===selectedComponent);
    if(!component){toast.error('Select a registered machine component');return;}
    setSaving(true);
    try{
      const response=await api.post('/api/smart-anatomy/scans/'+
        encodeURIComponent(selectedId)+'/hotspots',{
        componentId:selectedComponent,label:hotspotLabel.trim()||component.name,
        position:picked.position,sourceMeshPath:picked.sourceMeshPath,
      });
      if(!response.success)throw Error(response.error||'Unable to save scan hotspot');
      setPicked(null);setHotspotLabel('');setPlacing(false);setRefresh(x=>x+1);
      toast.success('Spatial marker saved as draft; a second engineer must approve it');
    }catch(error){toast.error(error instanceof Error?error.message:'Cannot save marker');}
    finally{setSaving(false);}
  };
  const reviewHotspot=async(id:string)=>{
    if(!canManage||reviewing)return;
    if(!physicalVerified||!scaleReviewed||reviewNote.trim().length<15){
      toast.error('Confirm machine-part identity, scale and enter an independent engineering note');return;
    }
    setReviewing(true);
    try{
      const response=await api.post('/api/smart-anatomy/scans/'+
        encodeURIComponent(selectedId)+'/hotspots/'+encodeURIComponent(id)+'/review',{
        physicalComponentMatched:true,modelScaleChecked:true,
        reviewNote:reviewNote.trim(),
      });
      if(!response.success)throw Error(response.error||'Independent hotspot review failed');
      setRefresh(x=>x+1);
      toast.success('Physical scan marker independently approved');
    }catch(error){toast.error(error instanceof Error?error.message:'Review denied');}
    finally{setReviewing(false);}
  };
  const commissionScan=async()=>{
    if(!selected||selected.isActive||!canManage||reviewing)return;
    if(!physicalVerified||!scaleReviewed||reviewNote.trim().length<15){
      toast.error('Complete independent physical-machine and scale review');return;
    }
    setReviewing(true);
    try{
      const response=await api.post('/api/smart-anatomy/models/'+
        encodeURIComponent(selected.id)+'/commission',{
        sourceReviewed:true,geometryReviewed:true,componentMappingReviewed:true,
        unmappedNodesAcknowledged:true,scanCapturedMachineVerified:true,
        scanScaleReviewed:true,reviewNote:reviewNote.trim(),
      });
      if(!response.success)throw Error(response.error||'Scan review failed');
      setRefresh(x=>x+1);
      toast.success('As-built scan approved for visual inspection only, not an OEM disassembly plan');
    }catch(error){toast.error(error instanceof Error?error.message:'Scan review denied');}
    finally{setReviewing(false);}
  };

  return <div className="space-y-3" data-testid="smart-anatomy-site-scan">
    <div className="rounded-lg border border-cyan-700/50 bg-slate-950 p-3 space-y-1">
      <p className="text-sm font-semibold text-cyan-100">Real Machine · 3D LiDAR / Photogrammetry</p>
      <p className="text-xs leading-relaxed text-slate-300">
        Explore a real installation as captured. Textured GLB retains real surface appearance,
        gauges and visible pipework. Scans cannot reveal hidden internal OEM components.
        Hotspots link only to existing registered parts, with independent engineer approval.
      </p>
    </div>
    <div className="rounded-md border p-2 space-y-2">
      <Label>Site scan revision</Label>
      <Select value={selectedId||'_none_'} onValueChange={v=>{
        setSelectedId(v==='_none_'?'':v);setPicked(null);setPlacing(false);
        setApprovedCadOverlay(null);setAlignmentMeasuring(false);
      }}>
        <SelectTrigger className="min-w-0"><SelectValue placeholder="Choose an actual as-built scan"/></SelectTrigger>
        <SelectContent>
          <SelectItem value="_none_">No as-built 3D scan</SelectItem>
          {models.map(m=><SelectItem key={m.id} value={m.id}>
            {m.name} · {m.isActive?'Approved':'Engineering review required'}
          </SelectItem>)}
        </SelectContent>
      </Select>
      {selected?.scanCapture&&<p className="text-xs text-muted-foreground">
        Captured {selected.scanCapture.capturedAt} · {selected.scanCapture.method} ·
        {selected.scanCapture.device} · uploaded GLB in metres
      </p>}
    </div>
    {canManage&&<details className="rounded-md border p-3" data-testid="site-scan-import">
      <summary className="cursor-pointer font-semibold text-sm">Import actual machine scan</summary>
      <div className="grid grid-cols-1 gap-3 pt-3 sm:grid-cols-2">
        <div className="space-y-1 sm:col-span-2">
          <Label>Self-contained textured GLB (max 25 MB)</Label>
          <Input type="file" accept=".glb,model/gltf-binary"
            aria-label="Choose actual machine LiDAR or photogrammetry GLB"
            onChange={e=>setFile(e.target.files?.[0]||null)}/>
        </div>
        <div className="space-y-1">
          <Label>Scan title</Label><Input value={name} onChange={e=>setName(e.target.value)}
            placeholder="Machine A installed configuration"/>
        </div>
        <div className="space-y-1">
          <Label>Capture date</Label><Input type="date" value={capturedAt}
            onChange={e=>setCapturedAt(e.target.value)}/>
        </div>
        <div className="space-y-1">
          <Label>Capture method</Label>
          <Select value={method} onValueChange={setMethod}><SelectTrigger><SelectValue/></SelectTrigger>
            <SelectContent>
              <SelectItem value="photogrammetry">Photogrammetry</SelectItem>
              <SelectItem value="lidar">LiDAR</SelectItem>
              <SelectItem value="structured-light">Structured light</SelectItem>
              <SelectItem value="hybrid">LiDAR + photogrammetry</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1"><Label>Scanner / device</Label>
          <Input value={device} onChange={e=>setDevice(e.target.value)}
            placeholder="Camera, phone, or professional scanner"/>
        </div>
        <div className="space-y-1"><Label>Original scan units</Label>
          <Select value={sourceUnit} onValueChange={setSourceUnit}>
            <SelectTrigger><SelectValue/></SelectTrigger>
            <SelectContent>{['mm','cm','m','in','ft'].map(unit=>
              <SelectItem key={unit} value={unit}>{unit}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="space-y-1 sm:col-span-2">
          <Label>Physical measurement used to verify GLB scale</Label>
          <Input value={scaleReference} onChange={e=>setScaleReference(e.target.value)}
            placeholder="Example: measured external housing length 1.250 m; scan 1.249 m"/>
        </div>
        <div className="space-y-1 sm:col-span-2"><Label>Capture provenance and rights</Label>
          <Input value={description} onChange={e=>setDescription(e.target.value)}
            placeholder="Captured on site with owner authorization; exterior scan coverage"/>
        </div>
        <label className="flex gap-2 items-start text-xs sm:col-span-2 cursor-pointer">
          <input type="checkbox" checked={metresConfirmed}
            onChange={e=>setMetresConfirmed(e.target.checked)}/>
          GLB geometry is scaled to real-world metres and checked against the physical reference
        </label>
        <label className="flex gap-2 items-start text-xs sm:col-span-2 cursor-pointer">
          <input type="checkbox" checked={visibleSurfacesOnly}
            onChange={e=>setVisibleSurfacesOnly(e.target.checked)}/>
          This capture shows visible surfaces only; no hidden internals or OEM part claims
        </label>
        <Button type="button" className="sm:col-span-2" disabled={uploading||!file}
          onClick={()=>void upload()}>{uploading?'Securing scan…':'Upload private site scan'}</Button>
      </div>
    </details>}
    {selected?<div className="space-y-3">
      <div className="flex flex-wrap gap-2 items-center text-xs">
        <span className={selected.isActive?'text-emerald-700':'text-amber-700'}>
          {selected.isActive?'Independent scan inspection accepted':'Unapproved site scan · engineering access only'}
        </span>
        <span className="text-muted-foreground">{markers.filter(x=>x.isApproved).length}
          {' / '}{markers.length} spatial markers independently reviewed</span>
      </div>
      {canManage&&<div className="rounded-md border p-3 space-y-2">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <div><Label>Registered part to identify</Label>
            <Select value={selectedComponent||'_none_'} onValueChange={v=>{
              const component=components.find(x=>x.id===v);
              setSelectedComponent(v==='_none_'?'':v);
              setHotspotLabel(component?.name||'');
              setPicked(null);
            }}>
              <SelectTrigger><SelectValue placeholder="Select registered part"/></SelectTrigger>
              <SelectContent>
                <SelectItem value="_none_">Select machine component</SelectItem>
                {components.map(item=><SelectItem key={item.id} value={item.id}>
                  {item.componentCode} · {item.name}
                </SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div><Label>Marker label</Label><Input value={hotspotLabel}
            onChange={e=>setHotspotLabel(e.target.value)} placeholder="Physical point / assembly"/>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant={placing?'default':'outline'} size="sm"
            disabled={!selectedComponent} onClick={()=>{setPlacing(x=>!x);setPicked(null);}}>
            {placing?'Stop placing markers':'Place 3D scan hotspot'}
          </Button>
          <Button type="button" size="sm" disabled={!picked||saving}
            onClick={()=>void saveHotspot()}>{saving?'Saving…':'Save marker as draft'}</Button>
        </div>
        <p className="text-xs text-muted-foreground">
          {placing?'Click the exact visible surface in the 3D view.':'Select a registered part and enable placement.'}
          {' '}Points are stored in model-local metres, not camera coordinates.
          {picked&&` Selected: (${picked.position.x.toFixed(3)}, ${picked.position.y.toFixed(3)}, ${picked.position.z.toFixed(3)}) m`}
        </p>
      </div>}
      {!alignmentMeasuring&&<div className="overflow-hidden rounded-lg border border-slate-700 bg-slate-950">
        <DigitalTwinViewer
          key={selected.id}
          modelUrl={selected.filePath}
          previewAssetModelId={selected.id}
          scanMode
          scanHotspots={overlay}
          approvedCadOverlay={placing||picked?null:approvedCadOverlay}
          onScanSurfacePick={placing?onPick:undefined}
          onComponentSelect={id=>onComponentSelect(id)}
          bindings={[]}
          enableRealtime={false} showSceneTree
          showInfoPanel={false} height="560px"
        />
      </div>}
      <SiteScanAlignmentPanel
        assetId={assetId}
        scanModel={{id:selected.id,filePath:selected.filePath,isActive:selected.isActive}}
        canManage={canManage}
        onOverlayChange={setApprovedCadOverlay}
        onMeasurementModeChange={setAlignmentMeasuring}
      />
      <div className="rounded-md border p-3 space-y-2">
        <p className="text-sm font-semibold">Existing machine parts · scan evidence</p>
        {!markers.length&&<p className="text-xs text-muted-foreground">
          No spatial markers yet. Scanned geometry is visual only until mapped and independently reviewed.
        </p>}
        {markers.map(marker=><div key={marker.id}
          className="flex flex-wrap justify-between gap-2 border-t py-2 text-xs">
          <div><p className="font-medium">{marker.label}</p>
            <p className="text-muted-foreground">
              {marker.component?.componentCode||marker.componentId} · {marker.component?.name}
              {' · '}{marker.isApproved?'independently approved':'draft · visual only'}
            </p></div>
          <div className="flex flex-wrap gap-1">
            <Button type="button" variant="outline" size="sm"
              onClick={()=>onComponentSelect(marker.componentId)}>Open maintenance</Button>
            {canManage&&!marker.isApproved&&<Button type="button" size="sm"
              disabled={reviewing||!physicalVerified||!scaleReviewed}
              onClick={()=>void reviewHotspot(marker.id)}>Approve location</Button>}
          </div>
        </div>)}
      </div>
      {canManage&&<div className="rounded-md border border-amber-500/40 p-3 space-y-2">
        <p className="text-sm font-semibold">Independent site engineer review</p>
        <label className="flex gap-2 text-xs cursor-pointer">
          <input type="checkbox" checked={physicalVerified}
            onChange={e=>setPhysicalVerified(e.target.checked)}/>
          Confirmed this is the correct installed machine and each selected hotspot identifies the physical registered part
        </label>
        <label className="flex gap-2 text-xs cursor-pointer">
          <input type="checkbox" checked={scaleReviewed}
            onChange={e=>setScaleReviewed(e.target.checked)}/>
          Checked scan dimensions against an independently measured physical reference in metres
        </label>
        <Input value={reviewNote} onChange={e=>setReviewNote(e.target.value)}
          aria-label="Independent scan engineer review note"
          placeholder="Reviewer, actual machine identity, reference measurement and inspection evidence"/>
        {!selected.isActive&&<Button type="button" disabled={reviewing||!physicalVerified||
            !scaleReviewed||markers.every(x=>!x.isApproved)||reviewNote.trim().length<15}
          onClick={()=>void commissionScan()}>
          {reviewing?'Recording review…':'Commission as-built 3D scan for inspection'}
        </Button>}
        <p className="text-xs text-muted-foreground">
          Uploaders cannot approve their own scan. Hotspot authors cannot approve their own markers.
          This does not certify OEM internal construction, maintenance clearances or disassembly procedures.
        </p>
      </div>}
    </div>:<div className="rounded-md border border-dashed p-5 text-center text-sm text-muted-foreground">
      No 3D scan selected. The real machine photographs remain available under Site Photo.
      Add a genuine site-owned GLB scan or continue using the source-verified engineering CAD view.
    </div>}
  </div>;
}
