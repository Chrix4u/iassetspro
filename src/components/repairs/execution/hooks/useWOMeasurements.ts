'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { api, useAbortRef } from '@/lib/api';
import { toast } from 'sonner';

export interface WOMeasurement {
  id: string;
  componentId: string;
  parameterKey: string;
  value: number;
  unit: string;
  quality: number;
  minThreshold: number | null;
  maxThreshold: number | null;
  isAlarm: boolean;
  source: string;
  recordedAt: string;
  recordedById: string | null;
  recordedBy: { id: string; fullName: string; username: string } | null;
  component: { id: string; name: string; componentCode: string | null } | null;
  pendingSync?: boolean;
}

export interface AddMeasurementParams {
  componentId?: string;
  parameterKey: string;
  value: number;
  unit: string;
  beforeAfter?: 'before' | 'after';
  acceptableMin?: number;
  acceptableMax?: number;
  notes?: string;
}

interface UseWOMeasurementsReturn {
  measurements: WOMeasurement[];
  isLoading: boolean;
  addMeasurement: (data: AddMeasurementParams) => Promise<WOMeasurement | null>;
  refetch: () => Promise<void>;
}

export function useWOMeasurements(workOrderId: string): UseWOMeasurementsReturn {
  const abortRef = useAbortRef();
  const [measurements, setMeasurements] = useState<WOMeasurement[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const refetch = useCallback(async () => {
    if (!workOrderId) return;
    setIsLoading(true);
    try {
      const res = await api.get<WOMeasurement[]>(`/api/work-orders/${workOrderId}/measurements`, {
        signal: abortRef.current.signal,
        timeout: 15_000,
      });
      if (res.success && res.data && mountedRef.current) {
        setMeasurements(Array.isArray(res.data) ? res.data : []);
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

  const addMeasurement = useCallback(async (data: AddMeasurementParams): Promise<WOMeasurement | null> => {
    try {
      const res = await api.post<WOMeasurement>(
        `/api/work-orders/${workOrderId}/measurements`,
        {
          componentId: data.componentId,
          parameterKey: data.parameterKey,
          value: data.value,
          unit: data.unit,
          acceptableMin: data.acceptableMin,
          acceptableMax: data.acceptableMax,
        },
        { timeout: 10_000 }
      );
      if (res.success && res.data && mountedRef.current) {
        setMeasurements(prev => [res.data!, ...prev]);
        toast.success(
          res.offlineQueued
            ? 'Reading saved offline — will sync when connected'
            : 'Measurement recorded',
        );
        return res.data;
      }
      toast.error(res.error || 'Failed to record measurement');
      return null;
    } catch {
      toast.error('Failed to record measurement');
      return null;
    }
  }, [workOrderId]);

  return { measurements, isLoading, addMeasurement, refetch };
}
