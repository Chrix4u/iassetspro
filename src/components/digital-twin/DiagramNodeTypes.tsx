'use client';

import React, { memo } from 'react';
import { Handle, Position, type NodeProps, type EdgeProps, getBezierPath, getSmoothStepPath } from 'reactflow';
import { isInstrumentAlarm } from './diagram-node-logic';
import {
  Cpu, Thermometer, Gauge, Activity, GitBranch,
  ChevronDown, ChevronUp, Droplets, Zap, Wind, FlaskConical,
  Settings, Shield, CircleDot, Filter, Fuel, Warehouse,
  Radio, Cog, Box, Layers, AlertTriangle,
  type LucideIcon,
} from 'lucide-react';

// ============================================================================
// SHARED STYLES & HELPERS
// ============================================================================

const statusColors: Record<string, string> = {
  operational: '#10b981',
  normal: '#10b981',
  active: '#10b981',
  online: '#10b981',
  running: '#10b981',
  standby: '#f59e0b',
  warning: '#f59e0b',
  stopped: '#6b7280',
  offline: '#6b7280',
  inactive: '#6b7280',
  critical: '#ef4444',
  alarm: '#ef4444',
  error: '#ef4444',
  fault: '#ef4444',
};

const criticalityColors: Record<string, string> = {
  low: '#94a3b8',
  medium: '#3b82f6',
  high: '#f59e0b',
  critical: '#ef4444',
};

const assetTypeIcons: Record<string, LucideIcon> = {
  chiller: Wind,
  pump: Droplets,
  transformer: Zap,
  switchgear: Zap,
  mcc: Cpu,
  motor: Cog,
  compressor: Wind,
  dryer: Thermometer,
  filter: Filter,
  receiver: Warehouse,
  ahu: Wind,
  vav: Settings,
  supply: Zap,
  generator: Zap,
  enduser: Box,
  valve: ChevronDown,
  default: Activity,
};

const nodeBaseStyle: React.CSSProperties = {
  background: '#1e293b',
  borderRadius: '12px',
  border: '1px solid rgba(148,163,184,0.15)',
  minWidth: '180px',
  fontFamily: 'inherit',
  backdropFilter: 'blur(12px)',
};

function HealthBar({ health }: { health: number }) {
  const color = health >= 80 ? '#10b981' : health >= 60 ? '#f59e0b' : '#ef4444';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <div style={{ flex: 1, height: 4, background: 'rgba(148,163,184,0.15)', borderRadius: 2 }}>
        <div style={{ height: '100%', width: `${health}%`, background: color, borderRadius: 2, transition: 'width 0.5s' }} />
      </div>
      <span style={{ fontSize: 10, color: '#94a3b8', fontWeight: 600 }}>{health}%</span>
    </div>
  );
}

// ============================================================================
// ASSET NODE
// ============================================================================

export interface AssetNodeData {
  label: string;
  assetType?: string;
  status?: string;
  criticality?: string;
  health?: number;
  parameters?: { name: string; value: string; unit: string }[];
  assetId?: string | null;
  [key: string]: unknown;
}

function AssetNodeComponent({ data, selected }: NodeProps) {
  const nodeData = data as unknown as AssetNodeData;
  const Icon = assetTypeIcons[nodeData.assetType || 'default'] || Activity;
  const statusColor = statusColors[nodeData.status || 'operational'] || '#10b981';
  const critColor = criticalityColors[nodeData.criticality || 'medium'] || '#3b82f6';

  return (
    <div
      style={{
        ...nodeBaseStyle,
        borderColor: selected ? '#10b981' : `rgba(148,163,184,0.15)`,
        boxShadow: selected ? '0 0 20px rgba(16,185,129,0.2)' : '0 4px 12px rgba(0,0,0,0.3)',
      }}
    >
      <Handle type="target" position={Position.Left} style={{ background: statusColor, border: '2px solid #1e293b', width: 10, height: 10 }} />

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px 6px' }}>
        <div style={{
          width: 32, height: 32, borderRadius: 8,
          background: `${statusColor}18`, display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Icon size={16} style={{ color: statusColor }} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#f1f5f9', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {nodeData.label}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
            <div style={{
              width: 7, height: 7, borderRadius: '50%', background: statusColor,
              boxShadow: nodeData.status === 'warning' ? `0 0 6px ${statusColor}` : 'none',
              animation: nodeData.status === 'warning' ? 'pulse 2s infinite' : 'none',
            }} />
            <span style={{ fontSize: 10, color: '#94a3b8', textTransform: 'capitalize' }}>
              {nodeData.status || 'operational'}
            </span>
            <div style={{ width: 1, height: 10, background: 'rgba(148,163,184,0.2)' }} />
            <span style={{ fontSize: 10, color: critColor, textTransform: 'uppercase', fontWeight: 600 }}>
              {nodeData.criticality || 'medium'}
            </span>
          </div>
        </div>
      </div>

      {/* Health bar */}
      {nodeData.health !== undefined && (
        <div style={{ padding: '0 12px 6px' }}>
          <HealthBar health={nodeData.health} />
        </div>
      )}

      {/* Parameters */}
      {nodeData.parameters && nodeData.parameters.length > 0 && (
        <div style={{
          padding: '6px 12px 8px', borderTop: '1px solid rgba(148,163,184,0.08)',
          display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2px 8px',
        }}>
          {nodeData.parameters.slice(0, 4).map((p, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 9, color: '#64748b' }}>{p.name}</span>
              <span style={{ fontSize: 9, color: '#cbd5e1', fontWeight: 600, fontFamily: 'monospace' }}>
                {p.value}{p.unit ? ` ${p.unit}` : ''}
              </span>
            </div>
          ))}
        </div>
      )}

      <Handle type="source" position={Position.Right} style={{ background: statusColor, border: '2px solid #1e293b', width: 10, height: 10 }} />

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
      `}</style>
    </div>
  );
}

export const AssetNode = memo(AssetNodeComponent);

// ============================================================================
// SENSOR NODE
// ============================================================================

export interface SensorNodeData {
  label: string;
  parameter: string;
  value: number;
  unit: string;
  min: number;
  max: number;
  status: 'normal' | 'warning' | 'alarm';
  [key: string]: unknown;
}

function SensorNodeComponent({ data, selected }: NodeProps) {
  const nodeData = data as unknown as SensorNodeData;
  const statusColor = statusColors[nodeData.status] || '#10b981';
  const isAlarm = nodeData.status === 'alarm';
  const isWarning = nodeData.status === 'warning';

  const percentage = nodeData.max !== nodeData.min
    ? Math.min(100, Math.max(0, ((nodeData.value - nodeData.min) / (nodeData.max - nodeData.min)) * 100))
    : 50;

  return (
    <div style={{
      ...nodeBaseStyle,
      minWidth: '140px',
      borderColor: isAlarm ? '#ef4444' : isWarning ? '#f59e0b' : selected ? '#10b981' : 'rgba(148,163,184,0.15)',
      boxShadow: isAlarm
        ? '0 0 16px rgba(239,68,68,0.3), inset 0 0 0 1px rgba(239,68,68,0.1)'
        : isWarning
          ? '0 0 12px rgba(245,158,11,0.2)'
          : selected
            ? '0 0 16px rgba(16,185,129,0.2)'
            : '0 4px 12px rgba(0,0,0,0.3)',
      animation: isAlarm ? 'sensorPulse 1.5s infinite' : 'none',
    }}>
      <Handle type="target" position={Position.Left} style={{ background: statusColor, border: '2px solid #1e293b', width: 8, height: 8 }} />

      <div style={{ padding: '8px 10px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
          <Radio size={12} style={{ color: statusColor }} />
          <span style={{ fontSize: 10, fontWeight: 700, color: '#e2e8f0', letterSpacing: 0.5 }}>{nodeData.label}</span>
        </div>

        <div style={{ fontSize: 9, color: '#64748b', marginBottom: 4 }}>{nodeData.parameter}</div>

        <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginBottom: 6 }}>
          <span style={{
            fontSize: 22, fontWeight: 700, fontFamily: 'monospace',
            color: statusColor,
          }}>
            {typeof nodeData.value === 'number' ? nodeData.value.toFixed(1) : nodeData.value}
          </span>
          <span style={{ fontSize: 11, color: '#94a3b8' }}>{nodeData.unit}</span>
        </div>

        {/* Gauge bar */}
        <div style={{ height: 4, background: 'rgba(148,163,184,0.12)', borderRadius: 2, position: 'relative' }}>
          <div style={{
            height: '100%', width: `${percentage}%`, background: statusColor, borderRadius: 2,
            transition: 'width 0.5s',
          }} />
          <div style={{ position: 'absolute', top: -2, left: 0, width: 1, height: 8, background: '#475569', borderRadius: 0.5 }} />
          <div style={{ position: 'absolute', top: -2, right: 0, width: 1, height: 8, background: '#475569', borderRadius: 0.5 }} />
        </div>

        {isAlarm && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 4 }}>
            <AlertTriangle size={10} style={{ color: '#ef4444' }} />
            <span style={{ fontSize: 9, color: '#ef4444', fontWeight: 600 }}>OUT OF RANGE</span>
          </div>
        )}
      </div>

      <Handle type="source" position={Position.Right} style={{ background: statusColor, border: '2px solid #1e293b', width: 8, height: 8 }} />

      <style>{`
        @keyframes sensorPulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.85; transform: scale(1.02); }
        }
      `}</style>
    </div>
  );
}

export const SensorNode = memo(SensorNodeComponent);

// ============================================================================
// VALVE NODE
// ============================================================================

export interface ValveNodeData {
  label: string;
  state: 'open' | 'closed' | 'partial';
  valveType?: string;
  [key: string]: unknown;
}

function ValveNodeComponent({ data, selected }: NodeProps) {
  const nodeData = data as unknown as ValveNodeData;
  const isOpen = nodeData.state === 'open';
  const isClosed = nodeData.state === 'closed';
  const color = isOpen ? '#10b981' : isClosed ? '#ef4444' : '#f59e0b';
  const Icon = isOpen ? ChevronUp : ChevronDown;

  return (
    <div style={{
      ...nodeBaseStyle,
      minWidth: '80px',
      borderColor: selected ? '#10b981' : `${color}40`,
      boxShadow: selected ? '0 0 16px rgba(16,185,129,0.2)' : '0 4px 12px rgba(0,0,0,0.3)',
    }}>
      <Handle type="target" position={Position.Left} style={{ background: color, border: '2px solid #1e293b', width: 8, height: 8 }} />

      <div style={{ padding: '10px 14px', textAlign: 'center' }}>
        <div style={{
          width: 40, height: 40, borderRadius: '50%',
          background: `${color}15`, border: `2px solid ${color}50`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          margin: '0 auto 6px', position: 'relative',
        }}>
          <Icon size={20} style={{ color }} />
          <div style={{
            position: 'absolute', top: -4, left: '50%', transform: 'translateX(-50%)',
            width: 8, height: 8, borderRadius: '50%',
            background: color,
          }} />
        </div>

        <div style={{ fontSize: 10, fontWeight: 700, color: '#e2e8f0' }}>{nodeData.label}</div>
        <div style={{
          fontSize: 9, fontWeight: 600, textTransform: 'uppercase', marginTop: 2,
          color,
        }}>
          {nodeData.state}
        </div>
        {nodeData.valveType && (
          <div style={{ fontSize: 8, color: '#64748b', marginTop: 1, textTransform: 'capitalize' }}>
            {nodeData.valveType}
          </div>
        )}
      </div>

      <Handle type="source" position={Position.Right} style={{ background: color, border: '2px solid #1e293b', width: 8, height: 8 }} />
    </div>
  );
}

export const ValveNode = memo(ValveNodeComponent);

// ============================================================================
// JUNCTION NODE
// ============================================================================

export interface JunctionNodeData {
  label?: string;
  [key: string]: unknown;
}

function JunctionNodeComponent({ data, selected }: NodeProps) {
  const nodeData = data as unknown as JunctionNodeData;

  return (
    <>
      <Handle type="target" position={Position.Left} style={{ background: '#64748b', border: '2px solid #1e293b', width: 8, height: 8 }} />
      <div style={{
        width: 24, height: 24, borderRadius: '50%',
        background: '#334155',
        border: `2px solid ${selected ? '#10b981' : '#475569'}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        boxShadow: selected ? '0 0 12px rgba(16,185,129,0.3)' : '0 2px 8px rgba(0,0,0,0.4)',
      }}>
        <CircleDot size={10} style={{ color: '#94a3b8' }} />
      </div>
      {nodeData.label && (
        <div style={{
          position: 'absolute', top: -18, left: '50%', transform: 'translateX(-50%)',
          fontSize: 8, color: '#64748b', fontWeight: 600, whiteSpace: 'nowrap',
          background: '#1e293b', padding: '1px 6px', borderRadius: 4,
        }}>
          {nodeData.label}
        </div>
      )}
      <Handle type="source" position={Position.Right} style={{ background: '#64748b', border: '2px solid #1e293b', width: 8, height: 8 }} />
    </>
  );
}

export const JunctionNode = memo(JunctionNodeComponent);

// ============================================================================
// PUMP NODE — Industrial pump symbol
// ============================================================================

export interface PumpNodeData {
  label: string;
  pumpType?: 'centrifugal' | 'reciprocating' | 'gear' | 'diaphragm' | 'submersible';
  status?: 'running' | 'stopped' | 'fault';
  health?: number;
  flowRate?: number;
  head?: number;
  [key: string]: unknown;
}

function PumpNodeComponent({ data, selected }: NodeProps) {
  const nodeData = data as unknown as PumpNodeData;
  const statusColor = statusColors[nodeData.status || 'stopped'] || '#6b7280';
  const isRunning = nodeData.status === 'running';
  const isFault = nodeData.status === 'fault';

  return (
    <div style={{
      ...nodeBaseStyle,
      minWidth: '160px',
      borderColor: isFault ? '#ef4444' : selected ? '#10b981' : `rgba(148,163,184,0.15)`,
      boxShadow: isFault
        ? '0 0 16px rgba(239,68,68,0.25)'
        : selected
          ? '0 0 20px rgba(16,185,129,0.2)'
          : '0 4px 12px rgba(0,0,0,0.3)',
    }}>
      <Handle type="target" position={Position.Left} style={{ background: statusColor, border: '2px solid #1e293b', width: 10, height: 10 }} />

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px 6px' }}>
        {/* Pump symbol — circle with rotating animation */}
        <div style={{
          width: 36, height: 36, borderRadius: '50%',
          background: `${statusColor}15`, border: `2px solid ${statusColor}50`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          position: 'relative', flexShrink: 0,
        }}>
          <div style={{
            animation: isRunning ? 'pumpSpin 2s linear infinite' : 'none',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            {/* Pump impeller blades */}
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="3" fill={statusColor} opacity={0.6} />
              <path d="M12 2C12 2 14 8 12 9C10 10 4 8 4 8" stroke={statusColor} strokeWidth="2" strokeLinecap="round" />
              <path d="M12 2C12 2 14 8 12 9C10 10 4 8 4 8" stroke={statusColor} strokeWidth="2" strokeLinecap="round" transform="rotate(120 12 12)" />
              <path d="M12 2C12 2 14 8 12 9C10 10 4 8 4 8" stroke={statusColor} strokeWidth="2" strokeLinecap="round" transform="rotate(240 12 12)" />
            </svg>
          </div>
          {/* Status dot */}
          <div style={{
            position: 'absolute', top: -2, right: -2,
            width: 10, height: 10, borderRadius: '50%',
            background: statusColor,
            boxShadow: isRunning ? `0 0 6px ${statusColor}` : 'none',
            animation: isRunning ? 'pulse 2s infinite' : 'none',
          }} />
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#f1f5f9', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {nodeData.label}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
            <span style={{ fontSize: 9, fontWeight: 600, textTransform: 'uppercase', color: statusColor }}>
              {nodeData.status || 'stopped'}
            </span>
            <span style={{ fontSize: 8, color: '#64748b', textTransform: 'capitalize' }}>
              {nodeData.pumpType || 'centrifugal'}
            </span>
          </div>
        </div>
      </div>

      {/* Parameters */}
      <div style={{
        padding: '6px 12px 8px', borderTop: '1px solid rgba(148,163,184,0.08)',
        display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2px 8px',
      }}>
        {nodeData.flowRate !== undefined && (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 9, color: '#64748b' }}>Flow</span>
            <span style={{ fontSize: 9, color: '#cbd5e1', fontWeight: 600, fontFamily: 'monospace' }}>{nodeData.flowRate} m³/h</span>
          </div>
        )}
        {nodeData.head !== undefined && (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 9, color: '#64748b' }}>Head</span>
            <span style={{ fontSize: 9, color: '#cbd5e1', fontWeight: 600, fontFamily: 'monospace' }}>{nodeData.head} m</span>
          </div>
        )}
      </div>

      {/* Health */}
      {nodeData.health !== undefined && (
        <div style={{ padding: '0 12px 8px' }}>
          <HealthBar health={nodeData.health} />
        </div>
      )}

      <Handle type="source" position={Position.Right} style={{ background: statusColor, border: '2px solid #1e293b', width: 10, height: 10 }} />

      <style>{`
        @keyframes pumpSpin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
      `}</style>
    </div>
  );
}

export const PumpNode = memo(PumpNodeComponent);

// ============================================================================
// TANK NODE — Storage tank with fill level
// ============================================================================

export interface TankNodeData {
  label: string;
  fillLevel?: number; // 0-100
  capacity?: number;
  temperature?: number;
  levelStatus?: 'high' | 'normal' | 'low';
  medium?: string;
  [key: string]: unknown;
}

function TankNodeComponent({ data, selected }: NodeProps) {
  const nodeData = data as unknown as TankNodeData;
  const fillLevel = nodeData.fillLevel ?? 0;
  const levelStatus = nodeData.levelStatus || 'normal';

  const levelColorMap: Record<string, string> = { high: '#f59e0b', normal: '#10b981', low: '#ef4444' };
  const levelColor = levelColorMap[levelStatus] || '#10b981';
  const tempColor = (nodeData.temperature ?? 0) > 60 ? '#ef4444' : (nodeData.temperature ?? 0) > 40 ? '#f59e0b' : '#10b981';

  return (
    <div style={{
      ...nodeBaseStyle,
      minWidth: '140px',
      borderColor: selected ? '#10b981' : levelStatus === 'low' ? '#ef444480' : 'rgba(148,163,184,0.15)',
      boxShadow: selected ? '0 0 20px rgba(16,185,129,0.2)' : levelStatus === 'low' ? '0 0 12px rgba(239,68,68,0.15)' : '0 4px 12px rgba(0,0,0,0.3)',
    }}>
      <Handle type="target" position={Position.Left} style={{ background: levelColor, border: '2px solid #1e293b', width: 8, height: 8 }} />

      <div style={{ padding: '10px 12px 6px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
          <Warehouse size={14} style={{ color: levelColor }} />
          <span style={{ fontSize: 11, fontWeight: 700, color: '#f1f5f9', flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {nodeData.label}
          </span>
          {nodeData.medium && (
            <span style={{ fontSize: 8, color: '#64748b', background: 'rgba(148,163,184,0.1)', padding: '1px 6px', borderRadius: 4 }}>
              {nodeData.medium}
            </span>
          )}
        </div>

        {/* Tank visual */}
        <div style={{
          width: '100%', height: 60, borderRadius: 8,
          border: '2px solid rgba(148,163,184,0.2)',
          background: 'rgba(15,23,42,0.6)',
          position: 'relative', overflow: 'hidden',
          marginBottom: 6,
        }}>
          {/* Fill level bar */}
          <div style={{
            position: 'absolute', bottom: 0, left: 0, right: 0,
            height: `${fillLevel}%`,
            background: `linear-gradient(to top, ${levelColor}60, ${levelColor}30)`,
            borderTop: `2px solid ${levelColor}80`,
            transition: 'height 0.5s',
          }} />
          {/* Level markers */}
          {[25, 50, 75].map((mark) => (
            <div key={mark} style={{
              position: 'absolute', left: 4, right: 4,
              bottom: `${mark}%`, height: 1,
              background: 'rgba(148,163,184,0.1)',
            }} />
          ))}
          {/* Fill percentage */}
          <div style={{
            position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
            fontSize: 16, fontWeight: 800, fontFamily: 'monospace', color: levelColor,
            textShadow: '0 1px 4px rgba(0,0,0,0.5)',
          }}>
            {fillLevel}%
          </div>
        </div>

        {/* Metrics row */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
          {/* Level status badge */}
          <div style={{
            fontSize: 8, fontWeight: 700, textTransform: 'uppercase',
            color: levelColor, background: `${levelColor}15`,
            padding: '2px 8px', borderRadius: 4,
            border: `1px solid ${levelColor}30`,
          }}>
            {levelStatus}
          </div>
          {nodeData.capacity !== undefined && (
            <span style={{ fontSize: 9, color: '#94a3b8' }}>
              {nodeData.capacity} L
            </span>
          )}
          {nodeData.temperature !== undefined && (
            <span style={{ fontSize: 9, color: tempColor, fontWeight: 600, fontFamily: 'monospace' }}>
              <Thermometer size={8} style={{ verticalAlign: -1, marginRight: 2 }} />
              {nodeData.temperature}°C
            </span>
          )}
        </div>
      </div>

      <Handle type="source" position={Position.Right} style={{ background: levelColor, border: '2px solid #1e293b', width: 8, height: 8 }} />
    </div>
  );
}

export const TankNode = memo(TankNodeComponent);

// ============================================================================
// MOTOR NODE — Electric motor
// ============================================================================

export interface MotorNodeData {
  label: string;
  rpm?: number;
  powerRating?: number;
  status?: 'running' | 'stopped' | 'fault';
  vibration?: number;
  temperature?: number;
  current?: number;
  [key: string]: unknown;
}

function MotorNodeComponent({ data, selected }: NodeProps) {
  const nodeData = data as unknown as MotorNodeData;
  const statusColor = statusColors[nodeData.status || 'stopped'] || '#6b7280';
  const isRunning = nodeData.status === 'running';
  const isFault = nodeData.status === 'fault';

  const vibColor = (nodeData.vibration ?? 0) > 7 ? '#ef4444' : (nodeData.vibration ?? 0) > 4 ? '#f59e0b' : '#10b981';
  const tempColor = (nodeData.temperature ?? 0) > 80 ? '#ef4444' : (nodeData.temperature ?? 0) > 65 ? '#f59e0b' : '#10b981';

  return (
    <div style={{
      ...nodeBaseStyle,
      minWidth: '160px',
      borderColor: isFault ? '#ef4444' : selected ? '#10b981' : 'rgba(148,163,184,0.15)',
      boxShadow: isFault
        ? '0 0 16px rgba(239,68,68,0.25)'
        : selected
          ? '0 0 20px rgba(16,185,129,0.2)'
          : '0 4px 12px rgba(0,0,0,0.3)',
    }}>
      <Handle type="target" position={Position.Left} style={{ background: statusColor, border: '2px solid #1e293b', width: 10, height: 10 }} />

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px 6px' }}>
        {/* Motor symbol — gear/cog */}
        <div style={{
          width: 36, height: 36, borderRadius: 8,
          background: `${statusColor}15`, border: `2px solid ${statusColor}40`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          position: 'relative', flexShrink: 0,
        }}>
          <Cog size={20} style={{ color: statusColor, animation: isRunning ? 'motorSpin 1.5s linear infinite' : 'none' }} />
          {/* Status dot */}
          <div style={{
            position: 'absolute', top: -2, right: -2,
            width: 10, height: 10, borderRadius: '50%',
            background: statusColor,
            boxShadow: isRunning ? `0 0 6px ${statusColor}` : 'none',
          }} />
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#f1f5f9', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {nodeData.label}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
            <span style={{ fontSize: 9, fontWeight: 600, textTransform: 'uppercase', color: statusColor }}>
              {nodeData.status || 'stopped'}
            </span>
            <div style={{ width: 1, height: 8, background: 'rgba(148,163,184,0.2)' }} />
            <Zap size={8} style={{ color: '#94a3b8' }} />
            <span style={{ fontSize: 9, color: '#94a3b8', fontFamily: 'monospace' }}>
              {nodeData.powerRating ?? 0} kW
            </span>
          </div>
        </div>
      </div>

      {/* RPM + Vibration */}
      <div style={{
        padding: '6px 12px 8px', borderTop: '1px solid rgba(148,163,184,0.08)',
        display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '2px 8px',
      }}>
        {nodeData.rpm !== undefined && (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 9, color: '#64748b' }}>RPM</span>
            <span style={{ fontSize: 9, color: '#cbd5e1', fontWeight: 600, fontFamily: 'monospace' }}>{nodeData.rpm}</span>
          </div>
        )}
        {nodeData.current !== undefined && (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 9, color: '#64748b' }}>I</span>
            <span style={{ fontSize: 9, color: '#cbd5e1', fontWeight: 600, fontFamily: 'monospace' }}>{nodeData.current}A</span>
          </div>
        )}
        {nodeData.vibration !== undefined && (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 9, color: '#64748b' }}>Vib</span>
            <span style={{ fontSize: 9, color: vibColor, fontWeight: 600, fontFamily: 'monospace' }}>{nodeData.vibration}</span>
          </div>
        )}
      </div>

      {/* Vibration bar */}
      {nodeData.vibration !== undefined && (
        <div style={{ padding: '0 12px 8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{ flex: 1, height: 3, background: 'rgba(148,163,184,0.12)', borderRadius: 2 }}>
              <div style={{
                height: '100%',
                width: `${Math.min(100, (nodeData.vibration / 10) * 100)}%`,
                background: vibColor, borderRadius: 2,
              }} />
            </div>
            <span style={{ fontSize: 8, color: vibColor, fontWeight: 600 }}>mm/s</span>
          </div>
        </div>
      )}

      <Handle type="source" position={Position.Right} style={{ background: statusColor, border: '2px solid #1e293b', width: 10, height: 10 }} />

      <style>{`
        @keyframes motorSpin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}

export const MotorNode = memo(MotorNodeComponent);

// ============================================================================
// PIPE NODE — Pipe segment with animated flow
// ============================================================================

export interface PipeNodeData {
  label: string;
  diameter?: string;
  material?: string;
  flowRate?: number;
  pressure?: number;
  flowDirection?: 'forward' | 'reverse';
  [key: string]: unknown;
}

export interface InstrumentNodeData {
  label?: string;
  tag?: string;
  measureType?: string;
  value?: number | null;
  unit?: string;
  alarmHigh?: number | null;
  alarmLow?: number | null;
  status?: string;
  [key: string]: unknown;
}

export interface ElectricalNodeData {
  label?: string;
  name?: string;
  equipType?: 'switchgear' | 'transformer' | 'mcc' | 'breaker' | 'generator';
  voltage?: number | null;
  current?: number | null;
  power?: number | null;
  status?: 'energized' | 'deenergized' | 'fault' | 'maintenance';
  [key: string]: unknown;
}

export interface ControlNodeData {
  label?: string;
  name?: string;
  controllerType?: 'PLC' | 'DCS' | 'SIS' | 'SCADA';
  ioCount?: { in: number; out: number } | number;
  scanRate?: number | null;
  status?: 'running' | 'stopped' | 'fault' | 'programming';
  program?: string | null;
  [key: string]: unknown;
}

export interface HeatExchangerNodeData {
  label?: string;
  name?: string;
  exchangerType?: 'shell_tube' | 'plate' | 'air_cooled';
  hotIn?: number | null;
  hotOut?: number | null;
  coldIn?: number | null;
  coldOut?: number | null;
  effectiveness?: number | null;
  status?: 'operational' | 'fouled' | 'bypass' | 'offline';
  [key: string]: unknown;
}

export interface VesselNodeData {
  label?: string;
  name?: string;
  vesselType?: 'separator' | 'reactor' | 'distillation' | 'absorber' | 'flash';
  pressure?: number | null;
  temperature?: number | null;
  level?: number | null;
  status?: 'operational' | 'shutdown' | 'alarm' | 'maintenance';
  [key: string]: unknown;
}

function PipeNodeComponent({ data, selected }: NodeProps) {
  const nodeData = data as unknown as PipeNodeData;
  const pressureColor = (nodeData.pressure ?? 0) > 10 ? '#ef4444' : (nodeData.pressure ?? 0) > 6 ? '#f59e0b' : '#06b6d4';

  return (
    <div style={{
      ...nodeBaseStyle,
      minWidth: '180px',
      borderColor: selected ? '#06b6d4' : 'rgba(148,163,184,0.15)',
      boxShadow: selected ? '0 0 20px rgba(6,182,212,0.2)' : '0 4px 12px rgba(0,0,0,0.3)',
    }}>
      <Handle type="target" position={Position.Left} style={{ background: '#06b6d4', border: '2px solid #1e293b', width: 10, height: 10 }} />

      <div style={{ padding: '8px 12px 6px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
          <Droplets size={12} style={{ color: '#06b6d4' }} />
          <span style={{ fontSize: 11, fontWeight: 700, color: '#f1f5f9', flex: 1 }}>{nodeData.label}</span>
          {nodeData.diameter && (
            <span style={{ fontSize: 8, color: '#94a3b8', background: 'rgba(6,182,212,0.1)', padding: '1px 6px', borderRadius: 4, fontWeight: 600 }}>
              DN{nodeData.diameter}
            </span>
          )}
        </div>

        {/* Animated pipe */}
        <div style={{
          width: '100%', height: 12, borderRadius: 6,
          background: 'rgba(6,182,212,0.08)',
          border: '1px solid rgba(6,182,212,0.2)',
          position: 'relative', overflow: 'hidden',
          marginBottom: 6,
        }}>
          {/* Flow animation */}
          <div style={{
            position: 'absolute', inset: 2, borderRadius: 4,
            background: 'linear-gradient(90deg, transparent, rgba(6,182,212,0.4), transparent)',
            backgroundSize: '20px 100%',
            animation: nodeData.flowRate ? 'pipeFlow 1s linear infinite' : 'none',
          }} />
          {/* Direction arrow */}
          <div style={{
            position: 'absolute', top: '50%', left: nodeData.flowDirection === 'reverse' ? '15%' : '75%', transform: 'translateY(-50%)',
            color: '#06b6d4', fontSize: 8,
            opacity: nodeData.flowRate ? 1 : 0.3,
          }}>
            {nodeData.flowDirection === 'reverse' ? '◀' : '▶'}
          </div>
        </div>

        {/* Specs row */}
        <div style={{
          display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '2px 8px',
          borderTop: '1px solid rgba(148,163,184,0.08)', paddingTop: 6,
        }}>
          {nodeData.flowRate !== undefined && (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 8, color: '#64748b' }}>Flow</span>
              <span style={{ fontSize: 9, color: '#cbd5e1', fontWeight: 600, fontFamily: 'monospace' }}>{nodeData.flowRate} m³/h</span>
            </div>
          )}
          {nodeData.pressure !== undefined && (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 8, color: '#64748b' }}>P</span>
              <span style={{ fontSize: 9, color: pressureColor, fontWeight: 600, fontFamily: 'monospace' }}>{nodeData.pressure} bar</span>
            </div>
          )}
          {nodeData.material && (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 8, color: '#64748b' }}>Mat</span>
              <span style={{ fontSize: 8, color: '#94a3b8', textTransform: 'capitalize' }}>{nodeData.material}</span>
            </div>
          )}
        </div>
      </div>

      <Handle type="source" position={Position.Right} style={{ background: '#06b6d4', border: '2px solid #1e293b', width: 10, height: 10 }} />

      <style>{`
        @keyframes pipeFlow {
          0% { background-position: -20px 0; }
          100% { background-position: 20px 0; }
        }
      `}</style>
    </div>
  );
}

export const PipeNode = memo(PipeNodeComponent);

// ============================================================================
// INSTRUMENT NODE — P&ID bubble
// ============================================================================

function InstrumentNodeComponent({ data, selected }: NodeProps<InstrumentNodeData>) {
  const tag = data.tag || 'PT-001';
  const measureType = data.measureType || 'Pressure';
  const value = data.value ?? null;
  const unit = data.unit || 'bar';
  const alarmHigh = data.alarmHigh ?? null;
  const alarmLow = data.alarmLow ?? null;
  const isAlarmed = isInstrumentAlarm(value, alarmHigh, alarmLow);

  return (
    <div className={`relative ${selected ? 'ring-2 ring-amber-400 ring-offset-1 ring-offset-slate-900' : ''}`}>
      {/* P&ID bubble shape */}
      <div className={`w-[72px] h-[52px] rounded-lg border-2 flex flex-col items-center justify-center relative overflow-hidden ${
        isAlarmed ? 'border-red-400 bg-red-950/60' : 'border-cyan-400 bg-cyan-950/40'
      }`}>
        {/* Top line (instrument line) */}
        <div className={`absolute top-0 left-1/2 -translate-x-1/2 w-px h-2 ${isAlarmed ? 'bg-red-400' : 'bg-cyan-400'}`} />
        
        {/* Tag number */}
        <span className="text-[9px] font-bold text-cyan-300 tracking-wide">{tag}</span>
        
        {/* Value display */}
        {value !== null ? (
          <span className={`text-sm font-mono font-bold ${isAlarmed ? 'text-red-400' : 'text-white'}`}>
            {typeof value === 'number' ? value.toFixed(1) : value}
            <span className="text-[8px] text-slate-400 ml-0.5">{unit}</span>
          </span>
        ) : (
          <span className="text-[8px] text-slate-500">-- {unit}</span>
        )}

        {/* Alarm indicator */}
        {isAlarmed && (
          <div className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-red-500 animate-pulse" />
        )}

        {/* Measure type badge */}
        <span className="absolute -bottom-3 left-1/2 -translate-x-1/2 text-[7px] text-slate-500 whitespace-nowrap bg-slate-900 px-1">
          {measureType}
        </span>
      </div>
    </div>
  );
}

export const InstrumentNode = memo(InstrumentNodeComponent);

// ============================================================================
// ELECTRICAL NODE — Single-line symbol
// ============================================================================

function ElectricalNodeComponent({ data, selected }: NodeProps<ElectricalNodeData>) {
  const name = data.name || 'MCC-01';
  const equipType = data.equipType || 'switchgear';
  const voltage = data.voltage ?? null;
  const current = data.current ?? null;
  const status = data.status || 'energized';
  const power = data.power ?? null;

  const statusColor = status === 'energized' ? 'text-emerald-400 border-emerald-500/50' :
    status === 'fault' ? 'text-red-400 border-red-500/50' :
    status === 'maintenance' ? 'text-amber-400 border-amber-500/50' :
    'text-slate-400 border-slate-500/50';

  const bgColor = status === 'energized' ? 'bg-emerald-950/40' :
    status === 'fault' ? 'bg-red-950/40' :
    status === 'maintenance' ? 'bg-amber-950/40' :
    'bg-slate-800/40';

  const icon = equipType === 'transformer' ? '⏛' :
    equipType === 'generator' ? '⚡' :
    equipType === 'breaker' ? '⏻' :
    equipType === 'mcc' ? '⊞' : '⎍';

  return (
    <div className={`relative ${selected ? 'ring-2 ring-amber-400 ring-offset-1 ring-offset-slate-900' : ''}`}>
      <div className={`w-[80px] rounded-lg border-2 px-2 py-2 ${statusColor} ${bgColor}`}>
        {/* Equipment icon */}
        <div className="text-center text-lg mb-0.5">{icon}</div>
        
        {/* Name */}
        <div className="text-[8px] font-bold text-center truncate">{name}</div>
        
        {/* Voltage/Current */}
        <div className="text-center mt-1 space-y-0.5">
          {voltage !== null && (
            <div className="text-[9px] font-mono text-slate-300">
              {voltage}<span className="text-[7px] text-slate-500">V</span>
            </div>
          )}
          {current !== null && (
            <div className="text-[9px] font-mono text-slate-300">
              {current}<span className="text-[7px] text-slate-500">A</span>
            </div>
          )}
          {power !== null && (
            <div className="text-[9px] font-mono text-amber-300">
              {power}<span className="text-[7px] text-slate-500">kW</span>
            </div>
          )}
        </div>

        {/* Status dot */}
        <div className={`absolute -top-1.5 -right-1.5 w-3 h-3 rounded-full border border-slate-900 ${
          status === 'energized' ? 'bg-emerald-400' :
          status === 'fault' ? 'bg-red-500 animate-pulse' :
          status === 'maintenance' ? 'bg-amber-400' :
          'bg-slate-500'
        }`} />

        {/* Type label */}
        <span className="absolute -bottom-2.5 left-1/2 -translate-x-1/2 text-[7px] text-slate-500 whitespace-nowrap bg-slate-900 px-1 capitalize">
          {equipType}
        </span>
      </div>
    </div>
  );
}

export const ElectricalNode = memo(ElectricalNodeComponent);

// ============================================================================
// CONTROL NODE — PLC/DCS/Controller
// ============================================================================

function ControlNodeComponent({ data, selected }: NodeProps<ControlNodeData>) {
  const name = data.name || 'PLC-01';
  const controllerType = data.controllerType || 'PLC';
  const ioCount = data.ioCount ?? { in: 0, out: 0 };
  const scanRate = data.scanRate ?? null;
  const status = data.status || 'running';
  const program = data.program || null;

  const statusColor = status === 'running' ? 'text-emerald-400 border-emerald-500/50' :
    status === 'fault' ? 'text-red-400 border-red-500/50' :
    status === 'programming' ? 'text-violet-400 border-violet-500/50' :
    'text-slate-400 border-slate-500/50';

  const bgColor = status === 'running' ? 'bg-emerald-950/30' :
    status === 'fault' ? 'bg-red-950/30' :
    status === 'programming' ? 'bg-violet-950/30' :
    'bg-slate-800/40';

  return (
    <div className={`relative ${selected ? 'ring-2 ring-amber-400 ring-offset-1 ring-offset-slate-900' : ''}`}>
      <div className={`w-[84px] rounded-lg border-2 ${statusColor} ${bgColor}`}>
        {/* Header */}
        <div className={`text-center text-[8px] font-bold px-1 py-0.5 rounded-t-md ${
          status === 'running' ? 'bg-emerald-900/50' :
          status === 'fault' ? 'bg-red-900/50' :
          status === 'programming' ? 'bg-violet-900/50' :
          'bg-slate-700/50'
        }`}>
          {controllerType}
        </div>
        
        {/* Body */}
        <div className="px-2 py-1.5 text-center">
          <div className="text-[9px] font-semibold text-white mb-1">{name}</div>
          
          {/* I/O counts */}
          <div className="flex justify-center gap-2 text-[8px]">
            <span className="text-sky-400">I:{typeof ioCount === 'object' ? ioCount.in : 0}</span>
            <span className="text-emerald-400">O:{typeof ioCount === 'object' ? ioCount.out : 0}</span>
          </div>
          
          {/* Scan rate */}
          {scanRate !== null && (
            <div className="text-[7px] text-slate-400 mt-0.5">{scanRate}ms scan</div>
          )}
          
          {/* Program name */}
          {program && (
            <div className="text-[7px] text-violet-300 mt-0.5 truncate max-w-full">{program}</div>
          )}
        </div>

        {/* Running indicator */}
        {status === 'running' && (
          <div className="absolute -top-1.5 -right-1.5 w-3 h-3 rounded-full bg-emerald-400 animate-pulse border border-slate-900" />
        )}
        {status === 'fault' && (
          <div className="absolute -top-1.5 -right-1.5 w-3 h-3 rounded-full bg-red-500 animate-pulse border border-slate-900" />
        )}
      </div>
    </div>
  );
}

export const ControlNode = memo(ControlNodeComponent);

// ============================================================================
// HEAT EXCHANGER NODE
// ============================================================================

function HeatExchangerNodeComponent({ data, selected }: NodeProps<HeatExchangerNodeData>) {
  const name = data.name || 'HE-001';
  const exchangerType = data.exchangerType || 'shell_tube';
  const hotIn = data.hotIn ?? null;
  const hotOut = data.hotOut ?? null;
  const coldIn = data.coldIn ?? null;
  const coldOut = data.coldOut ?? null;
  const effectiveness = data.effectiveness ?? null;
  const status = data.status || 'operational';

  const statusColor = status === 'operational' ? 'border-orange-500/50' :
    status === 'fouled' ? 'border-amber-500/50' :
    status === 'bypass' ? 'border-slate-500/50' :
    'border-red-500/50';

  return (
    <div className={`relative ${selected ? 'ring-2 ring-amber-400 ring-offset-1 ring-offset-slate-900' : ''}`}>
      <div className={`w-[90px] rounded-lg border-2 ${statusColor} bg-orange-950/20 p-1.5`}>
        {/* Shell/Tube visual */}
        <div className="relative h-8 rounded border border-orange-600/30 bg-slate-800/60 mb-1 overflow-hidden">
          {/* Tubes */}
          <div className="absolute inset-y-1 left-1 right-1 flex justify-between">
            {[0,1,2,3].map(i => (
              <div key={i} className={`w-0.5 rounded ${status === 'fouled' ? 'bg-amber-600' : 'bg-orange-400'}`} />
            ))}
          </div>
          {/* Flow arrows */}
          <div className="absolute inset-0 flex items-center justify-center text-[8px] text-orange-300">
            ⇄
          </div>
        </div>
        
        {/* Name */}
        <div className="text-[8px] font-bold text-center text-orange-200">{name}</div>
        
        {/* Temperatures */}
        <div className="grid grid-cols-2 gap-x-1 mt-1 text-[7px]">
          <div className="text-center">
            <div className="text-red-400">{hotIn !== null ? `${hotIn}°` : '--'}</div>
            <div className="text-red-300/60">Hot In</div>
          </div>
          <div className="text-center">
            <div className="text-blue-400">{coldIn !== null ? `${coldIn}°` : '--'}</div>
            <div className="text-blue-300/60">Cold In</div>
          </div>
          <div className="text-center">
            <div className="text-red-300">{hotOut !== null ? `${hotOut}°` : '--'}</div>
            <div className="text-red-300/60">Hot Out</div>
          </div>
          <div className="text-center">
            <div className="text-blue-300">{coldOut !== null ? `${coldOut}°` : '--'}</div>
            <div className="text-blue-300/60">Cold Out</div>
          </div>
        </div>
        
        {/* Effectiveness */}
        {effectiveness !== null && (
          <div className="text-center mt-1">
            <span className="text-[8px] text-orange-300 font-mono">{effectiveness}% eff</span>
          </div>
        )}
      </div>
    </div>
  );
}

export const HeatExchangerNode = memo(HeatExchangerNodeComponent);

// ============================================================================
// VESSEL NODE — Distillation column, reactor, separator
// ============================================================================

function VesselNodeComponent({ data, selected }: NodeProps<VesselNodeData>) {
  const name = data.name || 'V-001';
  const vesselType = data.vesselType || 'separator';
  const pressure = data.pressure ?? null;
  const temperature = data.temperature ?? null;
  const level = data.level ?? null;
  const status = data.status || 'operational';

  const statusColor = status === 'operational' ? 'border-slate-400/50' :
    status === 'shutdown' ? 'border-slate-600/50' :
    status === 'alarm' ? 'border-red-500/50' :
    'border-amber-500/50';

  // Height varies by vessel type
  const height = vesselType === 'distillation' ? 'h-[100px]' :
    vesselType === 'reactor' ? 'h-[80px]' :
    'h-[70px]';

  return (
    <div className={`relative ${selected ? 'ring-2 ring-amber-400 ring-offset-1 ring-offset-slate-900' : ''}`}>
      <div className={`w-[64px] ${height} rounded-xl border-2 ${statusColor} bg-slate-800/60 overflow-hidden`}>
        {/* Vessel body */}
        <div className="absolute inset-1 rounded-lg border border-slate-600/30">
          {/* Level fill */}
          {level !== null && (
            <div
              className="absolute bottom-0 left-0 right-0 bg-cyan-800/40 transition-all duration-700"
              style={{ height: `${Math.min(100, Math.max(0, level))}%` }}
            />
          )}
          
          {/* Internals for distillation */}
          {vesselType === 'distillation' && (
            <div className="absolute inset-x-1 top-2 bottom-2 flex flex-col justify-between">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="h-px bg-slate-500/40" />
              ))}
            </div>
          )}
        </div>

        {/* Name at top */}
        <div className="relative z-10 text-center pt-1">
          <div className="text-[8px] font-bold text-slate-200">{name}</div>
        </div>
        
        {/* Operating params at bottom */}
        <div className="absolute bottom-1 left-0 right-0 z-10 text-center space-y-0.5">
          {pressure !== null && (
            <div className="text-[7px] font-mono text-amber-300">{pressure} bar</div>
          )}
          {temperature !== null && (
            <div className="text-[7px] font-mono text-red-300">{temperature}°C</div>
          )}
          {level !== null && (
            <div className="text-[7px] font-mono text-cyan-300">{level}%</div>
          )}
        </div>

        {/* Top/bottom nozzles */}
        <div className="absolute -top-2 left-1/2 -translate-x-1/2 w-4 h-2 bg-slate-600 rounded-t" />
        <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-4 h-2 bg-slate-600 rounded-b" />
      </div>
      
      {/* Type label */}
      <span className="absolute -bottom-4 left-1/2 -translate-x-1/2 text-[7px] text-slate-500 whitespace-nowrap bg-slate-900 px-1 capitalize">
        {vesselType}
      </span>
    </div>
  );
}

export const VesselNode = memo(VesselNodeComponent);

// ============================================================================
// CUSTOM EDGE TYPES
// ============================================================================

// --- Process Flow Edge (animated dots + flowing dashes) ---

export interface ProcessFlowEdgeData {
  flowStatus?: 'normal' | 'warning' | 'alarm' | 'inactive';
  flowDirection?: 'forward' | 'reverse';
  label?: string;
  [key: string]: unknown;
}

function ProcessFlowEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
  selected,
}: EdgeProps) {
  const edgeData = data as ProcessFlowEdgeData | undefined;
  const flowStatus = edgeData?.flowStatus || 'normal';
  const flowDirection = edgeData?.flowDirection || 'forward';
  const isActive = flowStatus !== 'inactive';

  const colorMap: Record<string, string> = {
    normal: '#10b981',
    warning: '#f59e0b',
    alarm: '#ef4444',
    inactive: '#475569',
  };
  const edgeColor = colorMap[flowStatus] || '#10b981';

  const [edgePath] = getBezierPath({
    sourceX, sourceY, targetX, targetY,
    sourcePosition, targetPosition,
  });

  const animDur = flowStatus === 'alarm' ? '1s' : flowStatus === 'warning' ? '2s' : '3s';
  const animDurDash = flowStatus === 'alarm' ? '0.5s' : flowStatus === 'warning' ? '1s' : '1.5s';

  return (
    <>
      {/* Glow layer */}
      {isActive && (
        <path
          d={edgePath}
          fill="none"
          stroke={edgeColor}
          strokeWidth={6}
          strokeOpacity={0.15}
          style={{ filter: 'blur(3px)' }}
        />
      )}
      {/* Flowing dashed layer (animated) */}
      {isActive && (
        <path
          d={edgePath}
          fill="none"
          stroke={edgeColor}
          strokeWidth={2}
          strokeDasharray="6 4"
          strokeOpacity={0.25}
          style={{
            animation: `${flowDirection === 'reverse' ? 'edge-flow-reverse' : 'edge-flow'} ${animDurDash} linear infinite`,
          }}
        />
      )}
      {/* Main solid path */}
      <path
        d={edgePath}
        fill="none"
        stroke={edgeColor}
        strokeWidth={isActive ? 2.5 : 1.5}
        strokeOpacity={isActive ? 0.7 : 0.3}
        strokeDasharray={isActive ? undefined : '6 4'}
      />
      {/* Animated traveling dot */}
      {isActive && (
        <circle r="4" fill={edgeColor} filter={`drop-shadow(0 0 3px ${edgeColor})`}>
          <animateMotion dur={animDur} repeatCount="indefinite" path={edgePath} />
        </circle>
      )}
      {/* Second trailing dot for richer animation */}
      {isActive && flowStatus === 'normal' && (
        <circle r="2.5" fill={edgeColor} opacity={0.4}>
          <animateMotion dur={animDur} repeatCount="indefinite" path={edgePath} begin="1.5s" />
        </circle>
      )}
      {/* Selection highlight */}
      {selected && (
        <path
          d={edgePath}
          fill="none"
          stroke="#10b981"
          strokeWidth={6}
          strokeOpacity={0.15}
        />
      )}
      {/* Label */}
      {edgeData?.label && (
        <text
          x={(sourceX + targetX) / 2}
          y={(sourceY + targetY) / 2 - 8}
          textAnchor="middle"
          fill="#94a3b8"
          fontSize={10}
          fontFamily="inherit"
          fontWeight={600}
          style={{ pointerEvents: 'none', userSelect: 'none' }}
        >
          {edgeData.label}
        </text>
      )}
    </>
  );
}

// --- Signal Edge (animated flowing dashes) ---

function SignalEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  selected,
}: EdgeProps) {
  const [edgePath] = getBezierPath({
    sourceX, sourceY, targetX, targetY,
    sourcePosition, targetPosition,
  });

  const edgeId = `signal-${id || Math.random().toString(36).substr(2, 9)}`;

  return (
    <>
      {/* Glow layer */}
      <path
        d={edgePath}
        fill="none"
        stroke="#8b5cf6"
        strokeWidth={4}
        strokeOpacity={0.08}
        style={{ filter: 'blur(2px)' }}
      />
      {/* Static background path */}
      <path
        d={edgePath}
        fill="none"
        stroke="#8b5cf6"
        strokeWidth={1.5}
        strokeDasharray="6 3"
        strokeOpacity={0.25}
      />
      {/* Animated flowing dash layer */}
      <path
        d={edgePath}
        fill="none"
        stroke="#8b5cf6"
        strokeWidth={1.5}
        strokeDasharray="6 3"
        strokeOpacity={0.6}
        style={{ animation: 'edge-flow 1.2s linear infinite' }}
      />
      {/* Animated traveling dot */}
      <circle r="2" fill="#8b5cf6" opacity={0.5}>
        <animateMotion dur="2.5s" repeatCount="indefinite" path={edgePath} />
      </circle>
      {selected && (
        <path
          d={edgePath}
          fill="none"
          stroke="#8b5cf6"
          strokeWidth={5}
          strokeOpacity={0.15}
        />
      )}
    </>
  );
}

// --- Pipe Edge (thick with gradient + animated flow) ---

interface PipeEdgeData {
  flowStatus?: 'normal' | 'warning' | 'alarm' | 'inactive';
  label?: string;
  [key: string]: unknown;
}

function PipeEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
  selected,
}: EdgeProps) {
  const pipeData = data as PipeEdgeData | undefined;
  const flowStatus = pipeData?.flowStatus || 'normal';
  const isActive = flowStatus !== 'inactive';

  const colorMap: Record<string, string> = {
    normal: '#06b6d4',
    warning: '#f59e0b',
    alarm: '#ef4444',
    inactive: '#475569',
  };
  const pipeColor = colorMap[flowStatus] || '#06b6d4';

  const [edgePath] = getBezierPath({
    sourceX, sourceY, targetX, targetY,
    sourcePosition, targetPosition,
  });

  const edgeId = `pipe-${id || Math.random().toString(36).substr(2, 9)}`;
  const animDur = flowStatus === 'alarm' ? '1.2s' : flowStatus === 'warning' ? '2s' : '3s';

  return (
    <>
      <defs>
        <linearGradient id={edgeId} x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor={pipeColor} stopOpacity={0.3} />
          <stop offset="50%" stopColor={pipeColor} stopOpacity={isActive ? 0.9 : 0.3} />
          <stop offset="100%" stopColor={pipeColor} stopOpacity={0.3} />
        </linearGradient>
      </defs>
      {/* Outer glow */}
      <path
        d={edgePath}
        fill="none"
        stroke={isActive ? `${pipeColor}26` : `${pipeColor}10`}
        strokeWidth={8}
        strokeLinecap="round"
      />
      {/* Main pipe body */}
      <path
        d={edgePath}
        fill="none"
        stroke={`url(#${edgeId})`}
        strokeWidth={4}
        strokeLinecap="round"
        strokeDasharray={isActive ? undefined : '8 4'}
      />
      {/* Animated flowing overlay for active pipes */}
      {isActive && (
        <path
          d={edgePath}
          fill="none"
          stroke={pipeColor}
          strokeWidth={3}
          strokeDasharray="8 12"
          strokeLinecap="round"
          strokeOpacity={0.35}
          style={{ animation: `edge-flow ${animDur} linear infinite` }}
        />
      )}
      {/* Animated traveling dot */}
      {isActive && (
        <circle r="3.5" fill={pipeColor} filter={`drop-shadow(0 0 4px ${pipeColor})`} opacity={0.8}>
          <animateMotion dur={animDur} repeatCount="indefinite" path={edgePath} />
        </circle>
      )}
      {/* Second trailing dot for normal flow */}
      {isActive && flowStatus === 'normal' && (
        <circle r="2" fill={pipeColor} opacity={0.3}>
          <animateMotion dur={animDur} repeatCount="indefinite" path={edgePath} begin={`${parseFloat(animDur) / 2}s`} />
        </circle>
      )}
      {/* Selection highlight */}
      {selected && (
        <path
          d={edgePath}
          fill="none"
          stroke={pipeColor}
          strokeWidth={10}
          strokeOpacity={0.12}
        />
      )}
    </>
  );
}

// --- Cable Edge (electrical wire with animated flow) ---

function CableEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style = {},
  markerEnd,
  selected,
}: EdgeProps) {
  const [edgePath] = getSmoothStepPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
    borderRadius: 16,
  });

  return (
    <>
      {/* Glow layer */}
      <path
        d={edgePath}
        fill="none"
        stroke="#f59e0b"
        strokeWidth={5}
        strokeOpacity={0.08}
        style={{ filter: 'blur(2px)' }}
      />
      {/* Static background dashes */}
      <path
        d={edgePath}
        fill="none"
        stroke="#f59e0b"
        strokeWidth={2}
        strokeDasharray="6 3"
        strokeOpacity={0.2}
      />
      {/* Animated flowing dashes */}
      <path
        id={id}
        className="react-flow__edge-path"
        d={edgePath}
        stroke="#f59e0b"
        strokeWidth={2}
        strokeDasharray="6 3"
        strokeOpacity={0.7}
        style={{ ...style, animation: 'edge-flow 1s linear infinite' }}
        markerEnd={markerEnd}
      />
      {/* Primary animated dot */}
      <circle r="3" fill="#f59e0b" filter="drop-shadow(0 0 3px #f59e0b)" opacity={0.8}>
        <animateMotion dur="2s" repeatCount="indefinite" path={edgePath} />
      </circle>
      {/* Secondary trailing dot */}
      <circle r="2" fill="#f59e0b" opacity={0.3}>
        <animateMotion dur="2s" repeatCount="indefinite" path={edgePath} begin="1s" />
      </circle>
      {/* Selection highlight */}
      {selected && (
        <path
          d={edgePath}
          fill="none"
          stroke="#f59e0b"
          strokeWidth={6}
          strokeOpacity={0.15}
        />
      )}
    </>
  );
}

// ============================================================================
// EXPORT: Node & Edge type maps for ReactFlow
// ============================================================================

export const nodeTypes = {
  assetNode: AssetNode,
  sensorNode: SensorNode,
  valveNode: ValveNode,
  junctionNode: JunctionNode,
  pumpNode: PumpNode,
  tankNode: TankNode,
  motorNode: MotorNode,
  pipeNode: PipeNode,
  instrumentNode: InstrumentNode,
  electricalNode: ElectricalNode,
  controlNode: ControlNode,
  heatExchangerNode: HeatExchangerNode,
  vesselNode: VesselNode,
};

export const edgeTypes = {
  processFlowEdge: ProcessFlowEdge,
  signalEdge: SignalEdge,
  pipeEdge: PipeEdge,
  cableEdge: CableEdge,
};

export type CustomNodeTypes = typeof nodeTypes;
export type CustomEdgeTypes = typeof edgeTypes;
