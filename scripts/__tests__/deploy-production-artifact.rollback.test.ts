import { describe, expect, it } from 'vitest';
import { readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';

describe('production artifact deployment rollback safety', () => {
  it('wraps every core failure with production verification and previous-runtime restoration', async () => {
    const wrapperPath = join(process.cwd(), 'scripts/deploy-production-artifact.sh');
    const corePath = join(process.cwd(), 'scripts/deploy-production-artifact-core.sh');
    const [source, coreStats] = await Promise.all([
      readFile(wrapperPath, 'utf8'),
      stat(corePath),
    ]);

    expect(coreStats.isFile()).toBe(true);
    expect(coreStats.mode & 0o111).not.toBe(0);

    expect(source).toContain('CORE_SCRIPT="${SCRIPT_DIR}/deploy-production-artifact-core.sh"');
    expect(source).toContain('OLD_RELEASE="$(readlink -f "$APP_LINK" 2>/dev/null || true)"');
    expect(source).toContain('"$CORE_SCRIPT" "$@"');
    expect(source).toContain('CORE_RC=$?');
    expect(source).toContain('restore_previous_runtime');
    expect(source).toContain('WRAPPER ROLLBACK COMPLETE');
    expect(source).toContain('CRITICAL: deployment failed and previous production could not be restored');

    expect(source).toMatch(/Deployment core exited[\s\S]*health_check[\s\S]*restore_previous_runtime/);
    expect(source).toMatch(/pm2 delete \"\$PM2_NAME\"[\s\S]*ln -sfn \"\$OLD_RELEASE\"[\s\S]*pm2 start \"\$old_entry\"/);
  });
});
