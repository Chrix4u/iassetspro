// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { MultipartUploadError, readBoundedMultipart } from '@/lib/smart-anatomy/limited-multipart';

function uploadRequest(size: number) {
  const form = new FormData();
  form.set('name', 'Example CAD');
  form.set('file', new Blob([new Uint8Array(size)], { type: 'model/gltf-binary' }), 'test.glb');
  return new Request('http://localhost/api/smart-anatomy/models', {
    method: 'POST', body: form,
  });
}

describe('Smart Anatomy bounded multipart file intake', () => {
  it('preserves ordinary multipart fields and file bytes with a known cap', async () => {
    const form = await readBoundedMultipart(uploadRequest(512), 4096);
    expect(form.get('name')).toBe('Example CAD');
    const file = form.get('file') as File;
    expect(file.size).toBe(512);
    expect(file.name).toBe('test.glb');
  });

  it('rejects uploads over a hard cap even without a Content-Length header', async () => {
    const request = uploadRequest(32 * 1024);
    expect(request.headers.get('content-length')).toBeNull();
    const error = await readBoundedMultipart(request, 1024).catch(e => e);
    expect(error).toBeInstanceOf(MultipartUploadError);
    expect((error as MultipartUploadError).status).toBe(413);
  });

  it('rejects declared excess sizes before consuming a streamed upload', async () => {
    const request = uploadRequest(128);
    request.headers.set('content-length', '999999999');
    const error = await readBoundedMultipart(request, 2048).catch(e => e);
    expect(error.status).toBe(413);
  });

  it('rejects invalid multipart requests without parsing arbitrary bodies', async () => {
    const request = new Request('http://localhost/upload', {
      method:'POST', body:'random-not-a-form',
    });
    await expect(readBoundedMultipart(request, 1024))
      .rejects.toMatchObject({status:400});
  });
});
