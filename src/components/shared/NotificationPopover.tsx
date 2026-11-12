'use client';

import React, { useState, useCallback, useEffect, useRef } from 'react';
import { format } from 'date-fns';
import { useNavigationStore } from '@/stores/navigationStore';
import { api } from '@/lib/api';
import { timeAgo } from '@/components/shared/helpers';
import { useWebSocket } from '@/hooks/useWebSocket';
import type { PageName, Notification } from '@/types';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { ResponsiveDialog } from '@/components/shared/ResponsiveDialog';

import {
  Bell,
  CheckCircle2,
  XCircle,
  ClipboardList,
  Wrench,
  Settings,
  MessageSquare,
  Check,
  ExternalLink,
  Clock,
  UserPlus,
  UserCheck,
  UserX,
} from 'lucide-react';

function NotificationPopover() {
  const navigate = useNavigationStore(s => s.navigate);
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedNotif, setSelectedNotif] = useState<Notification | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [pulseAnimation, setPulseAnimation] = useState(false);
  const [pendingRequestCount, setPendingRequestCount] = useState(0);
  const { on: wsOn, connected } = useWebSocket();
  const pulseTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const typeColors: Record<string, string> = {
    mr_assigned: 'bg-sky-100 text-sky-600 dark:bg-sky-900/30 dark:text-sky-400',
    wo_assigned: 'bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400',
    wo_completed: 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400',
    mr_approved: 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400',
    mr_rejected: 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400',
    wo_team_request: 'bg-violet-100 text-violet-600 dark:bg-violet-900/30 dark:text-violet-400',
    wo_team_approved: 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400',
    wo_team_request_approved: 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400',
    wo_team_request_rejected: 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400',
    system: 'bg-slate-100 text-slate-600 dark:bg-slate-800/50 dark:text-slate-400',
    info: 'bg-slate-50 text-slate-500 dark:bg-slate-800/30 dark:text-slate-400',
  };

  const typeIcons: Record<string, React.ElementType> = {
    mr_assigned: ClipboardList,
    wo_assigned: Wrench,
    wo_completed: CheckCircle2,
    mr_approved: CheckCircle2,
    mr_rejected: XCircle,
    wo_team_request: UserPlus,
    wo_team_approved: UserCheck,
    wo_team_request_approved: UserCheck,
    wo_team_request_rejected: UserX,
    system: Settings,
    info: MessageSquare,
  };

  const triggerPulse = useCallback(() => {
    setPulseAnimation(true);
    if (pulseTimeoutRef.current) clearTimeout(pulseTimeoutRef.current);
    pulseTimeoutRef.current = setTimeout(() => setPulseAnimation(false), 2000);
  }, []);

  const loadNotifications = useCallback(() => {
    setLoading(true);
    api.get('/api/notifications').then(res => {
      if (res.success && res.data) {
        const data = (res.data as Record<string, unknown>).notifications || res.data;
        setNotifications(Array.isArray(data) ? data : []);
      }
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const loadPendingCount = useCallback(() => {
    api.get('/api/maintenance-requests/pending-count').then(res => {
      if (res.success && res.data?.count !== undefined) {
        setPendingRequestCount(res.data.count as number);
      }
    }).catch(() => {});
  }, []);

  const handlePopoverChange = (newOpen: boolean) => {
    setOpen(newOpen);
    if (newOpen) loadNotifications();
  };

  // Initial load and polling fallback
  useEffect(() => {
    loadNotifications();
    loadPendingCount();
    const interval = setInterval(() => {
      loadNotifications();
      loadPendingCount();
    }, 60000);
    return () => clearInterval(interval);
  }, [loadNotifications, loadPendingCount]);

  // WebSocket: listen for real-time notifications
  useEffect(() => {
    const cleanup = wsOn('notification', (data: unknown) => {
      const notification = data as Record<string, unknown>;
      console.log('[NotificationPopover] Received real-time notification:', notification);

      // Trigger bell pulse animation
      triggerPulse();

      // Refresh the notification list to show the new notification
      loadNotifications();
      // Also refresh pending request count
      loadPendingCount();
    });

    return cleanup;
  }, [wsOn, loadNotifications, loadPendingCount, triggerPulse]);

  // Cleanup pulse timeout on unmount
  useEffect(() => {
    return () => {
      if (pulseTimeoutRef.current) clearTimeout(pulseTimeoutRef.current);
    };
  }, []);

  const unreadCount = notifications.filter(n => !n.isRead).length;

  const handleNotificationClick = async (n: Notification) => {
    if (!n.isRead) {
      await api.put(`/api/notifications/${n.id}`, { read: true }).catch(() => {});
      setNotifications(prev => prev.map(x => x.id === n.id ? { ...x, isRead: true } : x));
    }
    // If notification has an action URL, navigate directly instead of opening a dialog
    if (n.actionUrl) {
      setOpen(false);
      const [pagePart, queryPart] = (n.actionUrl as string).split('?');
      const params: Record<string, string> = {};
      if (queryPart) {
        const qs = new URLSearchParams(queryPart);
        qs.forEach((v, k) => { params[k] = v; });
      }
      navigate(pagePart as PageName, params);
    } else {
      setSelectedNotif(n);
      setDetailOpen(true);
    }
  };

  const handleMarkAllRead = async () => {
    await api.put('/api/notifications/read-all');
    setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
  };

  const handleViewAll = () => {
    setOpen(false);
    navigate('notifications');
  };

  const handleViewPendingRequests = () => {
    setOpen(false);
    navigate('maintenance-requests' as PageName, { status: 'pending,approved', autoOpen: 'first' });
  };

  const handleGoToAction = () => {
    if (!selectedNotif?.actionUrl) return;
    const url = selectedNotif.actionUrl as string;
    // Parse actionUrl like "mr-detail?id=xxx" or "wo-detail?id=xxx"
    const [pagePart, queryPart] = url.split('?');
    const params: Record<string, string> = {};
    if (queryPart) {
      const qs = new URLSearchParams(queryPart);
      qs.forEach((v, k) => { params[k] = v; });
    }
    navigate(pagePart as PageName, params);
    setDetailOpen(false);
    setOpen(false);
  };

  return (
    <>
      <Popover open={open} onOpenChange={handlePopoverChange}>
        <PopoverTrigger asChild>
          <Button variant="ghost" size="icon" className="relative h-9 w-9 hover:bg-muted transition-colors">
            <Bell className={`h-4 w-4 text-muted-foreground transition-transform duration-300 ${pulseAnimation ? 'animate-bell-ring text-emerald-500 scale-110' : ''}`} />
            {(unreadCount > 0 || pendingRequestCount > 0) && (
              <span className={`absolute -top-0.5 -right-0.5 min-h-[16px] min-w-[16px] h-4 px-1 flex items-center justify-center rounded-full text-[10px] font-bold text-white shadow-sm transition-transform duration-300 ${pendingRequestCount > 0 ? 'bg-amber-500' : pulseAnimation ? 'bg-emerald-400 scale-125' : 'bg-emerald-500'}`}>
                {unreadCount + pendingRequestCount > 9 ? '9+' : unreadCount + pendingRequestCount}
              </span>
            )}
            {/* WebSocket connected indicator dot */}
            {connected && (
              <span className="absolute bottom-0 right-0 h-2 w-2 rounded-full bg-emerald-400 border border-background" />
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-96 p-0 gap-0 overflow-hidden" sideOffset={8}>
          {/* Popover header */}
          <div className="flex items-center justify-between px-4 py-3 border-b bg-muted/30">
            <div className="flex items-center gap-2">
              <Bell className="h-4 w-4 text-emerald-600" />
              <span className="text-sm font-semibold">Notifications</span>
              {unreadCount > 0 && (
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700 font-semibold dark:bg-emerald-900/40 dark:text-emerald-300">
                  {unreadCount} new
                </span>
              )}
            </div>
            <div className="flex items-center gap-1">
              {unreadCount > 0 && (
                <Button variant="ghost" size="sm" className="h-7 text-xs text-muted-foreground hover:text-foreground gap-1 px-2" onClick={handleMarkAllRead}>
                  <Check className="h-3 w-3" />
                  Mark all read
                </Button>
              )}
              <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-medium ${connected ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300' : 'bg-muted text-muted-foreground'}`}>
                {connected ? 'Live' : 'Polling'}
              </span>
            </div>
          </div>

          {/* Pending Requests Banner (for supervisors/admins) */}
          {pendingRequestCount > 0 && (
            <button
              onClick={handleViewPendingRequests}
              className="w-full flex items-center gap-3 px-4 py-3 text-left transition-colors border-b border-amber-200 dark:border-amber-900/40 bg-amber-50/80 dark:bg-amber-950/20 hover:bg-amber-100/80 dark:hover:bg-amber-950/40"
            >
              <div className="h-8 w-8 rounded-lg bg-amber-100 dark:bg-amber-900/50 flex items-center justify-center shrink-0">
                <Clock className="h-4 w-4 text-amber-600 dark:text-amber-400" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <p className="text-sm font-semibold text-amber-700 dark:text-amber-300">Pending Requests</p>
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-200 text-amber-800 font-bold dark:bg-amber-800/60 dark:text-amber-200">
                    {pendingRequestCount}
                  </span>
                </div>
                <p className="text-xs text-amber-600/70 dark:text-amber-400/70 mt-0.5">Maintenance requests awaiting your review</p>
              </div>
              <ExternalLink className="h-3.5 w-3.5 text-amber-400 shrink-0" />
            </button>
          )}

          {/* Notification list */}
          <div className="max-h-[340px] overflow-y-auto">
            {loading ? (
              <div className="flex flex-col gap-2 p-4">
                {[1, 2, 3].map(i => (
                  <div key={i} className="flex items-start gap-3 animate-pulse">
                    <div className="h-8 w-8 rounded-lg bg-muted shrink-0" />
                    <div className="flex-1 space-y-1.5">
                      <div className="h-3 w-3/4 rounded bg-muted" />
                      <div className="h-2.5 w-full rounded bg-muted/70" />
                    </div>
                  </div>
                ))}
              </div>
            ) : notifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-center px-4">
                {pendingRequestCount > 0 ? (
                  <>
                    <div className="h-10 w-10 rounded-full bg-amber-100 dark:bg-amber-900/50 flex items-center justify-center mb-3">
                      <Clock className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                    </div>
                    <p className="text-sm font-medium text-foreground">No notifications yet</p>
                    <p className="text-xs text-muted-foreground mt-1">But you have <span className="font-semibold text-amber-600 dark:text-amber-400">{pendingRequestCount} pending request{pendingRequestCount > 1 ? 's' : ''}</span> to review above</p>
                  </>
                ) : (
                  <>
                    <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center mb-3">
                      <Bell className="h-5 w-5 text-muted-foreground" />
                    </div>
                    <p className="text-sm font-medium text-muted-foreground">No notifications</p>
                    <p className="text-xs text-muted-foreground/60 mt-0.5">You&apos;re all caught up!</p>
                  </>
                )}
              </div>
            ) : (
              notifications.slice(0, 10).map(n => {
                const Icon = typeIcons[n.type] || MessageSquare;
                const colorClass = typeColors[n.type] || typeColors.info;
                return (
                  <button
                    key={n.id}
                    className={`w-full flex items-start gap-3 px-4 py-3 text-left transition-colors border-b border-border/50 last:border-b-0 hover:bg-muted/40 ${!n.isRead ? 'bg-emerald-50/30 dark:bg-emerald-950/10' : ''}`}
                    onClick={() => handleNotificationClick(n)}
                  >
                    <div className={`h-8 w-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${colorClass}`}>
                      <Icon className="h-3.5 w-3.5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <p className={`text-sm truncate ${!n.isRead ? 'font-semibold' : 'font-medium text-muted-foreground'}`}>{n.title}</p>
                        {!n.isRead && <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 shrink-0" />}
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{n.message}</p>
                      <p className="text-[10px] text-muted-foreground/50 mt-1">{timeAgo(n.createdAt)}</p>
                    </div>
                  </button>
                );
              })
            )}
          </div>

          {/* View All footer */}
          {notifications.length > 0 && (
            <div className="border-t bg-muted/20 px-2 py-1.5">
              <Button
                variant="ghost"
                className="w-full h-8 text-xs font-medium text-muted-foreground hover:text-foreground gap-1.5"
                onClick={handleViewAll}
              >
                View all notifications
                <ExternalLink className="h-3 w-3" />
              </Button>
            </div>
          )}
        </PopoverContent>
      </Popover>

      {/* Notification Detail Dialog */}
      <ResponsiveDialog open={detailOpen} onOpenChange={setDetailOpen}>
          {selectedNotif && (
            <>
              <div className="space-y-1.5 mb-4">
                <div className="flex items-center gap-3">
                  <div className={`h-10 w-10 rounded-xl flex items-center justify-center shrink-0 ${(typeColors[selectedNotif.type] || typeColors.info)}`}>
                    {React.createElement(typeIcons[selectedNotif.type] || MessageSquare, { className: 'h-5 w-5' })}
                  </div>
                  <div className="min-w-0 flex-1">
                    <h2 className="text-base font-semibold leading-none tracking-tight">{selectedNotif.title}</h2>
                    <p className="text-xs mt-0.5 text-muted-foreground">{timeAgo(selectedNotif.createdAt)}</p>
                  </div>
                </div>
              </div>
              <div className="space-y-4 py-2">
                <div className="rounded-lg bg-muted/40 border p-4">
                  <p className="text-sm leading-relaxed">{selectedNotif.message}</p>
                </div>
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div className="space-y-1">
                    <span className="text-muted-foreground">Type</span>
                    <Badge variant="outline" className="text-[10px] uppercase tracking-wider font-semibold">
                      {(selectedNotif.type || 'info').replace(/_/g, ' ')}
                    </Badge>
                  </div>
                  {selectedNotif.entityType && (
                    <div className="space-y-1">
                      <span className="text-muted-foreground">Entity</span>
                      <Badge variant="outline" className="text-[10px] uppercase tracking-wider">
                        {selectedNotif.entityType.replace(/_/g, ' ')}
                      </Badge>
                    </div>
                  )}
                  <div className="space-y-1">
                    <span className="text-muted-foreground">Status</span>
                    <div className="flex items-center gap-1.5">
                      <span className={`h-2 w-2 rounded-full ${selectedNotif.isRead ? 'bg-muted-foreground/40' : 'bg-emerald-500'}`} />
                      <span className="font-medium">{selectedNotif.isRead ? 'Read' : 'Unread'}</span>
                    </div>
                  </div>
                  <div className="space-y-1">
                    <span className="text-muted-foreground">Received</span>
                    <span className="font-medium">
                      {selectedNotif.createdAt ? format(new Date(selectedNotif.createdAt), 'MMM d, yyyy \'at\' h:mm a') : '—'}
                    </span>
                  </div>
                </div>
              </div>
              <div className="flex flex-col-reverse gap-2 mt-4 sm:flex-row sm:justify-end">
                {selectedNotif.actionUrl && (
                  <Button onClick={handleGoToAction} className="gap-1.5">
                    <ExternalLink className="h-3.5 w-3.5" />
                    View Details
                  </Button>
                )}
                <Button variant="outline" onClick={() => setDetailOpen(false)}>
                  Close
                </Button>
              </div>
            </>
          )}
      </ResponsiveDialog>
    </>
  );
}

export default NotificationPopover;
