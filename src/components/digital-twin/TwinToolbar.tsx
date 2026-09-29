'use client';

import { useCallback, useState } from 'react';
import {
  Box,
  Scissors,
  Activity,
  MapPin,
  MessageSquare,
  RotateCcw,
  Maximize2,
  Minimize2,
  Camera,
  Home,
  Expand,
  Video,
  Eye,
  Cpu,
  Grid3x3,
  Square,
  Layers,
  Settings,
  ChevronDown,
  Crosshair,
  ArrowUpFromLine,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import {
  Slider,
} from '@/components/ui/slider';
import { useDigitalTwinStore, type SectionAxis } from '@/stores/digitalTwinStore';

// ============================================================================
// Types
// ============================================================================

export interface TwinToolbarProps {
  /** Callback to reset camera via Three.js controls */
  onResetCamera?: () => void;
  /** Callback to fit view to model bounds */
  onFitView?: () => void;
  /** Callback to take a screenshot */
  onScreenshot?: () => void;
  /** Callback to apply a camera preset */
  onCameraPreset?: (preset: string) => void;
  /** Whether the viewer is currently fullscreen */
  isFullscreen?: boolean;
  /** Callback to toggle fullscreen */
  onToggleFullscreen?: () => void;
  /** Available camera presets */
  cameraPresets?: { name: string; label: string }[];
  /** Active projection mode */
  viewMode?: '3d' | '2d-front' | '2d-top' | '2d-side';
  /** Change between 3D and orthographic 2D projections */
  onViewModeChange?: (mode: '3d' | '2d-front' | '2d-top' | '2d-side') => void;
  /** Whether the left scene tree panel is open (shifts toolbar right) */
  isTreeOpen?: boolean;
}

// ============================================================================
// Toolbar Button
// ============================================================================

interface ToolbarButtonProps {
  icon: React.ReactNode;
  label: string;
  isActive?: boolean;
  onClick: () => void;
  shortcut?: string;
  danger?: boolean;
}

function ToolbarButton({ icon, label, isActive, onClick, shortcut, danger }: ToolbarButtonProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label={label}
          title={label}
          onClick={onClick}
          className={`
            h-8 w-8 rounded-md transition-all duration-150
            ${isActive
              ? 'bg-cyan-500/20 text-cyan-300 hover:bg-cyan-500/30 shadow-sm shadow-cyan-500/10'
              : danger
                ? 'text-slate-300 hover:text-red-400 hover:bg-red-500/10'
                : 'text-slate-300 hover:text-white hover:bg-white/10'
            }
          `}
        >
          {icon}
        </Button>
      </TooltipTrigger>
      <TooltipContent
        side="bottom"
        className="bg-slate-900 border-slate-700 text-slate-200 text-xs"
      >
        <div className="flex items-center gap-2">
          <span>{label}</span>
          {shortcut && (
            <kbd className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 text-[10px] font-mono">
              {shortcut}
            </kbd>
          )}
        </div>
      </TooltipContent>
    </Tooltip>
  );
}

// ============================================================================
// Toolbar Divider
// ============================================================================

function ToolbarDivider() {
  return <div className="h-5 w-px bg-white/10 mx-1" />;
}

// ============================================================================
// Explode Slider Popup
// ============================================================================

function ExplodeSliderPopup() {
  const explodeMode = useDigitalTwinStore(s => s.explodeMode);
  const explodeProgress = useDigitalTwinStore(s => s.explodeProgress);
  const setExplodeProgress = useDigitalTwinStore(s => s.setExplodeProgress);
  const toggleExplodeMode = useDigitalTwinStore(s => s.toggleExplodeMode);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <div>
          <ToolbarButton
            icon={<Box className="h-4 w-4" />}
            label="Exploded View"
            shortcut="E"
            isActive={explodeMode}
            onClick={toggleExplodeMode}
          />
        </div>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        side="bottom"
        align="center"
        className="bg-slate-900 border-slate-700 text-slate-200 w-52"
      >
        <DropdownMenuLabel className="text-slate-300">Explode Progress</DropdownMenuLabel>
        <div className="px-2 pb-2 pt-1">
          <Slider
            value={[explodeProgress * 100]}
            min={0}
            max={100}
            step={5}
            onValueChange={v => setExplodeProgress(v[0] / 100)}
            className="py-2"
          />
          <div className="flex justify-between text-[10px] text-slate-400">
            <span>Collapsed</span>
            <span>{Math.round(explodeProgress * 100)}%</span>
            <span>Expanded</span>
          </div>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// ============================================================================
// Section Plane Popup
// ============================================================================

function SectionPlanePopup() {
  const sectionMode = useDigitalTwinStore(s => s.sectionMode);
  const sectionAxis = useDigitalTwinStore(s => s.sectionAxis);
  const toggleSectionMode = useDigitalTwinStore(s => s.toggleSectionMode);
  const setSectionAxis = useDigitalTwinStore(s => s.setSectionAxis);

  const axes: { value: SectionAxis; label: string }[] = [
    { value: 'x', label: 'X Axis (Front-Back)' },
    { value: 'y', label: 'Y Axis (Top-Bottom)' },
    { value: 'z', label: 'Z Axis (Left-Right)' },
  ];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <div>
          <ToolbarButton
            icon={<Scissors className="h-4 w-4" />}
            label="Section Plane"
            shortcut="S"
            isActive={sectionMode}
            onClick={toggleSectionMode}
          />
        </div>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        side="bottom"
        align="center"
        className="bg-slate-900 border-slate-700 text-slate-200 w-52"
      >
        <DropdownMenuLabel className="text-slate-300">Section Plane Axis</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {axes.map(axis => (
          <DropdownMenuItem
            key={axis.value}
            onClick={() => {
              if (!sectionMode) toggleSectionMode();
              setSectionAxis(axis.value);
            }}
            className={`${sectionAxis === axis.value ? 'bg-cyan-500/10 text-cyan-300' : ''} text-xs`}
          >
            <Crosshair className="h-3.5 w-3.5 mr-2" />
            {axis.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// ============================================================================
// Camera Presets Popup
// ============================================================================

function CameraPresetsPopup({
  presets,
  onPreset,
}: {
  presets?: { name: string; label: string }[];
  onPreset?: (preset: string) => void;
}) {
  const cameraPreset = useDigitalTwinStore(s => s.cameraPreset);

  const defaultPresets = presets || [
    { name: 'front', label: 'Front View' },
    { name: 'back', label: 'Back View' },
    { name: 'left', label: 'Left View' },
    { name: 'right', label: 'Right View' },
    { name: 'top', label: 'Top View' },
    { name: 'bottom', label: 'Bottom View' },
    { name: 'iso', label: 'Isometric View' },
  ];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <div>
          <ToolbarButton
            icon={<Video className="h-4 w-4" />}
            label="Camera Presets"
            shortcut="C"
            isActive={!!cameraPreset}
            onClick={() => {}}
          />
        </div>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        side="bottom"
        align="center"
        className="bg-slate-900 border-slate-700 text-slate-200 w-48"
      >
        <DropdownMenuLabel className="text-slate-300">Camera Presets</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {defaultPresets.map(preset => (
          <DropdownMenuItem
            key={preset.name}
            onClick={() => onPreset?.(preset.name)}
            className={`${cameraPreset === preset.name ? 'bg-cyan-500/10 text-cyan-300' : ''} text-xs`}
          >
            {preset.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// ============================================================================
// Main Toolbar Component
// ============================================================================

export function TwinToolbar({
  onResetCamera,
  onFitView,
  onScreenshot,
  onCameraPreset,
  isFullscreen = false,
  onToggleFullscreen,
  cameraPresets,
  viewMode = '3d',
  onViewModeChange,
  isTreeOpen = false,
}: TwinToolbarProps) {
  const explodeMode = useDigitalTwinStore(s => s.explodeMode);
  const sectionMode = useDigitalTwinStore(s => s.sectionMode);
  const iotOverlayEnabled = useDigitalTwinStore(s => s.iotOverlayEnabled);
  const hotspotsVisible = useDigitalTwinStore(s => s.hotspotsVisible);
  const annotationsVisible = useDigitalTwinStore(s => s.annotationsVisible);
  const isolationAssetId = useDigitalTwinStore(s => s.isolationAssetId);

  const toggleExplodeMode = useDigitalTwinStore(s => s.toggleExplodeMode);
  const toggleSectionMode = useDigitalTwinStore(s => s.toggleSectionMode);
  const toggleIoTOverlay = useDigitalTwinStore(s => s.toggleIoTOverlay);
  const toggleHotspots = useDigitalTwinStore(s => s.toggleHotspots);
  const toggleAnnotations = useDigitalTwinStore(s => s.toggleAnnotations);
  const isolateAsset = useDigitalTwinStore(s => s.isolateAsset);

  // Display options — local state (wire to store/3D scene as needed)
  const [wireframe, setWireframe] = useState(false);
  const [groundPlane, setGroundPlane] = useState(true);
  const [gridVisible, setGridVisible] = useState(true);

  const handleScreenshot = useCallback(() => {
    if (onScreenshot) onScreenshot();
  }, [onScreenshot]);

  const handleIsolationToggle = useCallback(() => {
    isolateAsset(isolationAssetId ? null : '__all__');
  }, [isolationAssetId, isolateAsset]);

  return (
    <div
      className={`absolute top-3 z-30 transition-all duration-300 ${isTreeOpen ? 'left-[calc(50%+140px)]' : 'left-1/2'} -translate-x-1/2`}
    >
      <div
        className="flex items-center gap-0.5 px-2 py-1.5 rounded-xl shadow-2xl"
        style={{
          background: 'rgba(15,15,25,0.85)',
          border: '1px solid rgba(148,163,184,0.12)',
          backdropFilter: 'blur(16px) saturate(180%)',
        }}
      >
        {/* ── View Controls ─────────────────────────────────────────────── */}
        <ToolbarButton
          icon={<Home className="h-4 w-4" />}
          label="Reset Camera"
          shortcut="R"
          onClick={onResetCamera ?? (() => {})}
        />
        <ToolbarButton
          icon={<Expand className="h-4 w-4" />}
          label="Fit View"
          onClick={onFitView ?? (() => {})}
        />
        <CameraPresetsPopup presets={cameraPresets} onPreset={onCameraPreset} />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <div>
              <ToolbarButton
                icon={viewMode === '3d' ? <Box className="h-4 w-4" /> : <Square className="h-4 w-4" />}
                label={viewMode === '3d' ? '3D View' : '2D Projection'}
                isActive={viewMode !== '3d'}
                onClick={() => {}}
              />
            </div>
          </DropdownMenuTrigger>
          <DropdownMenuContent side="bottom" align="center" className="bg-slate-900 border-slate-700 text-slate-200 w-44">
            <DropdownMenuLabel className="text-slate-300">Projection</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => onViewModeChange?.('3d')} className={viewMode === '3d' ? 'bg-cyan-500/10 text-cyan-300 text-xs' : 'text-xs'}>3D Perspective</DropdownMenuItem>
            <DropdownMenuItem onClick={() => onViewModeChange?.('2d-front')} className={viewMode === '2d-front' ? 'bg-cyan-500/10 text-cyan-300 text-xs' : 'text-xs'}>2D Front</DropdownMenuItem>
            <DropdownMenuItem onClick={() => onViewModeChange?.('2d-top')} className={viewMode === '2d-top' ? 'bg-cyan-500/10 text-cyan-300 text-xs' : 'text-xs'}>2D Top</DropdownMenuItem>
            <DropdownMenuItem onClick={() => onViewModeChange?.('2d-side')} className={viewMode === '2d-side' ? 'bg-cyan-500/10 text-cyan-300 text-xs' : 'text-xs'}>2D Side</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <ToolbarButton
          icon={isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          label={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
          shortcut="F"
          onClick={onToggleFullscreen ?? (() => {})}
        />

        <ToolbarDivider />

        {/* ── Analysis Tools ────────────────────────────────────────────── */}
        <ExplodeSliderPopup />
        <SectionPlanePopup />
        <ToolbarButton
          icon={<Eye className="h-4 w-4" />}
          label="Isolation Mode"
          shortcut="I"
          isActive={!!isolationAssetId}
          onClick={handleIsolationToggle}
        />
        <ToolbarButton
          icon={<Activity className="h-4 w-4" />}
          label="IoT Overlay"
          shortcut="O"
          isActive={iotOverlayEnabled}
          onClick={toggleIoTOverlay}
        />

        <ToolbarDivider />

        {/* ── Display Options ───────────────────────────────────────────── */}
        <ToolbarButton
          icon={<Square className="h-4 w-4" />}
          label="Wireframe"
          shortcut="W"
          isActive={wireframe}
          onClick={() => setWireframe(w => !w)}
        />
        <ToolbarButton
          icon={<MapPin className="h-4 w-4" />}
          label="Hotspots"
          shortcut="H"
          isActive={hotspotsVisible}
          onClick={toggleHotspots}
        />
        <ToolbarButton
          icon={<MessageSquare className="h-4 w-4" />}
          label="Annotations"
          shortcut="A"
          isActive={annotationsVisible}
          onClick={toggleAnnotations}
        />
        <ToolbarButton
          icon={<ArrowUpFromLine className="h-4 w-4" />}
          label="Ground Plane"
          shortcut="G"
          isActive={groundPlane}
          onClick={() => setGroundPlane(g => !g)}
        />
        <ToolbarButton
          icon={<Grid3x3 className="h-4 w-4" />}
          label="Grid"
          isActive={gridVisible}
          onClick={() => setGridVisible(g => !g)}
        />

        <ToolbarDivider />

        {/* ── Settings ──────────────────────────────────────────────────── */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <div>
              <ToolbarButton
                icon={<Settings className="h-4 w-4" />}
                label="Scene Settings"
                onClick={() => {}}
              />
            </div>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            side="bottom"
            align="end"
            className="bg-slate-900 border-slate-700 text-slate-200 w-48"
          >
            <DropdownMenuLabel className="text-slate-300">Scene Settings</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="text-xs">
              <Layers className="h-3.5 w-3.5 mr-2" />
              Environment
            </DropdownMenuItem>
            <DropdownMenuItem className="text-xs">
              <Camera className="h-3.5 w-3.5 mr-2" />
              Background Color
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="text-xs" onClick={handleScreenshot}>
              <Camera className="h-3.5 w-3.5 mr-2" />
              Screenshot
            </DropdownMenuItem>
            <DropdownMenuItem className="text-xs">
              <Box className="h-3.5 w-3.5 mr-2" />
              Export Scene
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <ToolbarButton
          icon={<Camera className="h-4 w-4" />}
          label="Screenshot"
          onClick={handleScreenshot}
        />
      </div>
    </div>
  );
}

export default TwinToolbar;