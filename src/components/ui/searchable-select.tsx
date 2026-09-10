'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Check, ChevronsUpDown, Search, X, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import * as DismissableLayerPrimitive from '@radix-ui/react-dismissable-layer';

// Re-export DismissableLayer.Branch so Popovers nested inside Dialogs/Sheets
// register as "branches" — preventing accidental dialog dismissal on item click.
const DismissableLayerBranch = DismissableLayerPrimitive.Branch;

// ============================================================================
// SEARCHABLE SELECT — Combobox pattern (Command + Popover)
// ============================================================================

export interface SearchableOption {
  value: string;
  label: string;
  group?: string;
  icon?: React.ReactNode;
  badge?: string;
  badgeColor?: string;
  disabled?: boolean;
}

interface SearchableSelectProps {
  value: string;
  onValueChange: (value: string) => void;
  options: SearchableOption[];
  placeholder?: string;
  searchPlaceholder?: string;
  emptyMessage?: string;
  disabled?: boolean;
  className?: string;
  /** Show clear button when value is set */
  clearable?: boolean;
  /** Group options by `group` field */
  groupBy?: boolean;
  /** Max height of dropdown */
  maxHeight?: string;
  /** Loading state */
  loading?: boolean;
  /** Optional callback used by async wrappers for server-side search. */
  onSearchChange?: (query: string) => void;
}

export function SearchableSelect({
  value,
  onValueChange,
  options,
  placeholder = 'Select an option...',
  searchPlaceholder = 'Search...',
  emptyMessage = 'No options found.',
  disabled = false,
  className,
  clearable = true,
  groupBy = true,
  maxHeight = 'max-h-[240px]',
  loading = false,
  onSearchChange,
}: SearchableSelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const selectedOption = options.find(o => o.value === value);

  // Forward mouse wheel events to the scrollable cmdk-list container
  const handleWheel = React.useCallback((e: React.WheelEvent<HTMLDivElement>) => {
    const listEl = e.currentTarget.querySelector('[cmdk-list]') as HTMLElement | null;
    if (!listEl) return;
    listEl.scrollTop += e.deltaY;
  }, []);

  // Group options if groupBy is enabled
  const groupedOptions = React.useMemo(() => {
    if (!groupBy) return [{ group: '', items: options }];
    const groups = new Map<string, SearchableOption[]>();
    for (const opt of options) {
      const g = opt.group || 'Other';
      if (!groups.has(g)) groups.set(g, []);
      groups.get(g)!.push(opt);
    }
    return Array.from(groups.entries()).map(([group, items]) => ({ group, items }));
  }, [options, groupBy]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled || loading}
          className={cn(
            'w-full justify-between h-10 text-sm font-normal',
            'bg-white dark:bg-card',
            !value && 'text-muted-foreground',
            className,
          )}
        >
          <div className="flex items-center gap-2 min-w-0 flex-1">
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin shrink-0" />
            ) : selectedOption?.icon ? (
              <span className="shrink-0">{selectedOption.icon}</span>
            ) : null}
            <span className="truncate text-left">
              {selectedOption ? selectedOption.label : placeholder}
            </span>
            {selectedOption?.badge && (
              <Badge variant="secondary" className={cn('text-[10px] h-4 px-1.5 shrink-0', selectedOption.badgeColor)}>
                {selectedOption.badge}
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {clearable && value && !disabled && (
              <X
                className="h-3.5 w-3.5 opacity-50 hover:opacity-100 transition-opacity"
                onClick={(e) => {
                  e.stopPropagation();
                  onValueChange('');
                }}
              />
            )}
            <ChevronsUpDown className="h-4 w-4 opacity-50" />
          </div>
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[--radix-popover-trigger-width] p-0"
        align="start"
        onWheel={handleWheel}
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <DismissableLayerBranch>
        <Command shouldFilter={false} loop>
          <CommandInput
            placeholder={searchPlaceholder}
            value={query}
            onValueChange={(nextQuery) => {
              setQuery(nextQuery);
              onSearchChange?.(nextQuery);
            }}
          />
          <CommandList className={maxHeight}>
            <CommandEmpty>{emptyMessage}</CommandEmpty>
            {groupedOptions.map(({ group, items }) => {
              const filtered = items.filter(o =>
                o.label.toLowerCase().includes(query.toLowerCase()) ||
                o.value.toLowerCase().includes(query.toLowerCase()),
              );
              if (filtered.length === 0) return null;
              return (
                <CommandGroup key={group} heading={groupBy ? group : undefined}>
                  {filtered.map(opt => (
                    <CommandItem
                      key={opt.value}
                      value={opt.value}
                      disabled={opt.disabled}
                      onSelect={() => {
                        onValueChange(opt.value);
                        setOpen(false);
                        setQuery('');
                        onSearchChange?.('');
                      }}
                      className="cursor-pointer"
                    >
                      <Check
                        className={cn(
                          'mr-2 h-4 w-4 shrink-0',
                          value === opt.value ? 'opacity-100 text-emerald-600' : 'opacity-0',
                        )}
                      />
                      {opt.icon && <span className="mr-2 shrink-0">{opt.icon}</span>}
                      <span className="flex-1 truncate">{opt.label}</span>
                      {opt.badge && (
                        <Badge variant="secondary" className={cn('text-[10px] h-4 px-1.5 shrink-0 ml-1', opt.badgeColor)}>
                          {opt.badge}
                        </Badge>
                      )}
                    </CommandItem>
                  ))}
                </CommandGroup>
              );
            })}
          </CommandList>
        </Command>
        </DismissableLayerBranch>
      </PopoverContent>
    </Popover>
  );
}

// ============================================================================
// ASYNC SEARCHABLE SELECT — fetches options from API
// ============================================================================

interface AsyncSearchableSelectProps extends Omit<SearchableSelectProps, 'options' | 'onSearchChange'> {
  /** Async function to fetch options for the current search query */
  fetchOptions: (query: string) => Promise<SearchableOption[]>;
  /** Re-fetch when deps change */
  deps?: React.DependencyList;
}

export function AsyncSearchableSelect({
  fetchOptions,
  deps = [],
  loading: externalLoading,
  ...props
}: AsyncSearchableSelectProps) {
  const [options, setOptions] = useState<SearchableOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const mountedRef = useRef(true);
  // Keep the latest fetchOptions in a ref to avoid recreating the load callback
  // when the parent passes an inline function. This prevents infinite re-render loops.
  const fetchOptionsRef = useRef(fetchOptions);
  fetchOptionsRef.current = fetchOptions;

  const load = React.useCallback(async (searchQuery: string) => {
    setLoading(true);
    try {
      const opts = await fetchOptionsRef.current(searchQuery);
      if (mountedRef.current) setOptions(opts);
    } catch {
      // Silently fail
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    const timer = window.setTimeout(() => {
      void load(query);
    }, 250);

    return () => {
      window.clearTimeout(timer);
      mountedRef.current = false;
    };
  }, [load, query, ...deps]);

  return (
    <SearchableSelect
      {...props}
      options={options}
      loading={loading || externalLoading}
      onSearchChange={setQuery}
    />
  );
}

// ============================================================================
// MULTI-SELECT — Searchable multi-value select with badges
// ============================================================================

interface MultiSearchableSelectProps {
  values: string[];
  onValuesChange: (values: string[]) => void;
  options: SearchableOption[];
  placeholder?: string;
  searchPlaceholder?: string;
  emptyMessage?: string;
  disabled?: boolean;
  className?: string;
  maxDisplay?: number;
}

export function MultiSearchableSelect({
  values,
  onValuesChange,
  options,
  placeholder = 'Select options...',
  searchPlaceholder = 'Search...',
  emptyMessage = 'No options found.',
  disabled = false,
  className,
  maxDisplay = 3,
}: MultiSearchableSelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const selectedOpts = options.filter(o => values.includes(o.value));
  const displayOpts = selectedOpts.slice(0, maxDisplay);
  const remaining = selectedOpts.length - maxDisplay;

  // Forward mouse wheel events to the scrollable cmdk-list container
  const handleWheel = React.useCallback((e: React.WheelEvent<HTMLDivElement>) => {
    const listEl = e.currentTarget.querySelector('[cmdk-list]') as HTMLElement | null;
    if (!listEl) return;
    listEl.scrollTop += e.deltaY;
  }, []);

  const handleSelect = (val: string) => {
    if (values.includes(val)) {
      onValuesChange(values.filter(v => v !== val));
    } else {
      onValuesChange([...values, val]);
    }
  };

  const filteredOptions = options.filter(o =>
    o.label.toLowerCase().includes(query.toLowerCase()),
  );

  // Group options
  const groupedOptions = React.useMemo(() => {
    const groups = new Map<string, SearchableOption[]>();
    for (const opt of filteredOptions) {
      const g = opt.group || 'Other';
      if (!groups.has(g)) groups.set(g, []);
      groups.get(g)!.push(opt);
    }
    return Array.from(groups.entries()).map(([group, items]) => ({ group, items }));
  }, [filteredOptions]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn(
            'w-full justify-between h-auto min-h-10 text-sm font-normal',
            'bg-white dark:bg-card',
            values.length === 0 && 'text-muted-foreground',
            className,
          )}
        >
          <div className="flex items-center gap-1.5 flex-wrap min-w-0 flex-1">
            {displayOpts.length > 0 ? (
              <>
                {displayOpts.map(opt => (
                  <Badge
                    key={opt.value}
                    variant="secondary"
                    className="text-xs h-5 px-1.5 gap-1 bg-emerald-50 text-emerald-700 border-emerald-200"
                  >
                    {opt.label}
                    <X
                      className="h-3 w-3 cursor-pointer"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleSelect(opt.value);
                      }}
                    />
                  </Badge>
                ))}
                {remaining > 0 && (
                  <span className="text-xs text-muted-foreground">+{remaining} more</span>
                )}
              </>
            ) : (
              <span>{placeholder}</span>
            )}
          </div>
          <ChevronsUpDown className="h-4 w-4 opacity-50 shrink-0" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[--radix-popover-trigger-width] p-0"
        align="start"
        onWheel={handleWheel}
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <DismissableLayerBranch>
        <Command shouldFilter={false} loop>
          <CommandInput
            placeholder={searchPlaceholder}
            value={query}
            onValueChange={setQuery}
          />
          <CommandList className="max-h-[240px]">
            <CommandEmpty>{emptyMessage}</CommandEmpty>
            {groupedOptions.map(({ group, items }) => (
              <CommandGroup key={group} heading={group}>
                {items.map(opt => (
                  <CommandItem
                    key={opt.value}
                    value={opt.value}
                    onSelect={() => handleSelect(opt.value)}
                    className="cursor-pointer"
                  >
                    <Check
                      className={cn(
                        'mr-2 h-4 w-4 shrink-0',
                        values.includes(opt.value) ? 'opacity-100 text-emerald-600' : 'opacity-0',
                      )}
                    />
                    {opt.icon && <span className="mr-2 shrink-0">{opt.icon}</span>}
                    <span className="flex-1 truncate">{opt.label}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>
        </DismissableLayerBranch>
      </PopoverContent>
    </Popover>
  );
}
