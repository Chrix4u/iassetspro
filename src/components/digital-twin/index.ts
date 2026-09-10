'use client';

// ============================================================================
// Digital Twin 3D Viewer Components — Barrel Export
// ============================================================================

// Main pages
export { DigitalTwinMainPage, default } from './DigitalTwinMainPage';
export { default as SystemDiagramPage } from './SystemDiagramPage';

// Main viewer (orchestrator)
export { DigitalTwinViewer, type DigitalTwinViewerProps } from './DigitalTwinViewer';

// 3D scene components (rendered inside Canvas)
export { SceneLighting, type SceneLightingProps } from './SceneLighting';
export { GroundPlane, type GroundPlaneProps } from './GroundPlane';
export { ModelLoader, type ModelLoaderProps } from './ModelLoader';
export { InteractiveMesh, type InteractiveMeshProps, type AssetMeshBinding } from './InteractiveMesh';
export { IoTOverlayLayer, type IoTOverlayLayerProps } from './IoTOverlayLayer';
export { SectionPlane, type SectionPlaneProps } from './SectionPlane';
export { ExplodedView, type ExplodedViewProps } from './ExplodedView';
export { HotspotLayer, type HotspotLayerProps } from './HotspotLayer';
export { AnnotationLayer, type AnnotationLayerProps } from './AnnotationLayer';

// UI overlay panels (rendered outside Canvas, positioned absolute)
export { TwinToolbar, type TwinToolbarProps } from './TwinToolbar';
export { SceneTreePanel, type SceneTreePanelProps } from './SceneTreePanel';
export { ComponentInfoPanel, type ComponentInfoPanelProps } from './ComponentInfoPanel';

// Enterprise integration panels
export { default as FailureAnalysisPanel, type FailureAnalysisPanelProps } from './FailureAnalysisPanel';
export { default as PredictiveMaintenancePanel, type PredictiveMaintenancePanelProps } from './PredictiveMaintenancePanel';
export { default as WorkInstructionPanel } from './WorkInstructionPanel';

// Phase A — Enterprise 3D Components
export { ModelManagerPanel, type ModelManagerPanelProps } from './ModelManagerPanel';
export { ComponentMappingEditor, type ComponentMappingEditorProps } from './ComponentMappingEditor';
export { CameraTourPlayer, type CameraTourPlayerProps } from './CameraTourPlayer';

// Diagram components
export { diagramTemplates, diagramTypeMeta, type DiagramTemplate } from './DiagramTemplates';
export {
  nodeTypes, edgeTypes,
  type AssetNodeData, type SensorNodeData, type ValveNodeData, type JunctionNodeData,
  type PumpNodeData, type TankNodeData, type MotorNodeData, type PipeNodeData,
  type CustomNodeTypes, type CustomEdgeTypes,
} from './DiagramNodeTypes';

// Diagram telemetry overlay
export {
  DiagramTelemetryService,
  type TelemetryOverlayConfig,
  type TelemetrySourceConfig,
  type TelemetrySnapshot,
} from '@/services/diagramTelemetry.service';
