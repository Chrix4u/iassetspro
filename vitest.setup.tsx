// ============================================================================
// Vitest Setup — Mocks for Next.js, Lucide icons, and other non-testable deps
// ============================================================================

import { vi } from 'vitest';

// ---- Mock Next.js navigation ----
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
    prefetch: vi.fn(),
  }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
  useSelectedLayoutSegment: () => null,
  useSelectedLayoutSegments: () => [],
}));

// ---- Mock Next.js Image ----
vi.mock('next/image', () => ({
  default: (props: Record<string, unknown>) => {
    // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
    return <img {...props} />;
  },
}));

// ---- Mock Next.js Link ----
vi.mock('next/link', () => ({
  default: (props: { href: string; children: React.ReactNode }) => (
    <a href={props.href}>{props.children}</a>
  ),
}));

// ---- Mock Lucide React icons (return empty SVG elements) ----
vi.mock('lucide-react', () => {
  const icons = [
    'AlertTriangle', 'ArrowLeft', 'ArrowRight', 'BarChart3', 'Bell', 'BellRing',
    'BookOpen', 'Bot', 'Briefcase', 'Building2', 'Calendar', 'CalendarDays',
    'Camera', 'Car', 'Check', 'CheckCircle', 'CheckCircle2', 'ChevronDown', 'ChevronLeft',
    'ChevronRight', 'CircleDot', 'ClipboardList', 'Clock', 'Close', 'Code',
    'Cog', 'Copy', 'Cpu', 'Database', 'Download', 'Edit', 'FileText',
    'Filter', 'Flag', 'Folder', 'GitBranch', 'Globe', 'Grid3X3', 'Hash',
    'Heart', 'History', 'Home', 'Info', 'Key', 'Laptop', 'Layers', 'Layout',
    'LineChart', 'Link', 'Lock', 'LogOut', 'Mail', 'Map', 'MapPin',
    'Maximize2', 'Menu', 'MessageSquare', 'Minimize2', 'Monitor', 'MoreVertical',
    'Move', 'Music', 'Navigation', 'Network', 'Package', 'Paperclip', 'Pause',
    'Pencil', 'Phone', 'PieChart', 'Play', 'Plus', 'Power', 'Printer',
    'QrCode', 'Radio', 'RefreshCw', 'RotateCcw', 'Save', 'Scan', 'Search',
    'Send', 'Server', 'Settings', 'Share2', 'Shield', 'ShoppingCart', 'Signal',
    'Smartphone', 'Snowflake', 'Socket', 'Sparkles', 'Square', 'Star',
    'Start', 'StopCircle', 'Table', 'Tag', 'Target', 'Terminal', 'Thermometer',
    'Timer', 'ToggleLeft', 'ToggleRight', 'Tool', 'TrendingDown', 'TrendingUp',
    'Truck', 'Upload', 'User', 'UserCheck', 'UserCog', 'UserPlus', 'UserX',
    'Users', 'Video', 'Volume2', 'Wrench', 'X', 'Zap',
  ];

  const moduleExports: Record<string, unknown> = {};
  for (const icon of icons) {
    moduleExports[icon] = (props: Record<string, unknown>) => (
      <svg
        data-testid={`icon-${icon}`}
        width={24}
        height={24}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        {...props}
      />
    );
  }

  return moduleExports;
});

// ---- Mock z-ai-web-dev-sdk ----
vi.mock('z-ai-web-dev-sdk', () => ({
  chat: { completions: { create: vi.fn() } },
  images: { generate: { create: vi.fn() } },
  audio: { transcriptions: { create: vi.fn() } },
}));

// ---- Mock global performance.now if not available ----
if (typeof globalThis.performance === 'undefined') {
  globalThis.performance = {
    now: () => Date.now(),
    mark: () => {},
    measure: () => {},
    getEntries: () => [],
    getEntriesByType: () => [],
    getEntriesByName: () => [],
    clearMarks: () => {},
    clearMeasures: () => {},
    clearResourceTimings: () => {},
    setResourceTimingBufferSize: () => {},
    toJSON: () => ({}),
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
    timeOrigin: Date.now(),
  } as unknown as Performance;
}

// ---- Suppress console output during tests (optional) ----
// Uncomment the following lines to reduce noise in test output:
// const originalConsole = { ...console };
// beforeAll(() => {
//   console.log = vi.fn();
//   console.warn = vi.fn();
//   console.error = vi.fn();
//   console.info = vi.fn();
// });
// afterAll(() => {
//   Object.assign(console, originalConsole);
// });
