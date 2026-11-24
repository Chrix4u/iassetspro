/**
 * Private Smart Anatomy binaries are served by authenticated, plant-scoped API
 * routes. They must not be fetched anonymously by GLTFLoader, and must never
 * enter an origin-wide URL-keyed GLTF cache that survives user/plant switching.
 */
const PRIVATE_GLTF_ROUTE = /^\/api\/smart-anatomy\/models\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/file$/i;

export function isPrivateSmartAnatomyUrl(url:string):boolean{
  return PRIVATE_GLTF_ROUTE.test(url.split('?')[0]);
}

export function allowSharedGltfCache(url:string):boolean{
  return !isPrivateSmartAnatomyUrl(url);
}

export function privateModelRequestHeaders(
  modelUrl:string,
  currentSessionHeaders:Record<string,string>,
):Record<string,string> {
  if(!isPrivateSmartAnatomyUrl(modelUrl))return {};
  const header=currentSessionHeaders.Authorization||currentSessionHeaders.authorization||'';
  if(!/^Bearer\s+\S+$/.test(header)){
    throw Error('Sign in to view this protected engineering 3D model');
  }
  const result:Record<string,string>={Authorization:header};
  const plant=currentSessionHeaders['x-plant-id']||currentSessionHeaders['X-Plant-ID'];
  if(plant)result['X-Plant-ID']=plant;
  return result;
}

/** Fetch each private model under the current identity, without Three's global
 * URL-keyed FileLoader cache or its in-flight request coalescing. Server-side
 * intake rejects external references, so parsing bytes needs no auth headers. */
export async function fetchPrivateModelBytes(
  modelUrl:string,currentSessionHeaders:Record<string,string>,signal:AbortSignal,
):Promise<ArrayBuffer>{
  if(!isPrivateSmartAnatomyUrl(modelUrl))throw Error('Invalid private engineering model URL');
  const response=await fetch(modelUrl,{
    headers:privateModelRequestHeaders(modelUrl,currentSessionHeaders),
    cache:'no-store',credentials:'same-origin',redirect:'error',signal,
  });
  if(!response.ok)throw Error(`Private engineering model unavailable (${response.status})`);
  if(!response.headers.get('content-type')?.includes('model/gltf-binary'))throw Error('Invalid private engineering model response');
  return response.arrayBuffer();
}
