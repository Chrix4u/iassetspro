"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  AlertTriangle,
  Clock,
  Wrench,
  User,
  Building2,
  Timer,
  MapPin,
  CalendarDays,
  CalendarRange,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { ResponsiveDialog } from "@/components/shared/ResponsiveDialog";
import { api } from "@/lib/api";
import { useAuthStore } from "@/stores/authStore";
import { useNavigationStore } from "@/stores/navigationStore";
import { cn } from "@/lib/utils";
import type { PmSchedule } from "@/types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PmScheduleWithRelations extends PmSchedule {
  department?: { id: string; name: string; code: string } | null;
  createdBy?: { id: string; fullName: string; username: string } | null;
  template?: { id: string; title: string; type: string; _count: { tasks: number } } | null;
  component?: { id: string; name: string; componentCode: string; componentType: string; parentId?: string | null; assetId?: string | null } | null;
  assignedTo?: { id: string; fullName: string; username: string }[];
}

type CalendarView = "month" | "week";

interface CalendarDay {
  date: Date;
  isCurrentMonth: boolean;
  isToday: boolean;
  schedules: PmScheduleWithRelations[];
}

// ---------------------------------------------------------------------------
// Helper Functions
// ---------------------------------------------------------------------------

function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

function getFirstDayOfMonth(year: number, month: number): number {
  // Returns 0=Mon, 1=Tue, ... 6=Sun (adjusted for Monday start)
  const day = new Date(year, month, 1).getDay();
  return day === 0 ? 6 : day - 1; // convert Sun=0 → 6, Mon=1 → 0, etc.
}

function isSameDay(date1: Date, date2: Date): boolean {
  return (
    date1.getFullYear() === date2.getFullYear() &&
    date1.getMonth() === date2.getMonth() &&
    date1.getDate() === date2.getDate()
  );
}

function isOverdue(nextDueDate?: string | null): boolean {
  if (!nextDueDate) return false;
  const due = new Date(nextDueDate);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  due.setHours(0, 0, 0, 0);
  return due < today;
}

function isDueSoon(nextDueDate?: string | null, leadDays: number = 3): boolean {
  if (!nextDueDate) return false;
  const due = new Date(nextDueDate);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  due.setHours(0, 0, 0, 0);
  const diffMs = due.getTime() - today.getTime();
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  return diffDays >= 0 && diffDays <= leadDays;
}

function formatCalendarDate(date: Date): string {
  return date.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatTimeAgo(dateStr?: string | null): string {
  if (!dateStr) return "N/A";
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 0) return `In ${Math.abs(diffDays)} days`;
  if (diffDays < 30) return `${diffDays} days ago`;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function formatFrequency(type: string, value: number): string {
  const labels: Record<string, string> = {
    daily: "Day",
    weekly: "Week",
    biweekly: "2 Weeks",
    monthly: "Month",
    quarterly: "Quarter",
    semiannual: "6 Months",
    yearly: "Year",
  };
  const label = labels[type] || type;
  return `Every ${value > 1 ? value + " " : ""}${label}${value > 1 ? "s" : ""}`;
}

function formatDuration(minutes?: number | null): string {
  if (!minutes) return "N/A";
  const hrs = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hrs === 0) return `${mins}m`;
  if (mins === 0) return `${hrs}h`;
  return `${hrs}h ${mins}m`;
}

// ---------------------------------------------------------------------------
// Priority Helpers
// ---------------------------------------------------------------------------

const PRIORITY_COLORS: Record<string, { bg: string; text: string; border: string; dot: string; badge: string }> = {
  critical: {
    bg: "bg-red-50 dark:bg-red-950/40",
    text: "text-red-700 dark:text-red-300",
    border: "border-red-200 dark:border-red-800",
    dot: "bg-red-500",
    badge: "bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-300",
  },
  high: {
    bg: "bg-orange-50 dark:bg-orange-950/40",
    text: "text-orange-700 dark:text-orange-300",
    border: "border-orange-200 dark:border-orange-800",
    dot: "bg-orange-500",
    badge: "bg-orange-100 text-orange-800 dark:bg-orange-900/50 dark:text-orange-300",
  },
  medium: {
    bg: "bg-amber-50 dark:bg-amber-950/40",
    text: "text-amber-700 dark:text-amber-300",
    border: "border-amber-200 dark:border-amber-800",
    dot: "bg-amber-500",
    badge: "bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-300",
  },
  low: {
    bg: "bg-emerald-50 dark:bg-emerald-950/40",
    text: "text-emerald-700 dark:text-emerald-300",
    border: "border-emerald-200 dark:border-emerald-800",
    dot: "bg-emerald-500",
    badge: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-300",
  },
};

function getPriorityConfig(priority: string) {
  return PRIORITY_COLORS[priority] || PRIORITY_COLORS.medium;
}

// ---------------------------------------------------------------------------
// Day Abbreviations (Mon start)
// ---------------------------------------------------------------------------

const DAY_ABBREVS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const DAY_ABBREVS_SHORT = ["M", "T", "W", "T", "F", "S", "S"];
const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

// ---------------------------------------------------------------------------
// Component: PmCalendarPage
// ---------------------------------------------------------------------------

export default function PmCalendarPage() {
  const { hasPermission, isAdmin } = useAuthStore();
  const { navigate } = useNavigationStore();

  // --- State ---
  const [schedules, setSchedules] = useState<PmScheduleWithRelations[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<CalendarView>("month");
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);
  const [detailSchedule, setDetailSchedule] = useState<PmScheduleWithRelations | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [expandedDay, setExpandedDay] = useState<Date | null>(null);

  const currentYear = currentDate.getFullYear();
  const currentMonth = currentDate.getMonth();
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const canView = hasPermission("pm_schedules.view") || isAdmin();

  // --- Fetch PM Schedules ---
  useEffect(() => {
    if (!canView) {
      setLoading(false);
      return;
    }
    async function fetchSchedules() {
      setLoading(true);
      try {
        const res = await api.get<PmScheduleWithRelations[]>("/api/pm-schedules?isActive=true");
        if (res.success && res.data) {
          setSchedules(res.data.filter((s) => s.nextDueDate));
        }
      } catch {
        // silent fail
      } finally {
        setLoading(false);
      }
    }
    fetchSchedules();
  }, [canView]);

  // --- Build Calendar Days (Month View) ---
  const calendarDays = useMemo<CalendarDay[]>(() => {
    if (view !== "month") return [];

    const days: CalendarDay[] = [];
    const totalDays = getDaysInMonth(currentYear, currentMonth);
    const firstDay = getFirstDayOfMonth(currentYear, currentMonth);

    // Previous month trailing days
    const prevMonth = currentMonth === 0 ? 11 : currentMonth - 1;
    const prevYear = currentMonth === 0 ? currentYear - 1 : currentYear;
    const prevTotalDays = getDaysInMonth(prevYear, prevMonth);

    for (let i = firstDay - 1; i >= 0; i--) {
      const date = new Date(prevYear, prevMonth, prevTotalDays - i);
      days.push({
        date,
        isCurrentMonth: false,
        isToday: isSameDay(date, today),
        schedules: [],
      });
    }

    // Current month days
    for (let day = 1; day <= totalDays; day++) {
      const date = new Date(currentYear, currentMonth, day);
      const daySchedules = schedules.filter((s) => {
        if (!s.nextDueDate) return false;
        const dueDate = new Date(s.nextDueDate);
        return isSameDay(dueDate, date);
      });
      days.push({
        date,
        isCurrentMonth: true,
        isToday: isSameDay(date, today),
        schedules: daySchedules.sort((a, b) => {
          const prioOrder = { critical: 0, high: 1, medium: 2, low: 3 };
          return (prioOrder[a.priority] || 2) - (prioOrder[b.priority] || 2);
        }),
      });
    }

    // Next month leading days (fill to 6 rows = 42 cells, or minimum to complete week)
    const remaining = 42 - days.length;
    const nextMonth = currentMonth === 11 ? 0 : currentMonth + 1;
    const nextYear = currentMonth === 11 ? currentYear + 1 : currentYear;

    for (let day = 1; day <= remaining; day++) {
      const date = new Date(nextYear, nextMonth, day);
      days.push({
        date,
        isCurrentMonth: false,
        isToday: isSameDay(date, today),
        schedules: [],
      });
    }

    return days;
  }, [view, currentYear, currentMonth, schedules, today]);

  // --- Build Calendar Days (Week View) ---
  const weekDays = useMemo<CalendarDay[]>(() => {
    if (view !== "week") return [];

    const refDate = selectedDay || currentDate;
    const dayOfWeek = refDate.getDay();
    // Adjust to Monday start
    const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    const monday = new Date(refDate);
    monday.setDate(refDate.getDate() + mondayOffset);
    monday.setHours(0, 0, 0, 0);

    const days: CalendarDay[] = [];
    for (let i = 0; i < 7; i++) {
      const date = new Date(monday);
      date.setDate(monday.getDate() + i);
      const daySchedules = schedules.filter((s) => {
        if (!s.nextDueDate) return false;
        return isSameDay(new Date(s.nextDueDate), date);
      });
      days.push({
        date,
        isCurrentMonth: date.getMonth() === currentMonth,
        isToday: isSameDay(date, today),
        schedules: daySchedules.sort((a, b) => {
          const prioOrder = { critical: 0, high: 1, medium: 2, low: 3 };
          return (prioOrder[a.priority] || 2) - (prioOrder[b.priority] || 2);
        }),
      });
    }
    return days;
  }, [view, selectedDay, currentDate, currentMonth, schedules, today]);

  const displayDays = view === "month" ? calendarDays : weekDays;

  // --- Navigation handlers ---
  const goToPrev = useCallback(() => {
    if (view === "month") {
      setCurrentDate(new Date(currentYear, currentMonth - 1, 1));
    } else {
      const newDate = new Date(currentDate);
      newDate.setDate(newDate.getDate() - 7);
      setCurrentDate(newDate);
    }
  }, [view, currentYear, currentMonth, currentDate]);

  const goToNext = useCallback(() => {
    if (view === "month") {
      setCurrentDate(new Date(currentYear, currentMonth + 1, 1));
    } else {
      const newDate = new Date(currentDate);
      newDate.setDate(newDate.getDate() + 7);
      setCurrentDate(newDate);
    }
  }, [view, currentYear, currentMonth, currentDate]);

  const goToToday = useCallback(() => {
    setCurrentDate(new Date());
    setSelectedDay(new Date());
  }, []);

  const getHeaderTitle = () => {
    if (view === "month") {
      return `${MONTH_NAMES[currentMonth]} ${currentYear}`;
    }
    // Week view: show date range
    if (weekDays.length >= 7) {
      const start = weekDays[0].date;
      const end = weekDays[6].date;
      const sameMonth = start.getMonth() === end.getMonth();
      const sameYear = start.getFullYear() === end.getFullYear();
      if (sameMonth && sameYear) {
        return `${MONTH_NAMES[start.getMonth()]} ${start.getDate()} – ${end.getDate()}, ${start.getFullYear()}`;
      }
      return `${start.toLocaleDateString("en-US", { month: "short", day: "numeric" })} – ${end.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`;
    }
    return "";
  };

  // --- Detail dialog handlers ---
  const openDetail = useCallback((schedule: PmScheduleWithRelations) => {
    setDetailSchedule(schedule);
    setDetailOpen(true);
  }, []);

  const closeDetail = useCallback(() => {
    setDetailOpen(false);
    setTimeout(() => setDetailSchedule(null), 200);
  }, []);

  const handleViewSchedule = useCallback(() => {
    if (detailSchedule) {
      navigate("pm-schedules", { id: detailSchedule.id });
      closeDetail();
    }
  }, [detailSchedule, navigate, closeDetail]);

  // --- Stats for the visible range ---
  const visibleStats = useMemo(() => {
    const total = displayDays.length;
    let overdueCount = 0;
    let dueSoonCount = 0;
    let totalScheduled = 0;

    displayDays.forEach((day) => {
      day.schedules.forEach((s) => {
        totalScheduled++;
        if (isOverdue(s.nextDueDate)) overdueCount++;
        else if (isDueSoon(s.nextDueDate, s.leadDays)) dueSoonCount++;
      });
    });

    return { totalScheduled, overdueCount, dueSoonCount };
  }, [displayDays]);

  // --- Permission check ---
  if (!canView) {
    return (
      <div className="page-content flex items-center justify-center min-h-[50vh]">
        <Card className="p-8 text-center max-w-md">
          <Wrench className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
          <h2 className="text-lg font-semibold mb-2">Access Denied</h2>
          <p className="text-sm text-muted-foreground">
            You do not have permission to view the PM Calendar.
          </p>
        </Card>
      </div>
    );
  }

  // --- Render ---
  return (
    <div className="page-content space-y-4">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <CalendarDays className="h-6 w-6 text-emerald-600" />
            PM Calendar
          </h1>
          <p className="text-sm text-muted-foreground">
            Visual calendar of upcoming preventive maintenance
          </p>
        </div>
      </div>

      {/* Controls */}
      <Card className="p-3 sm:p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          {/* Navigation */}
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" onClick={goToPrev} className="h-8 w-8">
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <h2 className="text-base sm:text-lg font-semibold min-w-[180px] text-center">
              {getHeaderTitle()}
            </h2>
            <Button variant="outline" size="icon" onClick={goToNext} className="h-8 w-8">
              <ChevronRight className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="sm" onClick={goToToday} className="h-8 px-3">
              Today
            </Button>
          </div>

          {/* View Toggle + Stats */}
          <div className="flex items-center gap-3">
            {/* Quick stats */}
            <div className="hidden md:flex items-center gap-2 text-xs">
              {visibleStats.overdueCount > 0 && (
                <Badge variant="destructive" className="gap-1 text-xs">
                  <span className="h-1.5 w-1.5 rounded-full bg-red-400" />
                  {visibleStats.overdueCount} overdue
                </Badge>
              )}
              {visibleStats.dueSoonCount > 0 && (
                <Badge className="gap-1 text-xs bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-300 hover:bg-amber-100">
                  <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                  {visibleStats.dueSoonCount} due soon
                </Badge>
              )}
              <span className="text-muted-foreground">
                {visibleStats.totalScheduled} scheduled
              </span>
            </div>

            {/* View toggle */}
            <div className="flex items-center rounded-lg border bg-muted p-0.5">
              <button
                onClick={() => setView("month")}
                className={cn(
                  "flex items-center gap-1.5 rounded-md px-3 py-1 text-xs font-medium transition-all",
                  view === "month"
                    ? "bg-background shadow-sm text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <CalendarIcon className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Month</span>
              </button>
              <button
                onClick={() => setView("week")}
                className={cn(
                  "flex items-center gap-1.5 rounded-md px-3 py-1 text-xs font-medium transition-all",
                  view === "week"
                    ? "bg-background shadow-sm text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <CalendarRange className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Week</span>
              </button>
            </div>
          </div>
        </div>
      </Card>

      {/* Loading State */}
      {loading ? (
        <Card className="p-4">
          <div className="grid grid-cols-7 gap-1 mb-2">
            {DAY_ABBREVS.map((d) => (
              <div key={d} className="h-8 flex items-center justify-center text-xs font-medium text-muted-foreground">
                {d}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {Array.from({ length: 35 }).map((_, i) => (
              <Skeleton key={i} className="aspect-square rounded-md" />
            ))}
          </div>
        </Card>
      ) : (
        <>
          {/* Calendar Grid */}
          <Card className="overflow-hidden">
            {/* Day Headers */}
            <div className="grid grid-cols-7 border-b bg-muted/50">
              {DAY_ABBREVS.map((day, idx) => (
                <div
                  key={day}
                  className={cn(
                    "flex items-center justify-center py-2 text-xs font-medium text-muted-foreground border-r last:border-r-0",
                    idx >= 5 && "text-muted-foreground/60"
                  )}
                >
                  <span className="hidden sm:inline">{day}</span>
                  <span className="sm:hidden">{DAY_ABBREVS_SHORT[idx]}</span>
                </div>
              ))}
            </div>

            {/* Calendar Cells */}
            <div className="grid grid-cols-7">
              {displayDays.map((day, idx) => {
                const hasOverdue = day.schedules.some((s) => isOverdue(s.nextDueDate));
                const hasDueSoon = day.schedules.some(
                  (s) => !isOverdue(s.nextDueDate) && isDueSoon(s.nextDueDate, s.leadDays)
                );
                const isSelected = selectedDay ? isSameDay(day.date, selectedDay) : false;
                const isExpanded = expandedDay ? isSameDay(day.date, expandedDay) : false;
                const visibleItems = view === "month" ? (isExpanded ? day.schedules : day.schedules.slice(0, 3)) : day.schedules;
                const hiddenCount = view === "month" ? day.schedules.length - 3 : 0;

                return (
                  <div
                    key={idx}
                    onClick={() => setSelectedDay(day.date)}
                    className={cn(
                      "relative min-h-[72px] sm:min-h-[100px] md:min-h-[110px] border-b border-r p-1 sm:p-1.5 cursor-pointer transition-colors",
                      "hover:bg-muted/30",
                      !day.isCurrentMonth && "bg-muted/20",
                      day.isToday && "bg-emerald-50/60 dark:bg-emerald-950/20",
                      isSelected && !day.isToday && "bg-muted/40 ring-1 ring-inset ring-emerald-500/30",
                      day.isToday && isSelected && "ring-2 ring-inset ring-emerald-500"
                    )}
                  >
                    {/* Day number */}
                    <div className="flex items-center justify-between mb-0.5">
                      <div className="flex items-center gap-1">
                        <span
                          className={cn(
                            "inline-flex items-center justify-center h-6 w-6 sm:h-7 sm:w-7 rounded-full text-xs sm:text-sm font-medium",
                            day.isToday && "bg-emerald-600 text-white",
                            !day.isToday && day.isCurrentMonth && "text-foreground",
                            !day.isToday && !day.isCurrentMonth && "text-muted-foreground/50"
                          )}
                        >
                          {day.date.getDate()}
                        </span>
                        {/* Mobile-only status dots */}
                        <div className="flex sm:hidden gap-0.5">
                          {hasOverdue && <span className="h-1.5 w-1.5 rounded-full bg-red-500" />}
                          {hasDueSoon && !hasOverdue && <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />}
                          {day.schedules.length > 0 && !hasOverdue && !hasDueSoon && (
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                          )}
                        </div>
                      </div>
                      {/* Desktop status indicators */}
                      <div className="hidden sm:flex gap-0.5">
                        {hasOverdue && (
                          <span className="h-2 w-2 rounded-full bg-red-500 animate-pulse" title="Overdue items" />
                        )}
                        {hasDueSoon && !hasOverdue && (
                          <span className="h-2 w-2 rounded-full bg-amber-500" title="Due soon" />
                        )}
                      </div>
                    </div>

                    {/* Schedule Items (desktop) */}
                    <div className="hidden sm:flex flex-col gap-0.5">
                      {visibleItems.map((schedule) => {
                        const prio = getPriorityConfig(schedule.priority);
                        const overdue = isOverdue(schedule.nextDueDate);
                        return (
                          <button
                            key={schedule.id}
                            onClick={(e) => {
                              e.stopPropagation();
                              openDetail(schedule);
                            }}
                            className={cn(
                              "flex items-center gap-1 rounded px-1.5 py-0.5 text-left text-[11px] leading-tight w-full transition-colors hover:opacity-80 truncate",
                              prio.bg,
                              prio.text,
                              overdue && "ring-1 ring-red-300 dark:ring-red-700"
                            )}
                          >
                            <span className={cn("h-1.5 w-1.5 rounded-full shrink-0", prio.dot)} />
                            <span className="truncate font-medium">
                              {schedule.title}
                            </span>
                            {schedule.asset && (
                              <span className="hidden lg:inline text-[10px] opacity-70 truncate">
                                · {schedule.asset.assetTag}
                              </span>
                            )}
                          </button>
                        );
                      })}
                      {hiddenCount > 0 && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setExpandedDay(isExpanded ? null : day.date);
                          }}
                          className="text-[10px] text-muted-foreground hover:text-foreground text-center py-0.5 rounded hover:bg-muted/50 transition-colors"
                        >
                          {isExpanded ? "Show less" : `+${hiddenCount} more`}
                        </button>
                      )}
                    </div>

                    {/* Mobile: show count chip if there are items */}
                    {day.schedules.length > 0 && (
                      <div className="sm:hidden mt-1 flex items-center gap-0.5">
                        <div className="flex items-center gap-0.5 overflow-hidden">
                          {day.schedules.slice(0, 3).map((schedule) => (
                            <span
                              key={schedule.id}
                              className={cn(
                                "h-3 w-3 rounded-sm shrink-0",
                                getPriorityConfig(schedule.priority).dot,
                                isOverdue(schedule.nextDueDate) && "ring-1 ring-red-300"
                              )}
                            />
                          ))}
                        </div>
                        <span className="text-[9px] text-muted-foreground ml-0.5">
                          {day.schedules.length}
                        </span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </Card>

          {/* Mobile Day Detail (tap a day to expand) */}
          {selectedDay && view === "month" && (
            <Card className="sm:hidden">
              <CardContent className="p-3">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-semibold">
                    {formatCalendarDate(selectedDay)}
                  </h3>
                  <button
                    onClick={() => setSelectedDay(null)}
                    className="text-xs text-muted-foreground hover:text-foreground"
                  >
                    Close
                  </button>
                </div>
                {(() => {
                  const dayData = displayDays.find((d) => isSameDay(d.date, selectedDay));
                  if (!dayData || dayData.schedules.length === 0) {
                    return (
                      <p className="text-xs text-muted-foreground text-center py-4">
                        No PM schedules for this day
                      </p>
                    );
                  }
                  return (
                    <div className="space-y-2">
                      {dayData.schedules.map((schedule) => {
                        const prio = getPriorityConfig(schedule.priority);
                        const overdue = isOverdue(schedule.nextDueDate);
                        return (
                          <button
                            key={schedule.id}
                            onClick={() => openDetail(schedule)}
                            className={cn(
                              "w-full flex items-center gap-2 rounded-lg border p-2.5 text-left transition-colors",
                              prio.bg,
                              prio.border
                            )}
                          >
                            <span className={cn("h-2 w-2 rounded-full shrink-0", prio.dot)} />
                            <div className="flex-1 min-w-0">
                              <p className={cn("text-xs font-semibold truncate", prio.text)}>
                                {schedule.title}
                              </p>
                              <div className="flex items-center gap-1 mt-0.5">
                                {schedule.asset && (
                                  <span className="text-[10px] text-muted-foreground truncate">
                                    {schedule.asset.assetTag}
                                  </span>
                                )}
                                {overdue && (
                                  <Badge variant="destructive" className="text-[9px] px-1 py-0 h-4">
                                    Overdue
                                  </Badge>
                                )}
                              </div>
                            </div>
                            <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                          </button>
                        );
                      })}
                    </div>
                  );
                })()}
              </CardContent>
            </Card>
          )}

          {/* Legend */}
          <Card className="p-3 sm:p-4">
            <div className="flex flex-wrap items-center gap-3 sm:gap-4">
              <span className="text-xs font-medium text-muted-foreground">Priority:</span>
              {[
                { key: "critical", label: "Critical" },
                { key: "high", label: "High" },
                { key: "medium", label: "Medium" },
                { key: "low", label: "Low" },
              ].map(({ key, label }) => (
                <div key={key} className="flex items-center gap-1.5">
                  <span className={cn("h-2.5 w-2.5 rounded-full", PRIORITY_COLORS[key]?.dot)} />
                  <span className="text-xs text-muted-foreground">{label}</span>
                </div>
              ))}
              <Separator orientation="vertical" className="h-4 hidden sm:block" />
              <div className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-red-500 animate-pulse" />
                <span className="text-xs text-muted-foreground">Overdue</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-amber-500" />
                <span className="text-xs text-muted-foreground">Due Soon</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="h-6 w-6 rounded-full bg-emerald-600 text-white flex items-center justify-center text-[9px] font-bold">
                  D
                </span>
                <span className="text-xs text-muted-foreground">Today</span>
              </div>
            </div>
          </Card>

          {/* Summary Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Card className="p-3 sm:p-4">
              <div className="flex items-center gap-2">
                <div className="h-8 w-8 rounded-lg bg-emerald-100 dark:bg-emerald-900/40 flex items-center justify-center">
                  <CalendarIcon className="h-4 w-4 text-emerald-600" />
                </div>
                <div>
                  <p className="text-lg font-bold">{schedules.length}</p>
                  <p className="text-[11px] text-muted-foreground">Active Schedules</p>
                </div>
              </div>
            </Card>
            <Card className="p-3 sm:p-4">
              <div className="flex items-center gap-2">
                <div className="h-8 w-8 rounded-lg bg-red-100 dark:bg-red-900/40 flex items-center justify-center">
                  <AlertTriangle className="h-4 w-4 text-red-600" />
                </div>
                <div>
                  <p className="text-lg font-bold">
                    {schedules.filter((s) => isOverdue(s.nextDueDate)).length}
                  </p>
                  <p className="text-[11px] text-muted-foreground">Overdue</p>
                </div>
              </div>
            </Card>
            <Card className="p-3 sm:p-4">
              <div className="flex items-center gap-2">
                <div className="h-8 w-8 rounded-lg bg-amber-100 dark:bg-amber-900/40 flex items-center justify-center">
                  <Clock className="h-4 w-4 text-amber-600" />
                </div>
                <div>
                  <p className="text-lg font-bold">
                    {schedules.filter((s) => !isOverdue(s.nextDueDate) && isDueSoon(s.nextDueDate, s.leadDays)).length}
                  </p>
                  <p className="text-[11px] text-muted-foreground">Due Soon</p>
                </div>
              </div>
            </Card>
            <Card className="p-3 sm:p-4">
              <div className="flex items-center gap-2">
                <div className="h-8 w-8 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
                  <Timer className="h-4 w-4 text-slate-600" />
                </div>
                <div>
                  <p className="text-lg font-bold">
                    {(() => {
                      const total = schedules.reduce((sum, s) => sum + (s.estimatedDuration || 0), 0);
                      return formatDuration(total);
                    })()}
                  </p>
                  <p className="text-[11px] text-muted-foreground">Est. Total Duration</p>
                </div>
              </div>
            </Card>
          </div>
        </>
      )}

      {/* Detail Dialog */}
      <ResponsiveDialog
        open={detailOpen}
        onOpenChange={setDetailOpen}
        title={detailSchedule?.title}
        description={
          detailSchedule
            ? formatCalendarDate(new Date(detailSchedule.nextDueDate!))
            : undefined
        }
        footer={
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={closeDetail}
              className="flex-1 sm:flex-none"
            >
              Close
            </Button>
            <Button
              onClick={handleViewSchedule}
              className="flex-1 sm:flex-none bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              View Schedule
            </Button>
          </div>
        }
      >
        {detailSchedule && (
          <PmScheduleDetail schedule={detailSchedule} />
        )}
      </ResponsiveDialog>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-component: PmScheduleDetail (shown inside dialog)
// ---------------------------------------------------------------------------

function PmScheduleDetail({ schedule }: { schedule: PmScheduleWithRelations }) {
  const prio = getPriorityConfig(schedule.priority);
  const overdue = isOverdue(schedule.nextDueDate);
  const dueSoon = !overdue && isDueSoon(schedule.nextDueDate, schedule.leadDays);

  return (
    <div className="space-y-4">
      {/* Description */}
      {schedule.description && (
        <p className="text-sm text-muted-foreground leading-relaxed">
          {schedule.description}
        </p>
      )}

      {/* Status badges */}
      <div className="flex flex-wrap items-center gap-2">
        <Badge className={prio.badge}>
          {schedule.priority.charAt(0).toUpperCase() + schedule.priority.slice(1)}
        </Badge>
        {overdue && (
          <Badge variant="destructive" className="gap-1">
            <AlertTriangle className="h-3 w-3" />
            Overdue
          </Badge>
        )}
        {dueSoon && (
          <Badge className="gap-1 bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-300 hover:bg-amber-100">
            <Clock className="h-3 w-3" />
            Due Soon
          </Badge>
        )}
        {schedule.isActive && (
          <Badge className="bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-300 hover:bg-emerald-100">
            Active
          </Badge>
        )}
        {schedule.autoGenerateWO && (
          <Badge variant="outline" className="gap-1">
            <Wrench className="h-3 w-3" />
            Auto-generates WO
          </Badge>
        )}
      </div>

      <Separator />

      {/* Detail fields */}
      <div className="grid gap-3">
        {/* Asset */}
        <div className="flex items-start gap-3">
          <MapPin className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
          <div>
            <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
              Asset
            </p>
            {schedule.asset ? (
              <div className="mt-0.5">
                <p className="text-sm font-medium">{schedule.asset.name}</p>
                <p className="text-xs text-muted-foreground">
                  Tag: {schedule.asset.assetTag} · Status: {schedule.asset.status}
                </p>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground mt-0.5">Not assigned</p>
            )}
          </div>
        </div>

        {schedule.component && (
          <div className="flex items-start gap-3">
            <Wrench className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
            <div>
              <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
                Target Component
              </p>
              <div className="mt-0.5">
                <p className="text-sm font-medium">{schedule.component.name}</p>
                <p className="text-xs text-muted-foreground">
                  {schedule.component.componentCode} · {schedule.component.componentType.replace(/_/g, ' ')}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Frequency */}
        <div className="flex items-start gap-3">
          <CalendarRange className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
          <div>
            <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
              Frequency
            </p>
            <p className="text-sm font-medium mt-0.5">
              {formatFrequency(schedule.frequencyType, schedule.frequencyValue)}
            </p>
          </div>
        </div>

        {/* Next Due Date */}
        <div className="flex items-start gap-3">
          <CalendarIcon className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
          <div>
            <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
              Next Due Date
            </p>
            <p className={cn("text-sm font-medium mt-0.5", overdue && "text-red-600 dark:text-red-400")}>
              {schedule.nextDueDate
                ? new Date(schedule.nextDueDate).toLocaleDateString("en-US", {
                    weekday: "short",
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })
                : "Not set"}
              {overdue && (
                <span className="ml-2 text-xs font-normal text-red-500">
                  ({formatTimeAgo(schedule.nextDueDate)})
                </span>
              )}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Lead days: {schedule.leadDays}
            </p>
          </div>
        </div>

        {/* Last Completed Date */}
        <div className="flex items-start gap-3">
          <Clock className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
          <div>
            <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
              Last Completed
            </p>
            <p className="text-sm font-medium mt-0.5">
              {schedule.lastCompletedDate
                ? new Date(schedule.lastCompletedDate).toLocaleDateString("en-US", {
                    weekday: "short",
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })
                : "Never"}
            </p>
          </div>
        </div>

        {/* Assigned To */}
        <div className="flex items-start gap-3">
          <User className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
          <div>
            <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
              Assigned To
            </p>
            {schedule.assignedTo && schedule.assignedTo.length > 0 ? (
              <div className="mt-0.5 flex flex-wrap gap-1">
                {schedule.assignedTo.map((u) => (
                  <Badge key={u.id} variant="outline" className="text-xs font-normal">
                    {u.fullName}
                  </Badge>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground mt-0.5">Not assigned</p>
            )}
          </div>
        </div>

        {/* Department */}
        {schedule.department && (
          <div className="flex items-start gap-3">
            <Building2 className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
            <div>
              <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
                Department
              </p>
              <p className="text-sm font-medium mt-0.5">
                {schedule.department.name}
                {schedule.department.code && (
                  <span className="text-muted-foreground ml-1">
                    ({schedule.department.code})
                  </span>
                )}
              </p>
            </div>
          </div>
        )}

        {/* Estimated Duration */}
        <div className="flex items-start gap-3">
          <Timer className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
          <div>
            <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
              Estimated Duration
            </p>
            <p className="text-sm font-medium mt-0.5">
              {formatDuration(schedule.estimatedDuration)}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
