#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

const operation = process.argv[2] || 'unknown-operation';
const override = process.env.IASSETSPRO_ALLOW_DESTRUCTIVE_DB === '1';

function parseEnvValue(filePath, key) {
  if (!fs.existsSync(filePath)) return '';
  const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/);
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const index = line.indexOf('=');
    if (index < 1) continue;
    if (line.slice(0, index).trim() !== key) continue;
    return line.slice(index + 1).trim().replace(/^['"]|['"]$/g, '');
  }
  return '';
}

function resolveDatabaseUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;

  for (const file of ['.env.local', '.env.development', '.env', '.env.production']) {
    const value = parseEnvValue(path.resolve(process.cwd(), file), 'DATABASE_URL');
    if (value) return value;
  }

  return '';
}

function fail(message) {
  console.error(`[database-safety] BLOCKED ${operation}: ${message}`);
  console.error(
    '[database-safety] For an intentional exceptional operation, set IASSETSPRO_ALLOW_DESTRUCTIVE_DB=1 for that single command.',
  );
  process.exit(1);
}

if (override) {
  console.warn(`[database-safety] OVERRIDE accepted for ${operation}.`);
  process.exit(0);
}

if (process.env.NODE_ENV === 'production') {
  fail('NODE_ENV=production does not permit interactive/destructive Prisma commands.');
}

const databaseUrl = resolveDatabaseUrl();
if (!databaseUrl) {
  fail('DATABASE_URL could not be resolved.');
}

let parsed;
try {
  parsed = new URL(databaseUrl);
} catch {
  fail('DATABASE_URL is not a valid URL.');
}

if (!['postgres:', 'postgresql:'].includes(parsed.protocol)) {
  fail(`unsupported database provider ${parsed.protocol || 'unknown'}; PostgreSQL is required.`);
}

const hostname = parsed.hostname.toLowerCase();
const localHosts = new Set([
  'localhost',
  '127.0.0.1',
  '::1',
  'host.docker.internal',
  'postgres',
  'db',
]);

if (!localHosts.has(hostname)) {
  fail(`database host ${hostname} is not an approved local-development host.`);
}

console.log(`[database-safety] ${operation} permitted for local PostgreSQL host ${hostname}.`);
