import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const route = readFileSync('src/app/api/assets/ai-generate/route.ts', 'utf8');
const dialog = readFileSync('src/components/shared/AIAssetGenerator.tsx', 'utf8');

describe('AI draft asset commissioning safety guards', () => {
  it('requires user acknowledgment, plant access and a validated assignable location before LLM or database writes', () => {
    expect(route).toContain('body.acknowledgeUnverified !== true');
    expect(route).toContain('getPlantScope(request, session)');
    expect(route).toContain('!canAccessPlant(plantScope, plantId)');
    expect(route).toContain("'assets.functional_locations.assign'");
    expect(route).toContain("installation.hierarchyLevel.allowAssetAssignment");
    expect(route).toContain('installation.plantId !== plantId');
    expect(route.indexOf('body.acknowledgeUnverified !== true')).toBeLessThan(
      route.indexOf('generateMachineDataWithLLM(\n        machineName.trim()'),
    );
    expect(route).toContain('functionalLocationAssignments: { create: {');
    expect(route).toContain('functionalLocationId: installation.id');
  });

  it('never asserts speculative manufacturer, year, prices or specifications as verified machine facts', () => {
    expect(route).toContain('name: machineName.trim(),');
    expect(route).toContain('manufacturer: null,');
    expect(route).toContain('model: null,');
    expect(route).toContain('yearManufactured: null,');
    expect(route).toContain('purchaseCost: null,');
    expect(route).toContain("verified: false,");
    expect(route).toContain("source: 'ai_suggestion'");
    expect(route).toContain("status: 'standby',");
  });

  it('does not automatically activate PM work order generation from AI guesses', () => {
    const scheduleStart = route.indexOf('await tx.pmSchedule.create({');
    expect(scheduleStart).toBeGreaterThan(-1);
    const schedule = route.slice(scheduleStart, route.indexOf('summary.pmSchedules++', scheduleStart));
    expect(schedule).toContain("frequencyType: 'time_day'");
    expect(schedule).toContain('nextDueDate: null');
    expect(schedule).toContain('isActive: false');
    expect(schedule).toContain('autoGenerateWO: false');
    expect(schedule).not.toContain('autoGenerateWO: true');
  });

  it('quarantines speculative AI spare parts from active inventory and costs', () => {
    const start = route.indexOf('await tx.inventoryItem.createMany({');
    expect(start).toBeGreaterThan(-1);
    const inventory = route.slice(start, route.indexOf('summary.inventoryItems =', start));
    expect(inventory).toContain('isActive: false');
    expect(route).toContain('suggestedManufacturerPartCode: sparePart.code');
    expect(route).toContain('suggestedUnitCost: sparePart.unitCost');
    expect(route).toContain('minStockLevel: 0');
    expect(route).toContain("lifecycleStatus: 'uncommissioned'");
  });

  it('preflights the unique machine code family before persisting AI draft assets and parts', () => {
    expect(route).toContain('normalizeAiMachineCode(requestedMachineCode');
    expect(route).toContain('generateAssetTag(shortName, next)');
    expect(route).toContain("assetTag: { startsWith: prefix }");
    expect(route).toContain('first free root');
    expect(route).toContain('expectedAssetCodes');
    expect(route).toContain('expectedPartCodes');
    expect(route).toContain('aiAssemblyCode(mainAssetTag');
    expect(route).toContain('aiComponentCode(mainAssetTag');
    expect(route).toContain('aiPartCode(mainAssetTag');
    expect(route).toContain('Choose another machine code');
    expect(dialog).toContain('payload.machineCode = machineCode.trim().toUpperCase()');
    expect(dialog).toContain('-A01-C01-P01');
    expect(dialog).toContain('e.g. ST-001');
  });

  it('labels AI diagrams and twins as unverified conceptual material, never live machine health', () => {
    expect(route).toContain('isPhysicalTwin: false');
    expect(route).toContain("candidateSpecifications: machineData.specification");
    expect(route).toContain('not a live or OEM-certified digital twin');
    const twinStart = route.indexOf('await db.digitalTwin.create({');
    const twinEnd = route.indexOf('summary.digitalTwin = 1', twinStart);
    const twin = route.slice(twinStart, twinEnd);
    expect(twin).toContain('healthScore: 0');
    expect(twin).toContain('isActive: false');
    expect(route).toContain('NOT OEM CAD');
  });

  it('commits or rolls back the entire machine, BOM, inventory and PM proposal with its audit', () => {
    const start=route.indexOf('const mainAsset = await db.$transaction(async tx => {');
    const finish=route.indexOf('// 7. CREATE DIGITAL TWIN',start);
    expect(start).toBeGreaterThan(-1);
    expect(finish).toBeGreaterThan(start);
    const registration=route.slice(start,finish);
    for(const statement of [
      'await tx.asset.create({',
      'await tx.billOfMaterial.createMany({',
      'await tx.componentRegistry.createMany({',
      'await tx.inventoryItem.createMany({',
      'await tx.pmTemplate.create({',
      'await tx.pmTemplateTask.create({',
      'await tx.pmSchedule.create({',
      'await tx.auditLog.create({',
      'return mainAsset;',
    ]) expect(registration).toContain(statement);
    expect(registration).not.toContain('await db.');
    expect(registration).toContain('skipDuplicates: false');
    expect(registration).toContain('timeout: 90000');
    expect(route).toContain('verificationStatus: \'unverified_draft\'');
  });

  it('never fabricates running status, machine telemetry or a fake factory photo',()=>{
    const start=route.indexOf('// 8. CREATE ENHANCED SYSTEM DIAGRAM');
    const finish=route.indexOf('// DONE — Return response',start);
    expect(start).toBeGreaterThan(-1);
    const diagram=route.slice(start,finish);
    expect(diagram).toContain('UNVERIFIED ILLUSTRATIVE SYSTEM DIAGRAM');
    expect(diagram).toContain("status: 'unverified'");
    expect(diagram).toContain('nodeData.rpm = null');
    expect(diagram).toContain('nodeData.powerRating = null');
    expect(diagram).not.toContain("status: 'operational'");
    expect(diagram).not.toContain('nodeData.health = 100;');
    expect(diagram).not.toContain('nodeData.rpm = 1500;');
    expect(route).not.toContain('aiImageGeneration');
    expect(route).not.toContain('generateMachineImage(');
    expect(route).not.toContain('data: { imageUrl: generatedImageUrl }');
    expect(route).toContain('imageUrl: mainAsset.imageUrl');
  });

  it('makes actual plant path and explicit concept approval mandatory in the generator modal', () => {
    expect(dialog).toContain('<FunctionalLocationPicker');
    expect(dialog).toContain('plantId={plantId}');
    expect(dialog).toContain('acknowledgeUnverified: true');
    expect(dialog).toContain('!functionalLocationId || !acknowledgeUnverified');
    expect(dialog).toContain('Create AI Draft');
    expect(dialog).toContain('not manufacturer/OEM evidence');
  });
});
