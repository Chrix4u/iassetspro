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
