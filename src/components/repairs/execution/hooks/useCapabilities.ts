'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { toast } from 'sonner';

export interface Capabilities {
  canStart: boolean;
  canPause: boolean;
  canResume: boolean;
  canLogOwnTime: boolean;
  canLogTeamTime: boolean;
  canRequestTools: boolean;
  canRequestMaterials: boolean;
  canRequestAssistance: boolean;
  canHandover: boolean;
  canSubmitCompletion: boolean;
  canVerify: boolean;
  canClose: boolean;
  isTeamLeader: boolean;
  isTeamMember: boolean;
  isSupervisor: boolean;
  isPlanner: boolean;
  isAdmin: boolean;
}

export interface StartReadinessItem {
  code: string;
  category: string;
  message: string;
  severity: 'blocker' | 'warning';
}

export interface StartReadiness {
  ready: boolean;
  blockers: StartReadinessItem[];
  warnings: StartReadinessItem[];
}

interface CapabilitiesResult {
  capabilities: Capabilities | null;
  startReadiness: StartReadiness | null;
  startReadinessError: string | null;
  isLoading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

/**
 * Apply the server-authoritative start-readiness result to the capability set.
 * Capabilities determine who may start; readiness determines whether the
 * currently authorised user may start this work order right now.
 *
 * A missing readiness result fails closed for Start. The mutation endpoint is
 * still authoritative, but the UI must not invite a technician to start work
 * while the preflight cannot be verified.
 */
export function mergeStartReadiness(
  capabilities: Capabilities,
  readiness: StartReadiness | null,
): Capabilities {
  if (!capabilities.canStart) {
    return capabilities;
  }

  if (!readiness || !readiness.ready) {
    return { ...capabilities, canStart: false };
  }

  return capabilities;
}

/**
 * Fetches server-authoritative capabilities for a work order and, whenever the
 * user is otherwise allowed to start, also checks phase=start readiness.
 *
 * Start preflight is fail-safe: loading/transport/API failures never create a
 * Start capability. Confirmed blockers and readiness failures remain visible
 * as persistent notices until a later successful refresh clears them. POST
 * /start remains the final enforcement point for races after the read check.
 */
export function useCapabilities(workOrderId: string | undefined): CapabilitiesResult {
  const [capabilities, setCapabilities] = useState<Capabilities | null>(null);
  const [startReadiness, setStartReadiness] = useState<StartReadiness | null>(null);
  const [startReadinessError, setStartReadinessError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mountedRef = useRef(true);
  const readinessNoticeRef = useRef<string>('');

  const fetchCapabilities = useCallback(async () => {
    if (!workOrderId) return;
    setIsLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/work-orders/${workOrderId}/capabilities`, { cache: 'no-store' });
      const json = await res.json();
      if (!mountedRef.current) return;

      if (!res.ok || !json.success) {
        setCapabilities(null);
        setError(json.error || 'Failed to fetch capabilities');
        return;
      }

      const rawCapabilities = json.data as Capabilities;
      let readiness: StartReadiness | null = null;

      if (rawCapabilities.canStart) {
        setStartReadinessError(null);

        try {
          const readinessRes = await fetch(
            `/api/work-orders/${workOrderId}/readiness?phase=start`,
            { cache: 'no-store' },
          );
          const readinessJson = await readinessRes.json();

          if (!mountedRef.current) return;

          if (!readinessRes.ok || !readinessJson.success || !readinessJson.data) {
            const message = readinessJson.error || 'Unable to verify start readiness';
            setStartReadiness(null);
            setStartReadinessError(message);
            readinessNoticeRef.current = '';
            toast.error('Start preflight unavailable', {
              description: `${message}. Start is disabled until readiness can be verified.`,
              duration: Infinity,
              id: `start-readiness-${workOrderId}`,
            });
          } else {
            readiness = readinessJson.data as StartReadiness;
            setStartReadiness(readiness);
            setStartReadinessError(null);

            const blockerMessages = readiness.blockers.map((item) => item.message);
            const warningMessages = readiness.warnings.map((item) => item.message);
            const noticeSignature = JSON.stringify({ blockerMessages, warningMessages });

            if (readiness.ready && blockerMessages.length === 0 && warningMessages.length === 0) {
              readinessNoticeRef.current = '';
              toast.dismiss(`start-readiness-${workOrderId}`);
            } else if (noticeSignature !== readinessNoticeRef.current) {
              readinessNoticeRef.current = noticeSignature;

              if (blockerMessages.length > 0) {
                toast.error('Work is not ready to start', {
                  description: blockerMessages.join(' • '),
                  duration: Infinity,
                  id: `start-readiness-${workOrderId}`,
                });
              } else if (warningMessages.length > 0) {
                toast.warning('Start readiness warnings', {
                  description: warningMessages.join(' • '),
                  duration: 12_000,
                  id: `start-readiness-${workOrderId}`,
                });
              }
            }
          }
        } catch (err) {
          if (!mountedRef.current) return;
          const message = err instanceof Error ? err.message : 'Unable to verify start readiness';
          setStartReadiness(null);
          setStartReadinessError(message);
          readinessNoticeRef.current = '';
          toast.error('Start preflight unavailable', {
            description: 'Start is disabled until readiness can be verified. The check will retry automatically.',
            duration: Infinity,
            id: `start-readiness-${workOrderId}`,
          });
        }
      } else {
        setStartReadiness(null);
        setStartReadinessError(null);
        readinessNoticeRef.current = '';
        toast.dismiss(`start-readiness-${workOrderId}`);
      }

      if (mountedRef.current) {
        setCapabilities(mergeStartReadiness(rawCapabilities, readiness));
      }
    } catch (err) {
      if (!mountedRef.current) return;
      setCapabilities(null);
      setError(err instanceof Error ? err.message : 'Network error');
    } finally {
      if (mountedRef.current) setIsLoading(false);
    }
  }, [workOrderId]);

  useEffect(() => {
    mountedRef.current = true;
    setCapabilities(null);
    setStartReadiness(null);
    setStartReadinessError(null);
    setError(null);
    readinessNoticeRef.current = '';
    void fetchCapabilities();

    // Refresh unconditionally while the workspace is mounted so readiness can
    // recover automatically after another role resolves a blocker.
    intervalRef.current = setInterval(() => {
      void fetchCapabilities();
    }, 30_000);

    return () => {
      mountedRef.current = false;
      toast.dismiss(`start-readiness-${workOrderId}`);
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [fetchCapabilities, workOrderId]);

  return {
    capabilities,
    startReadiness,
    startReadinessError,
    isLoading,
    error,
    refetch: fetchCapabilities,
  };
}

export default useCapabilities;
