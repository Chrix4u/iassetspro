'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Factory, Loader2, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export default function FirstAdminSetupPage() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [allowed, setAllowed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    fullName: '',
    username: '',
    email: '',
    password: '',
    confirmPassword: '',
  });

  useEffect(() => {
    fetch('/api/setup/first-admin', { cache: 'no-store' })
      .then((res) => res.json())
      .then((payload) => {
        const canSetup = Boolean(payload?.success && payload.data?.setupRequired && payload.data?.constantsReady);
        setAllowed(canSetup);
        if (!canSetup && payload?.success && !payload.data?.setupRequired) {
          router.replace('/login');
        }
      })
      .catch(() => setAllowed(false))
      .finally(() => setChecking(false));
  }, [router]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    try {
      const response = await fetch('/api/setup/first-admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const payload = await response.json();
      if (!response.ok || !payload?.success) {
        toast.error(payload?.error || 'Unable to create administrator', {
          description: Array.isArray(payload?.details) ? payload.details.join(' · ') : undefined,
        });
        return;
      }
      toast.success('Administrator created. Sign in to begin commissioning.');
      router.replace('/login');
    } catch {
      toast.error('Network error while creating administrator');
    } finally {
      setSubmitting(false);
    }
  };

  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <Loader2 className="h-7 w-7 animate-spin text-emerald-600" />
      </div>
    );
  }

  if (!allowed) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-6">
        <div className="max-w-md rounded-2xl border bg-white p-8 text-center shadow-sm">
          <ShieldCheck className="mx-auto h-10 w-10 text-emerald-600" />
          <h1 className="mt-4 text-xl font-bold">First-time setup is unavailable</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Either the system constants are not ready yet or an administrator already exists.
          </p>
          <Button className="mt-6" onClick={() => router.replace('/login')}>Go to login</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-100 via-emerald-50/40 to-teal-50 p-4 sm:p-8">
      <div className="mx-auto max-w-xl">
        <div className="mb-6 flex items-center justify-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-600 text-white shadow">
            <Factory className="h-5 w-5" />
          </div>
          <div>
            <h1 className="font-bold text-slate-900">iAssetsPro</h1>
            <p className="text-xs text-slate-500">First-time commissioning</p>
          </div>
        </div>

        <form onSubmit={submit} className="rounded-2xl border bg-white p-5 shadow-xl sm:p-8">
          <div className="mb-6">
            <h2 className="text-xl font-bold text-slate-900">Create the first administrator</h2>
            <p className="mt-2 text-sm text-slate-600">
              The operational database is empty. After this account is created, this setup page disables itself.
            </p>
          </div>

          <div className="grid gap-5">
            <div className="space-y-2">
              <Label htmlFor="fullName">Full name</Label>
              <Input id="fullName" required value={form.fullName} onChange={(e) => setForm((v) => ({ ...v, fullName: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="username">Username</Label>
              <Input id="username" required autoComplete="username" value={form.username} onChange={(e) => setForm((v) => ({ ...v, username: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" required type="email" autoComplete="email" value={form.email} onChange={(e) => setForm((v) => ({ ...v, email: e.target.value }))} />
            </div>
            <div className="grid gap-5 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input id="password" required type="password" autoComplete="new-password" value={form.password} onChange={(e) => setForm((v) => ({ ...v, password: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirmPassword">Confirm password</Label>
                <Input id="confirmPassword" required type="password" autoComplete="new-password" value={form.confirmPassword} onChange={(e) => setForm((v) => ({ ...v, confirmPassword: e.target.value }))} />
              </div>
            </div>
            <p className="text-xs text-slate-500">
              Minimum 12 characters with uppercase, lowercase, number and special character.
            </p>
            <Button type="submit" className="min-h-[46px] bg-emerald-600 hover:bg-emerald-700" disabled={submitting}>
              {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Create administrator
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
