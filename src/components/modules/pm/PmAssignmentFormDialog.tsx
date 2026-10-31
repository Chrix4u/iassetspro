'use client';

import React, { useCallback, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import type { PmTaskType } from '@/lib/pm-task';
import {
  clearPmAssignmentConditionBinding,
  formatPmAssignmentEstimatedTime,
  pmAssignmentDraftFromApi,
  pmAssignmentDraftFromApi,
  pmAssignmentDraftFromApi,
  pmAssignmentDraftFromMaster,
  pmAssignmentTaskPayload,
  totalPmAssignmentEstimatedMinutes,
  validatePmAssignmentTaskDraft,
  type PmAssignmentTaskDraft,
} from '@/lib/pm-assignment-draft';
import type { PmAssignmentTargetGroup } from '@/lib/pm-assignment-target-list';
import type { PmAssignmentTargetGroup } from '@/lib/pm-assignment-target-list';
import type { PmAssignmentTargetGroup } from '@/lib/pm-assignment-target-list';
import { PmAssignmentTaskPlanner } from '@/components/modules/pm/PmAssignmentTaskPlanner';
import { PmTargetTreePicker, type PmTargetAsset } from '@/components/modules/pm/PmTargetTreePicker';
import { ResponsiveDialog } from '@/components/shared/ResponsiveDialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { AsyncSearchableSelect } from '@/components/ui/searchable-select';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: () => void;
  editTarget?: PmAssignmentTargetGroup | null;
}

export function PmAssignmentFormDialog({ open, onOpenChange, onSaved, editTarget = null }: Props) {
  const [assetId, setAssetId] = useState('');
  const [assetCache, setAssetCache] = useState<Record<string, PmTargetAsset>>({});
  const [componentId, setComponentId] = useState<string | null>(null);
  const [technicalPath, setTechnicalPath] = useState<Array<{ id: string; name: string; componentCode?: string | null }>>([]);
  const [targetConfirmed, setTargetConfirmed] = useState(false);
  const [templateId, setTemplateId] = useState('');
  const [tasks, setTasks] = useState<PmAssignmentTaskDraft[]>([]);
  const [templateLoading, setTemplateLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const templateSequence = useRef(0);

  const asset = assetCache[assetId] || null;
  const totalEstimatedMinutes = totalPmAssignmentEstimatedMinutes(tasks);
  const totalEstimatedLabel = formatPmAssignmentEstimatedTime(totalEstimatedMinutes);

  const reset = useCallback(() => {
    setAssetId('');
    setComponentId(null);
    setTechnicalPath([]);
    setTargetConfirmed(false);
    setTemplateId('');
    setTasks([]);
    setTemplateLoading(false);
  }, []);

  React.useEffect(() => {
    if (!open) reset();
  }, [open, reset]);

  React.useEffect(() => {
    if (!open || !editTarget) return;
    const editAsset: PmTargetAsset = { id: editTarget.asset.id, name: editTarget.asset.name, assetTag: editTarget.asset.assetTag || undefined };
    setAssetCache((current) => ({ ...current, [editAsset.id]: editAsset }));
    setAssetId(editTarget.assetId);
    setComponentId(editTarget.componentId);
    setTechnicalPath([]);
    setTargetConfirmed(true);
    setTemplateId('');
    setTasks(editTarget.assignments.map((assignment, index) => pmAssignmentDraftFromApi(assignment, index)));
  }, [editTarget, open]);

  React.useEffect(() => {
    if (!open || !editTarget) return;
    const editAsset: PmTargetAsset = { id: editTarget.asset.id, name: editTarget.asset.name, assetTag: editTarget.asset.assetTag || undefined };
    setAssetCache((current) => ({ ...current, [editAsset.id]: editAsset }));
    setAssetId(editTarget.assetId);
    setComponentId(editTarget.componentId);
    setTechnicalPath([]);
    setTargetConfirmed(true);
    setTemplateId('');
    setTasks(editTarget.assignments.map((assignment, index) => pmAssignmentDraftFromApi(assignment, index)));
  }, [editTarget, open]);

  React.useEffect(() => {
    if (!open || !editTarget) return;
    const editAsset: PmTargetAsset = { id: editTarget.asset.id, name: editTarget.asset.name, assetTag: editTarget.asset.assetTag || undefined };
    setAssetCache((current) => ({ ...current, [editAsset.id]: editAsset }));
    setAssetId(editTarget.assetId);
    setComponentId(editTarget.componentId);
    setTechnicalPath([]);
    setTargetConfirmed(true);
    setTemplateId('');
    setTasks(editTarget.assignments.map((assignment, index) => pmAssignmentDraftFromApi(assignment, index)));
  }, [editTarget, open]);

  const fetchAssets = async (query: string) => {
    const response = await api.get(`/api/assets?search=${encodeURIComponent(query)}&limit=100`);
    if (!response.success || !Array.isArray(response.data)) return [];
    const next: Record<string, PmTargetAsset> = {};
    for (const item of response.data as any[]) {
      next[item.id] = {
        id: item.id,
        name: item.name,
        assetTag: item.assetTag,
        location: item.location,
        functionalLocation: item.functionalLocation,
        description: item.description,
        imageUrl: item.imageUrl,
        manufacturer: item.manufacturer,
        model: item.model,
        criticality: item.criticality,
        status: item.status,
        specification: item.specification,
      };
    }
    setAssetCache((current) => ({ ...current, ...next }));
    return (response.data as any[]).map((item) => ({ value: item.id, label: `${item.name} [${item.assetTag}]`, badge: item.status }));
  };

  const fetchTemplates = async (query: string) => {
    const response = await api.get('/api/pm-templates?active=true');
    if (!response.success || !Array.isArray(response.data)) return [];
    const needle = query.trim().toLowerCase();
    return (response.data as any[])
      .filter((template) => !needle || String(template.title || '').toLowerCase().includes(needle))
      .map((template) => ({
        value: template.id,
        label: `${template.title} · ${template._count?.tasks ?? 0} task${template._count?.tasks === 1 ? '' : 's'}`,
        badge: template.type,
      }));
  };

  const loadTemplate = async (nextTemplateId: string) => {
    setTemplateId(nextTemplateId);
    if (!nextTemplateId) {
      setTasks([]);
      return;
    }
    setTemplateLoading(true);
    try {
      const response = await api.get(`/api/pm-templates/${encodeURIComponent(nextTemplateId)}`);
      if (!response.success || !response.data) throw new Error(response.error || 'Failed to load PM template');
      const templateTasks = Array.isArray((response.data as any).tasks) ? (response.data as any).tasks : [];
      const rows = templateTasks
        .filter((task: any) => task.pmTaskId && task.masterTaskNumber !== null && task.discipline && task.masterIsActive !== false)
        .map((task: any, index: number) => {
          templateSequence.current += 1;
          return pmAssignmentDraftFromMaster({
            id: String(task.pmTaskId),
            taskNumber: Number(task.masterTaskNumber),
            description: String(task.description || ''),
            taskType: String(task.discipline) as PmTaskType,
            isActive: task.masterIsActive !== false,
          }, `${task.pmTaskId}:template:${templateSequence.current}:${index}`);
        });
      setTasks(rows);
      const skipped = templateTasks.length - rows.length;
      toast.success(`Loaded ${rows.length} task${rows.length === 1 ? '' : 's'} from template${skipped ? ` · ${skipped} inactive/legacy skipped` : ''}`);
    } catch (error) {
      setTemplateId('');
      toast.error(error instanceof Error ? error.message : 'Failed to load PM template');
    } finally {
      setTemplateLoading(false);
    }
  };

  const changeAsset = (nextAssetId: string) => {
    setAssetId(nextAssetId);
    setComponentId(null);
    setTechnicalPath([]);
    setTargetConfirmed(false);
    setTemplateId('');
    setTasks([]);
  };

  const save = async () => {
    if (!assetId) {
      toast.error('Select an asset');
      return;
    }
    if (!targetConfirmed) {
      toast.error('Select a PM target and confirm it');
      return;
    }
    if (tasks.length === 0) {
      toast.error('Load a Task Template or add at least one Task Library task');
      return;
    }
    for (const task of tasks) {
      const error = validatePmAssignmentTaskDraft(task);
      if (error) {
        toast.error(error);
        return;
      }
    }

    setSaving(true);
    try {
      const assignments = tasks.map((task) => ({
        ...pmAssignmentTaskPayload(task),
        ...(task.assignmentId ? { id: task.assignmentId } : {}),
      }));
      const response = editTarget
        ? await api.patch('/api/pm-assignments/target', { assetId, componentId, assignments })
        : await api.post('/api/pm-assignments', { assetId, componentId, assignments });
      if (!response.success) throw new Error(response.error || (editTarget ? 'Failed to update PM schedule' : 'Failed to create PM assignments'));
      toast.success(editTarget ? 'PM schedule updated' : `${tasks.length} PM assignment${tasks.length === 1 ? '' : 's'} created`);
      onOpenChange(false);
      onSaved?.();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to create PM assignments');
    } finally {
      setSaving(false);
    }
  };

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      size="extra-wide"
      desktopMaxWidth="sm:max-w-[94vw] 2xl:max-w-[88rem]"
      title={editTarget ? 'Edit PM Schedule' : 'New PM Assignment'}
      description={editTarget ? 'Update the tasks and planning conditions defined on this target. The asset and part remain fixed.' : 'Select the machine and exact PM target, then load a Task Template or add Task Library tasks. Each task keeps its own planning conditions.'}
      footer={(
        <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-xs" data-testid="pm-assignment-footer-total">
            <span className="text-muted-foreground">Total estimated time:</span>{' '}
            <strong>{totalEstimatedLabel}</strong>
            <span className="ml-1 text-muted-foreground">· {tasks.length} task{tasks.length === 1 ? '' : 's'}</span>
          </div>
          <div className="flex flex-col-reverse gap-2 sm:flex-row">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="button" onClick={save} disabled={saving || templateLoading || !targetConfirmed || tasks.length === 0}>
              {saving && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              {editTarget ? 'Update PM Schedule' : `Create PM Assignment${tasks.length === 1 ? '' : 's'}`}
            </Button>
          </div>
        </div>
      )}
    >
      <div className="space-y-4 py-1">
        <div className="space-y-1.5">
          <Label className="text-xs font-semibold">Asset *</Label>
          <AsyncSearchableSelect
            value={assetId}
            onValueChange={changeAsset}
            fetchOptions={fetchAssets}
            placeholder="Select machine / asset..."
            searchPlaceholder="Search asset name or tag..."
            disabled={Boolean(editTarget)}
          />
        </div>

        <div>
          <Label className="mb-1.5 block text-xs font-semibold">PM Target</Label>
          {editTarget ? (
            <div className="rounded-lg border bg-muted/20 px-3 py-2">
              <p className="text-sm font-semibold">{editTarget.targetName}</p>
              <p className="text-xs text-muted-foreground">{editTarget.component ? `${editTarget.component.componentCode || ''} · ${editTarget.asset.name}` : `${editTarget.asset.name} · Whole machine`}</p>
            </div>
          ) : (
            <PmTargetTreePicker
              asset={asset}
              componentId={componentId}
              technicalPath={technicalPath}
              onChange={(id, path) => {
                if (id !== componentId) setTasks((current) => current.map(clearPmAssignmentConditionBinding));
                setComponentId(id);
                setTechnicalPath(path);
                setTargetConfirmed(true);
              }}
            />
          )}
        </div>

        <div className="space-y-1.5 rounded-lg border bg-muted/10 p-3">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div>
              <Label className="text-xs font-semibold">Task Template</Label>
              <p className="mt-0.5 text-[10px] text-muted-foreground">Optional. Selecting a template populates/replaces the task rows below; you can still add Task Library tasks afterward.</p>
            </div>
            {templateLoading && <span className="flex items-center gap-1 text-[10px] text-muted-foreground"><Loader2 className="h-3 w-3 animate-spin" />Loading template tasks…</span>}
          </div>
          <AsyncSearchableSelect
            value={templateId}
            onValueChange={(value) => void loadTemplate(value)}
            fetchOptions={fetchTemplates}
            placeholder="Select Task Template..."
            searchPlaceholder="Search PM templates..."
            disabled={!assetId || templateLoading}
          />
        </div>

        <PmAssignmentTaskPlanner
          tasks={tasks}
          onChange={setTasks}
          assetId={assetId}
          componentId={componentId}
          targetConfirmed={targetConfirmed}
          disabled={saving || templateLoading}
        />
      </div>
    </ResponsiveDialog>
  );
}
