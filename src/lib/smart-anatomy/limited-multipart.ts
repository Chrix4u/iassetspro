/**
 * Strict bounded multipart intake for private CAD.
 *
 * Request.formData() buffers the entire body before code can check file.size,
 * so a chunked request with no Content-Length could exhaust server memory.
 * Reading a hard-capped stream first ensures the input never exceeds the
 * individual upload limit plus a fixed multipart/form field allowance.
 */
export class MultipartUploadError extends Error {
  constructor(public readonly status: 400 | 413, message: string) {
    super(message);
  }
}

export const MAX_CAD_MULTIPART_OVERHEAD = 1024 * 1024;

export async function readBoundedMultipart(
  request: Request,
  maxBytes: number,
): Promise<FormData> {
  const contentType = request.headers.get('content-type') || '';
  if (!/^multipart\/form-data\s*;\s*boundary=.+/i.test(contentType)) {
    throw new MultipartUploadError(400, 'Expected a multipart CAD upload');
  }
  if (!request.body) throw new MultipartUploadError(400, 'CAD upload body is empty');

  const declared = request.headers.get('content-length');
  if (declared !== null) {
    const length = Number(declared);
    if (!Number.isSafeInteger(length) || length < 0) {
      throw new MultipartUploadError(400, 'Invalid CAD upload length');
    }
    if (length > maxBytes) throw new MultipartUploadError(413, 'CAD upload exceeds 25 MB');
  }

  const reader = request.body.getReader();
  const parts: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      if (!value || !value.byteLength) continue;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel().catch(() => {});
        throw new MultipartUploadError(413, 'CAD upload exceeds 25 MB');
      }
      parts.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const combined = new Uint8Array(total);
  let position = 0;
  for (const part of parts) {
    combined.set(part, position);
    position += part.byteLength;
  }

  // The second Request is an in-memory, size-bounded multipart body.
  // Reuse the original content-type boundary; do not trust user file types.
  try {
    return await new Request(request.url, {
      method: 'POST',
      headers: { 'content-type': contentType },
      body: new Blob([combined]),
    }).formData();
  } catch {
    throw new MultipartUploadError(400, 'Malformed multipart CAD upload');
  }
}
