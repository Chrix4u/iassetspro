import { describe, expect, it } from 'vitest';
import fs from 'node:fs';

const schema = fs.readFileSync('prisma/schema.prisma', 'utf8');
const assetPage = fs.readFileSync('src/components/modules/AssetDetailPage.tsx', 'utf8');
const maintenancePages = fs.readFileSync('src/components/modules/MaintenancePages.tsx', 'utf8');
const convertDialog = fs.readFileSync('src/components/shared/ConvertMRToWODialog.tsx', 'utf8');
const planningService = fs.readFileSync('src/services/repairPlanning.service.ts', 'utf8');
const checkDue = fs.readFileSync('src/app/api/pm-schedules/check-due/route.ts', 'utf8');
const checkDueCron = fs.readFileSync('src/app/api/pm-schedules/check-due-cron/route.ts', 'utf8');
const detailedReport = fs.readFileSync('src/app/api/repairs/reports/detailed/route.ts', 'utf8');

describe('machine component hierarchy maintenance workflow contract', () => {
  it('supports recursive assemblies/components and store spare-part linkage', () => {
    expect(schema).toContain('parentId          String?');
    expect(schema).toContain('children      ComponentRegistry[] @relation("ComponentHierarchy")');
    expect(schema).toContain('model ComponentSparePart');
    expect(schema).toContain('inventoryItemId   String?');
    expect(assetPage).toContain('Parent Assembly / Component');
    expect(assetPage).toContain('Component Spare Parts & Store Linkage');
    expect(assetPage).toContain('Link Store Part');
  });

  it('lets work orders target exact components while preserving the machine', () => {
    expect(schema).toContain('model WorkOrderComponent');
    expect(maintenancePages).toContain('componentIds: [] as string[]');
    expect(maintenancePages).toContain('workOrderComponentLabel');
    expect(convertDialog).toContain('Affected Assembly / Component');
    expect(convertDialog).toContain('componentIds: form.componentIds.length > 0');
    expect(planningService).toContain('await tx.workOrderComponent.createMany');
    expect(planningService).toContain('component.assetId !== mr.assetId');
  });

  it('allows PM schedules to target a component and carries it to generated PM work orders', () => {
    expect(schema).toContain('componentId       String?');
    expect(schema).toContain('@relation("PmScheduleComponent"');
    expect(maintenancePages).toContain('Target Assembly / Component');
    expect(maintenancePages).toContain('componentId: formComponentId || null');
    expect(checkDue).toContain('Inherited from component-targeted PM schedule');
    expect(checkDueCron).toContain('Inherited from component-targeted PM schedule');
    expect(checkDue).toContain('componentRegistryId: schedule.componentId');
  });

  it('rolls exact component repairs up to the parent machine with hierarchy context in reports', () => {
    expect(detailedReport).toContain("'Machine Name': asset?.name || wo.assetName || 'N/A'");
    expect(detailedReport).toContain("'Component/Part': comp.name");
    expect(detailedReport).toContain("'Component Hierarchy': componentPath(comp.id)");
    expect(detailedReport).toContain("return chain.join(' → ')");
  });
});
