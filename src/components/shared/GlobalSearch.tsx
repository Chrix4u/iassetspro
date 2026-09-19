'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigationStore } from '@/stores/navigationStore';
import { useAuthStore } from '@/stores/authStore';
import { api } from '@/lib/api';
import { canAccessPage } from '@/lib/pageAccess';
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import {
  Wrench,
  ClipboardList,
  FileText,
  Package,
  Users,
  Loader2,
  SearchIcon,
} from 'lucide-react';

// ============================================================================
// Types
// ============================================================================

interface SearchResult {
  id: string;
  type: string;
  title: string;
  subtitle: string;
  status?: string;
  meta?: string;
}

interface SearchGroup {
  type: string;
  label: string;
  count: number;
  results: SearchResult[];
}

interface SearchResponse {
  query: string;
  results: SearchGroup[];
  total: number;
}

// ============================================================================
// Icon map per entity type
// ============================================================================

const TYPE_ICONS: Record<string, React.ElementType> = {
  assets: Wrench,
  work_orders: ClipboardList,
  maintenance_requests: FileText,
  inventory: Package,
  users: Users,
};

// ============================================================================
// Navigation map — which page + params to use per entity type
// ============================================================================

function getNavigation(item: SearchResult): { page: string; params: Record<string, string> } {
  switch (item.type) {
    case 'assets':
      return { page: 'asset-detail', params: { id: item.id } };
    case 'work_orders':
      return { page: 'wo-detail', params: { id: item.id } };
    case 'maintenance_requests':
      return { page: 'mr-detail', params: { id: item.id } };
    case 'inventory':
      return { page: 'inventory-items', params: { id: item.id } };
    case 'users':
      return { page: 'settings-users', params: {} };
    default:
      return { page: 'dashboard', params: {} };
  }
}

// ============================================================================
// Status badge color helper
// ============================================================================

function statusColor(status?: string): string {
  if (!status) return 'text-muted-foreground';
  const s = status.toLowerCase();
  if (['completed', 'closed', 'verified', 'operational', 'active', 'converted'].includes(s))
    return 'text-emerald-600 dark:text-emerald-400';
  if (['in_progress', 'approved', 'planned', 'assigned', 'good'].includes(s))
    return 'text-blue-600 dark:text-blue-400';
  if (['draft', 'pending', 'requested', 'new', 'fair'].includes(s))
    return 'text-amber-600 dark:text-amber-400';
  if (['cancelled', 'rejected', 'decommissioned', 'inactive', 'disposed', 'out_of_service'].includes(s))
    return 'text-red-600 dark:text-red-400';
  if (['on_hold', 'waiting_parts', 'standby'].includes(s))
    return 'text-orange-600 dark:text-orange-400';
  return 'text-muted-foreground';
}

// ============================================================================
// GlobalSearch Component
// ============================================================================

export default function GlobalSearch() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchGroup[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(null);
  const navigate = useNavigationStore((s) => s.navigate);
  const enabledModules = useNavigationStore((s) => s.enabledModules);
  const hasPermission = useAuthStore((s) => s.hasPermission);
  const isAdmin = useAuthStore((s) => s.isAdmin);

  // ---- Keyboard shortcut (Ctrl+K / Cmd+K) ----
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  // ---- Reset when dialog closes ----
  useEffect(() => {
    if (!open) {
      setQuery('');
      setResults([]);
      setHasSearched(false);
      setLoading(false);
    }
  }, [open]);

  // ---- Debounced search ----
  const doSearch = useCallback(async (q: string) => {
    if (!q.trim()) {
      setResults([]);
      setHasSearched(false);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const res = await api.get<SearchResponse>(`/api/search?q=${encodeURIComponent(q.trim())}&limit=10`);
      if (res.success && res.data) {
        const admin = isAdmin();
        const filtered = res.data.results
          .map((group) => ({
            ...group,
            results: group.results.filter((item) => {
              const nav = getNavigation(item);
              return canAccessPage(nav.page, hasPermission, admin, enabledModules);
            }),
          }))
          .filter((group) => group.results.length > 0)
          .map((group) => ({ ...group, count: group.results.length }));
        setResults(filtered);
      } else {
        setResults([]);
      }
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
      setHasSearched(true);
    }
  }, [hasPermission, isAdmin, enabledModules]);

  const handleValueChange = useCallback(
    (value: string) => {
      setQuery(value);

      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }

      debounceRef.current = setTimeout(() => {
        doSearch(value);
      }, 300);
    },
    [doSearch]
  );

  // Cleanup debounce on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  // ---- Handle selection ----
  const handleSelect = useCallback(
    (item: SearchResult) => {
      const nav = getNavigation(item);
      navigate(nav.page as any, nav.params);
      setOpen(false);
    },
    [navigate]
  );

  // ---- Loading indicator ----
  const LoadingIndicator = () => (
    <div className="flex items-center justify-center py-6 text-muted-foreground">
      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
      <span className="text-sm">Searching...</span>
    </div>
  );

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput
        placeholder="Search assets, work orders, inventory, users..."
        value={query}
        onValueChange={handleValueChange}
      />
      <CommandList>
        {loading && <LoadingIndicator />}
        {!loading && !hasSearched && (
          <div className="py-8 text-center text-muted-foreground">
            <SearchIcon className="h-8 w-8 mx-auto mb-2 opacity-30" />
            <p className="text-sm">Type to search across the system</p>
            <p className="text-xs mt-1 opacity-60">
              Assets · Work Orders · Maintenance Requests · Inventory · Users
            </p>
          </div>
        )}
        {!loading && hasSearched && results.length === 0 && (
          <CommandEmpty>
            <div className="py-4">
              <p className="text-sm font-medium">No results found</p>
              <p className="text-xs mt-1 opacity-60">
                Try a different search term or check your spelling
              </p>
            </div>
          </CommandEmpty>
        )}
        {results.map((group) => {
          const Icon = TYPE_ICONS[group.type] || SearchIcon;
          return (
            <CommandGroup key={group.type} heading={`${group.label} (${group.count})`}>
              {group.results.map((item) => (
                <CommandItem
                  key={`${item.type}-${item.id}`}
                  value={`${item.title} ${item.subtitle} ${item.type}`}
                  onSelect={() => handleSelect(item)}
                  className="flex items-center gap-3 cursor-pointer"
                >
                  <div className="flex items-center justify-center h-8 w-8 rounded-md bg-muted shrink-0">
                    <Icon className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium truncate">{item.title}</span>
                      {item.status && (
                        <span className={`text-[11px] font-medium px-1.5 py-0.5 rounded-full bg-muted shrink-0 ${statusColor(item.status)}`}>
                          {item.status.replace(/_/g, ' ')}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span className="text-xs text-muted-foreground truncate">
                        {item.subtitle}
                      </span>
                      {item.meta && (
                        <>
                          <span className="text-muted-foreground/40 text-xs">·</span>
                          <span className="text-xs text-muted-foreground/70 truncate">
                            {item.meta}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          );
        })}
      </CommandList>
    </CommandDialog>
  );
}
