import { describe, expect, it } from 'vitest';
import fs from 'node:fs';

const schema = fs.readFileSync('prisma/schema.prisma', 'utf8');
const assetPage = fs.readFileSync('src/components/modules/AssetDetailPage.tsx', 'utf8');
const convertDialog = fs.readFileSync('src/components/shared/ConvertMRToWODialog.tsx', 'utf8');
const planning = fs.readFileSync('src/services/repairPlanning.service.ts', 'utf8');
const woComponents = fs.readFileSync('src/app/api/work-orders/[id]/components/route.ts', 'utf8');
const pmApi = fs.readFileSync('src/app/api/pm-schedules/route.ts', 'utf8');
const pmDue = fs.readFileSync('src/app/api/pm-schedules/check-due/route.ts', 'utf8');

describe('machine component maintenance hierarchy contract', () => {
  it('supports recursive machine component hierarchy and inventory spare links', () => {
    expect(schema).toContain('parent        ComponentRegistry?');
    expect(schema).toContain('children      ComponentRegistry[]');
    expect(schema).toContain('model ComponentSparePart');
    expect(schema).toContain('inventoryItemId   String?');
    expect(assetPage).toContain('Parent Assembly / Component');
    expect(assetPage).toContain('Component Spare Parts & Store Linkage');
    expect(assetPage).toContain('Link Store Part');
  });

  it('links exact affected components to work orders while retaining the parent machine', () => {
    expect(schema).toContain('model WorkOrderComponent');
    expect(planning).toContain('tx.workOrderComponent.createMany');
    expect(planning).toContain('componentIds: uniqueComponentIds');
    expect(woComponents).toContain('does not belong to the work order asset');
    expect(convertDialog).toContain('Affected Assembly / Component');
    expect(convertDialog).toContain('Reports still roll the work order up to the parent machine.');
  });

  it('surfaces component-linked inventory parts during repair planning', () => {
    expect(convertDialog).toContain('Linked Store Parts for Selected Components');
    expect(convertDialog).toContain('/spare-parts');
    expect(convertDialog).toContain('Stock {suggestion.currentStock}');
    expect(convertDialog).toContain("{alreadyAdded ? 'Added' : 'Add Part'}");
  });

  it('supports component-targeted PM schedules and generated WO inheritance', () => {
    expect(schema).toContain('componentId       String?');
    expect(schema).toContain('pmSchedules              PmSchedule[] @relation("PmScheduleComponent")');
    expect(pmApi).toContain('Selected component does not belong to the selected asset');
    expect(pmDue).toContain('Inherited from component-targeted PM schedule');
    expect(pmDue).toContain('workOrderId_componentRegistryId');
  });
});
