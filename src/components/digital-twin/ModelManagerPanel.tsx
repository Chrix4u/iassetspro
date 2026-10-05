'use client';

import React, { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import {
  Upload, Search, MoreVertical, Eye, Trash2, RefreshCw,
  CheckCircle2, XCircle, Loader2, HardDrive, Box,
  Download,
  type LucideIcon,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Skeleton } from '@/components/ui/skeleton';

interface ModelRecord {
  id: string;
  name: string;
  description?: string;
  originalFile: string;
  format: string;
  fileSize: number;
  version: number;
  status: string;
  thumbnail?: string;
  dracoCompressed: boolean;
  optimizedForWeb: boolean;
  createdAt: string;
  updatedAt: string;
  uploadedBy: { id: string; name: string; fullName?: string };
  asset?: { id: string; name: string };
  plant?: { id: string; name: string };
  _count: { scenes: number; versions: number };
}

interface ModelManagerPanelProps {
  onSelectModel?: (model: ModelRecord) => void;
  onClose?: () => void;
}

export function ModelManagerPanel({ onSelectModel, onClose }: ModelManagerPanelProps) {
  const [models, setModels] = useState<ModelRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [formatFilter, setFormatFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [stats, setStats] = useState<Record<string, unknown> | null>(null);

  useEffect(() => {
    fetchModels();
  }, [search, formatFilter, statusFilter, page]);

  const fetchModels = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: '20' });
      if (search) params.set('search', search);
      if (formatFilter !== 'all') params.set('format', formatFilter);
      if (statusFilter !== 'all') params.set('status', statusFilter);
      const res = await api.get(`/api/model-library?${params}`);
      if (res.success) {
        setModels(res.data?.data || []);
        setStats(res.data?.stats || null);
      }
    } catch (err) {
      console.error('Failed to fetch models:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this model? This cannot be undone.')) return;
    try {
      await api.delete(`/api/model-library/${id}`);
      fetchModels();
    } catch (err) {
      console.error('Failed to delete model:', err);
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1048576).toFixed(1)} MB`;
  };

  const statusConfig: Record<string, { icon: LucideIcon; color: string; bg: string }> = {
    ready: { icon: CheckCircle2, color: 'text-emerald-600', bg: 'bg-emerald-50 dark:bg-emerald-950/30' },
    processing: { icon: Loader2, color: 'text-amber-600', bg: 'bg-amber-50 dark:bg-amber-950/30' },
    failed: { icon: XCircle, color: 'text-red-600', bg: 'bg-red-50 dark:bg-red-950/30' },
    archived: { icon: HardDrive, color: 'text-slate-600', bg: 'bg-slate-50 dark:bg-slate-950/30' },
  };

  return (
    <div className="space-y-4">
      {/* Stats row */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: 'Total Models', value: stats.totalCount, icon: Box, color: 'text-sky-600 bg-sky-50 dark:bg-sky-950/30' },
            { label: 'Ready', value: stats.readyCount, icon: CheckCircle2, color: 'text-emerald-600 bg-emerald-50 dark:bg-emerald-950/30' },
            { label: 'Processing', value: stats.processingCount, icon: Loader2, color: 'text-amber-600 bg-amber-50 dark:bg-amber-950/30' },
            { label: 'Storage', value: formatFileSize(stats.totalSizeBytes as number), icon: HardDrive, color: 'text-violet-600 bg-violet-50 dark:bg-violet-950/30' },
          ].map(s => (
            <Card key={s.label} className="border-0 shadow-sm">
              <CardContent className="p-3 flex items-center gap-3">
                <div className={`h-9 w-9 rounded-lg flex items-center justify-center ${s.color.split(' ')[1]}`}>
                  <s.icon className={`h-4 w-4 ${s.color.split(' ')[0]}`} />
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{s.label}</p>
                  <p className="text-sm font-bold">{String(s.value)}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Filters */}
      <Card className="border-0 shadow-sm">
        <CardContent className="p-3">
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Search models..." value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} className="pl-9 h-9" />
            </div>
            <Select value={formatFilter} onValueChange={v => { setFormatFilter(v); setPage(1); }}>
              <SelectTrigger className="h-9 w-full sm:w-32"><SelectValue placeholder="Format" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Formats</SelectItem>
                <SelectItem value="glb">GLB</SelectItem>
                <SelectItem value="gltf">GLTF</SelectItem>
                <SelectItem value="fbx">FBX</SelectItem>
                <SelectItem value="obj">OBJ</SelectItem>
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={v => { setStatusFilter(v); setPage(1); }}>
              <SelectTrigger className="h-9 w-full sm:w-36"><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="ready">Ready</SelectItem>
                <SelectItem value="processing">Processing</SelectItem>
                <SelectItem value="failed">Failed</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Model list */}
      <div className="space-y-2">
        {loading ? (
          Array.from({ length: 3 }).map((_, i) => (
            <Card key={i} className="border-0 shadow-sm"><CardContent className="p-4"><Skeleton className="h-16 w-full" /></CardContent></Card>
          ))
        ) : models.length === 0 ? (
          <Card className="border-0 shadow-sm"><CardContent className="p-8 text-center"><Box className="h-10 w-10 mx-auto text-muted-foreground mb-2" /><p className="text-sm text-muted-foreground">No models found</p></CardContent></Card>
        ) : (
          models.map(model => {
            const sc = statusConfig[model.status] || statusConfig.processing;
            const StatusIcon = sc.icon;
            return (
              <Card key={model.id} className="border-0 shadow-sm hover:shadow-md transition-shadow cursor-pointer group" onClick={() => onSelectModel?.(model)}>
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <div className={`h-10 w-10 rounded-lg flex items-center justify-center shrink-0 ${sc.bg}`}>
                      <StatusIcon className={`h-5 w-5 ${sc.color} ${model.status === 'processing' ? 'animate-spin' : ''}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-semibold text-sm truncate">{model.name}</p>
                        <Badge variant="outline" className="text-[10px] uppercase shrink-0">{model.format}</Badge>
                        <Badge variant="secondary" className="text-[10px] shrink-0">v{model.version}</Badge>
                        {model.dracoCompressed && <Badge variant="outline" className="text-[10px] text-emerald-600 border-emerald-200">DRACO</Badge>}
                        {model.optimizedForWeb && <Badge variant="outline" className="text-[10px] text-sky-600 border-sky-200">WEB</Badge>}
                      </div>
                      <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1 text-xs text-muted-foreground">
                        <span>{formatFileSize(model.fileSize)}</span>
                        <span>{model.originalFile}</span>
                        {model.asset && <span>Asset: {model.asset.name}</span>}
                        <span>{model._count.scenes} scene{model._count.scenes !== 1 ? 's' : ''}</span>
                      </div>
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild onClick={e => e.stopPropagation()}>
                        <Button variant="ghost" size="icon" className="h-8 w-8 opacity-0 group-hover:opacity-100"><MoreVertical className="h-4 w-4" /></Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => onSelectModel?.(model)}><Eye className="h-4 w-4 mr-2" />View Details</DropdownMenuItem>
                        <DropdownMenuItem><Download className="h-4 w-4 mr-2" />Download</DropdownMenuItem>
                        <DropdownMenuItem variant="destructive" onClick={() => handleDelete(model.id)}><Trash2 className="h-4 w-4 mr-2" />Delete</DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </CardContent>
              </Card>
            );
          })
        )}
      </div>
    </div>
  );
}
