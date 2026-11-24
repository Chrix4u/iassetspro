import type {NextRequest} from 'next/server';

/** Deliberately small JSON control-plane payloads. A missing Content-Length
 * must NOT bypass size checks by allowing an unbounded req.json() allocation.
 */
export class BoundedJsonError extends Error {
  constructor(message:string,public readonly status:400|413){super(message);}
}

export async function readBoundedJsonObject(
  req:NextRequest, maxBytes=24*1024,
):Promise<Record<string,unknown>>{
  const declared=req.headers.get('content-length');
  if(declared!==null){
    const n=Number(declared);
    if(!Number.isSafeInteger(n)||n<0)throw new BoundedJsonError('Invalid declared JSON length',400);
    if(n>maxBytes)throw new BoundedJsonError('Engineering JSON payload exceeds size limit',413);
  }
  const reader=req.body?.getReader();
  if(!reader)throw new BoundedJsonError('JSON request body is required',400);
  const chunks:Uint8Array[]=[];
  let count=0;
  try{
    for(;;){
      const {value,done}=await reader.read();
      if(done)break;
      if(!value)continue;
      count+=value.byteLength;
      if(count>maxBytes){
        await reader.cancel().catch(()=>{});
        throw new BoundedJsonError('Engineering JSON payload exceeds size limit',413);
      }
      chunks.push(value);
    }
  }finally{reader.releaseLock();}
  let data:unknown;
  try{
    data=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(
      Buffer.concat(chunks.map(chunk=>Buffer.from(chunk))),
    ));
  }catch{
    throw new BoundedJsonError('Invalid JSON engineering request',400);
  }
  if(!data||typeof data!=='object'||Array.isArray(data)){
    throw new BoundedJsonError('Expected a JSON object',400);
  }
  return data as Record<string,unknown>;
}
