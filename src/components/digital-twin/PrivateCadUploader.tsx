'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { api } from '@/lib/api';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader,
  AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog';

interface CadSourceEvidence {
  sourceOrigin: string;
  sourceNote: string;
  oemManufacturer: string | null;
  oemModel: string | null;
  drawingRevision: string | null;
  nameplateSerial: string | null;
  conversionSidecarPresent: boolean;
  originalCadFileChecksumVerified: false;
}

export interface PrivateCadModel {
  id: string;
  name: string;
  filePath: string;
  fileName?: string;
  isActive?: boolean;
  meshCount?: number;
}

export function PrivateCadUploader({
  assetId, canManage, selected, onSelect,
}: {
  assetId: string;
  canManage: boolean;
  selected: PrivateCadModel | null;
  onSelect: (value: PrivateCadModel | null) => void;
}) {
  const [models, setModels] = useState<PrivateCadModel[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [sourceManifest, setSourceManifest] = useState<File | null>(null);
  const [name, setName] = useState('');
  const [origin, setOrigin] = useState('licensed-oem');
  const [sourceNote, setSourceNote] = useState('');
  const [oemManufacturer, setOemManufacturer] = useState('');
  const [oemModel, setOemModel] = useState('');
  const [drawingRevision, setDrawingRevision] = useState('');
  const [nameplateSerial, setNameplateSerial] = useState('');
  const [saving, setSaving] = useState(false);
  const [showUpload, setShowUpload] = useState(false);
  const [reviewNote, setReviewNote] = useState('');
  const [sourceReviewed, setSourceReviewed] = useState(false);
  const [geometryReviewed, setGeometryReviewed] = useState(false);
  const [componentMappingReviewed, setComponentMappingReviewed] = useState(false);
  const [approving, setApproving] = useState(false);
  const [withdrawing, setWithdrawing] = useState(false);
  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const [withdrawNote, setWithdrawNote] = useState('');
  const [reviewStatus, setReviewStatus] = useState<'checking' | 'awaiting-review' | 'withdrawn'>('checking');
  const [independentReviewerEligible, setIndependentReviewerEligible] = useState(false);
  const [sourceEvidence, setSourceEvidence] = useState<CadSourceEvidence | null>(null);

  useEffect(() => {
    if (!selected?.id || selected.isActive) {
      setReviewStatus('checking');
      setIndependentReviewerEligible(false);
      setSourceEvidence(null);
      return;
    }
    let cancelled=false;
    setReviewStatus('checking');
    setIndependentReviewerEligible(false);
    setSourceEvidence(null);
    void api.get<{
      status:'withdrawn'|'approved'|'awaiting-review';
      independentReviewerEligible:boolean;
      sourceEvidence: CadSourceEvidence | null;
    }>(
      '/api/smart-anatomy/models/' + encodeURIComponent(selected.id) + '/status',
    ).then(result => {
      if(cancelled) return;
      if(!result.success) {
        setReviewStatus('checking');
        setSourceEvidence(null);
        return;
      }
      setSourceEvidence(result.data?.sourceEvidence || null);
      setReviewStatus(result.data?.status==='withdrawn' ? 'withdrawn' : 'awaiting-review');
      setIndependentReviewerEligible(result.data?.independentReviewerEligible === true);
    }).catch(()=>{if(!cancelled)setReviewStatus('checking');});
    return ()=>{cancelled=true;};
  }, [selected?.id, selected?.isActive]);

  const loadModels = useCallback(async () => {
    try {
      const res = await api.get<PrivateCadModel[]>(
        '/api/asset-models?assetId=' + encodeURIComponent(assetId) + '&limit=100');
      if (res.success) {
        setModels((res.data || []).filter(model =>
          /^\/api\/smart-anatomy\/models\/[0-9a-f-]{36}\/file$/i.test(model.filePath)));
      }
    } catch {
      setModels([]);
    }
  }, [assetId]);

  useEffect(() => { void loadModels(); }, [loadModels]);

  const save = async () => {
    if (!canManage || !file || !name.trim() || !sourceNote.trim() || saving ||
        (origin === 'licensed-oem' && [oemManufacturer, oemModel, drawingRevision, nameplateSerial].some(v => v.trim().length < 2))) return;
    setSaving(true);
    try {
      const form = new FormData();
      form.set('assetId', assetId);
      form.set('name', name.trim());
      form.set('sourceOrigin', origin);
      form.set('sourceNote', sourceNote.trim());
      if (origin === 'licensed-oem') {
        form.set('oemManufacturer', oemManufacturer.trim());
        form.set('oemModel', oemModel.trim());
        form.set('drawingRevision', drawingRevision.trim());
        form.set('nameplateSerial', nameplateSerial.trim());
      }
      form.set('file', file);
      if (sourceManifest) form.set('sourceManifest', sourceManifest);
      const res = await api.post<PrivateCadModel>('/api/smart-anatomy/models', form);
      if (!res.success || !res.data?.id) {
        throw new Error(res.error || 'CAD upload failed');
      }
      onSelect(res.data);
      setFile(null);
      setSourceManifest(null);
      setName('');
      setSourceNote('');
      setOemManufacturer('');
      setOemModel('');
      setDrawingRevision('');
      setNameplateSerial('');
      setShowUpload(false);
      await loadModels();
      toast.success('Private 3D CAD stored for engineer mapping; not yet commissioned.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Cannot upload private CAD');
    } finally {
      setSaving(false);
    }
  };

  const approve = async () => {
    if (!selected || !canManage || !independentReviewerEligible ||
        approving || selected.isActive ||
        !sourceReviewed || !geometryReviewed || !componentMappingReviewed ||
        reviewNote.trim().length < 12) return;
    setApproving(true);
    try {
      const res = await api.post<{id:string;isActive:boolean}>(
        '/api/smart-anatomy/models/' + encodeURIComponent(selected.id) + '/commission',
        {sourceReviewed,geometryReviewed,componentMappingReviewed,reviewNote:reviewNote.trim()});
      if(!res.success || !res.data?.isActive) {
        throw new Error(res.error || 'Engineering model review was not approved');
      }
      onSelect({...selected,isActive:true});
      setReviewNote('');
      setSourceReviewed(false);
      setGeometryReviewed(false);
      setComponentMappingReviewed(false);
      await loadModels();
      toast.success('CAD model accepted for technical inspection. Maintenance procedures remain separately controlled.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'CAD model review failed');
    } finally {
      setApproving(false);
    }
  };

  const withdraw = async () => {
    if (!selected?.isActive || !canManage || withdrawing || withdrawNote.trim().length < 15) return;
    setWithdrawing(true);
    try {
      const res = await api.post<{id:string;isActive:boolean;scenesWithdrawn:number}>(
        '/api/smart-anatomy/models/' + encodeURIComponent(selected.id) + '/withdraw',
        { reason: withdrawNote.trim() });
      if (!res.success || res.data?.isActive !== false) {
        throw new Error(res.error || 'Engineering approval could not be withdrawn');
      }
      onSelect({ ...selected, isActive: false });
      setReviewStatus('withdrawn');
      setWithdrawOpen(false);
      setWithdrawNote('');
      await loadModels();
      toast.success(
        `CAD withdrawn from ${res.data.scenesWithdrawn} active scene(s). History retained; import a new revision.`,
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to withdraw CAD approval');
    } finally {
      setWithdrawing(false);
    }
  };

  return (
    <div className="space-y-2 rounded-lg border border-slate-700 bg-slate-950 p-3"
      data-testid="smart-anatomy-private-cad">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-slate-100">Private CAD model library</p>
          <p className="text-xs text-slate-400">
            Access is restricted to authorized users in this asset&apos;s plant. Uploading does not approve maintenance procedures.
          </p>
        </div>
        {canManage && <Button type="button" size="sm" variant="outline"
          onClick={() => setShowUpload(value => !value)}>
          {showUpload ? 'Close upload' : 'Import GLB'}
        </Button>}
      </div>
      <Select value={selected?.id || '_none_'} onValueChange={value =>
        onSelect(value === '_none_' ? null : models.find(model => model.id === value) || null)}>
        <SelectTrigger className="border-slate-700 text-slate-100">
          <SelectValue placeholder="Select a private CAD model" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="_none_">Use commissioned 3D scene / original examples</SelectItem>
          {models.map(model => <SelectItem key={model.id} value={model.id}>
            {model.name} · {model.meshCount || 'Unknown'} meshes
            {model.isActive ? ' · active' : ' · pending review'}
          </SelectItem>)}
        </SelectContent>
      </Select>

      {selected && <Badge variant="outline"
        className="border-amber-600 text-amber-300">
        {selected.isActive ? 'Model active · verify component mappings'
          : reviewStatus==='withdrawn' ? 'Withdrawn CAD · not approved'
            : reviewStatus==='checking' ? 'Checking CAD approval history…'
              : 'Uncommissioned private CAD'}
      </Badge>}

      {selected?.isActive && canManage && (
        <AlertDialog open={withdrawOpen} onOpenChange={setWithdrawOpen}>
          <AlertDialogTrigger asChild>
            <Button type="button" variant="outline" size="sm"
              className="border-amber-600 text-amber-300">
              Withdraw engineering CAD approval
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Withdraw this CAD revision?</AlertDialogTitle>
              <AlertDialogDescription>
                The model and its source evidence remain in the private archive,
                but its published 3D scenes become inactive. A new uploaded
                revision and engineering review are required to restore inspection.
                PM schedules and maintenance history are not deleted.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <div className="space-y-1">
              <Label htmlFor="cad-withdraw-note">Engineering withdrawal reason (minimum 15 characters)</Label>
              <Input id="cad-withdraw-note" value={withdrawNote}
                placeholder="Incorrect model version, source, dimension or part mapping"
                onChange={event => setWithdrawNote(event.target.value)} />
            </div>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={withdrawing}>Keep approved</AlertDialogCancel>
              <AlertDialogAction disabled={withdrawing || withdrawNote.trim().length < 15}
                onClick={event => { event.preventDefault(); void withdraw(); }}>
                {withdrawing ? 'Withdrawing…' : 'Confirm withdrawal'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}

      {selected && !selected.isActive && reviewStatus==='withdrawn' && (
        <div className="rounded-md border border-amber-700 bg-amber-950/40 p-3 text-xs text-amber-100">
          This CAD revision was withdrawn from active inspection. Its source and audit evidence
          remain available. Import and independently review a new revision; withdrawn files
          cannot be commissioned again.
        </div>
      )}

      {selected && !selected.isActive && reviewStatus==='awaiting-review' && canManage && (
        <div className="space-y-2 rounded-md border border-amber-700/40 bg-amber-950/30 p-3">
          <p className="text-xs font-semibold text-amber-200">Engineering source review · approval for 3D inspection only</p>
          <p className="text-[11px] text-slate-300">
            Inspect the actual file and registered component links below. This does not authorize physical disassembly or automatically create PM and work orders.
          </p>
          {sourceEvidence && (
            <div className="rounded-md border border-slate-700 bg-slate-900/70 p-3 space-y-2">
              <p className="text-xs font-semibold text-slate-200">Original CAD source declarations (awaiting independent verification)</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-slate-300">
                <span>Source class: <strong>{sourceEvidence.sourceOrigin}</strong></span>
                <span>Offline conversion evidence: <strong>{sourceEvidence.conversionSidecarPresent ? 'Supplied · GLB digest checked' : 'Not supplied'}</strong></span>
                {sourceEvidence.sourceOrigin === 'licensed-oem' && (
                  <>
                    <span>Manufacturer: <strong>{sourceEvidence.oemManufacturer || 'Unrecorded'}</strong></span>
                    <span>Machine model: <strong>{sourceEvidence.oemModel || 'Unrecorded'}</strong></span>
                    <span>Drawing revision: <strong>{sourceEvidence.drawingRevision || 'Unrecorded'}</strong></span>
                    <span>Nameplate serial: <strong>{sourceEvidence.nameplateSerial || 'Unrecorded'}</strong></span>
                  </>
                )}
              </div>
              <p className="text-[11px] text-slate-300 whitespace-pre-wrap break-words">{sourceEvidence.sourceNote}</p>
              <p className="text-[11px] font-medium text-amber-200">
                The source file's original checksum, licensed drawing revision and identity of the physical machine
                are not automatically certified by a GLB checksum. Verify against retained OEM documentation.
              </p>
            </div>
          )}
          {!independentReviewerEligible && (
            <p className="rounded-md border border-amber-700/60 p-2 text-xs text-amber-200">
              Independent engineering sign-off is required. The uploader cannot approve their
              own CAD file. Ask a different authorized Digital Twin manager to review it.
            </p>
          )}
          {[
            {label:'Model origin, licence or site ownership checked',checked:sourceReviewed,change:setSourceReviewed},
            {label:'Imported geometry reviewed for the selected machine',checked:geometryReviewed,change:setGeometryReviewed},
            {label:'CAD nodes mapped to the correct registered components',checked:componentMappingReviewed,change:setComponentMappingReviewed},
          ].map(item=>(
            <label key={item.label} className="flex cursor-pointer items-start gap-2 text-xs text-slate-200">
              <input type="checkbox" checked={item.checked}
                onChange={event=>item.change(event.target.checked)} className="mt-0.5" />
              <span>{item.label}</span>
            </label>
          ))}
          <Input aria-label="Engineering CAD review evidence" placeholder="Engineering review notes, approver evidence, checked revision"
            value={reviewNote} onChange={event=>setReviewNote(event.target.value)}
            className="border-slate-700 text-slate-100"/>
          <Button type="button" size="sm" onClick={()=>void approve()}
            disabled={!independentReviewerEligible || approving || !sourceReviewed ||
              !geometryReviewed || !componentMappingReviewed || reviewNote.trim().length < 12}>
            {approving?'Recording engineer review…':'Approve model for visual inspection'}
          </Button>
        </div>
      )}

      {showUpload && canManage && (
        <div className="grid gap-3 border-t border-slate-700 pt-3 sm:grid-cols-2">
          <p className="sm:col-span-2 text-[11px] leading-relaxed text-slate-300">
            STL workshop scans must first be converted to GLB offline by an engineer
            with explicit source units and documented origin. Retain the generated
            SHA-256 provenance manifest and record its source details below.
            A single STL has no genuine assembly hierarchy or OEM part identity;
            its preview cannot substitute for a manufacturer-reviewed exploded CAD.
          </p>
          <div className="space-y-1">
            <Label className="text-xs text-slate-300">Self-contained glTF binary (GLB · max 25 MB)</Label>
            <Input aria-label="Choose private CAD GLB file" type="file"
              accept=".glb,model/gltf-binary" className="text-slate-100"
              onChange={event => {
                const next=event.target.files?.[0] || null;
                setFile(next);
                setSourceManifest(null);
                if (next) setName(next.name.replace(/\.glb$/i, ''));
              }} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-slate-300">Offline CAD source sidecar (optional)</Label>
            <Input aria-label="Choose offline CAD source manifest" type="file"
              accept=".json,application/json" className="text-slate-100"
              onChange={event => setSourceManifest(event.target.files?.[0] || null)} />
            <p className="text-[11px] text-slate-400">For STEP/IGES/BREP conversion, select the matching .glb.source.json file (max 32 KB); it will be checked against the uploaded GLB checksum.</p>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-slate-300">Model identification</Label>
            <Input aria-label="Private CAD model name" value={name}
              onChange={event => setName(event.target.value)} placeholder="Manufacturer, type, revision" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-slate-300">Verified source / licensing category</Label>
            <Select value={origin} onValueChange={setOrigin}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="licensed-oem">Licensed OEM model</SelectItem>
                <SelectItem value="site-owned-scan">Site-owned engineering scan</SelectItem>
                <SelectItem value="site-owned-design">Site-owned engineering CAD design</SelectItem>
                <SelectItem value="original-training">Original internal training geometry</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {origin === 'licensed-oem' && (
            <div className="sm:col-span-2 grid grid-cols-1 gap-3 sm:grid-cols-2 rounded-md border border-amber-600/50 p-3">
              <p className="sm:col-span-2 text-xs text-amber-200">
                Manufacturer CAD identity must match the installed machine's nameplate.
                These values are source claims until a separate engineer verifies them.
              </p>
              <div className="space-y-1">
                <Label htmlFor="cad-oem-manufacturer" className="text-xs text-slate-300">OEM Manufacturer</Label>
                <Input id="cad-oem-manufacturer" maxLength={140} value={oemManufacturer}
                  onChange={event => setOemManufacturer(event.target.value)}
                  placeholder="Manufacturer on nameplate" />
              </div>
              <div className="space-y-1">
                <Label htmlFor="cad-oem-model" className="text-xs text-slate-300">Exact Machine Model / Variant</Label>
                <Input id="cad-oem-model" maxLength={140} value={oemModel}
                  onChange={event => setOemModel(event.target.value)}
                  placeholder="Exact manufacturer model" />
              </div>
              <div className="space-y-1">
                <Label htmlFor="cad-revision" className="text-xs text-slate-300">CAD Drawing Revision</Label>
                <Input id="cad-revision" maxLength={140} value={drawingRevision}
                  onChange={event => setDrawingRevision(event.target.value)}
                  placeholder="Drawing number or revision" />
              </div>
              <div className="space-y-1">
                <Label htmlFor="cad-nameplate-serial" className="text-xs text-slate-300">Installed Machine Serial</Label>
                <Input id="cad-nameplate-serial" maxLength={140} value={nameplateSerial}
                  onChange={event => setNameplateSerial(event.target.value)}
                  placeholder="Serial number from machine nameplate" />
              </div>
            </div>
          )}
          <div className="space-y-1">
            <Label className="text-xs text-slate-300">Source evidence / licence notes</Label>
            <Input aria-label="CAD provenance and licence note" value={sourceNote}
              onChange={event => setSourceNote(event.target.value)}
              placeholder="Document origin, revision, licence terms" />
          </div>
          <div className="sm:col-span-2 flex items-center justify-between gap-2">
            <p className="text-[11px] text-amber-200">Stored privately · engineer review required · no automatic PM or repair linkage</p>
            <Button type="button" size="sm"
              disabled={saving || !file || file.size > 25*1024*1024 ||
                (sourceManifest !== null && (sourceManifest.size < 20 || sourceManifest.size > 32*1024)) ||
                name.trim().length < 3 || sourceNote.trim().length < 8 ||
                (origin === 'licensed-oem' &&
                  [oemManufacturer, oemModel, drawingRevision, nameplateSerial].some(v => v.trim().length < 2))}
              onClick={() => void save()}>
              {saving ? 'Validating and storing…' : 'Validate & upload privately'}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
