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
