'use client';

import type { Node, Edge } from 'reactflow';

// ============================================================================
// DIAGRAM TEMPLATE DATA
// Enterprise-grade pre-built system diagram templates
// ============================================================================

export interface DiagramTemplate {
  id: string;
  name: string;
  description: string;
  diagramType: 'piping' | 'electrical' | 'process' | 'hvac' | 'control' | 'safety';
  thumbnail: string;
  nodes: Node[];
  edges: Edge[];
}

// --- Chilled Water System Template ---
export const chilledWaterTemplate: DiagramTemplate = {
  id: 'tpl-chilled-water',
  name: 'Chilled Water System',
  description: 'Complete chilled water distribution system with chiller plant, primary/secondary pumps, AHUs and VAV terminals',
  diagramType: 'hvac',
  thumbnail: 'chl',
  nodes: [
    {
      id: 'chiller-1', type: 'assetNode', position: { x: 80, y: 200 },
      data: { label: 'Chiller CH-1', assetType: 'chiller', status: 'operational', criticality: 'critical', health: 92, parameters: [{ name: 'Supply Temp', value: '6.2', unit: '°C' }, { name: 'Return Temp', value: '12.8', unit: '°C' }, { name: 'Load', value: '78', unit: '%' }], assetId: null },
    },
    {
      id: 'chiller-2', type: 'assetNode', position: { x: 80, y: 420 },
      data: { label: 'Chiller CH-2', assetType: 'chiller', status: 'standby', criticality: 'critical', health: 88, parameters: [{ name: 'Supply Temp', value: '-', unit: '°C' }, { name: 'Return Temp', value: '-', unit: '°C' }, { name: 'Load', value: '0', unit: '%' }], assetId: null },
    },
    {
      id: 'pump-p1', type: 'assetNode', position: { x: 380, y: 160 },
      data: { label: 'Primary Pump P-1', assetType: 'pump', status: 'operational', criticality: 'high', health: 95, parameters: [{ name: 'Flow', value: '48.2', unit: 'm³/h' }, { name: 'Head', value: '32', unit: 'm' }, { name: 'Power', value: '15.2', unit: 'kW' }], assetId: null },
    },
    {
      id: 'pump-p2', type: 'assetNode', position: { x: 380, y: 320 },
      data: { label: 'Primary Pump P-2', assetType: 'pump', status: 'operational', criticality: 'high', health: 91, parameters: [{ name: 'Flow', value: '47.8', unit: 'm³/h' }, { name: 'Head', value: '31', unit: 'm' }, { name: 'Power', value: '14.9', unit: 'kW' }], assetId: null },
    },
    {
      id: 'pump-s1', type: 'assetNode', position: { x: 680, y: 160 },
      data: { label: 'Secondary Pump S-1', assetType: 'pump', status: 'operational', criticality: 'high', health: 87, parameters: [{ name: 'Flow', value: '52.1', unit: 'm³/h' }, { name: 'Delta P', value: '180', unit: 'kPa' }, { name: 'VFD Speed', value: '72', unit: '%' }], assetId: null },
    },
    {
      id: 'pump-s2', type: 'assetNode', position: { x: 680, y: 320 },
      data: { label: 'Secondary Pump S-2', assetType: 'pump', status: 'standby', criticality: 'high', health: 84, parameters: [{ name: 'Flow', value: '-', unit: 'm³/h' }, { name: 'Delta P', value: '-', unit: 'kPa' }, { name: 'VFD Speed', value: '0', unit: '%' }], assetId: null },
    },
    {
      id: 'ahu-1', type: 'assetNode', position: { x: 1000, y: 120 },
      data: { label: 'AHU-1 (Floor 1)', assetType: 'ahu', status: 'operational', criticality: 'medium', health: 93, parameters: [{ name: 'Supply Air', value: '12.5', unit: '°C' }, { name: 'Return Air', value: '24.1', unit: '°C' }, { name: 'Fan Speed', value: '68', unit: '%' }], assetId: null },
    },
    {
      id: 'ahu-2', type: 'assetNode', position: { x: 1000, y: 320 },
      data: { label: 'AHU-2 (Floor 2)', assetType: 'ahu', status: 'operational', criticality: 'medium', health: 89, parameters: [{ name: 'Supply Air', value: '13.1', unit: '°C' }, { name: 'Return Air', value: '24.8', unit: '°C' }, { name: 'Fan Speed', value: '72', unit: '%' }], assetId: null },
    },
    {
      id: 'vav-101', type: 'assetNode', position: { x: 1320, y: 60 },
      data: { label: 'VAV-101', assetType: 'vav', status: 'operational', criticality: 'low', health: 96, parameters: [{ name: 'Zone Temp', value: '22.4', unit: '°C' }, { name: 'Airflow', value: '340', unit: 'CFM' }], assetId: null },
    },
    {
      id: 'vav-102', type: 'assetNode', position: { x: 1320, y: 180 },
      data: { label: 'VAV-102', assetType: 'vav', status: 'warning', criticality: 'low', health: 72, parameters: [{ name: 'Zone Temp', value: '25.1', unit: '°C' }, { name: 'Airflow', value: '410', unit: 'CFM' }], assetId: null },
    },
    {
      id: 'vav-201', type: 'assetNode', position: { x: 1320, y: 280 },
      data: { label: 'VAV-201', assetType: 'vav', status: 'operational', criticality: 'low', health: 94, parameters: [{ name: 'Zone Temp', value: '22.8', unit: '°C' }, { name: 'Airflow', value: '320', unit: 'CFM' }], assetId: null },
    },
    {
      id: 'vav-202', type: 'assetNode', position: { x: 1320, y: 400 },
      data: { label: 'VAV-202', assetType: 'vav', status: 'operational', criticality: 'low', health: 90, parameters: [{ name: 'Zone Temp', value: '23.0', unit: '°C' }, { name: 'Airflow', value: '295', unit: 'CFM' }], assetId: null },
    },
    {
      id: 'sensor-chwst', type: 'sensorNode', position: { x: 230, y: 160 },
      data: { label: 'CHWST', parameter: 'Chilled Water Supply Temp', value: 6.2, unit: '°C', min: 4, max: 10, status: 'normal' },
    },
    {
      id: 'sensor-chwrt', type: 'sensorNode', position: { x: 230, y: 440 },
      data: { label: 'CHWRT', parameter: 'Chilled Water Return Temp', value: 12.8, unit: '°C', min: 8, max: 14, status: 'normal' },
    },
    {
      id: 'sensor-dp', type: 'sensorNode', position: { x: 850, y: 240 },
      data: { label: 'DP-001', parameter: 'Differential Pressure', value: 182, unit: 'kPa', min: 140, max: 210, status: 'normal' },
    },
    {
      id: 'valve-iso-1', type: 'valveNode', position: { x: 530, y: 200 },
      data: { label: 'ISO-01', state: 'open', valveType: 'isolation' },
    },
    {
      id: 'valve-bypass', type: 'valveNode', position: { x: 530, y: 380 },
      data: { label: 'BP-01', state: 'closed', valveType: 'bypass' },
    },
    {
      id: 'junc-header', type: 'junctionNode', position: { x: 530, y: 100 },
      data: { label: 'Header' },
    },
  ],
  edges: [
    { id: 'e-ch1-sensor', source: 'chiller-1', target: 'sensor-chwst', type: 'processFlowEdge', data: { flowStatus: 'normal' } },
    { id: 'e-sensor-ch1', source: 'sensor-chwrt', target: 'chiller-1', type: 'processFlowEdge', data: { flowStatus: 'normal' } },
    { id: 'e-ch1-junc', source: 'chiller-1', target: 'junc-header', type: 'processFlowEdge', data: { flowStatus: 'normal' } },
    { id: 'e-ch2-junc', source: 'chiller-2', target: 'junc-header', type: 'processFlowEdge', data: { flowStatus: 'inactive' } },
    { id: 'e-junc-p1', source: 'junc-header', target: 'pump-p1', type: 'processFlowEdge', data: { flowStatus: 'normal' } },
    { id: 'e-junc-p2', source: 'junc-header', target: 'pump-p2', type: 'processFlowEdge', data: { flowStatus: 'normal' } },
    { id: 'e-p1-valve', source: 'pump-p1', target: 'valve-iso-1', type: 'processFlowEdge', data: { flowStatus: 'normal' } },
    { id: 'e-p2-valve', source: 'pump-p2', target: 'valve-iso-1', type: 'processFlowEdge', data: { flowStatus: 'normal' } },
    { id: 'e-p2-bypass', source: 'pump-p2', target: 'valve-bypass', type: 'processFlowEdge', data: { flowStatus: 'inactive' } },
    { id: 'e-valve-s1', source: 'valve-iso-1', target: 'pump-s1', type: 'processFlowEdge', data: { flowStatus: 'normal' } },
    { id: 'e-valve-s2', source: 'valve-iso-1', target: 'pump-s2', type: 'processFlowEdge', data: { flowStatus: 'inactive' } },
    { id: 'e-s1-dp', source: 'pump-s1', target: 'sensor-dp', type: 'processFlowEdge', data: { flowStatus: 'normal' } },
    { id: 'e-dp-ahu1', source: 'sensor-dp', target: 'ahu-1', type: 'processFlowEdge', data: { flowStatus: 'normal' } },
    { id: 'e-dp-ahu2', source: 'sensor-dp', target: 'ahu-2', type: 'processFlowEdge', data: { flowStatus: 'normal' } },
    { id: 'e-ahu1-vav1', source: 'ahu-1', target: 'vav-101', type: 'processFlowEdge', data: { flowStatus: 'normal' } },
    { id: 'e-ahu1-vav2', source: 'ahu-1', target: 'vav-102', type: 'processFlowEdge', data: { flowStatus: 'warning' } },
    { id: 'e-ahu2-vav3', source: 'ahu-2', target: 'vav-201', type: 'processFlowEdge', data: { flowStatus: 'normal' } },
    { id: 'e-ahu2-vav4', source: 'ahu-2', target: 'vav-202', type: 'processFlowEdge', data: { flowStatus: 'normal' } },
  ],
};

// --- Electrical Distribution Template ---
export const electricalDistributionTemplate: DiagramTemplate = {
  id: 'tpl-electrical-dist',
  name: 'Electrical Distribution',
  description: 'Medium voltage electrical distribution system with transformer, switchgear, MCC and motor loads',
  diagramType: 'electrical',
  thumbnail: 'elec',
  nodes: [
    {
      id: 'hv-supply', type: 'assetNode', position: { x: 60, y: 280 },
      data: { label: 'HV Supply 11kV', assetType: 'supply', status: 'operational', criticality: 'critical', health: 99, parameters: [{ name: 'Voltage', value: '11042', unit: 'V' }, { name: 'Frequency', value: '50.01', unit: 'Hz' }, { name: 'Power Factor', value: '0.96', unit: '' }], assetId: null },
    },
    {
      id: 'tx-1', type: 'assetNode', position: { x: 320, y: 200 },
      data: { label: 'Transformer TX-1', assetType: 'transformer', status: 'operational', criticality: 'critical', health: 94, parameters: [{ name: 'Primary V', value: '11042', unit: 'V' }, { name: 'Secondary V', value: '415', unit: 'V' }, { name: 'Oil Temp', value: '62', unit: '°C' }, { name: 'Load', value: '78', unit: '%' }], assetId: null },
    },
    {
      id: 'tx-2', type: 'assetNode', position: { x: 320, y: 420 },
      data: { label: 'Transformer TX-2', assetType: 'transformer', status: 'standby', criticality: 'critical', health: 97, parameters: [{ name: 'Primary V', value: '-', unit: 'V' }, { name: 'Secondary V', value: '-', unit: 'V' }, { name: 'Oil Temp', value: '38', unit: '°C' }, { name: 'Load', value: '0', unit: '%' }], assetId: null },
    },
    {
      id: 'msb-1', type: 'assetNode', position: { x: 620, y: 200 },
      data: { label: 'MSB-1 Main Switchboard', assetType: 'switchgear', status: 'operational', criticality: 'critical', health: 91, parameters: [{ name: 'Bus Voltage', value: '413', unit: 'V' }, { name: 'Bus Current', value: '1240', unit: 'A' }, { name: 'Power', value: '820', unit: 'kW' }], assetId: null },
    },
    {
      id: 'ats-1', type: 'valveNode', position: { x: 530, y: 340 },
      data: { label: 'ATS-1', state: 'open', valveType: 'ats' },
    },
    {
      id: 'mcc-1', type: 'assetNode', position: { x: 920, y: 100 },
      data: { label: 'MCC-1 Process Motors', assetType: 'mcc', status: 'operational', criticality: 'high', health: 88, parameters: [{ name: 'Active Feeders', value: '12', unit: '/16' }, { name: 'Total Load', value: '340', unit: 'kW' }], assetId: null },
    },
    {
      id: 'mcc-2', type: 'assetNode', position: { x: 920, y: 320 },
      data: { label: 'MCC-2 Utility Motors', assetType: 'mcc', status: 'operational', criticality: 'high', health: 85, parameters: [{ name: 'Active Feeders', value: '8', unit: '/12' }, { name: 'Total Load', value: '210', unit: 'kW' }], assetId: null },
    },
    {
      id: 'motor-m1', type: 'assetNode', position: { x: 1240, y: 40 },
      data: { label: 'Motor M-101', assetType: 'motor', status: 'operational', criticality: 'medium', health: 82, parameters: [{ name: 'Current', value: '87', unit: 'A' }, { name: 'Vibration', value: '2.8', unit: 'mm/s' }, { name: 'Temp', value: '68', unit: '°C' }], assetId: null },
    },
    {
      id: 'motor-m2', type: 'assetNode', position: { x: 1240, y: 160 },
      data: { label: 'Motor M-102', assetType: 'motor', status: 'warning', criticality: 'high', health: 64, parameters: [{ name: 'Current', value: '95', unit: 'A' }, { name: 'Vibration', value: '7.2', unit: 'mm/s' }, { name: 'Temp', value: '82', unit: '°C' }], assetId: null },
    },
    {
      id: 'motor-m3', type: 'assetNode', position: { x: 1240, y: 280 },
      data: { label: 'Motor M-201', assetType: 'motor', status: 'operational', criticality: 'medium', health: 90, parameters: [{ name: 'Current', value: '45', unit: 'A' }, { name: 'Vibration', value: '1.9', unit: 'mm/s' }, { name: 'Temp', value: '55', unit: '°C' }], assetId: null },
    },
    {
      id: 'motor-m4', type: 'assetNode', position: { x: 1240, y: 400 },
      data: { label: 'Motor M-202', assetType: 'motor', status: 'operational', criticality: 'low', health: 93, parameters: [{ name: 'Current', value: '22', unit: 'A' }, { name: 'Vibration', value: '1.2', unit: 'mm/s' }, { name: 'Temp', value: '48', unit: '°C' }], assetId: null },
    },
    {
      id: 'sensor-pf', type: 'sensorNode', position: { x: 190, y: 240 },
      data: { label: 'PF-MTR', parameter: 'Power Factor', value: 0.96, unit: '', min: 0.9, max: 1.0, status: 'normal' },
    },
    {
      id: 'sensor-vib-m2', type: 'sensorNode', position: { x: 1400, y: 140 },
      data: { label: 'VIB-102', parameter: 'Vibration', value: 7.2, unit: 'mm/s', min: 0, max: 5, status: 'alarm' },
    },
    {
      id: 'gen-1', type: 'assetNode', position: { x: 320, y: 540 },
      data: { label: 'Emergency Gen G-1', assetType: 'generator', status: 'standby', criticality: 'critical', health: 86, parameters: [{ name: 'Fuel Level', value: '82', unit: '%' }, { name: 'Last Test', value: '3d', unit: 'ago' }], assetId: null },
    },
  ],
  edges: [
    { id: 'e-hv-tx1', source: 'hv-supply', target: 'tx-1', type: 'processFlowEdge', data: { flowStatus: 'normal' } },
    { id: 'e-hv-tx2', source: 'hv-supply', target: 'tx-2', type: 'processFlowEdge', data: { flowStatus: 'inactive' } },
    { id: 'e-hv-pf', source: 'hv-supply', target: 'sensor-pf', type: 'signalEdge' },
    { id: 'e-tx1-msb', source: 'tx-1', target: 'msb-1', type: 'processFlowEdge', data: { flowStatus: 'normal' } },
    { id: 'e-tx2-ats', source: 'tx-2', target: 'ats-1', type: 'processFlowEdge', data: { flowStatus: 'inactive' } },
    { id: 'e-ats-msb', source: 'ats-1', target: 'msb-1', type: 'processFlowEdge', data: { flowStatus: 'inactive' } },
    { id: 'e-msb-mcc1', source: 'msb-1', target: 'mcc-1', type: 'processFlowEdge', data: { flowStatus: 'normal' } },
    { id: 'e-msb-mcc2', source: 'msb-1', target: 'mcc-2', type: 'processFlowEdge', data: { flowStatus: 'normal' } },
    { id: 'e-mcc1-m1', source: 'mcc-1', target: 'motor-m1', type: 'processFlowEdge', data: { flowStatus: 'normal' } },
    { id: 'e-mcc1-m2', source: 'mcc-1', target: 'motor-m2', type: 'processFlowEdge', data: { flowStatus: 'warning' } },
    { id: 'e-mcc2-m3', source: 'mcc-2', target: 'motor-m3', type: 'processFlowEdge', data: { flowStatus: 'normal' } },
    { id: 'e-mcc2-m4', source: 'mcc-2', target: 'motor-m4', type: 'processFlowEdge', data: { flowStatus: 'normal' } },
    { id: 'e-m2-vib', source: 'motor-m2', target: 'sensor-vib-m2', type: 'signalEdge' },
    { id: 'e-gen-ats', source: 'gen-1', target: 'ats-1', type: 'processFlowEdge', data: { flowStatus: 'inactive' } },
  ],
};

// --- Compressed Air System Template ---
export const compressedAirTemplate: DiagramTemplate = {
  id: 'tpl-compressed-air',
  name: 'Compressed Air System',
  description: 'Industrial compressed air system with compressors, dryer, receiver and distribution network',
  diagramType: 'process',
  thumbnail: 'air',
  nodes: [
    {
      id: 'comp-1', type: 'assetNode', position: { x: 80, y: 120 },
      data: { label: 'Compressor C-1', assetType: 'compressor', status: 'operational', criticality: 'critical', health: 88, parameters: [{ name: 'Discharge P', value: '7.2', unit: 'bar' }, { name: 'Discharge T', value: '92', unit: '°C' }, { name: 'Load', value: '82', unit: '%' }, { name: 'Run Hours', value: '18420', unit: 'h' }], assetId: null },
    },
    {
      id: 'comp-2', type: 'assetNode', position: { x: 80, y: 340 },
      data: { label: 'Compressor C-2', assetType: 'compressor', status: 'operational', criticality: 'critical', health: 79, parameters: [{ name: 'Discharge P', value: '7.1', unit: 'bar' }, { name: 'Discharge T', value: '88', unit: '°C' }, { name: 'Load', value: '68', unit: '%' }, { name: 'Run Hours', value: '22350', unit: 'h' }], assetId: null },
    },
    {
      id: 'comp-3', type: 'assetNode', position: { x: 80, y: 540 },
      data: { label: 'Compressor C-3', assetType: 'compressor', status: 'standby', criticality: 'critical', health: 95, parameters: [{ name: 'Discharge P', value: '-', unit: 'bar' }, { name: 'Discharge T', value: '-', unit: '°C' }, { name: 'Load', value: '0', unit: '%' }, { name: 'Run Hours', value: '8100', unit: 'h' }], assetId: null },
    },
    {
      id: 'dryer-1', type: 'assetNode', position: { x: 420, y: 200 },
      data: { label: 'Refrigerant Dryer D-1', assetType: 'dryer', status: 'operational', criticality: 'high', health: 92, parameters: [{ name: 'Inlet T', value: '38', unit: '°C' }, { name: 'Dew Point', value: '3', unit: '°C' }, { name: 'Pressure Drop', value: '0.15', unit: 'bar' }], assetId: null },
    },
    {
      id: 'filter-1', type: 'assetNode', position: { x: 420, y: 400 },
      data: { label: 'Particulate Filter F-1', assetType: 'filter', status: 'operational', criticality: 'medium', health: 85, parameters: [{ name: 'DP', value: '0.08', unit: 'bar' }, { name: 'DP Alarm', value: '>0.3', unit: 'bar' }], assetId: null },
    },
    {
      id: 'receiver-1', type: 'assetNode', position: { x: 740, y: 240 },
      data: { label: 'Air Receiver R-1', assetType: 'receiver', status: 'operational', criticality: 'high', health: 96, parameters: [{ name: 'Pressure', value: '7.0', unit: 'bar' }, { name: 'Capacity', value: '5000', unit: 'L' }, { name: 'Drain', value: 'Auto', unit: '' }], assetId: null },
    },
    {
      id: 'valve-dist-1', type: 'valveNode', position: { x: 1000, y: 120 },
      data: { label: 'DV-01', state: 'open', valveType: 'distribution' },
    },
    {
      id: 'valve-dist-2', type: 'valveNode', position: { x: 1000, y: 280 },
      data: { label: 'DV-02', state: 'open', valveType: 'distribution' },
    },
    {
      id: 'valve-dist-3', type: 'valveNode', position: { x: 1000, y: 440 },
      data: { label: 'DV-03', state: 'closed', valveType: 'distribution' },
    },
    {
      id: 'user-prod', type: 'assetNode', position: { x: 1280, y: 60 },
      data: { label: 'Production Line', assetType: 'enduser', status: 'operational', criticality: 'high', health: 90, parameters: [{ name: 'Air Demand', value: '2.4', unit: 'm³/min' }, { name: 'Pressure', value: '6.2', unit: 'bar' }], assetId: null },
    },
    {
      id: 'user-pkg', type: 'assetNode', position: { x: 1280, y: 220 },
      data: { label: 'Packaging Area', assetType: 'enduser', status: 'operational', criticality: 'medium', health: 88, parameters: [{ name: 'Air Demand', value: '1.8', unit: 'm³/min' }, { name: 'Pressure', value: '6.0', unit: 'bar' }], assetId: null },
    },
    {
      id: 'user-tools', type: 'assetNode', position: { x: 1280, y: 380 },
      data: { label: 'Workshop Tools', assetType: 'enduser', status: 'operational', criticality: 'low', health: 95, parameters: [{ name: 'Air Demand', value: '0.6', unit: 'm³/min' }, { name: 'Pressure', value: '5.8', unit: 'bar' }], assetId: null },
    },
    {
      id: 'sensor-dp1', type: 'sensorNode', position: { x: 580, y: 160 },
      data: { label: 'PT-101', parameter: 'Line Pressure', value: 7.0, unit: 'bar', min: 6.0, max: 8.0, status: 'normal' },
    },
    {
      id: 'sensor-dp2', type: 'sensorNode', position: { x: 580, y: 340 },
      data: { label: 'PT-102', parameter: 'Filter DP', value: 0.08, unit: 'bar', min: 0, max: 0.3, status: 'normal' },
    },
    {
      id: 'sensor-flow', type: 'sensorNode', position: { x: 1140, y: 180 },
      data: { label: 'FT-101', parameter: 'Total Flow', value: 4.8, unit: 'm³/min', min: 0, max: 8, status: 'normal' },
    },
    {
      id: 'junc-manifold', type: 'junctionNode', position: { x: 1000, y: 280 },
      data: { label: 'Manifold' },
    },
  ],
  edges: [
    { id: 'e-c1-dryer', source: 'comp-1', target: 'dryer-1', type: 'processFlowEdge', data: { flowStatus: 'normal' } },
    { id: 'e-c2-dryer', source: 'comp-2', target: 'dryer-1', type: 'processFlowEdge', data: { flowStatus: 'normal' } },
    { id: 'e-c3-dryer', source: 'comp-3', target: 'dryer-1', type: 'processFlowEdge', data: { flowStatus: 'inactive' } },
    { id: 'e-dryer-filter', source: 'dryer-1', target: 'filter-1', type: 'processFlowEdge', data: { flowStatus: 'normal' } },
    { id: 'e-dryer-pt1', source: 'dryer-1', target: 'sensor-dp1', type: 'signalEdge' },
    { id: 'e-filter-pt2', source: 'filter-1', target: 'sensor-dp2', type: 'signalEdge' },
    { id: 'e-pt1-recv', source: 'sensor-dp1', target: 'receiver-1', type: 'processFlowEdge', data: { flowStatus: 'normal' } },
    { id: 'e-pt2-recv', source: 'sensor-dp2', target: 'receiver-1', type: 'processFlowEdge', data: { flowStatus: 'normal' } },
    { id: 'e-recv-dist1', source: 'receiver-1', target: 'valve-dist-1', type: 'processFlowEdge', data: { flowStatus: 'normal' } },
    { id: 'e-recv-dist2', source: 'receiver-1', target: 'valve-dist-2', type: 'processFlowEdge', data: { flowStatus: 'normal' } },
    { id: 'e-recv-dist3', source: 'receiver-1', target: 'valve-dist-3', type: 'processFlowEdge', data: { flowStatus: 'inactive' } },
    { id: 'e-dist1-prod', source: 'valve-dist-1', target: 'user-prod', type: 'processFlowEdge', data: { flowStatus: 'normal' } },
    { id: 'e-dist2-pkg', source: 'valve-dist-2', target: 'user-pkg', type: 'processFlowEdge', data: { flowStatus: 'normal' } },
    { id: 'e-dist3-tools', source: 'valve-dist-3', target: 'user-tools', type: 'processFlowEdge', data: { flowStatus: 'inactive' } },
    { id: 'e-dist1-flow', source: 'valve-dist-1', target: 'sensor-flow', type: 'signalEdge' },
  ],
};

// --- Steam Distribution System Template ---
export const steamDistributionTemplate: DiagramTemplate = {
  id: 'tpl-steam-dist',
  name: 'Steam Distribution System',
  description: 'Industrial steam distribution with boilers, steam headers, pressure reducing stations, heat exchangers and condensate return',
  diagramType: 'piping',
  thumbnail: 'steam',
  nodes: [
    {
      id: 'boiler-1', type: 'assetNode', position: { x: 60, y: 80 },
      data: { label: 'Boiler B-1', assetType: 'compressor', status: 'operational', criticality: 'critical', health: 91, parameters: [{ name: 'Steam P', value: '10.5', unit: 'bar' }, { name: 'Steam T', value: '185', unit: '°C' }, { name: 'Load', value: '72', unit: '%' }], assetId: null },
    },
    {
      id: 'boiler-2', type: 'assetNode', position: { x: 60, y: 300 },
      data: { label: 'Boiler B-2', assetType: 'compressor', status: 'operational', criticality: 'critical', health: 86, parameters: [{ name: 'Steam P', value: '10.2', unit: 'bar' }, { name: 'Steam T', value: '183', unit: '°C' }, { name: 'Load', value: '65', unit: '%' }], assetId: null },
    },
    {
      id: 'boiler-3', type: 'assetNode', position: { x: 60, y: 520 },
      data: { label: 'Boiler B-3', assetType: 'compressor', status: 'standby', criticality: 'critical', health: 98, parameters: [{ name: 'Steam P', value: '-', unit: 'bar' }, { name: 'Steam T', value: '-', unit: '°C' }, { name: 'Load', value: '0', unit: '%' }], assetId: null },
    },
    {
      id: 'steam-header-hp', type: 'junctionNode', position: { x: 340, y: 180 },
      data: { label: 'HP Header 10 bar' },
    },
    {
      id: 'prv-1', type: 'valveNode', position: { x: 540, y: 80 },
      data: { label: 'PRV-01', state: 'open', valveType: 'control' },
    },
    {
      id: 'prv-2', type: 'valveNode', position: { x: 540, y: 280 },
      data: { label: 'PRV-02', state: 'open', valveType: 'control' },
    },
    {
      id: 'steam-header-mp', type: 'junctionNode', position: { x: 740, y: 100 },
      data: { label: 'MP Header 4 bar' },
    },
    {
      id: 'steam-header-lp', type: 'junctionNode', position: { x: 740, y: 300 },
      data: { label: 'LP Header 1.5 bar' },
    },
    {
      id: 'hx-1', type: 'assetNode', position: { x: 1000, y: 40 },
      data: { label: 'HX-1 Process Heat', assetType: 'dryer', status: 'operational', criticality: 'high', health: 88, parameters: [{ name: 'Inlet T', value: '178', unit: '°C' }, { name: 'Outlet T', value: '110', unit: '°C' }, { name: 'Duty', value: '850', unit: 'kW' }], assetId: null },
    },
    {
      id: 'hx-2', type: 'assetNode', position: { x: 1000, y: 200 },
      data: { label: 'HX-2 Space Heating', assetType: 'ahu', status: 'operational', criticality: 'medium', health: 92, parameters: [{ name: 'Inlet T', value: '175', unit: '°C' }, { name: 'Outlet T', value: '105', unit: '°C' }, { name: 'Duty', value: '420', unit: 'kW' }], assetId: null },
    },
    {
      id: 'hx-3', type: 'assetNode', position: { x: 1000, y: 380 },
      data: { label: 'HX-3 Hot Water', assetType: 'ahu', status: 'operational', criticality: 'medium', health: 94, parameters: [{ name: 'Inlet T', value: '120', unit: '°C' }, { name: 'Outlet T', value: '85', unit: '°C' }, { name: 'Duty', value: '280', unit: 'kW' }], assetId: null },
    },
    {
      id: 'cond-tank', type: 'tankNode', position: { x: 1300, y: 200 },
      data: { label: 'Condensate Tank', fillLevel: 62, capacity: 10000, temperature: 82, levelStatus: 'normal', medium: 'Water' },
    },
    {
      id: 'cond-pump', type: 'pumpNode', position: { x: 1560, y: 220 },
      data: { label: 'Condensate Pump', pumpType: 'centrifugal', status: 'running', health: 90, flowRate: 4.2, head: 45 },
    },
    {
      id: 'sensor-steam-p', type: 'sensorNode', position: { x: 200, y: 40 },
      data: { label: 'PT-201', parameter: 'HP Steam Pressure', value: 10.4, unit: 'bar', min: 9.0, max: 11.0, status: 'normal' },
    },
    {
      id: 'sensor-prv1', type: 'sensorNode', position: { x: 640, y: 40 },
      data: { label: 'PT-202', parameter: 'MP Steam Pressure', value: 4.1, unit: 'bar', min: 3.5, max: 4.5, status: 'normal' },
    },
    {
      id: 'sensor-prv2', type: 'sensorNode', position: { x: 640, y: 240 },
      data: { label: 'PT-203', parameter: 'LP Steam Pressure', value: 1.5, unit: 'bar', min: 1.0, max: 2.0, status: 'normal' },
    },
  ],
  edges: [
    { id: 'e-b1-header', source: 'boiler-1', target: 'steam-header-hp', type: 'pipeEdge' },
    { id: 'e-b2-header', source: 'boiler-2', target: 'steam-header-hp', type: 'pipeEdge' },
    { id: 'e-b3-header', source: 'boiler-3', target: 'steam-header-hp', type: 'pipeEdge', data: { flowStatus: 'inactive' } },
    { id: 'e-b1-sensor', source: 'boiler-1', target: 'sensor-steam-p', type: 'signalEdge' },
    { id: 'e-header-prv1', source: 'steam-header-hp', target: 'prv-1', type: 'pipeEdge' },
    { id: 'e-header-prv2', source: 'steam-header-hp', target: 'prv-2', type: 'pipeEdge' },
    { id: 'e-prv1-mp', source: 'prv-1', target: 'steam-header-mp', type: 'pipeEdge' },
    { id: 'e-prv2-lp', source: 'prv-2', target: 'steam-header-lp', type: 'pipeEdge' },
    { id: 'e-prv1-sensor', source: 'prv-1', target: 'sensor-prv1', type: 'signalEdge' },
    { id: 'e-prv2-sensor', source: 'prv-2', target: 'sensor-prv2', type: 'signalEdge' },
    { id: 'e-mp-hx1', source: 'steam-header-mp', target: 'hx-1', type: 'pipeEdge' },
    { id: 'e-mp-hx2', source: 'steam-header-mp', target: 'hx-2', type: 'pipeEdge' },
    { id: 'e-lp-hx3', source: 'steam-header-lp', target: 'hx-3', type: 'pipeEdge' },
    { id: 'e-hx1-cond', source: 'hx-1', target: 'cond-tank', type: 'pipeEdge', data: { flowStatus: 'normal' } },
    { id: 'e-hx2-cond', source: 'hx-2', target: 'cond-tank', type: 'pipeEdge', data: { flowStatus: 'normal' } },
    { id: 'e-hx3-cond', source: 'hx-3', target: 'cond-tank', type: 'pipeEdge', data: { flowStatus: 'normal' } },
    { id: 'e-cond-pump', source: 'cond-tank', target: 'cond-pump', type: 'pipeEdge' },
  ],
};

// --- Fire Protection System Template ---
export const fireProtectionTemplate: DiagramTemplate = {
  id: 'tpl-fire-protection',
  name: 'Fire Protection System',
  description: 'Fire protection system with fire pumps, sprinkler zones, hose stations and fire alarm panel',
  diagramType: 'safety',
  thumbnail: 'fire',
  nodes: [
    {
      id: 'fap', type: 'assetNode', position: { x: 60, y: 240 },
      data: { label: 'Fire Alarm Panel', assetType: 'mcc', status: 'operational', criticality: 'critical', health: 99, parameters: [{ name: 'Zones', value: '6', unit: '/6' }, { name: 'Status', value: 'Normal', unit: '' }], assetId: null },
    },
    {
      id: 'jockey-pump', type: 'pumpNode', position: { x: 340, y: 120 },
      data: { label: 'Jockey Pump JP-1', pumpType: 'centrifugal', status: 'running', health: 96, flowRate: 12, head: 85 },
    },
    {
      id: 'fire-pump-1', type: 'pumpNode', position: { x: 340, y: 280 },
      data: { label: 'Fire Pump FP-1', pumpType: 'centrifugal', status: 'stopped', health: 94, flowRate: 450, head: 120 },
    },
    {
      id: 'fire-pump-2', type: 'pumpNode', position: { x: 340, y: 440 },
      data: { label: 'Fire Pump FP-2', pumpType: 'centrifugal', status: 'stopped', health: 91, flowRate: 450, head: 120 },
    },
    {
      id: 'fw-tank', type: 'tankNode', position: { x: 60, y: 20 },
      data: { label: 'Fire Water Tank', fillLevel: 92, capacity: 50000, temperature: 25, levelStatus: 'normal', medium: 'Water' },
    },
    {
      id: 'main-valve', type: 'valveNode', position: { x: 580, y: 260 },
      data: { label: 'MV-01', state: 'open', valveType: 'isolation' },
    },
    {
      id: 'sprinkler-z1', type: 'assetNode', position: { x: 840, y: 60 },
      data: { label: 'Sprinkler Zone 1\nOffice', assetType: 'filter', status: 'operational', criticality: 'high', health: 95, parameters: [{ name: 'Heads', value: '24', unit: '' }, { name: 'Pressure', value: '4.2', unit: 'bar' }], assetId: null },
    },
    {
      id: 'sprinkler-z2', type: 'assetNode', position: { x: 840, y: 200 },
      data: { label: 'Sprinkler Zone 2\nWarehouse', assetType: 'filter', status: 'operational', criticality: 'high', health: 88, parameters: [{ name: 'Heads', value: '36', unit: '' }, { name: 'Pressure', value: '4.0', unit: 'bar' }], assetId: null },
    },
    {
      id: 'sprinkler-z3', type: 'assetNode', position: { x: 840, y: 340 },
      data: { label: 'Sprinkler Zone 3\nPlant', assetType: 'filter', status: 'operational', criticality: 'high', health: 92, parameters: [{ name: 'Heads', value: '42', unit: '' }, { name: 'Pressure', value: '3.8', unit: 'bar' }], assetId: null },
    },
    {
      id: 'hose-1', type: 'assetNode', position: { x: 1100, y: 100 },
      data: { label: 'Hose Station HS-1', assetType: 'enduser', status: 'operational', criticality: 'high', health: 97, parameters: [{ name: 'Pressure', value: '6.5', unit: 'bar' }, { name: 'Size', value: '65mm', unit: '' }], assetId: null },
    },
    {
      id: 'hose-2', type: 'assetNode', position: { x: 1100, y: 260 },
      data: { label: 'Hose Station HS-2', assetType: 'enduser', status: 'operational', criticality: 'high', health: 94, parameters: [{ name: 'Pressure', value: '6.3', unit: 'bar' }, { name: 'Size', value: '65mm', unit: '' }], assetId: null },
    },
    {
      id: 'hydrant-1', type: 'assetNode', position: { x: 1100, y: 420 },
      data: { label: 'Hydrant HY-1', assetType: 'enduser', status: 'operational', criticality: 'high', health: 99, parameters: [{ name: 'Flow Rate', value: '1500', unit: 'LPM' }], assetId: null },
    },
    {
      id: 'sensor-fp', type: 'sensorNode', position: { x: 480, y: 160 },
      data: { label: 'PT-FP', parameter: 'Fire Main Pressure', value: 7.2, unit: 'bar', min: 6.0, max: 8.5, status: 'normal' },
    },
  ],
  edges: [
    { id: 'e-tank-jockey', source: 'fw-tank', target: 'jockey-pump', type: 'pipeEdge' },
    { id: 'e-tank-fp1', source: 'fw-tank', target: 'fire-pump-1', type: 'pipeEdge' },
    { id: 'e-tank-fp2', source: 'fw-tank', target: 'fire-pump-2', type: 'pipeEdge' },
    { id: 'e-jockey-mv', source: 'jockey-pump', target: 'main-valve', type: 'pipeEdge' },
    { id: 'e-fp1-mv', source: 'fire-pump-1', target: 'main-valve', type: 'pipeEdge', data: { flowStatus: 'inactive' } },
    { id: 'e-fp2-mv', source: 'fire-pump-2', target: 'main-valve', type: 'pipeEdge', data: { flowStatus: 'inactive' } },
    { id: 'e-mv-sensor', source: 'main-valve', target: 'sensor-fp', type: 'signalEdge' },
    { id: 'e-mv-z1', source: 'main-valve', target: 'sprinkler-z1', type: 'pipeEdge' },
    { id: 'e-mv-z2', source: 'main-valve', target: 'sprinkler-z2', type: 'pipeEdge' },
    { id: 'e-mv-z3', source: 'main-valve', target: 'sprinkler-z3', type: 'pipeEdge' },
    { id: 'e-z1-hose1', source: 'sprinkler-z1', target: 'hose-1', type: 'pipeEdge' },
    { id: 'e-z2-hose2', source: 'sprinkler-z2', target: 'hose-2', type: 'pipeEdge' },
    { id: 'e-z3-hydrant', source: 'sprinkler-z3', target: 'hydrant-1', type: 'pipeEdge' },
    { id: 'e-fap-z1', source: 'fap', target: 'sprinkler-z1', type: 'signalEdge' },
    { id: 'e-fap-z2', source: 'fap', target: 'sprinkler-z2', type: 'signalEdge' },
  ],
};

// --- Process Flow Diagram (Generic Manufacturing) Template ---
export const processFlowTemplate: DiagramTemplate = {
  id: 'tpl-process-flow',
  name: 'Process Flow Diagram',
  description: 'Generic manufacturing process flow: raw material storage, processing, quality checkpoints, and finished goods',
  diagramType: 'process',
  thumbnail: 'pfd',
  nodes: [
    {
      id: 'raw-storage', type: 'tankNode', position: { x: 40, y: 120 },
      data: { label: 'Raw Material Storage', fillLevel: 78, capacity: 20000, temperature: 22, levelStatus: 'normal', medium: 'Chemical' },
    },
    {
      id: 'raw-storage-2', type: 'tankNode', position: { x: 40, y: 340 },
      data: { label: 'Bulk Storage', fillLevel: 55, capacity: 50000, temperature: 20, levelStatus: 'normal', medium: 'Solvent' },
    },
    {
      id: 'feed-pump', type: 'pumpNode', position: { x: 280, y: 150 },
      data: { label: 'Feed Pump P-301', pumpType: 'centrifugal', status: 'running', health: 88, flowRate: 18.5, head: 42 },
    },
    {
      id: 'reactor', type: 'assetNode', position: { x: 520, y: 100 },
      data: { label: 'Reactor R-301', assetType: 'filter', status: 'operational', criticality: 'critical', health: 85, parameters: [{ name: 'Temp', value: '185', unit: '°C' }, { name: 'Pressure', value: '3.5', unit: 'bar' }, { name: 'Agitator', value: '120', unit: 'RPM' }], assetId: null },
    },
    {
      id: 'mixer', type: 'motorNode', position: { x: 520, y: 300 },
      data: { label: 'Mixer Motor M-301', rpm: 120, powerRating: 45, status: 'running', vibration: 2.1, temperature: 62, current: 78 },
    },
    {
      id: 'qc-in', type: 'sensorNode', position: { x: 360, y: 60 },
      data: { label: 'QC-IN', parameter: 'Input Quality Check', value: 98.2, unit: '%', min: 95, max: 100, status: 'normal' },
    },
    {
      id: 'separator', type: 'assetNode', position: { x: 800, y: 100 },
      data: { label: 'Separator S-301', assetType: 'filter', status: 'operational', criticality: 'high', health: 90, parameters: [{ name: 'Inlet T', value: '95', unit: '°C' }, { name: 'DP', value: '0.45', unit: 'bar' }, { name: 'Efficiency', value: '99.2', unit: '%' }], assetId: null },
    },
    {
      id: 'distillation', type: 'assetNode', position: { x: 1080, y: 100 },
      data: { label: 'Distillation Col D-301', assetType: 'filter', status: 'operational', criticality: 'critical', health: 82, parameters: [{ name: 'Top T', value: '78', unit: '°C' }, { name: 'Bottom T', value: '145', unit: '°C' }, { name: 'Reflux', value: '3.2', unit: ':1' }], assetId: null },
    },
    {
      id: 'qc-mid', type: 'sensorNode', position: { x: 940, y: 30 },
      data: { label: 'QC-MID', parameter: 'Mid-Process QC', value: 96.8, unit: '%', min: 94, max: 100, status: 'normal' },
    },
    {
      id: 'product-tank', type: 'tankNode', position: { x: 1380, y: 100 },
      data: { label: 'Product Tank T-301', fillLevel: 40, capacity: 15000, temperature: 35, levelStatus: 'normal', medium: 'Product' },
    },
    {
      id: 'packaging', type: 'assetNode', position: { x: 1380, y: 320 },
      data: { label: 'Packaging Line', assetType: 'enduser', status: 'operational', criticality: 'medium', health: 94, parameters: [{ name: 'Rate', value: '120', unit: 'pkg/h' }, { name: 'Reject', value: '0.8', unit: '%' }], assetId: null },
    },
    {
      id: 'qc-final', type: 'sensorNode', position: { x: 1240, y: 30 },
      data: { label: 'QC-FINAL', parameter: 'Final Quality', value: 99.5, unit: '%', min: 98, max: 100, status: 'normal' },
    },
  ],
  edges: [
    { id: 'e-raw-feed', source: 'raw-storage', target: 'feed-pump', type: 'pipeEdge' },
    { id: 'e-bulk-feed', source: 'raw-storage-2', target: 'feed-pump', type: 'pipeEdge' },
    { id: 'e-raw-qc', source: 'raw-storage', target: 'qc-in', type: 'signalEdge' },
    { id: 'e-feed-reactor', source: 'feed-pump', target: 'reactor', type: 'pipeEdge' },
    { id: 'e-reactor-sep', source: 'reactor', target: 'separator', type: 'pipeEdge' },
    { id: 'e-mixer-reactor', source: 'mixer', target: 'reactor', type: 'signalEdge' },
    { id: 'e-sep-dist', source: 'separator', target: 'distillation', type: 'pipeEdge' },
    { id: 'e-sep-qc', source: 'separator', target: 'qc-mid', type: 'signalEdge' },
    { id: 'e-dist-product', source: 'distillation', target: 'product-tank', type: 'pipeEdge' },
    { id: 'e-dist-qc', source: 'distillation', target: 'qc-final', type: 'signalEdge' },
    { id: 'e-product-pkg', source: 'product-tank', target: 'packaging', type: 'pipeEdge' },
  ],
};

// --- DCS Process Control System Template ---
export const controlSystemTemplate: DiagramTemplate = {
  id: 'control-system-dcs',
  name: 'DCS Process Control System',
  description: 'Distributed control system with PLCs, field instruments, motor control centers, and signal wiring for a process unit',
  diagramType: 'control',
  thumbnail: 'dcs',
  nodes: [
    // DCS Controller
    { id: 'dcs-01', type: 'controlNode', position: { x: 400, y: 40 }, data: { label: 'DCS Main', name: 'DCS-01', controllerType: 'DCS', ioCount: { in: 64, out: 48 }, scanRate: 50, status: 'running', program: 'Process_Control_v3.2' } },
    // Safety Instrumented System
    { id: 'sis-01', type: 'controlNode', position: { x: 400, y: 200 }, data: { label: 'SIS', name: 'SIS-01', controllerType: 'SIS', ioCount: { in: 24, out: 16 }, scanRate: 20, status: 'running', program: 'ESD_System_v2.1' } },
    // Field PLCs
    { id: 'plc-area1', type: 'controlNode', position: { x: 100, y: 120 }, data: { label: 'Area 1 PLC', name: 'PLC-A1', controllerType: 'PLC', ioCount: { in: 32, out: 24 }, scanRate: 100, status: 'running', program: 'Area1_Control' } },
    { id: 'plc-area2', type: 'controlNode', position: { x: 700, y: 120 }, data: { label: 'Area 2 PLC', name: 'PLC-A2', controllerType: 'PLC', ioCount: { in: 32, out: 24 }, scanRate: 100, status: 'running', program: 'Area2_Control' } },
    // MCC
    { id: 'mcc-01', type: 'electricalNode', position: { x: 50, y: 300 }, data: { label: 'MCC-01', name: 'MCC-01', equipType: 'mcc', voltage: 415, current: 120, power: 85, status: 'energized' } },
    { id: 'mcc-02', type: 'electricalNode', position: { x: 750, y: 300 }, data: { label: 'MCC-02', name: 'MCC-02', equipType: 'mcc', voltage: 415, current: 95, power: 68, status: 'energized' } },
    // Switchgear
    { id: 'swgr-main', type: 'electricalNode', position: { x: 350, y: 350 }, data: { label: 'Main Switchgear', name: 'SWGR-MS', equipType: 'switchgear', voltage: 11000, current: 250, power: 4800, status: 'energized' } },
    { id: 'xfmr-01', type: 'electricalNode', position: { x: 520, y: 350 }, data: { label: 'Step Down', name: 'XFMR-01', equipType: 'transformer', voltage: 415, current: 600, power: 430, status: 'energized' } },
    // Field Instruments
    { id: 'pt-001', type: 'instrumentNode', position: { x: 0, y: 0 }, data: { label: 'Pressure Transmitter', tag: 'PT-001', measureType: 'Pressure', value: 4.2, unit: 'bar', alarmHigh: 6.0, alarmLow: 1.5, status: 'normal' } },
    { id: 'tt-001', type: 'instrumentNode', position: { x: 200, y: 0 }, data: { label: 'Temp Transmitter', tag: 'TT-001', measureType: 'Temperature', value: 82.5, unit: '°C', alarmHigh: 95, alarmLow: 60, status: 'normal' } },
    { id: 'ft-001', type: 'instrumentNode', position: { x: 600, y: 0 }, data: { label: 'Flow Transmitter', tag: 'FT-001', measureType: 'Flow', value: 125.3, unit: 'm³/h', alarmHigh: 150, alarmLow: 50, status: 'normal' } },
    { id: 'lt-001', type: 'instrumentNode', position: { x: 400, y: 500 }, data: { label: 'Level Transmitter', tag: 'LT-001', measureType: 'Level', value: 72, unit: '%', alarmHigh: 85, alarmLow: 20, status: 'normal' } },
    { id: 'at-001', type: 'instrumentNode', position: { x: 800, y: 500 }, data: { label: 'Analyzer', tag: 'AT-001', measureType: 'pH', value: 7.2, unit: 'pH', alarmHigh: 9.0, alarmLow: 5.5, status: 'normal' } },
    { id: 'pst-001', type: 'instrumentNode', position: { x: 100, y: 500 }, data: { label: 'PSH Alarm', tag: 'PSH-001', measureType: 'Pressure', value: 5.8, unit: 'bar', alarmHigh: 6.5, alarmLow: null, status: 'warning' } },
    // Junction points
    { id: 'junc-bus', type: 'junctionNode', position: { x: 400, y: 130 }, data: { label: 'Comm Bus' } },
  ],
  edges: [
    // DCS to communication bus
    { id: 'e-dcs-bus', source: 'dcs-01', target: 'junc-bus', type: 'signalEdge', data: {} },
    { id: 'e-sis-bus', source: 'sis-01', target: 'junc-bus', type: 'signalEdge', data: {} },
    // PLCs to bus
    { id: 'e-plca-bus', source: 'plc-area1', target: 'junc-bus', type: 'signalEdge', data: {} },
    { id: 'e-plcb-bus', source: 'plc-area2', target: 'junc-bus', type: 'signalEdge', data: {} },
    // Instruments to PLCs
    { id: 'e-pt-plca', source: 'pt-001', target: 'plc-area1', type: 'signalEdge', data: {} },
    { id: 'e-tt-plca', source: 'tt-001', target: 'plc-area1', type: 'signalEdge', data: {} },
    { id: 'e-ft-plcb', source: 'ft-001', target: 'plc-area2', type: 'signalEdge', data: {} },
    // Instruments to DCS
    { id: 'e-lt-dcs', source: 'lt-001', target: 'dcs-01', type: 'signalEdge', data: {} },
    { id: 'e-at-dcs', source: 'at-001', target: 'dcs-01', type: 'signalEdge', data: {} },
    // Safety signal
    { id: 'e-pst-sis', source: 'pst-001', target: 'sis-01', type: 'signalEdge', data: {} },
    // PLCs to MCCs
    { id: 'e-plca-mcc1', source: 'plc-area1', target: 'mcc-01', type: 'cableEdge', data: {} },
    { id: 'e-plcb-mcc2', source: 'plc-area2', target: 'mcc-02', type: 'cableEdge', data: {} },
    // Power distribution
    { id: 'e-swgr-xfmr', source: 'swgr-main', target: 'xfmr-01', type: 'processFlowEdge', data: { flowStatus: 'normal' } },
    { id: 'e-xfmr-mcc1', source: 'xfmr-01', target: 'mcc-01', type: 'processFlowEdge', data: { flowStatus: 'normal' } },
    { id: 'e-xfmr-mcc2', source: 'xfmr-01', target: 'mcc-02', type: 'processFlowEdge', data: { flowStatus: 'normal' } },
  ],
};

// --- All Templates ---
export const diagramTemplates: DiagramTemplate[] = [
  chilledWaterTemplate,
  electricalDistributionTemplate,
  compressedAirTemplate,
  steamDistributionTemplate,
  fireProtectionTemplate,
  processFlowTemplate,
  controlSystemTemplate,
];

// --- Diagram type metadata ---
export const diagramTypeMeta: Record<string, { label: string; color: string; bgColor: string; icon: string }> = {
  piping: { label: 'Piping', color: 'text-cyan-600', bgColor: 'bg-cyan-50 dark:bg-cyan-950/40', icon: 'Droplets' },
  electrical: { label: 'Electrical', color: 'text-amber-600', bgColor: 'bg-amber-50 dark:bg-amber-950/40', icon: 'Zap' },
  process: { label: 'Process', color: 'text-emerald-600', bgColor: 'bg-emerald-50 dark:bg-emerald-950/40', icon: 'FlaskConical' },
  hvac: { label: 'HVAC', color: 'text-sky-600', bgColor: 'bg-sky-50 dark:bg-sky-950/40', icon: 'Thermometer' },
  control: { label: 'Control', color: 'text-violet-600', bgColor: 'bg-violet-50 dark:bg-violet-950/40', icon: 'Settings' },
  safety: { label: 'Safety', color: 'text-red-600', bgColor: 'bg-red-50 dark:bg-red-950/40', icon: 'Shield' },
};
