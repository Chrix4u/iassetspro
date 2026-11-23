'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { useNavigationStore } from '@/stores/navigationStore';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Progress } from '@/components/ui/progress';
import { ResponsiveDialog } from '@/components/shared/ResponsiveDialog';
import { AsyncSearchableSelect } from '@/components/ui/searchable-select';
import { FunctionalLocationPicker } from '@/components/assets/FunctionalLocationPicker';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Sparkles, Loader2, CheckCircle2, Building2, Wrench, Package,
  ClipboardList, Activity, Cpu, AlertTriangle, Layers, GitBranch,
  ChevronDown, ChevronRight, Box, Image, Zap, Crown,
} from 'lucide-react';

interface GenerateSummary {
  subsystems: number;
  components: number;
  bomEntries: number;
  componentRegistry: number;
  inventoryItems: number;
  pmTemplates: number;
  pmTasks: number;
  pmSchedules: number;
  digitalTwin: number;
  systemDiagram: number;
}

interface GenerateResult {
  asset: {
    id: string;
    name: string;
    assetTag: string;
    description: string;
    manufacturer: string;
    model: string;
    criticality: string;
    imageUrl?: string | null;
  };
  summary: GenerateSummary;
}

interface AIAssetGeneratorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

type GenStep = 'input' | 'generating' | 'result';

export function AIAssetGenerator({ open, onOpenChange, onSuccess }: AIAssetGeneratorProps) {
  const [step, setStep] = useState<GenStep>('input');
  const [machineName, setMachineName] = useState('');
  const [machineCode, setMachineCode] = useState('');
  const [additionalContext, setAdditionalContext] = useState('');
  const [plantId, setPlantId] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [functionalLocationId, setFunctionalLocationId] = useState('');
  const [acknowledgeUnverified, setAcknowledgeUnverified] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressLabel, setProgressLabel] = useState('');
  const [result, setResult] = useState<GenerateResult | null>(null);
  const [error, setError] = useState('');
  const [threeDStatus, setThreeDStatus] = useState<'idle' | 'generating' | 'completed' | 'failed'>('idle');
  const [threeDProgress, setThreeDProgress] = useState(0);
  const [threeDMessage, setThreeDMessage] = useState('');
  const [threeDError, setThreeDError] = useState('');
  const [threeDProvider, setThreeDProvider] = useState<'programmatic' | 'meshy'>('programmatic');
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const reset = () => {
    setStep('input');
    setMachineName('');
    setMachineCode('');
    setAdditionalContext('');
    setPlantId('');
    setCategoryId('');
    setFunctionalLocationId('');
    setAcknowledgeUnverified(false);
    setGenerating(false);
    setProgress(0);
    setProgressLabel('');
    setResult(null);
    setError('');
    setThreeDStatus('idle');
    setThreeDProgress(0);
    setThreeDMessage('');
    setThreeDError('');
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
  };

  const handleClose = (open: boolean) => {
    if (!open) reset();
    onOpenChange(open);
  };

  const { navigate } = useNavigationStore();

  const start3DGeneration = useCallback(async () => {
    if (!result) return;
    setThreeDStatus('generating');
    setThreeDProgress(10);
    setThreeDError('');

    const isProgrammatic = threeDProvider === 'programmatic';
    setThreeDMessage(isProgrammatic
      ? 'AI is generating 3D geometry from machine description...'
      : 'Starting premium 3D model generation...'
    );

    try {
      const res = await api.post<any>('/api/ai/generate-3d', {
        machineName: result.asset.name,
        description: result.asset.description,
        assetId: result.asset.id,
        provider3d: threeDProvider,
      });

      if (!res.success) {
        setThreeDStatus('failed');
        setThreeDError(res.error || 'Failed to start 3D generation');
        return;
      }

      // ── Programmatic: immediate result (status: 'succeeded') ──
      if (res.data?.status === 'succeeded' || res.data?.model) {
        setThreeDStatus('completed');
        setThreeDProgress(100);
        setThreeDMessage('3D model generated successfully!');
        toast.success('3D model generated and linked to Digital Twin');
        return;
      }

      // ── Meshy/Premium: async polling needed ──
      if (res.data?.taskId) {
        const taskId = res.data.taskId;
        setThreeDProgress(20);
        setThreeDMessage('3D model generation in progress...');

        pollingRef.current = setInterval(async () => {
          try {
            const statusRes = await api.get<{ status: string; progress: number; message: string }>(
              `/api/ai/generate-3d/status?taskId=${taskId}&assetId=${result.asset.id}&provider3d=${threeDProvider}`
            );

            if (statusRes.success && statusRes.data) {
              const { status, progress, message } = statusRes.data;
              setThreeDProgress(progress);
              setThreeDMessage(message);

              if (status === 'succeeded') {
                setThreeDStatus('completed');
                setThreeDProgress(100);
                if (pollingRef.current) {
                  clearInterval(pollingRef.current);
                  pollingRef.current = null;
                }
              } else if (status === 'failed') {
                setThreeDStatus('failed');
                setThreeDError(message || '3D model generation failed');
                if (pollingRef.current) {
                  clearInterval(pollingRef.current);
                  pollingRef.current = null;
                }
              }
            }
          } catch {
            // Continue polling on transient errors
          }
        }, 5000);
      } else {
        // No taskId and no immediate success — edge case
        setThreeDStatus('failed');
        setThreeDError('Unexpected response from 3D generation API');
      }
    } catch (err: any) {
      setThreeDStatus('failed');
      setThreeDError(err.message || 'Failed to start 3D generation');
    }
  }, [result, threeDProvider]);

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
      }
    };
  }, []);

  const handleGenerate = async () => {
    if (!machineName.trim()) {
      toast.error('Please enter a machine name');
      return;
    }

    if (!plantId || !functionalLocationId) {
      toast.error('Select the machine plant and full installation location path');
      return;
    }
    if (!acknowledgeUnverified) {
      toast.error('Please acknowledge that AI-generated details must be verified by an engineer');
      return;
    }
    setStep('generating');
    setGenerating(true);
    setProgress(5);
    setProgressLabel('Analyzing machine requirements...');
    setError('');

    // Simulate progress updates
    const progressSteps = [
      { at: 8, label: 'AI is identifying sub-systems and components...' },
      { at: 18, label: 'Generating Bill of Materials...' },
      { at: 28, label: 'Creating component registry entries...' },
      { at: 38, label: 'Adding spare parts to inventory...' },
      { at: 48, label: 'Building preventive maintenance templates...' },
      { at: 58, label: 'Setting up PM schedules...' },
      { at: 68, label: 'Configuring digital twin...' },
      { at: 78, label: 'Building detailed system diagram with all components...' },
      { at: 88, label: 'Generating AI machine illustration...' },
      { at: 95, label: 'Finalizing asset record...' },
    ];

    const timers = progressSteps.map(s =>
      setTimeout(() => {
        setProgress(s.at);
        setProgressLabel(s.label);
      }, s.at * 30)
    );

    try {
      const payload: any = { machineName: machineName.trim(), functionalLocationId, acknowledgeUnverified: true };
      if (machineCode.trim()) payload.machineCode = machineCode.trim().toUpperCase();
      if (additionalContext.trim()) payload.additionalContext = additionalContext.trim();
      if (plantId) payload.plantId = plantId;
      if (categoryId) payload.categoryId = categoryId;

      const res = await api.post('/api/assets/ai-generate', payload, { timeout: 300_000 }); // 5 min for LLM + image + DB

      timers.forEach(clearTimeout);

      if (res.success && res.data) {
        setProgress(100);
        setProgressLabel('Complete!');
        setResult(res.data);
        setStep('result');
        toast.success(`AI draft "${res.data.asset.name}" saved. Verify before commissioning.`);
        onSuccess?.();
      } else {
        setError(res.error || 'Failed to generate asset');
        toast.error(res.error || 'AI generation failed');
        setStep('input');
      }
    } catch (err: any) {
      timers.forEach(clearTimeout);
      setError(err.message || 'An unexpected error occurred');
      toast.error('AI generation failed');
      setStep('input');
    } finally {
      setGenerating(false);
    }
  };

  const totalItems = result
    ? Object.values(result.summary).reduce((a: number, b: any) => a + b, 0)
    : 0;

  return (
    <ResponsiveDialog open={open} onOpenChange={handleClose}>
      {/* ── STEP 1: Input ── */}
      {step === 'input' && (
        <>
          <div className="space-y-1.5 mb-4">
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-lg bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center">
                <Sparkles className="h-4.5 w-4.5 text-violet-600 dark:text-violet-400" />
              </div>
              <div>
                <h2 className="text-lg font-semibold leading-none tracking-tight">AI Asset Generator</h2>
                <p className="text-sm text-muted-foreground">Enter machine details to create an unverified engineering draft</p>
              </div>
            </div>
          </div>

          <div className="grid gap-4 py-2">
            {/* Machine name */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">Machine Name *</Label>
              <Input
                placeholder="e.g., CNC Lathe Machine, Rotary Screen Printing Machine, Air Compressor..."
                value={machineName}
                onChange={e => setMachineName(e.target.value)}
                className="text-base h-11"
                onKeyDown={e => e.key === 'Enter' && handleGenerate()}
              />
              <p className="text-xs text-muted-foreground">
                Be specific for best results — include type, brand, or model if known
              </p>
            </div>

            <div className="space-y-2">
              <Label className="text-sm font-medium">Internal Machine Code (optional)</Label>
              <Input
                placeholder="e.g. ST-001"
                value={machineCode}
                onChange={event => setMachineCode(event.target.value.toUpperCase())}
                maxLength={40}
                className="h-11 font-mono"
              />
              {machineCode.trim() ? (
                /^[A-Z0-9]+(?:-[A-Z0-9]+)*$/.test(machineCode.trim()) && machineCode.trim().length >= 3 ? (
                  <p className="text-xs text-muted-foreground">
                    Code preview: {machineCode.trim()} → {machineCode.trim()}-A01 → {machineCode.trim()}-A01-C01 → {machineCode.trim()}-A01-C01-P01.
                    Assemblies, components and proposed parts receive derived internal codes; genuine OEM numbers remain separate.
                  </p>
                ) : (
                  <p role="alert" className="text-xs text-red-600">
                    Use 3–40 letters/numbers in groups separated by hyphens.
                  </p>
                )
              ) : (
                <p className="text-xs text-muted-foreground">An AI-prefixed machine code will be generated unless you enter your own unique code.</p>
              )}
            </div>

            {/* Additional context */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">Additional Context (optional)</Label>
              <Textarea
                placeholder="e.g., Used at Ghana Tema Factory, 8-color configuration, manufactured 2021 by Stork Prints, model RD-I Plus 1850..."
                value={additionalContext}
                onChange={e => setAdditionalContext(e.target.value)}
                rows={3}
              />
            </div>

            <Separator className="my-1" />

            {/* Plant & Category */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Plant</Label>
                <AsyncSearchableSelect
                  value={plantId}
                  onValueChange={value => { setPlantId(value); setFunctionalLocationId(''); }}
                  fetchOptions={async () => {
                    const res = await api.get('/api/plants');
                    if (res.success && res.data) {
                      return (Array.isArray(res.data) ? res.data : []).map((p: any) => ({
                        value: p.id,
                        label: p.name,
                        group: p.city || p.location || undefined,
                      }));
                    }
                    return [];
                  }}
                  placeholder="Select plant..."
                  searchPlaceholder="Search plants..."
                />
              </div>
              <div className="space-y-1.5">
                <Label>Category</Label>
                <AsyncSearchableSelect
                  value={categoryId}
                  onValueChange={setCategoryId}
                  fetchOptions={async () => {
                    const res = await api.get('/api/asset-categories');
                    if (res.success && res.data) {
                      return (Array.isArray(res.data) ? res.data : []).map((c: any) => ({
                        value: c.id,
                        label: c.name,
                      }));
                    }
                    return [];
                  }}
                  placeholder="Select category..."
                  searchPlaceholder="Search categories..."
                />
              </div>
            </div>
            {plantId && (
              <FunctionalLocationPicker
                plantId={plantId}
                value={functionalLocationId}
                onValueChange={setFunctionalLocationId}
                label="Installation Location Path *"
                placeholder="Select the full coded machine installation path"
              />
            )}
            <div className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-amber-950 dark:border-amber-800 dark:bg-amber-950/20 dark:text-amber-100">
              <Checkbox
                id="ai-draft-acknowledgment"
                checked={acknowledgeUnverified}
                onCheckedChange={value => setAcknowledgeUnverified(value === true)}
                className="mt-0.5"
              />
              <label htmlFor="ai-draft-acknowledgment" className="cursor-pointer text-xs leading-relaxed">
                I understand AI-generated machine details and illustrations are unverified suggestions, not manufacturer/OEM evidence. The asset will remain on standby, and no AI PM schedule will generate a work order until reviewed and activated.
              </label>
            </div>
          </div>

          {/* What gets generated */}
          <div className="mt-4 p-3 rounded-lg bg-muted/50 border">
            <p className="text-xs font-medium text-muted-foreground mb-2">AI will automatically generate:</p>
            <div className="flex flex-wrap gap-1.5">
              {[
                { icon: Layers, label: 'Sub-systems & Components' },
                { icon: GitBranch, label: 'Bill of Materials' },
                { icon: Cpu, label: 'Component Registry' },
                { icon: Package, label: 'Spare Parts Inventory' },
                { icon: ClipboardList, label: 'PM Templates & Schedules' },
                { icon: Activity, label: 'Digital Twin' },
                { icon: Box, label: 'Interactive System Diagram' },
                { icon: Image, label: 'AI Machine Illustration' },
                { icon: Zap, label: '3D Model (Free)' },
              ].map(item => (
                <Badge key={item.label} variant="secondary" className="text-[10px] gap-1 py-0.5">
                  <item.icon className="h-2.5 w-2.5" />
                  {item.label}
                </Badge>
              ))}
            </div>
          </div>

          {/* Error */}
          {error && (
            <div className="mt-3 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 text-sm">
              {error}
            </div>
          )}

          <div className="flex flex-col-reverse gap-2 mt-4 sm:flex-row sm:justify-end">
            <Button variant="outline" onClick={() => handleClose(false)}>Cancel</Button>
            <Button
              onClick={handleGenerate}
              disabled={!machineName.trim() || !plantId || !functionalLocationId || !acknowledgeUnverified || (!!machineCode.trim() && (machineCode.trim().length < 3 || !/^[A-Z0-9]+(?:-[A-Z0-9]+)*$/.test(machineCode.trim())))}
              className="bg-violet-600 hover:bg-violet-700 text-white gap-2"
            >
              <Sparkles className="h-4 w-4" />
              Create AI Draft
            </Button>
          </div>
        </>
      )}

      {/* ── STEP 2: Generating (Loading) ── */}
      {step === 'generating' && (
        <div className="flex flex-col items-center justify-center py-12 gap-6">
          <div className="relative">
            <div className="h-20 w-20 rounded-full bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center animate-pulse">
              <Sparkles className="h-10 w-10 text-violet-600 dark:text-violet-400" />
            </div>
            <div className="absolute -bottom-1 -right-1 h-7 w-7 rounded-full bg-violet-600 flex items-center justify-center">
              <Loader2 className="h-4 w-4 text-white animate-spin" />
            </div>
          </div>

          <div className="text-center space-y-2 max-w-sm">
            <h3 className="text-lg font-semibold">AI is Building Your Asset</h3>
            <p className="text-sm text-muted-foreground">{progressLabel}</p>
          </div>

          <div className="w-full max-w-xs space-y-2">
            <Progress value={progress} className="h-2" />
            <p className="text-xs text-muted-foreground text-center">{progress}%</p>
          </div>

          <p className="text-xs text-muted-foreground max-w-xs text-center">
            The AI is drafting possible sub-systems, components, spare parts and inactive PM proposals. Manufacturer accuracy and maintenance limits require engineering verification.
          </p>
        </div>
      )}

      {/* ── STEP 3: Result ── */}
      {step === 'result' && result && (
        <>
          <div className="space-y-1.5 mb-4">
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-lg bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
                <CheckCircle2 className="h-4.5 w-4.5 text-emerald-600 dark:text-emerald-400" />
              </div>
              <div>
                <h2 className="text-lg font-semibold leading-none tracking-tight">Asset Created Successfully!</h2>
                <p className="text-sm text-muted-foreground">AI generated {totalItems} records for this asset</p>
              </div>
            </div>
          </div>

          <ScrollArea className="max-h-[60vh]">
            <div className="grid gap-4 py-2">
              {/* Asset info card */}
              <Card className="border-0 shadow-sm bg-gradient-to-br from-violet-50 to-emerald-50 dark:from-violet-950/20 dark:to-emerald-950/20">
                <CardContent className="p-4">
                  {result.asset.imageUrl && (
                    <div className="mb-3 rounded-xl overflow-hidden border bg-white dark:bg-card">
                      <img 
                        src={result.asset.imageUrl} 
                        alt={result.asset.name}
                        className="w-full h-auto max-h-64 object-contain"
                      />
                    </div>
                  )}
                  <div className="flex items-start gap-3">
                    <div className="h-12 w-12 rounded-xl bg-white dark:bg-card shadow-sm flex items-center justify-center shrink-0">
                      <Building2 className="h-6 w-6 text-violet-600" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <h3 className="font-semibold text-base truncate">{result.asset.name}</h3>
                      <p className="text-xs text-muted-foreground font-mono mt-0.5">{result.asset.assetTag}</p>
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {result.asset.manufacturer && (
                          <Badge variant="outline" className="text-[10px]">{result.asset.manufacturer}</Badge>
                        )}
                        {result.asset.model && (
                          <Badge variant="outline" className="text-[10px]">{result.asset.model}</Badge>
                        )}
                        <Badge
                          variant="outline"
                          className={`text-[10px] ${
                            result.asset.criticality === 'critical'
                              ? 'bg-red-50 text-red-700 border-red-200'
                              : result.asset.criticality === 'high'
                                ? 'bg-amber-50 text-amber-700 border-amber-200'
                                : 'bg-sky-50 text-sky-700 border-sky-200'
                          }`}
                        >
                          {result.asset.criticality?.toUpperCase()}
                        </Badge>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Summary grid */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {[
                  { icon: Layers, label: 'Sub-systems', value: result.summary.subsystems, color: 'text-blue-600' },
                  { icon: Wrench, label: 'Components', value: result.summary.components, color: 'text-indigo-600' },
                  { icon: GitBranch, label: 'BOM Entries', value: result.summary.bomEntries, color: 'text-emerald-600' },
                  { icon: Cpu, label: 'Component Registry', value: result.summary.componentRegistry, color: 'text-violet-600' },
                  { icon: Package, label: 'Spare Parts', value: result.summary.inventoryItems, color: 'text-amber-600' },
                  { icon: ClipboardList, label: 'PM Tasks', value: result.summary.pmTasks, color: 'text-teal-600' },
                  { icon: AlertTriangle, label: 'PM Templates', value: result.summary.pmTemplates, color: 'text-orange-600' },
                  { icon: Activity, label: 'PM Schedules', value: result.summary.pmSchedules, color: 'text-pink-600' },
                  { icon: Activity, label: 'Digital Twin', value: result.summary.digitalTwin, color: 'text-cyan-600' },
                  { icon: Box, label: 'System Diagram', value: result.summary.systemDiagram, color: 'text-fuchsia-600' },
                ].map(s => (
                  <div key={s.label} className="flex items-center gap-2.5 p-2.5 rounded-lg bg-muted/50 border">
                    <s.icon className={`h-4 w-4 ${s.color} shrink-0`} />
                    <div className="min-w-0">
                      <p className="text-lg font-bold leading-none">{s.value}</p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">{s.label}</p>
                    </div>
                  </div>
                ))}
              </div>

              {/* 3D Model Generation Status */}
              {result && (
                <Card className="border-0 shadow-sm py-0">
                  <CardContent className="p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Box className="h-4 w-4 text-cyan-600 dark:text-cyan-400" />
                        <h4 className="text-sm font-semibold">3D Model Generation</h4>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Badge variant="outline" className={`text-[10px] gap-1 ${threeDProvider === 'programmatic' ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-400' : 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/30 dark:text-amber-400'}`}>
                          {threeDProvider === 'programmatic' ? <Zap className="h-2.5 w-2.5" /> : <Crown className="h-2.5 w-2.5" />}
                          {threeDProvider === 'programmatic' ? 'Free' : 'Premium'}
                        </Badge>
                        {threeDStatus === 'idle' && (
                          <button
                            type="button"
                            onClick={() => setThreeDProvider(p => p === 'programmatic' ? 'meshy' : 'programmatic')}
                            className="px-2 py-0.5 rounded text-[10px] font-medium border border-border bg-muted hover:bg-muted/80 transition-colors"
                          >
                            Switch to {threeDProvider === 'programmatic' ? 'Premium' : 'Free'}
                          </button>
                        )}
                      </div>
                    </div>

                    {threeDProvider === 'programmatic' && threeDStatus === 'idle' && (
                      <p className="text-xs text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/20 rounded-md px-2.5 py-1.5">
                        Creates an illustrative 3D shape model, NOT the manufacturer's actual exploded mechanical assembly. The configured AI provider may still incur usage charges.
                      </p>
                    )}
                    {threeDProvider === 'meshy' && threeDStatus === 'idle' && (
                      <p className="text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/20 rounded-md px-2.5 py-1.5">
                        Uses Meshy.ai for photorealistic 3D models. Requires an active Meshy.ai subscription and API key configured in AI Settings.
                      </p>
                    )}

                    {threeDStatus === 'idle' && (
                      <Button onClick={start3DGeneration} className="gap-2" variant="outline">
                        <Sparkles className="h-4 w-4" /> Generate 3D Model
                      </Button>
                    )}

                    {threeDStatus === 'generating' && (
                      <div className="space-y-2">
                        <Progress value={threeDProgress} className="h-2" />
                        <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                          <Loader2 className="h-3 w-3 animate-spin" /> {threeDMessage}
                        </p>
                      </div>
                    )}

                    {threeDStatus === 'completed' && (
                      <div className="flex items-center justify-between flex-wrap gap-2">
                        <div className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400">
                          <CheckCircle2 className="h-4 w-4" />
                          <span className="text-xs font-medium">3D model generated! View it in the Digital Twin viewer.</span>
                        </div>
                        <Button
                          size="sm"
                          className="gap-1.5"
                          onClick={() => navigate('assets-digital-twin', { id: result.asset.id })}
                        >
                          Open Digital Twin
                        </Button>
                      </div>
                    )}

                    {threeDStatus === 'failed' && (
                      <div className="flex items-center justify-between flex-wrap gap-2">
                        <div className="flex items-center gap-1.5 text-red-500">
                          <AlertTriangle className="h-4 w-4" />
                          <span className="text-xs">{threeDError}</span>
                        </div>
                        <Button size="sm" variant="outline" onClick={start3DGeneration} className="gap-1.5">
                          Retry
                        </Button>
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}

              {/* What you can do now */}
              <div className="p-3 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800">
                <p className="text-sm font-medium text-emerald-700 dark:text-emerald-400 mb-1.5">What you can do now:</p>
                <ul className="text-xs text-emerald-600 dark:text-emerald-500 space-y-0.5">
                  <li>• View the illustrative (not OEM-certified) machine image on the asset card</li>
                  <li>• Explore the interactive system diagram with all labeled components</li>
                  <li>• Check the Bill of Materials and spare parts inventory</li>
                  <li>• Review and approve draft PM schedules before activation</li>
                  <li>• Explore the digital twin configuration</li>
                  <li>• Create maintenance requests and work orders for this machine</li>
                </ul>
              </div>
            </div>
          </ScrollArea>

          <div className="flex flex-col-reverse gap-2 mt-4 sm:flex-row sm:justify-end">
            <Button variant="outline" onClick={() => handleClose(false)}>Close</Button>
            <Button
              onClick={() => {
                const assetId = result.asset.id;
                handleClose(false);
                navigate('assets-machines', { id: assetId });
              }}
              className="bg-emerald-600 hover:bg-emerald-700 text-white gap-2"
            >
              <CheckCircle2 className="h-4 w-4" />
              Review Asset & Location
            </Button>
          </div>
        </>
      )}
    </ResponsiveDialog>
  );
}
