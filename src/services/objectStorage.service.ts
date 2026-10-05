// ============================================================================
// OBJECT STORAGE — S3-compatible abstraction with local filesystem fallback
// ============================================================================

import { createLogger } from '@/lib/logger';
import { writeFile, mkdir, readFile, unlink, stat, readdir } from 'fs/promises';
import { existsSync } from 'fs';

import crypto from 'crypto';

/** Simple path join using string concat — avoids Turbopack tracing path.join() with dynamic args */
function pjoin(...segments: string[]): string {
  return segments.filter(Boolean).join('/');
}

const logger = createLogger('objectStorage');

export interface UploadResult {
  key: string;
  url: string;
  size: number;
  mimeType: string;
  etag: string;
  uploadedAt: string;
}

export interface SignedUploadUrl {
  uploadUrl: string;
  key: string;
  expiresAt: string;
  fields?: Record<string, string>;
}

export interface StorageObject {
  key: string;
  size: number;
  mimeType: string;
  lastModified: string;
  etag: string;
  url: string;
}

const STORAGE_DIR = process.env.STORAGE_PATH || pjoin(process.cwd(), 'data', 'storage');
const CDN_BASE = process.env.CDN_BASE_URL || '/api/files';
const MAX_FILE_SIZE = parseInt(process.env.MAX_UPLOAD_SIZE || '52428800', 10); // 50MB

export class InvalidStorageKeyError extends Error {
  constructor(message = 'Invalid storage key') {
    super(message);
    this.name = 'InvalidStorageKeyError';
  }
}

function normalizeStorageKey(key: string, allowEmpty = false): string {
  if (typeof key !== 'string' || key.includes('\0')) {
    throw new InvalidStorageKeyError();
  }

  const normalized = key.replace(/\\/g, '/');
  if (!normalized) {
    if (allowEmpty) return '';
    throw new InvalidStorageKeyError();
  }
  if (normalized.startsWith('/')) {
    throw new InvalidStorageKeyError();
  }

  const segments = normalized.split('/');
  if (segments.some((segment) => !segment || segment === '.' || segment === '..')) {
    throw new InvalidStorageKeyError();
  }

  return segments.join('/');
}

function storagePathForKey(key: string): { key: string; path: string } {
  const safeKey = normalizeStorageKey(key);
  return { key: safeKey, path: pjoin(STORAGE_DIR, safeKey) };
}

// Allowed MIME types
const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml',
  'model/gltf-binary', 'model/gltf+json',
  'application/pdf',
  'application/json',
  'text/csv', 'text/plain',
  'video/mp4',
  'audio/webm', 'audio/ogg', 'audio/mpeg', 'audio/mp4', 'audio/wav', 'audio/x-wav',
  'application/zip', 'application/gzip',
]);

export class ObjectStorageService {
  /**
   * Ensure storage directory exists
   */
  private static async ensureDir(path: string): Promise<void> {
    if (!existsSync(path)) {
      await mkdir(path, { recursive: true });
    }
  }

  /**
   * Generate a storage key from filename
   */
  static generateKey(prefix: string, filename: string): string {
    const safePrefix = normalizeStorageKey(prefix);
    const rawExt = filename.includes('.') ? filename.split('.').pop() || '' : '';
    const ext = rawExt.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 16).toLowerCase() || 'bin';
    const hash = crypto.randomBytes(8).toString('hex');
    const date = new Date().toISOString().split('T')[0].replace(/-/g, '/');
    return `${safePrefix}/${date}/${hash}.${ext}`;
  }

  /**
   * Validate file upload
   */
  static validateUpload(mimeType: string, size: number): { valid: boolean; error?: string } {
    if (size > MAX_FILE_SIZE) {
      return { valid: false, error: `File too large. Maximum size: ${Math.round(MAX_FILE_SIZE / 1024 / 1024)}MB` };
    }

    if (!ALLOWED_MIME_TYPES.has(mimeType)) {
      return { valid: false, error: `File type not allowed: ${mimeType}` };
    }

    return { valid: true };
  }

  /**
   * Upload a file (buffer)
   */
  static async upload(
    key: string,
    buffer: Buffer,
    mimeType: string,
    metadata?: Record<string, string>
  ): Promise<UploadResult> {
    const validation = this.validateUpload(mimeType, buffer.length);
    if (!validation.valid) {
      throw new Error(validation.error);
    }

    const { key: safeKey, path: filePath } = storagePathForKey(key);
    await this.ensureDir(filePath.substring(0, filePath.lastIndexOf('/')));

    await writeFile(filePath, buffer);

    const etag = crypto.createHash('md5').update(buffer).digest('hex');

    logger.info('File uploaded', { key: safeKey, size: buffer.length, mimeType });

    return {
      key: safeKey,
      url: `${CDN_BASE}/${safeKey}`,
      size: buffer.length,
      mimeType,
      etag,
      uploadedAt: new Date().toISOString(),
    };
  }

  /**
   * Download a file
   */
  static async download(key: string): Promise<{ buffer: Buffer; mimeType: string } | null> {
    const { key: safeKey, path: filePath } = storagePathForKey(key);

    try {
      const buffer = await readFile(filePath);
      const ext = safeKey.split('.').pop() || '';
      const mimeMap: Record<string, string> = {
        jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif',
        webp: 'image/webp', svg: 'image/svg+xml', glb: 'model/gltf-binary',
        gltf: 'model/gltf+json', pdf: 'application/pdf', json: 'application/json',
        csv: 'text/csv', txt: 'text/plain', mp4: 'video/mp4', zip: 'application/zip',
      };

      return {
        buffer,
        mimeType: mimeMap[ext] || 'application/octet-stream',
      };
    } catch {
      return null;
    }
  }

  /**
   * Delete a file
   */
  static async delete(key: string): Promise<boolean> {
    const { key: safeKey, path: filePath } = storagePathForKey(key);

    try {
      await unlink(filePath);
      logger.info('File deleted', { key: safeKey });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Check if file exists
   */
  static async exists(key: string): Promise<boolean> {
    const { path: filePath } = storagePathForKey(key);
    try {
      await stat(filePath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get file metadata
   */
  static async getMetadata(key: string): Promise<StorageObject | null> {
    const { key: safeKey, path: filePath } = storagePathForKey(key);

    try {
      const stats = await stat(filePath);
      const ext = safeKey.split('.').pop() || '';

      return {
        key: safeKey,
        size: stats.size,
        mimeType: `application/${ext}`,
        lastModified: stats.mtime.toISOString(),
        etag: '',
        url: `${CDN_BASE}/${safeKey}`,
      };
    } catch {
      return null;
    }
  }

  /**
   * List objects with prefix
   */
  static async list(prefix: string, limit = 100): Promise<StorageObject[]> {
    const safePrefix = normalizeStorageKey(prefix, true);
    const dirPath = safePrefix ? pjoin(STORAGE_DIR, safePrefix) : STORAGE_DIR;

    try {
      if (!existsSync(dirPath)) return [];

      const files = await readdir(dirPath, { recursive: true });
      const objects: StorageObject[] = [];

      for (const file of files) {
        if (objects.length >= limit) break;

        const fullPath = pjoin(dirPath, file);
        try {
          const stats = await stat(fullPath);
          if (stats.isFile()) {
            const relativeKey = safePrefix ? `${safePrefix}/${file}` : String(file);
            objects.push({
              key: relativeKey,
              size: stats.size,
              mimeType: 'application/octet-stream',
              lastModified: stats.mtime.toISOString(),
              etag: '',
              url: `${CDN_BASE}/${relativeKey}`,
            });
          }
        } catch { /* skip */ }
      }

      return objects;
    } catch {
      return [];
    }
  }

  /**
   * Generate a signed upload URL (simulated — in production uses S3 presigned URL)
   */
  static generateSignedUploadUrl(
    prefix: string,
    filename: string,
    mimeType: string,
    expiresInSeconds = 3600
  ): SignedUploadUrl {
    const key = this.generateKey(prefix, filename);
    const expiresAt = new Date(Date.now() + expiresInSeconds * 1000).toISOString();

    return {
      uploadUrl: `/api/files/upload?key=${encodeURIComponent(key)}&expires=${expiresAt}`,
      key,
      expiresAt,
    };
  }

  /**
   * Get storage usage statistics
   */
  static async getStorageStats(prefix?: string): Promise<{
    totalFiles: number;
    totalSize: number;
    byPrefix: Record<string, { files: number; size: number }>;
  }> {
    const safePrefix = prefix ? normalizeStorageKey(prefix) : '';
    const baseDir = safePrefix ? pjoin(STORAGE_DIR, safePrefix) : STORAGE_DIR;

    const stats = {
      totalFiles: 0,
      totalSize: 0,
      byPrefix: {} as Record<string, { files: number; size: number }>,
    };

    try {
      if (!existsSync(baseDir)) return stats;

      const walkDir = async (dir: string, depth = 0) => {
        if (depth > 5) return; // Max depth

        const entries = await readdir(dir, { withFileTypes: true });
        for (const entry of entries) {
          const fullPath = pjoin(dir, entry.name);
          if (entry.isDirectory()) {
            await walkDir(fullPath, depth + 1);
          } else {
            try {
              const fileStat = await stat(fullPath);
              stats.totalFiles++;
              stats.totalSize += fileStat.size;

              // Group by first-level prefix
              const relPath = fullPath.replace(STORAGE_DIR + '/', '');
              const prefixKey = relPath.split('/')[0];
              if (!stats.byPrefix[prefixKey]) {
                stats.byPrefix[prefixKey] = { files: 0, size: 0 };
              }
              stats.byPrefix[prefixKey].files++;
              stats.byPrefix[prefixKey].size += fileStat.size;
            } catch { /* skip */ }
          }
        }
      };

      await walkDir(baseDir);
    } catch { /* empty stats */ }

    return stats;
  }
}
