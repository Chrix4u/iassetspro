'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { api, useAbortRef } from '@/lib/api';
import { toast } from 'sonner';

export interface WOAttachment {
  id: string;
  fileName: string;
  fileType: string;
  fileSize: number;
  filePath: string;
  entityType: string;
  entityId: string;
  uploadedById: string;
  uploadedAt: string;
  description: string | null;
  uploadedBy: { id: string; fullName: string; username: string } | null;
}

interface UseWOAttachmentsReturn {
  attachments: WOAttachment[];
  isLoading: boolean;
  uploading: boolean;
  upload: (file: File, options?: { description?: string; category?: string }) => Promise<WOAttachment | null>;
  remove: (attachmentId: string) => Promise<boolean>;
  refetch: () => Promise<void>;
}

export function useWOAttachments(workOrderId: string): UseWOAttachmentsReturn {
  const abortRef = useAbortRef();
  const [attachments, setAttachments] = useState<WOAttachment[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const refetch = useCallback(async () => {
    if (!workOrderId) return;
    setIsLoading(true);
    try {
      const res = await api.get<WOAttachment[]>(`/api/work-orders/${workOrderId}/attachments`, {
        signal: abortRef.current.signal,
        timeout: 15_000,
      });
      if (res.success && res.data && mountedRef.current) {
        setAttachments(Array.isArray(res.data) ? res.data : []);
      }
    } catch {
      /* silent */
    } finally {
      if (mountedRef.current) setIsLoading(false);
    }
  }, [workOrderId, abortRef]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  const upload = useCallback(async (
    file: File,
    options?: { description?: string; category?: string }
  ): Promise<WOAttachment | null> => {
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      if (options?.description) formData.append('description', options.description);
      if (options?.category) formData.append('category', options.category);

      const res = await fetch(`/api/work-orders/${workOrderId}/attachments`, {
        method: 'POST',
        body: formData,
        headers: { ...getAuthHeaders() },
      });

      const json = await res.json();
      if (res.ok && json.success && mountedRef.current) {
        const attachment = json.data as WOAttachment;
        setAttachments(prev => [attachment, ...prev]);
        toast.success('File uploaded');
        return attachment;
      }
      toast.error(json.error || 'Upload failed');
      return null;
    } catch {
      toast.error('Failed to upload file');
      return null;
    } finally {
      if (mountedRef.current) setUploading(false);
    }
  }, [workOrderId]);

  const remove = useCallback(async (attachmentId: string): Promise<boolean> => {
    try {
      const res = await api.delete(`/api/work-orders/${workOrderId}/attachments/${attachmentId}`);
      if (res.success && mountedRef.current) {
        setAttachments(prev => prev.filter(a => a.id !== attachmentId));
        toast.success('Attachment removed');
        return true;
      }
      toast.error('Failed to remove attachment');
      return false;
    } catch {
      toast.error('Failed to remove attachment');
      return false;
    }
  }, [workOrderId]);

  return { attachments, isLoading, uploading, upload, remove, refetch };
}

function getAuthHeaders(): Record<string, string> {
  if (typeof window === 'undefined') return {};
  const token = localStorage.getItem('eam_token');
  const plantId = localStorage.getItem('user_plant_id');
  const headers: Record<string, string> = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;
  if (plantId) headers['x-plant-id'] = plantId;
  return headers;
}
