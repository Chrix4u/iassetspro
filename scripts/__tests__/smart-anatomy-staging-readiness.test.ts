import { describe, expect, it, vi } from 'vitest';
import { assertStagingTarget, runStagingReadiness } from '../smart-anatomy/check-staging-readiness.mjs';

describe('read-only Smart Anatomy staging gate',()=>{
  it('refuses production, credentials, arbitrary external hosts and HTTP',()=>{
    for (const value of [
      undefined, 'https://iassetspro.lightworldtech.com',
      'https://www.iassetspro.lightworldtech.com',
      'https://lightworldtech.com',
      'https://some-random-site.com',
      'http://staging.lightworldtech.com',
      'https://admin:secret@staging.lightworldtech.com',
      'https://staging.lightworldtech.com/api/health',
      'https://staging.lightworldtech.com/?token=abc',
      'file:///tmp/test',
    ]) expect(()=>assertStagingTarget(value)).toThrow();
    expect(assertStagingTarget('https://staging.lightworldtech.com')).toBe('https://staging.lightworldtech.com');
    expect(assertStagingTarget('http://localhost:4011')).toBe('http://localhost:4011');
  });

  it('runs GET-only checks without redirects or credentials',async()=>{
    const fetcher=vi.fn().mockImplementation(async(url:string)=>({
      status:url.endsWith('/api/health')?200:401,
      url,redirected:false,
      headers:{get:()=> 'application/json; charset=utf-8'},
      json:async()=>url.endsWith('/api/health')?({status:'healthy',checks:{database:{status:'healthy'}},uptime:15}):({error:'Not authenticated'}),
      body:{cancel:vi.fn()},
    }));
    const output={log:vi.fn()} as unknown as Console;
    await runStagingReadiness({origin:'https://uat.lightworldtech.com',fetcher,output});
    expect(fetcher).toHaveBeenCalledTimes(3);
    for (const [,options] of fetcher.mock.calls){
      expect(options.method).toBe('GET');
      expect(options.redirect).toBe('manual');
      expect(options.credentials).toBe('omit');
    }
    expect(output.log).toHaveBeenCalledWith(expect.stringContaining('Read-only smoke checks passed'));
  });

  it('accepts real consumed JSON streams and the canonical app authentication proxy denial',async()=>{
    const fetcher=vi.fn().mockImplementation(async(url:string)=>{
      const health=url.endsWith('/api/health');
      const response=new Response(JSON.stringify(health
        ? {status:'healthy',checks:{database:{status:'healthy'}},uptime:15}
        : {success:false,error:'Authentication required'}),{
        status:health?200:401,headers:{'content-type':'application/json'},
      });
      Object.defineProperty(response,'url',{value:url});
      return response;
    });
    await expect(runStagingReadiness({origin:'http://127.0.0.1:36471',fetcher,output:{log:vi.fn()} as unknown as Console})).resolves.toBeUndefined();
  });

  it('rejects proxy or SSO 401 responses that are not the application denial JSON',async()=>{
    const origin='https://uat.lightworldtech.com';
    const output={log:vi.fn()} as unknown as Console;
    for(const [contentType,denial] of [
      ['text/html',{error:'Not authenticated'}],
      ['application/json',{error:'Unauthorized'}],
      ['application/json',{error:'Authentication required'}],
      ['application/json',{success:true,error:'Authentication required'}],
      ['application/json',{}],
    ] as const){
      const fetcher=vi.fn().mockImplementation(async(url:string)=>({
        status:url.endsWith('/api/health')?200:401,
        url,redirected:false,
        headers:{get:()=>contentType},
        json:async()=>url.endsWith('/api/health')
          ? {status:'healthy',checks:{database:{status:'healthy'}},uptime:15}
          : denial,
        body:{cancel:vi.fn()},
      }));
      await expect(runStagingReadiness({origin,fetcher,output}))
        .rejects.toThrow('Staging readiness failed');
    }
  });

  it('rejects a health 200 that is HTML, degraded, or lacks a healthy database',async()=>{
    const output={log:vi.fn()} as unknown as Console;
    const origin='https://stage.lightworldtech.com';
    for(const json of [
      async()=>{throw new Error('not JSON');},
      async()=>({status:'degraded',checks:{database:{status:'healthy'}},uptime:5}),
      async()=>({status:'healthy',checks:{database:{status:'unhealthy'}},uptime:5}),
      async()=>({status:'healthy',checks:{database:{status:'healthy'}}}),
    ]){
      const fetcher=vi.fn().mockResolvedValue({
        status:200,url:origin+'/api/health',redirected:false,json,body:{cancel:vi.fn()},
      });
      await expect(runStagingReadiness({origin,fetcher,output}))
        .rejects.toThrow('Staging readiness failed');
    }
  });

  it('rejects a silently followed redirect even when destination reports expected status',async()=>{
    const output={log:vi.fn()} as unknown as Console;
    const origin='https://uat.lightworldtech.com';
    const fetcher=vi.fn().mockImplementation(async(url:string)=>({
      status:url.endsWith('/api/health')?200:401,
      url:'https://iassetspro.lightworldtech.com'+new URL(url).pathname,
      redirected:true,
      json:async()=>({status:'healthy',checks:{database:{status:'healthy'}},uptime:5}),
      body:{cancel:vi.fn()},
    }));
    await expect(runStagingReadiness({origin,fetcher,output}))
      .rejects.toThrow('Staging readiness failed');
  });

  it('fails closed for redirects, unexpected status and unavailable staging',async()=>{
    const output={log:vi.fn()} as unknown as Console;
    for (const status of [200,302,403,500]){
      const fetcher=vi.fn().mockResolvedValue({status,body:{cancel:vi.fn()}});
      await expect(runStagingReadiness({
        origin:'https://stage.lightworldtech.com',fetcher,output,
      })).rejects.toThrow('Staging readiness failed');
    }
    const fetcher=vi.fn().mockRejectedValue(new Error('offline'));
    await expect(runStagingReadiness({
      origin:'https://stage.lightworldtech.com',fetcher,output,
    })).rejects.toThrow('Staging readiness failed');
  });
});
