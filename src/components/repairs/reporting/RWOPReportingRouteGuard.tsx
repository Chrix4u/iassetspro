'use client';

import React, { useEffect, useState } from 'react';
import { LogIn, ShieldCheck } from 'lucide-react';
import RWOPReportingPage from './RWOPReportingPage';
import { useAuthStore } from '@/stores/authStore';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { LoadingSkeleton } from '@/components/shared/helpers';

export default function RWOPReportingRouteGuard() {
  const { isAuthenticated, fetchMe } = useAuthStore();
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    let active = true;
    const resolveAuth = async () => {
      if (!isAuthenticated) await fetchMe();
      if (active) setChecked(true);
    };
    void resolveAuth();
    return () => { active = false; };
  }, [fetchMe, isAuthenticated]);

  if (!checked) {
    return <div className="page-content"><LoadingSkeleton /></div>;
  }

  if (!useAuthStore.getState().isAuthenticated) {
    return (
      <div className="page-content flex min-h-[70vh] items-center justify-center">
        <Card className="w-full max-w-md border-border/60 shadow-sm">
          <CardContent className="flex flex-col items-center gap-4 p-8 text-center">
            <div className="rounded-full bg-muted p-3"><ShieldCheck className="h-7 w-7 text-muted-foreground" /></div>
            <div>
              <h1 className="text-xl font-semibold">Sign in required</h1>
              <p className="mt-1 text-sm text-muted-foreground">RWOP reports contain plant-scoped operational data and require an authenticated EAM session.</p>
            </div>
            <Button onClick={() => { window.location.href = '/'; }}>
              <LogIn className="mr-2 h-4 w-4" />Go to sign in
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return <RWOPReportingPage />;
}
