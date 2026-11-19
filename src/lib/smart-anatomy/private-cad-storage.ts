import { constants } from 'node:fs';
import { access, lstat, realpath } from 'node:fs/promises';
import { isAbsolute, join, resolve, sep } from 'node:path';

/** Fail closed rather than publishing proprietary CAD in a static web folder. */
export function privateCadStorageRoot(): string | null {
  const configured = process.env.IASSETSPRO_CAD_STORAGE_ROOT?.trim();
  if (!configured || !isAbsolute(configured)) return null;
  const root = resolve(configured);
  // Misconfigured local static-folder storage would expose proprietary CAD
  // without any token or plant checks. Fail closed.
  const publicRoot = resolve(process.cwd(), 'public');
  if (root === publicRoot || root.startsWith(publicRoot + sep)) return null;
  return root;
}

export function privateCadFilePath(root: string, id: string): string {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    throw new Error('Invalid CAD file identifier');
  }
  return join(root, id + '.glb');
}


/**
 * Enforce the deployment storage invariant on every write and private read.
 * A one-time preflight cannot protect against permission or symlink drift.
 * The directory is provisioned out-of-band; the application must never
 * create an insecure writable parent tree for proprietary CAD.
 */
export async function assertPrivateCadStorageReady(root: string): Promise<void> {
  const normalized = privateCadStorageRoot();
  if (!normalized || normalized !== resolve(root)) {
    throw new Error('Private CAD root is not configured safely');
  }

  const info = await lstat(root);
  if (!info.isDirectory() || info.isSymbolicLink()) {
    throw new Error('Private CAD root must be an actual directory');
  }

  // Require private permissions for the entire storage directory.
  if ((info.mode & 0o077) !== 0) {
    throw new Error('Private CAD root must have owner-only permissions');
  }

  // Reject all symlinks in the storage path, not just at its final component.
  const canonical = await realpath(root);
  if (canonical !== resolve(root)) {
    throw new Error('Private CAD storage path must not contain symlinks');
  }

  const publicRoot = resolve(process.cwd(), 'public');
  const publicCanonical = await realpath(publicRoot).catch(() => publicRoot);
  if (canonical === publicCanonical || canonical.startsWith(publicCanonical + sep)) {
    throw new Error('Private CAD cannot be stored in a public web root');
  }

  if (typeof process.getuid === 'function' && info.uid !== process.getuid()) {
    throw new Error('Private CAD storage root must belong to the application user');
  }

  await access(root, constants.R_OK | constants.W_OK | constants.X_OK);
}
