import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockDb,
  mockCreateStandardWorkbook,
  mockAddDataSheet,
  mockAddAnalyticsSheet,
  mockGenerateXlsxBuffer,
  mockBuildFilename,
  mockLegacyGenerateReport,
} = vi.hoisted(() => ({
  mockDb: {
    workOrder: { findMany: vi.fn() },
    maintenanceRequest: { findMany: vi.fn() },
    workOrderTimeLog: { findMany: vi.fn() },
    workOrderDowntime: { findMany: vi.fn() },
    asset: { findMany: vi.fn() },
    department: { findMany: vi.fn() },
    repairMaterialRequest: { findMany: vi.fn() },
    repairToolRequest: { findMany: vi.fn() },
    woTeamMemberRequest: { findMany: vi.fn() },
    shiftHandover: { findMany: vi.fn() },
  },
  mockCreateStandardWorkbook: vi.fn(() => ({})),
  mockAddDataSheet: vi.fn(),
  mockAddAnalyticsSheet: vi.fn(),
  mockGenerateXlsxBuffer: vi.fn(() => Buffer.from('xlsx-bytes')),
  mockBuildFilename: vi.fn((name: string) => `${name}.xlsx`),
  mockLegacyGenerateReport: vi.fn(),
}));

vi.mock('@/lib/db', () => ({ db: mockDb }));
vi.mock('@/services/reportExportXlsx.service', () => ({
  createStandardWorkbook: mockCreateStandardWorkbook,
  addDataSheet: mockAddDataSheet,
  addAnalyticsSheet: mockAddAnalyticsSheet,
  generateXlsxBuffer: mockGenerateXlsxBuffer,
  buildFilename: mockBuildFilename,
}));
vi.mock('@/services/repairsReportXlsx.service', () => ({
  generateReport: mockLegacyGenerateReport,
}));

import { generateRepairsReport } from '@/services/repairsReportXlsxSafe.service';

const session = {
  userId: 'planner-1',
  fullName: 'Planner One',
  roles: ['maintenance_planner'],
  permissions: ['reports.export'],
} as any;

describe('repairsReportXlsxSafe operational report pack', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDb.workOrder.findMany.mockResolvedValue([]);
    mockDb.maintenanceRequest.findMany.mockResolvedValue([]);
    mockDb.workOrderTimeLog.findMany.mockResolvedValue([]);
    mockDb.workOrderDowntime.findMany.mockResolvedValue([]);
    mockDb.asset.findMany.mockResolvedValue([]);
    mockDb.department.findMany.mockResolvedValue([]);
    mockDb.repairMaterialRequest.findMany.mockResolvedValue([]);
    mockDb.repairToolRequest.findMany.mockResolvedValue([]);
    mockDb.woTeamMemberRequest.findMany.mockResolvedValue([]);
    mockDb.shiftHandover.findMany.mockResolvedValue([]);
  });

  it('builds a date-bounded daily operations report and does not count an opening outside the selected period', async () => {
    mockDb.workOrder.findMany.mockResolvedValue([
      {
        id: 'wo-1',
        woNumber: 'WO-1',
        title: 'Emergency pump repair',
        type: 'emergency',
        priority: 'critical',
        status: 'closed',
        assetId: 'asset-1',
        assetName: 'Process Pump',
        departmentId: 'dept-1',
        assignedTo: 'tech-1',
        totalCost: 450,
        createdAt: new Date('2026-08-31T10:00:00Z'),
        actualEnd: new Date('2026-09-01T12:00:00Z'),
        repairCompletion: { totalLaborHours: 2 },
      },
    ]);
    mockDb.workOrderTimeLog.findMany.mockResolvedValue([
      { timestamp: new Date('2026-09-01T09:00:00Z'), duration: 1.5 },
    ]);
    mockDb.workOrderDowntime.findMany.mockResolvedValue([
      { downtimeStart: new Date('2026-09-01T08:00:00Z'), durationMinutes: 60, productionLoss: 100 },
    ]);

    const result = await generateRepairsReport(
      'operations-summary',
      {
        plantId: 'plant-a',
        dateFrom: '2026-09-01',
        dateTo: '2026-09-02',
        maintenanceScope: 'repairs',
      },
      session,
    );

    expect(result.filename).toBe('repairs-operations-summary.xlsx');
    expect(mockLegacyGenerateReport).not.toHaveBeenCalled();
    expect(mockDb.workOrder.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        plantId: 'plant-a',
        type: { in: ['corrective', 'emergency', 'predictive'] },
        OR: expect.any(Array),
      }),
    }));
    expect(mockDb.workOrderTimeLog.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        workOrder: expect.objectContaining({
          plantId: 'plant-a',
          type: { in: ['corrective', 'emergency', 'predictive'] },
        }),
      }),
    }));
    expect(mockDb.workOrderDowntime.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        plantId: 'plant-a',
        workOrder: expect.objectContaining({
          type: { in: ['corrective', 'emergency', 'predictive'] },
        }),
      }),
    }));

    const dailyCall = mockAddDataSheet.mock.calls.find((call) => call[1] === 'Daily Operations');
    expect(dailyCall).toBeDefined();
    const rows = dailyCall?.[3] as Array<Record<string, unknown>>;
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      date: '2026-09-01',
      opened: 0,
      completed: 1,
      emergencyOpened: 0,
      laborHours: 1.5,
      downtimeHours: 1,
      productionLoss: 100,
      maintenanceCost: 450,
    });
  });

  it('builds asset repair history from repair, failure, RCA, downtime and cost records', async () => {
    mockDb.workOrder.findMany.mockResolvedValue([
      {
        id: 'wo-asset-1',
        woNumber: 'WO-ASSET-1',
        title: 'Replace pump bearing',
        type: 'corrective',
        priority: 'high',
        status: 'closed',
        assetId: 'asset-1',
        assetName: 'Process Pump',
        causeDescription: 'Bearing wear',
        actionDescription: 'Bearing replaced',
        actualHours: 2,
        partsCost: 120,
        contractorCost: 0,
        totalCost: 300,
        actualStart: new Date('2026-09-02T08:00:00Z'),
        actualEnd: new Date('2026-09-02T10:00:00Z'),
        assignee: { fullName: 'Technician One' },
        repairCompletion: {
          rootCause: 'Bearing wear',
          correctiveAction: 'Bearing replaced',
          totalLaborHours: 2,
          totalMaterialCost: 120,
          totalDowntimeMinutes: 90,
        },
        failureRecords: [
          { failureMode: 'wear', rootCause: 'Bearing wear', correctiveAction: 'Bearing replaced' },
        ],
        workOrderDowntimes: [
          { durationMinutes: 90, productionLoss: 250 },
        ],
      },
    ]);
    mockDb.asset.findMany.mockResolvedValue([
      { id: 'asset-1', name: 'Process Pump', assetTag: 'PUMP-01', category: { name: 'Pump' } },
    ]);

    const result = await generateRepairsReport(
      'asset-history',
      { plantId: 'plant-a', maintenanceScope: 'repairs' },
      session,
    );

    expect(result.filename).toBe('asset-repair-history.xlsx');
    expect(mockLegacyGenerateReport).not.toHaveBeenCalled();
    expect(mockDb.workOrder.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        plantId: 'plant-a',
        type: { in: ['corrective', 'emergency', 'predictive'] },
      }),
    }));

    const historyCall = mockAddDataSheet.mock.calls.find((call) => call[1] === 'Repair History');
    expect(historyCall).toBeDefined();
    expect(historyCall?.[3]?.[0]).toMatchObject({
      assetName: 'Process Pump',
      assetTag: 'PUMP-01',
      failureModes: 'wear',
      rootCause: 'Bearing wear',
      correctiveAction: 'Bearing replaced',
      laborHours: 2,
      downtimeMinutes: 90,
      productionLoss: 250,
      materialCost: 120,
      totalCost: 300,
    });
    expect(mockAddAnalyticsSheet).toHaveBeenCalledWith(
      expect.anything(),
      'Asset Summary',
      expect.arrayContaining([
        expect.objectContaining({ Asset: 'Process Pump', Repairs: 1 }),
      ]),
    );
  });

  it('allocates repairs cost by department code/cost center with work-order detail', async () => {
    mockDb.workOrder.findMany.mockResolvedValue([
      {
        id: 'wo-cost-1',
        woNumber: 'WO-COST-1',
        title: 'Motor repair',
        type: 'corrective',
        priority: 'medium',
        status: 'closed',
        assetName: 'Line Motor',
        departmentId: 'dept-1',
        actualHours: 3,
        laborCost: 150,
        partsCost: 200,
        contractorCost: 50,
        totalCost: 425,
        actualEnd: new Date('2026-09-03T14:00:00Z'),
        createdAt: new Date('2026-09-03T08:00:00Z'),
        repairCompletion: { totalLaborHours: 3, totalToolCost: 25 },
      },
    ]);
    mockDb.department.findMany.mockResolvedValue([
      { id: 'dept-1', name: 'Production', code: 'PROD' },
    ]);

    const result = await generateRepairsReport(
      'department-cost',
      { plantId: 'plant-a', maintenanceScope: 'repairs' },
      session,
    );

    expect(result.filename).toBe('department-cost-center-report.xlsx');
    expect(mockLegacyGenerateReport).not.toHaveBeenCalled();

    const summaryCall = mockAddDataSheet.mock.calls.find((call) => call[1] === 'Cost Centers');
    expect(summaryCall).toBeDefined();
    expect(summaryCall?.[3]?.[0]).toMatchObject({
      departmentCode: 'PROD',
      departmentName: 'Production',
      workOrders: 1,
      completed: 1,
      laborHours: 3,
      laborCost: 150,
      partsCost: 200,
      contractorCost: 50,
      toolCost: 25,
      totalCost: 425,
      avgCostPerWo: 425,
    });

    const detailCall = mockAddDataSheet.mock.calls.find((call) => call[1] === 'WO Cost Detail');
    expect(detailCall?.[3]?.[0]).toMatchObject({
      departmentCode: 'PROD',
      woNumber: 'WO-COST-1',
      totalCost: 425,
    });
  });

  it('audits material reconciliation and surfaces quantity variances', async () => {
    mockDb.repairMaterialRequest.findMany.mockResolvedValue([
      {
        id: 'mat-1',
        itemName: 'Bearing',
        unit: 'each',
        quantityIssued: 10,
        quantityApproved: 10,
        quantityReturned: 2,
        unitCost: 25,
        consumedQty: 6,
        wastedQty: 1,
        declaredConsumedQty: 6,
        declaredWastedQty: 1,
        declaredReturnQty: 3,
        issuedAt: new Date('2026-09-10T08:00:00Z'),
        workOrder: { woNumber: 'WO-MAT-1', title: 'Bearing repair' },
        item: { itemCode: 'BRG-01', name: 'Bearing' },
        requestedBy: { fullName: 'Technician One' },
        issuedByUser: { fullName: 'Storekeeper One' },
      },
    ]);

    const result = await generateRepairsReport(
      'material-reconciliation',
      { plantId: 'plant-a', maintenanceScope: 'repairs' },
      session,
    );

    expect(result.filename).toBe('material-reconciliation-audit.xlsx');
    expect(mockDb.repairMaterialRequest.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        plantId: 'plant-a',
        workOrder: expect.objectContaining({
          type: { in: ['corrective', 'emergency', 'predictive'] },
        }),
      }),
    }));

    const sheet = mockAddDataSheet.mock.calls.find((call) => call[1] === 'Reconciliation');
    expect(sheet?.[3]?.[0]).toMatchObject({
      woNumber: 'WO-MAT-1',
      issuedQty: 10,
      consumedQty: 6,
      wastedQty: 1,
      reconciledReturnQty: 3,
      recordedReturnQty: 2,
      balanceDelta: 1,
      reconciliationStatus: 'Variance',
      issuedCost: 250,
      wastedCost: 25,
      returnValue: 75,
    });
  });

  it('reports outstanding tool custody and return-confirmation state', async () => {
    mockDb.repairToolRequest.findMany.mockResolvedValue([
      {
        id: 'tool-req-1',
        requestNumber: 'TR-202609-0001',
        toolName: 'Torque Wrench',
        status: 'issued',
        toolConditionAtIssue: 'good',
        toolConditionAtReturn: null,
        reason: 'Bearing replacement',
        notes: 'Return after task',
        issuedAt: new Date('2026-09-10T08:00:00Z'),
        returnedAt: null,
        returnConfirmedAt: null,
        workOrder: { woNumber: 'WO-TOOL-1', title: 'Bearing replacement' },
        requestedBy: { fullName: 'Technician One' },
        issuedByUser: { fullName: 'Storekeeper One' },
        returnedByUser: null,
        returnConfirmedByUser: null,
        items: [
          {
            toolCode: 'TW-01',
            toolName: 'Torque Wrench',
            quantityRequested: 2,
            quantityIssued: 2,
            quantityReturned: 0,
            quantityTransferred: 0,
            pendingReturnQty: 1,
            conditionAtIssue: 'good',
            conditionAtReturn: null,
            pendingReturnCondition: 'fair',
            pendingReturnNotes: 'One unit ready for store confirmation',
          },
        ],
      },
    ]);

    const result = await generateRepairsReport(
      'tool-custody',
      { plantId: 'plant-a', maintenanceScope: 'repairs' },
      session,
    );

    expect(result.filename).toBe('tool-custody-return-audit.xlsx');
    const sheet = mockAddDataSheet.mock.calls.find((call) => call[1] === 'Tool Custody');
    expect(sheet?.[3]?.[0]).toMatchObject({
      requestNumber: 'TR-202609-0001',
      woNumber: 'WO-TOOL-1',
      toolCode: 'TW-01',
      toolName: 'Torque Wrench',
      quantityRequested: 2,
      quantityIssued: 2,
      pendingReturnQty: 1,
      custodyStatus: 'Awaiting Store Confirmation',
      conditionAtIssue: 'good',
      conditionAtReturn: 'fair',
    });
  });

  it('calculates assistance request review turnaround from authoritative review timestamps', async () => {
    mockDb.woTeamMemberRequest.findMany.mockResolvedValue([
      {
        id: 'assist-1',
        requestedTrade: 'Electrician',
        role: 'assistant',
        status: 'approved',
        reason: 'Electrical isolation support',
        reviewNotes: 'Approved for shift',
        createdAt: new Date('2026-09-10T08:00:00Z'),
        reviewedAt: new Date('2026-09-10T10:30:00Z'),
        workOrder: { woNumber: 'WO-AST-1', title: 'Motor repair' },
        requestedByUser: { fullName: 'Technician One' },
        requestedUser: { fullName: 'Electrician One' },
        reviewedByUser: { fullName: 'Planner One' },
      },
    ]);

    const result = await generateRepairsReport(
      'assistance',
      { plantId: 'plant-a', maintenanceScope: 'repairs' },
      session,
    );

    expect(result.filename).toBe('assistance-turnaround-report.xlsx');
    const sheet = mockAddDataSheet.mock.calls.find((call) => call[1] === 'Assistance Requests');
    expect(sheet?.[3]?.[0]).toMatchObject({
      woNumber: 'WO-AST-1',
      requestedTrade: 'Electrician',
      status: 'approved',
      reviewHours: 2.5,
      reviewedBy: 'Planner One',
    });
  });

  it('exports shift handover continuity and pending issue evidence', async () => {
    mockDb.shiftHandover.findMany.mockResolvedValue([
      {
        id: 'handover-1',
        shiftDate: new Date('2026-09-10T00:00:00Z'),
        shiftType: 'night',
        fromShift: 'afternoon',
        toShift: 'night',
        status: 'pending',
        tasksSummary: JSON.stringify(['Bearing removed', 'Shaft inspected']),
        pendingIssues: JSON.stringify(['Replacement bearing pending']),
        safetyNotes: 'LOTO remains active',
        equipmentStatus: JSON.stringify({ state: 'stopped' }),
        notes: 'Continue next shift',
        createdAt: new Date('2026-09-10T21:45:00Z'),
        updatedAt: new Date('2026-09-10T22:00:00Z'),
        handedOverBy: { fullName: 'Technician One' },
        receivedBy: null,
        workOrder: { woNumber: 'WO-HO-1', title: 'Conveyor repair' },
      },
    ]);

    const result = await generateRepairsReport(
      'shift-handover',
      { plantId: 'plant-a', maintenanceScope: 'repairs' },
      session,
    );

    expect(result.filename).toBe('shift-handover-audit.xlsx');
    const sheet = mockAddDataSheet.mock.calls.find((call) => call[1] === 'Shift Handovers');
    expect(sheet?.[3]?.[0]).toMatchObject({
      woNumber: 'WO-HO-1',
      status: 'pending',
      handedOverBy: 'Technician One',
      pendingIssues: 'Replacement bearing pending',
      safetyNotes: 'LOTO remains active',
      elapsedToLastUpdateHours: 0.25,
      createdAt: '2026-09-10T21:45:00.000Z',
      updatedAt: '2026-09-10T22:00:00.000Z',
    });
  });

  it('audits RCA, supervisor approval and planner closure compliance', async () => {
    mockDb.workOrder.findMany.mockResolvedValue([
      {
        id: 'wo-close-1',
        woNumber: 'WO-CLOSE-1',
        title: 'Pump repair',
        assetName: 'Process Pump',
        type: 'corrective',
        priority: 'high',
        status: 'closed',
        actualEnd: new Date('2026-09-10T15:00:00Z'),
        assignee: { fullName: 'Technician One' },
        repairCompletion: {
          rootCause: 'Seal wear',
          correctiveAction: 'Seal replaced',
          findings: 'Leak eliminated',
          supervisorStatus: 'approved',
          supervisorApprovedAt: new Date('2026-09-10T16:00:00Z'),
          supervisorApprovedBy: { fullName: 'Supervisor One' },
          plannerStatus: 'closed',
          plannerClosedAt: new Date('2026-09-10T17:00:00Z'),
          plannerClosedBy: { fullName: 'Planner One' },
          reworkCount: 0,
        },
      },
    ]);

    const result = await generateRepairsReport(
      'closure-audit',
      { plantId: 'plant-a', maintenanceScope: 'repairs' },
      session,
    );

    expect(result.filename).toBe('closure-rca-compliance-audit.xlsx');
    expect(mockDb.workOrder.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        plantId: 'plant-a',
        type: { in: ['corrective', 'emergency', 'predictive'] },
        status: { in: ['completed', 'verified', 'closed'] },
      }),
    }));

    const sheet = mockAddDataSheet.mock.calls.find((call) => call[1] === 'Closure Audit');
    expect(sheet?.[3]?.[0]).toMatchObject({
      woNumber: 'WO-CLOSE-1',
      rcaRequired: 'Yes',
      rcaComplete: 'Yes',
      supervisorStatus: 'approved',
      plannerStatus: 'closed',
      fullyCompliant: 'Yes',
      supervisorApprovedBy: 'Supervisor One',
      plannerClosedBy: 'Planner One',
    });
  });

});
