'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { CheckCircle2, CircleAlert, RefreshCcw, ShieldAlert } from 'lucide-react';
import type { CommissioningCheck } from '@/lib/assets/machine-commissioning-readiness';

type MachineReadinessResponse = {
  assetId:string;
  checks:CommissioningCheck[];
  configuredCount:number;
  totalChecks:number;
  softwarePreflightComplete:boolean;
  physicalAcceptanceComplete:false;
  note:string;
};

export function AssetCommissioningReadinessPanel({assetId}: {assetId:string}) {
  const [version,setVersion]=useState(0);
  const [data,setData]=useState<MachineReadinessResponse|null>(null);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState('');

  useEffect(()=>{
    let cancelled=false;
    setData(null);
    setError('');
    setLoading(true);
    api.get<MachineReadinessResponse>(
      '/api/assets/'+encodeURIComponent(assetId)+'/commissioning-readiness',
    ).then(response=>{
      if(cancelled)return;
      if(response.success&&response.data)setData(response.data);
      else setError(response.error||'Readiness could not be checked');
    }).catch(()=>{
      if(!cancelled)setError('Readiness could not be checked. Try refreshing.');
    }).finally(()=>{
      if(!cancelled)setLoading(false);
    });
    return ()=>{cancelled=true;};
  },[assetId,version]);

  return (
    <Card className="min-w-0 gap-3 border shadow-sm">
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 px-4 pb-0 sm:px-6">
        <div className="min-w-0 space-y-1">
          <CardTitle className="text-sm">Machine commissioning preflight</CardTitle>
          <CardDescription className="text-xs leading-relaxed">
            Live configuration checks for location, OEM evidence, shift planning, maintenance and operator reporting
          </CardDescription>
        </div>
        <Button
          type="button" size="sm" variant="outline"
          className="h-8 shrink-0 cursor-pointer" disabled={loading}
          onClick={()=>setVersion(v=>v+1)}
        >
          <RefreshCcw className="mr-1.5 h-3.5 w-3.5" />
          Refresh
        </Button>
      </CardHeader>
      <CardContent className="space-y-3 px-4 sm:px-6">
        {loading && <p role="status" className="text-xs text-muted-foreground">
          Checking the selected machine…
        </p>}
        {!loading&&error && <p role="alert" className="text-xs text-muted-foreground">{error}</p>}
        {!loading&&data&& (
          <>
            <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-3 text-xs">
              <span className="font-medium">
                {data.configuredCount} of {data.totalChecks} configuration checks complete
              </span>
              <Badge variant="outline" className="max-w-full whitespace-normal text-left text-[11px]">
                {data.softwarePreflightComplete?'Software configuration checked':'Setup/review still required'}
              </Badge>
            </div>
            <div className="grid min-w-0 grid-cols-1 gap-2 lg:grid-cols-2">
              {data.checks.map(item=>{
                const Icon=item.state==='configured'?CheckCircle2:
                  item.state==='review'?ShieldAlert:CircleAlert;
                return (
                  <div key={item.key} className="min-w-0 rounded-lg border p-3">
                    <div className="flex min-w-0 flex-wrap items-start justify-between gap-2">
                      <div className="flex min-w-0 flex-1 items-start gap-2">
                        <Icon aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                        <span className="min-w-0 text-xs font-semibold leading-snug [overflow-wrap:anywhere]">
                          {item.title}
                        </span>
                      </div>
                      <Badge variant="outline" className="shrink-0 text-[10px]">
                        {item.state==='configured'?'Configured':
                          item.state==='review'?'Review required':'Needs setup'}
                      </Badge>
                    </div>
                    <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground [overflow-wrap:anywhere]">
                      {item.detail}
                    </p>
                  </div>
                );
              })}
            </div>
            <p className="border-t pt-3 text-[11px] leading-relaxed text-muted-foreground">
              {data.note} A software checklist cannot certify the physical machine or replace a witnessed acceptance test.
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}
