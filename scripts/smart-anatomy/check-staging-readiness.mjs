#!/usr/bin/env node
/**
 * Non-mutating CAD staging smoke gate. Never sends credentials or writes
 * machine, model, PM, inventory, or work-order records.
 *
 * IASSETSPRO_STAGING_URL=https://staging.example.com node scripts/smart-anatomy/check-staging-readiness.mjs
 */
import { pathToFileURL } from 'node:url';

export function assertStagingTarget(raw) {
  if (!raw || typeof raw !== 'string') throw new Error('Explicit IASSETSPRO_STAGING_URL is required');
  let url;
  try { url = new URL(raw); } catch { throw new Error('Invalid staging URL'); }
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password ||
      url.search || url.hash || url.pathname !== '/' ||
      !url.hostname || url.hostname.endsWith('.')) {
    throw new Error('Use a credential-free staging origin without path, query or fragment');
  }
  const host = url.hostname.toLowerCase();
  const local = ['localhost','127.0.0.1','::1','[::1]'].includes(host);
  if (url.protocol !== 'https:' && !local) throw new Error('Remote staging must use HTTPS');
  if (host === 'iassetspro.lightworldtech.com' ||
      host === 'www.iassetspro.lightworldtech.com' ||
      host === 'lightworldtech.com' || host === 'www.lightworldtech.com') {
    throw new Error('Refusing the production application or company domain');
  }
  if (!local && !/(^|[.-])(staging|stage|uat|test)([.-]|$)/i.test(host)) {
    throw new Error('Hostname must explicitly identify a staging, UAT or test environment');
  }
  return url.origin;
}

export async function runStagingReadiness({origin, fetcher=fetch, output=console}) {
  const base=assertStagingTarget(origin);
  const checks=[
    {path:'/api/health',allowed:[200],label:'Staging health'},
    {path:'/api/smart-anatomy/models/00000000-0000-4000-8000-000000000000/file',
      allowed:[401],label:'Anonymous CAD binary access denied'},
    {path:'/api/smart-anatomy/models/00000000-0000-4000-8000-000000000000/maintenance-trace',
      allowed:[401],label:'Anonymous maintenance trace access denied'},
  ];
  let passed=true;
  for (const check of checks) {
    let status=0;
    try {
      const controller=new AbortController();
      const timeout=setTimeout(()=>controller.abort(),8000);
      try {
        const response=await fetcher(base+check.path,{
          method:'GET',redirect:'manual',credentials:'omit',
          headers:{Accept:'application/json', 'Cache-Control':'no-store'},
          signal:controller.signal,
        });
        status=response.status;
        // A mocked fetch, proxy or custom fetch implementation can follow
        // redirects even when redirect:manual is requested. Never count a
        // response that came from a different endpoint or origin as staging.
        const expectedUrl=base+check.path;
        if(response.redirected===true ||
            (typeof response.url==='string' && response.url!==expectedUrl)){
          status=0;
        }
        // A proxy, CDN or SSO layer may return its own generic 401 page.
        // Require the application's JSON authentication error, not merely
        // the HTTP status, before accepting anonymous access protection.
        if(check.allowed.includes(401) && status===401){
          try{
            const type=response.headers?.get('content-type') || '';
            if(!/^application\/json(?:\s*;|\s*$)/i.test(type)){
              status=0;
            }else{
              const denial=await response.json();
              if(!denial || denial.error!=='Not authenticated') status=0;
            }
          }catch{status=0;}
        }
        if(check.path==='/api/health' && status===200){
          // A bare HTTP 200 may be a CDN landing page, an SSO page, or a
          // degraded deployment. Require the actual iAssetsPro health JSON
          // with a functioning staging database before accepting the gate.
          try{
            const health=await response.json();
            if(!health || health.status!=='healthy' ||
                health.checks?.database?.status!=='healthy' ||
                !Number.isFinite(health.uptime)){
              status=0;
            }
          }catch{status=0;}
        }
        await response.body?.cancel();
      } finally { clearTimeout(timeout); }
    } catch {
      status=0;
    }
    const ok=check.allowed.includes(status);
    output.log(`[CAD staging] ${ok?'PASS':'FAIL'} ${check.label}: HTTP ${status||'unreachable'}`);
    passed &&=ok;
  }
  if (!passed) throw new Error('Staging readiness failed; no production activation authorized');
  output.log('[CAD staging] Read-only smoke checks passed. Engineer UAT, source provenance and restore drill remain separate gates.');
}

if (process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href) {
  try {
    await runStagingReadiness({origin:process.env.IASSETSPRO_STAGING_URL});
  } catch (error) {
    console.error('[CAD staging] FAIL:',error instanceof Error?error.message:String(error));
    process.exitCode=1;
  }
}
