/*
 * seed-repairs-uat-costing.ts — Deterministic labor costing fixtures for Repairs UAT.
 *
 * These fixtures intentionally exercise both layers of the production hierarchy:
 * - user-specific overrides for technicians with an authoritative personal rate;
 * - a true trade fallback whose userId is NULL for technicians without an override.
 *
 * Scenario D records real labor against the electrical assistant, so that worker
 * receives a user+plant+trade rate. Scenario B records labor against the mechanical
 * team leader, who intentionally has no user override and therefore exercises the
 * generic PLANT-A Mechanical trade rate end to end. This prevents UAT from relying
 * on another technician's user-specific rate while keeping closure costing strict.
 */

import { PrismaClient } from '@prisma/client';

if (!process.env.DATABASE_URL || !/^postgres(?:ql)?:\/\//i.test(process.env.DATABASE_URL)) {
  const host = process.env.DB_HOST || 'localhost';
  const port = process.env.DB_PORT || '5432';
  const user = process.env.DB_USER || 'postgres';
  const password = process.env.DB_PASSWORD || '';
  const database = process.env.DB_NAME || 'iassetspro';
  process.env.DATABASE_URL = `postgresql://${encodeURIComponent(user)}:${encodeURIComponent(password)}@${host}:${port}/${database}?schema=public`;
}

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { createAdapter } = require('../src/lib/create-postgres-adapter');
const db = new PrismaClient({ adapter: createAdapter(process.env.DATABASE_URL) });

const EFFECTIVE_FROM = new Date('2024-01-01T00:00:00.000Z');

async function main() {
  console.log('💰 Seeding Repairs UAT team labor costing...');

  const [assistant, plant, electricalTrade, mechanicalTrade] = await Promise.all([
    db.user.findUnique({ where: { username: 'uat_tech_assistant' }, select: { id: true } }),
    db.plant.findUnique({ where: { code: 'PLANT-A' }, select: { id: true } }),
    db.trade.findUnique({ where: { name: 'Electrical' }, select: { id: true } }),
    db.trade.findUnique({ where: { name: 'Mechanical' }, select: { id: true } }),
  ]);

  if (!assistant || !plant || !electricalTrade || !mechanicalTrade) {
    throw new Error(
      'Repairs UAT costing prerequisites are missing (assistant, PLANT-A, Electrical trade, or Mechanical trade)',
    );
  }

  const existingAssistantRate = await db.laborRate.findFirst({
    where: {
      userId: assistant.id,
      plantId: plant.id,
      tradeId: electricalTrade.id,
      effectiveFrom: EFFECTIVE_FROM,
    },
    select: { id: true },
  });

  if (existingAssistantRate) {
    await db.laborRate.update({
      where: { id: existingAssistantRate.id },
      data: {
        normalHourlyRate: 55,
        overtimeHourlyRate: 82.5,
        currency: 'GHS',
        effectiveTo: null,
      },
    });
  } else {
    await db.laborRate.create({
      data: {
        userId: assistant.id,
        plantId: plant.id,
        tradeId: electricalTrade.id,
        normalHourlyRate: 55,
        overtimeHourlyRate: 82.5,
        effectiveFrom: EFFECTIVE_FROM,
        currency: 'GHS',
      },
    });
  }

  // This is deliberately a trade-level rate. userId MUST remain null so the
  // production resolver can distinguish it from technician-specific overrides.
  const existingMechanicalTradeRate = await db.laborRate.findFirst({
    where: {
      userId: null,
      plantId: plant.id,
      tradeId: mechanicalTrade.id,
      effectiveFrom: EFFECTIVE_FROM,
    },
    select: { id: true },
  });

  if (existingMechanicalTradeRate) {
    await db.laborRate.update({
      where: { id: existingMechanicalTradeRate.id },
      data: {
        normalHourlyRate: 45,
        overtimeHourlyRate: 67.5,
        currency: 'GHS',
        effectiveTo: null,
      },
    });
  } else {
    await db.laborRate.create({
      data: {
        userId: null,
        plantId: plant.id,
        tradeId: mechanicalTrade.id,
        normalHourlyRate: 45,
        overtimeHourlyRate: 67.5,
        effectiveFrom: EFFECTIVE_FROM,
        currency: 'GHS',
      },
    });
  }

  const now = new Date();
  const [verifiedAssistantRate, verifiedMechanicalTradeRate] = await Promise.all([
    db.laborRate.findFirst({
      where: {
        userId: assistant.id,
        plantId: plant.id,
        tradeId: electricalTrade.id,
        effectiveFrom: { lte: now },
        OR: [{ effectiveTo: null }, { effectiveTo: { gte: now } }],
      },
      select: { userId: true, normalHourlyRate: true, overtimeHourlyRate: true, currency: true },
      orderBy: { effectiveFrom: 'desc' },
    }),
    db.laborRate.findFirst({
      where: {
        userId: null,
        plantId: plant.id,
        tradeId: mechanicalTrade.id,
        effectiveFrom: { lte: now },
        OR: [{ effectiveTo: null }, { effectiveTo: { gte: now } }],
      },
      select: { userId: true, normalHourlyRate: true, overtimeHourlyRate: true, currency: true },
      orderBy: { effectiveFrom: 'desc' },
    }),
  ]);

  if (!verifiedAssistantRate || verifiedAssistantRate.normalHourlyRate <= 0) {
    throw new Error('Repairs UAT electrical assistant labor rate could not be verified');
  }
  if (verifiedAssistantRate.userId !== assistant.id) {
    throw new Error('Repairs UAT electrical assistant rate is not bound to the intended technician');
  }

  if (!verifiedMechanicalTradeRate || verifiedMechanicalTradeRate.normalHourlyRate <= 0) {
    throw new Error('Repairs UAT generic Mechanical trade labor rate could not be verified');
  }
  if (verifiedMechanicalTradeRate.userId !== null) {
    throw new Error('Repairs UAT Mechanical fallback rate must remain trade-level with userId=null');
  }

  console.log(
    `✅ UAT Tech Assistant labor rate: ${verifiedAssistantRate.currency} ` +
      `${verifiedAssistantRate.normalHourlyRate}/hr (OT ${verifiedAssistantRate.overtimeHourlyRate}/hr)`,
  );
  console.log(
    `✅ UAT Mechanical generic trade rate: ${verifiedMechanicalTradeRate.currency} ` +
      `${verifiedMechanicalTradeRate.normalHourlyRate}/hr ` +
      `(OT ${verifiedMechanicalTradeRate.overtimeHourlyRate}/hr, userId=null)`,
  );
}

main()
  .catch((error) => {
    console.error('❌ Repairs UAT costing seed failed:', error);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
