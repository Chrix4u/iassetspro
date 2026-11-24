import {describe,it,expect,vi} from 'vitest';
import {readFileSync} from 'node:fs';
import {
  allowSharedGltfCache,isPrivateSmartAnatomyUrl,privateModelRequestHeaders,fetchPrivateModelBytes,
} from '@/lib/smart-anatomy/private-model-client';

const url='/api/smart-anatomy/models/f4f9438d-5e92-499a-9abf-b66d6ba591ca/file';
describe('private CAD / laser scan GLTFLoader identity and cache enforcement',()=>{
  it('recognizes only the exact protected same-origin 3D model API path',()=>{
    expect(isPrivateSmartAnatomyUrl(url)).toBe(true);
    expect(isPrivateSmartAnatomyUrl(url+'?revision=2')).toBe(true);
    for(const other of [
      '/smart-anatomy-demos/original-centrifugal-pump.glb',
      'https://example.test/api/smart-anatomy/models/f4f9438d-5e92-499a-9abf-b66d6ba591ca/file',
      '/api/smart-anatomy/models/not-uuid/file',
      '/api/smart-anatomy/models/f4f9438d-5e92-499a-9abf-b66d6ba591ca/file/other',
    ])expect(isPrivateSmartAnatomyUrl(other)).toBe(false);
  });
  it('requires actual bearer credentials before the browser fetches proprietary GLBs',()=>{
    expect(()=>privateModelRequestHeaders(url,{})).toThrow(/Sign in/);
    expect(()=>privateModelRequestHeaders(url,{Authorization:'Bearer '})).toThrow(/Sign in/);
    expect(()=>privateModelRequestHeaders(url,{Authorization:'Basic value'})).toThrow(/Sign in/);
    expect(privateModelRequestHeaders(url,{
      Authorization:'Bearer user-scoped-token',
      'x-plant-id':'authorized-plant-A',
    })).toEqual({
      Authorization:'Bearer user-scoped-token',
      'X-Plant-ID':'authorized-plant-A',
    });
  });
  it('never transmits bearer credentials to public, remote or relative nonprivate models',()=>{
    for(const other of [
      '/smart-anatomy-demos/original-centrifugal-pump.glb',
      'https://vendor.example/verified.glb',
    ]){
      expect(privateModelRequestHeaders(other,{
        Authorization:'Bearer do-not-send-outside-private-api',
      })).toEqual({});
    }
  });
  it('never caches private models in the global URL-keyed cache across user switches',()=>{
    expect(allowSharedGltfCache(url)).toBe(false);
    expect(allowSharedGltfCache(url+'?v=1')).toBe(false);
    expect(allowSharedGltfCache('/smart-anatomy-demos/original-centrifugal-pump.glb')).toBe(true);
  });
  it('fetches the same private model separately for each identity and refuses redirects',async()=>{
    const fetchMock=vi.spyOn(globalThis,'fetch').mockImplementation(async()=>new Response(new Uint8Array([1,2,3]),{headers:{'content-type':'model/gltf-binary'}}));
    try{
      const signal=new AbortController().signal;
      for(const identity of ['first','second'])await fetchPrivateModelBytes(url,{Authorization:'Bearer '+identity,'x-plant-id':identity},signal);
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(fetchMock).toHaveBeenNthCalledWith(1,url,{headers:{Authorization:'Bearer first','X-Plant-ID':'first'},cache:'no-store',credentials:'same-origin',redirect:'error',signal});
      expect(fetchMock).toHaveBeenNthCalledWith(2,url,{headers:{Authorization:'Bearer second','X-Plant-ID':'second'},cache:'no-store',credentials:'same-origin',redirect:'error',signal});
      await expect(fetchPrivateModelBytes('https://outside.test/file',{},signal)).rejects.toThrow(/Invalid private/);
      expect(fetchMock).toHaveBeenCalledTimes(2);
      fetchMock.mockResolvedValueOnce(new Response(null,{status:403}));
      await expect(fetchPrivateModelBytes(url,{Authorization:'Bearer first'},signal)).rejects.toThrow(/403/);
    }finally{fetchMock.mockRestore();}
  });
  it('wires bearer-aware GLTFLoader and releases private scene geometry on unmount',()=>{
    const source=readFileSync('src/components/digital-twin/ModelLoader.tsx','utf8');
    expect(source).toContain('allowSharedGltfCache(modelUrl)');
    expect(source).toContain('fetchPrivateModelBytes(modelUrl, getAuthHeaders(), privateRequest.signal)');
    expect(source).toContain('gltfLoader.parseAsync(bytes');
    expect(source).toContain('privateRequest?.abort()');
    expect(source).toContain('if (shareable) releaseToCache(modelUrl)');
    expect(source).toContain('else if (privateSourceScene) disposeScene(privateSourceScene)');
    expect(source).toContain('if (!shareable) disposeScene(gltf.scene)');
  });
});
