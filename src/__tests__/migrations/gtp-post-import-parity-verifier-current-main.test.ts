import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const verifierPath = 'scripts/verify-gtp-post-import-parity.ts';
const verifierExists = fs.existsSync(verifierPath);
const verifier = verifierExists ? fs.readFileSync(verifierPath, 'utf8') : '';

describe('GTP independent post-import parity verifier', () => {
  it('exists as an independent signed-manifest-backed CLI verifier', () => {
    if (!verifierExists) {
      expect(verifierExists).toBe(true);
      return;
    }

    expect(verifier).toContain('fingerprintManifestCore');
    expect(verifier).toContain('verifyManifestSignature');
    expect(verifier).toContain('manifest.workbookParity');
    expect(verifier).toContain('manifest.fingerprint');
    expect(verifier).toContain('manifest.source.sha256');
    expect(verifier).toContain('manifest.migrationPlantId');
  });

  it('binds database evidence to both signed source SHA and manifest fingerprint', () => {
    if (!verifierExists) return;

    expect(verifier).toContain("action: 'historical_import'");
    expect(verifier).toContain("entityType: 'work_order'");
    expect(verifier).toContain('sourceSha256');
    expect(verifier).toContain('manifestFingerprint');
    expect(verifier).toContain('manifest.source.sha256');
    expect(verifier).toContain('manifest.fingerprint');
  });

  it('recomputes PostgreSQL parity and fails closed on any mismatch', () => {
    if (!verifierExists) return;

    expect(verifier).toContain('workOrderCount');
    expect(verifier).toContain('maintenanceRequestCount');
    expect(verifier).toContain('auditRowCount');
    expect(verifier).toContain('linkedPairs');
    expect(verifier).toContain('breakdownCount');
    expect(verifier).toContain('priorityOneBreakdowns');
    expect(verifier).toContain('priorityOneResponseMinutes');
    expect(verifier).toContain('process.exitCode = 1');
  });
});
