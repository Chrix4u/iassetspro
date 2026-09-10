'use client';

import React, { useState } from 'react';
import { toast } from 'sonner';
import { useAuthStore } from '@/stores/authStore';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  BarChart3,
  Zap,
  Wrench,
  Package,
  Factory,
  Lock,
  RefreshCw,
  Shield,
  ChevronDown,
} from 'lucide-react';

export default function LoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [forgotOpen, setForgotOpen] = useState(false);
  const [showDemo, setShowDemo] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [resetLoading, setResetLoading] = useState(false);
  const { login } = useAuthStore();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username || !password) {
      toast.error('Please enter username and password');
      return;
    }
    setLoading(true);
    const result = await login(username, password);
    if (result.ok) {
      toast.success('Welcome to iAssetsPro!');
    } else {
      // Show the actual error from the API (not just "Invalid credentials")
      const errMsg = result.error || 'Invalid credentials';
      // Clean up internal error messages for user display
      const displayMsg = errMsg.includes('Database error') || errMsg.includes('Session creation failed')
        ? 'Service unavailable — please contact IT support'
        : errMsg;
      toast.error(displayMsg);
    }
    setLoading(false);
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetEmail.trim()) {
      toast.error('Please enter your email address');
      return;
    }
    setResetLoading(true);
    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: resetEmail.trim() }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success(data.message || 'Reset instructions sent to your email');
        setForgotOpen(false);
        setResetEmail('');
      } else {
        toast.error(data.error || 'Failed to send reset link');
      }
    } catch {
      toast.error('Network error. Please try again.');
    } finally {
      setResetLoading(false);
    }
  };

  const features = [
    { icon: BarChart3, label: 'Real-time Monitoring', desc: 'Track assets 24/7 with live dashboards', color: 'bg-emerald-500/20 text-emerald-300' },
    { icon: Zap, label: 'Smart Prediction', desc: 'Prevent failures before they happen', color: 'bg-amber-500/20 text-amber-300' },
    { icon: Wrench, label: 'Work Orders', desc: 'Streamline maintenance tasks', color: 'bg-teal-500/20 text-teal-300' },
    { icon: Package, label: 'Inventory', desc: 'Manage parts & supplies', color: 'bg-orange-500/20 text-orange-300' },
  ];

  return (
    <div className="h-screen flex overflow-hidden bg-gradient-to-br from-slate-50 via-emerald-50/30 to-teal-50">
      {/* ========== LEFT PANEL - BRANDING ========== */}
      <div className="hidden lg:flex lg:flex-col lg:w-1/2 relative overflow-hidden">
        {/* Dark gradient background */}
        <div className="absolute inset-0 bg-gradient-to-br from-slate-900 via-emerald-950 to-slate-950" />

        {/* Animated grid background */}
        <div className="absolute inset-0 opacity-[0.07]">
          <div
            className="absolute inset-0"
            style={{
              backgroundImage: 'linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)',
              backgroundSize: '50px 50px',
            }}
          />
        </div>

        {/* Floating orbs */}
        <div className="absolute top-20 left-16 w-72 h-72 bg-emerald-500/15 rounded-full blur-3xl animate-pulse" />
        <div className="absolute bottom-24 right-16 w-80 h-80 bg-teal-500/10 rounded-full blur-3xl animate-pulse [animation-delay:1.5s]" />
        <div className="absolute top-1/2 left-1/3 w-40 h-40 bg-amber-500/10 rounded-full blur-3xl animate-pulse [animation-delay:3s]" />

        <div className="relative z-10 flex flex-col justify-between p-8 lg:p-10 xl:p-12 text-white h-full">
          <div className="space-y-8">
            {/* Logo & Brand */}
            <div className="space-y-6">
              <div className="inline-flex items-center space-x-4 bg-white/10 backdrop-blur-xl rounded-2xl px-6 py-4 border border-white/15 shadow-2xl">
                <div className="h-12 w-12 bg-gradient-to-br from-emerald-400 via-emerald-500 to-teal-600 rounded-xl flex items-center justify-center shadow-lg">
                  <Factory className="h-6 w-6 text-white" />
                </div>
                <div>
                  <h1 className="text-base font-bold tracking-tight">iAssetsPro</h1>
                  <p className="text-emerald-300/80 text-xs font-medium">Asset Management</p>
                </div>
              </div>

              <div className="space-y-3">
                <h2 className="text-lg font-bold leading-tight bg-gradient-to-r from-white via-emerald-100 to-teal-200 bg-clip-text text-transparent">
                  Intelligent Asset Management Platform
                </h2>
                <p className="text-xs text-emerald-200/80 leading-relaxed max-w-lg">
                  Transform your maintenance operations with real-time monitoring, predictive analytics, and comprehensive asset lifecycle management.
                </p>
              </div>
            </div>

            {/* Feature Cards */}
            <div className="grid grid-cols-2 gap-3">
              {features.map((f) => {
                const Icon = f.icon;
                return (
                  <div
                    key={f.label}
                    className="group bg-white/[0.08] backdrop-blur-sm rounded-xl p-4 border border-white/[0.12] hover:bg-white/[0.12] hover:border-white/20 transition-all duration-300 cursor-default"
                  >
                    <div className={`h-10 w-10 ${f.color} rounded-lg flex items-center justify-center mb-3 group-hover:scale-110 transition-transform duration-300`}>
                      <Icon className="h-4 w-4" />
                    </div>
                    <h3 className="text-sm font-semibold mb-1">{f.label}</h3>
                    <p className="text-[11px] text-emerald-200/70 leading-relaxed">{f.desc}</p>
                  </div>
                );
              })}
            </div>

            {/* Stats */}
            <div className="grid grid-cols-3 gap-3 pt-3">
              {[
                { value: '99.9%', label: 'System Uptime' },
                { value: '24/7', label: 'Live Support' },
                { value: 'ISO', label: '27001 Certified' },
              ].map((s) => (
                <div key={s.label} className="text-center">
                  <div className="text-lg font-bold">{s.value}</div>
                  <div className="text-[11px] text-emerald-300/60">{s.label}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between text-[11px] text-emerald-300/50 pt-6 border-t border-white/10">
            <span>&copy; {new Date().getFullYear()} iAssetsPro</span>
            <div className="flex items-center gap-2">
              <span className="bg-emerald-500/20 text-emerald-300 px-2 py-0.5 rounded-full text-[10px] font-semibold flex items-center gap-1">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                ONLINE
              </span>
              <span className="bg-white/[0.08] px-2 py-0.5 rounded">v2.0</span>
            </div>
          </div>
        </div>
      </div>

      {/* ========== RIGHT PANEL - LOGIN FORM ========== */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-4 sm:p-6 lg:p-8 overflow-y-auto">
        <div className="w-full max-w-md">
          {/* Mobile Logo */}
          <div className="lg:hidden flex items-center justify-center mb-5">
            <div className="inline-flex items-center space-x-2.5 bg-white rounded-xl px-4 py-2.5 shadow-md border border-slate-200">
              <div className="h-9 w-9 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-lg flex items-center justify-center shadow-md">
                <Factory className="h-4.5 w-4.5 text-white" />
              </div>
              <div>
                <h1 className="text-base font-bold text-slate-900 leading-tight">iAssetsPro</h1>
                <p className="text-[10px] text-slate-500">Asset Management</p>
              </div>
            </div>
          </div>

          {/* Login Card */}
          <div className="bg-white rounded-2xl sm:rounded-3xl shadow-2xl shadow-slate-200/50 border border-slate-200/60 p-5 sm:p-7 lg:p-8">
            {/* Header */}
            <div className="text-center mb-5 sm:mb-7">
              <div className="inline-flex items-center justify-center h-12 w-12 sm:h-14 sm:w-14 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-xl sm:rounded-2xl mb-3 shadow-lg shadow-emerald-500/20">
                <Lock className="h-5 w-5 sm:h-6 sm:w-6 text-white" />
              </div>
              <h2 className="text-lg sm:text-xl font-bold text-slate-900 mb-1">Welcome Back</h2>
              <p className="hidden sm:block text-sm text-slate-500">Sign in to access your maintenance dashboard</p>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit} className="space-y-3.5 sm:space-y-5">
              {/* Username */}
              <div>
                <label className="block text-xs sm:text-sm font-semibold text-slate-700 mb-1.5 sm:mb-2">Username or Email</label>
                <div className="relative group">
                  <div className="absolute inset-y-0 left-0 pl-3.5 sm:pl-4 flex items-center pointer-events-none">
                    <svg className="h-4 w-4 sm:h-5 sm:w-5 text-slate-400 group-focus-within:text-emerald-500 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                    </svg>
                  </div>
                  <Input
                    type="text"
                    placeholder="Enter your username"
                    value={username}
                    onChange={e => setUsername(e.target.value)}
                    autoFocus
                    className="w-full pl-10 sm:pl-12 pr-4 py-2.5 sm:py-3 border-2 border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition-all text-sm bg-slate-50/50 focus:bg-white h-11 sm:h-12"
                  />
                </div>
              </div>

              {/* Password */}
              <div>
                <label className="block text-xs sm:text-sm font-semibold text-slate-700 mb-1.5 sm:mb-2">Password</label>
                <div className="relative group">
                  <div className="absolute inset-y-0 left-0 pl-3.5 sm:pl-4 flex items-center pointer-events-none">
                    <svg className="h-4 w-4 sm:h-5 sm:w-5 text-slate-400 group-focus-within:text-emerald-500 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                    </svg>
                  </div>
                  <Input
                    type={showPassword ? 'text' : 'password'}
                    placeholder="Enter your password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    className="w-full pl-10 sm:pl-12 pr-10 sm:pr-12 py-2.5 sm:py-3 border-2 border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition-all text-sm bg-slate-50/50 focus:bg-white h-11 sm:h-12"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-0 right-0 pr-3.5 sm:pr-4 flex items-center text-slate-400 hover:text-slate-600 transition-colors"
                  >
                    {showPassword ? (
                      <svg className="h-4 w-4 sm:h-5 sm:w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                      </svg>
                    ) : (
                      <svg className="h-4 w-4 sm:h-5 sm:w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                      </svg>
                    )}
                  </button>
                </div>
              </div>

              {/* Remember + Forgot */}
              <div className="flex items-center justify-between pt-0.5">
                <label className="flex items-center cursor-pointer group">
                  <input
                    type="checkbox"
                    checked={rememberMe}
                    onChange={e => setRememberMe(e.target.checked)}
                    className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-emerald-600 border-slate-300 rounded focus:ring-emerald-500 cursor-pointer"
                  />
                  <span className="ml-2 text-xs sm:text-sm text-slate-600 group-hover:text-slate-900 transition-colors">Remember me</span>
                </label>
                <button
                  type="button"
                  onClick={() => setForgotOpen(true)}
                  className="text-xs sm:text-sm font-semibold text-emerald-600 hover:text-emerald-700 transition-colors"
                >
                  Forgot password?
                </button>
              </div>

              {/* Submit */}
              <button
                type="submit"
                disabled={loading}
                className="w-full bg-gradient-to-r from-emerald-600 via-emerald-600 to-teal-600 hover:from-emerald-700 hover:via-emerald-700 hover:to-teal-700 text-white py-3 sm:py-3.5 rounded-xl font-semibold shadow-lg shadow-emerald-500/20 hover:shadow-xl hover:shadow-emerald-500/30 transform hover:-translate-y-0.5 transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none text-sm"
              >
                {loading ? (
                  <span className="flex items-center justify-center gap-2">
                    <RefreshCw className="h-4 w-4 animate-spin" />
                    Signing in...
                  </span>
                ) : (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1" />
                    </svg>
                    Sign In
                  </span>
                )}
              </button>
            </form>

            {/* Security Badge */}
            <div className="mt-4 sm:mt-6 pt-4 sm:pt-6 border-t border-slate-200">
              <div className="flex items-center justify-center gap-1.5 sm:gap-2 text-[11px] sm:text-xs text-slate-500">
                <Shield className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-emerald-500" />
                <span>Secured by enterprise-grade encryption</span>
              </div>
            </div>
          </div>

          {/* Demo Accounts */}
          <div className="mt-4 sm:mt-5 rounded-xl sm:rounded-2xl bg-white/80 backdrop-blur border border-slate-200/60 shadow-sm overflow-hidden">
            <button
              type="button"
              onClick={() => setShowDemo(!showDemo)}
              className="w-full flex items-center justify-between px-4 py-3 sm:px-4 sm:py-3 text-left"
            >
              <p className="font-semibold text-[11px] sm:text-xs text-slate-500 uppercase tracking-wider">Demo Accounts</p>
              <ChevronDown className={`h-4 w-4 text-slate-400 transition-transform ${showDemo ? 'rotate-180' : ''}`} />
            </button>
            {showDemo && (
              <div className="px-4 pb-3 space-y-1.5 text-xs max-h-[280px] overflow-y-auto">
                <p className="text-[10px] text-slate-400 font-medium mb-1">Click to auto-fill credentials</p>
                {[
                  // ── Management ──
                  { user: 'admin', pass: 'admin123', role: 'Administrator', desc: 'Full system access', color: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
                  { user: 'manager1', pass: 'password123', role: 'Plant Manager', desc: 'Plant-wide view', color: 'bg-violet-100 text-violet-700 border-violet-200' },
                  // ── Maintenance ──
                  { user: 'maint_mgr1', pass: 'password123', role: 'Maint. Manager', desc: 'Full RWOP + assets', color: 'bg-amber-100 text-amber-700 border-amber-200' },
                  { user: 'planner1', pass: 'password123', role: 'Planner', desc: 'Plan & schedule WOs', color: 'bg-sky-100 text-sky-700 border-sky-200' },
                  { user: 'supervisor1', pass: 'password123', role: 'Supervisor', desc: 'Supervise WO execution', color: 'bg-teal-100 text-teal-700 border-teal-200' },
                  { user: 'tech1', pass: 'password123', role: 'Technician', desc: 'Execute WOs (Tema)', color: 'bg-orange-100 text-orange-700 border-orange-200' },
                  { user: 'tech2', pass: 'password123', role: 'Technician', desc: 'Execute WOs (Kumasi)', color: 'bg-orange-100 text-orange-700 border-orange-200' },
                  // ── Production ──
                  { user: 'prod_mgr1', pass: 'password123', role: 'Prod. Manager', desc: 'Full production mgmt', color: 'bg-blue-100 text-blue-700 border-blue-200' },
                  { user: 'operator1', pass: 'password123', role: 'Operator', desc: 'Data entry (Tema)', color: 'bg-slate-100 text-slate-600 border-slate-200' },
                  { user: 'op2', pass: 'password123', role: 'Operator', desc: 'Data entry (Kumasi)', color: 'bg-slate-100 text-slate-600 border-slate-200' },
                  // ── Store / Inventory ──
                  { user: 'inv_mgr1', pass: 'password123', role: 'Inv. Manager', desc: 'Full inventory', color: 'bg-fuchsia-100 text-fuchsia-700 border-fuchsia-200' },
                  { user: 'store1', pass: 'password123', role: 'Store Keeper', desc: 'Stock operations (Tema)', color: 'bg-rose-100 text-rose-700 border-rose-200' },
                  { user: 'store2', pass: 'password123', role: 'Store Keeper', desc: 'Stock operations (Kumasi)', color: 'bg-rose-100 text-rose-700 border-rose-200' },
                  { user: 'toolshop1', pass: 'password123', role: 'Tools Shop Att.', desc: 'Tool checkout & transfers', color: 'bg-pink-100 text-pink-700 border-pink-200' },
                  // ── Quality / Safety / HR / IoT ──
                  { user: 'qual_mgr1', pass: 'password123', role: 'Quality Mgr', desc: 'Quality & calibration', color: 'bg-cyan-100 text-cyan-700 border-cyan-200' },
                  { user: 'safety1', pass: 'password123', role: 'Safety Officer', desc: 'HSE management', color: 'bg-red-100 text-red-700 border-red-200' },
                  { user: 'hr1', pass: 'password123', role: 'HR Manager', desc: 'HR & training', color: 'bg-indigo-100 text-indigo-700 border-indigo-200' },
                  { user: 'iot1', pass: 'password123', role: 'IoT Engineer', desc: 'IoT & predictive', color: 'bg-lime-100 text-lime-700 border-lime-200' },
                  // ── Read-only ──
                  { user: 'viewer1', pass: 'password123', role: 'Viewer', desc: 'Read-only access', color: 'bg-gray-100 text-gray-600 border-gray-200' },
                ].map(d => (
                  <button
                    key={d.user}
                    type="button"
                    onClick={() => { setUsername(d.user); setPassword(d.pass); }}
                    className="w-full flex items-center justify-between px-3 py-1.5 rounded-lg bg-white hover:bg-emerald-50/50 border border-slate-100 hover:border-emerald-200 transition-all group cursor-pointer"
                  >
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="font-mono font-semibold text-slate-700 group-hover:text-emerald-700 transition-colors truncate">{d.user}</span>
                      <span className="text-slate-300 shrink-0">/</span>
                      <span className="font-mono text-slate-400">{d.pass}</span>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0 ml-2">
                      <span className="hidden sm:inline text-[10px] text-slate-400 max-w-[80px] truncate">{d.desc}</span>
                      <Badge variant="outline" className={`text-[9px] font-semibold px-1.5 py-0 ${d.color}`}>{d.role}</Badge>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Download Presentation Link */}
          <button
            onClick={() => {
              fetch('/iAssetsPro-WO-Workflow-Presentation.pptx')
                .then(r => r.blob())
                .then(blob => {
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = 'iAssetsPro-WO-Workflow-Presentation.pptx';
                  document.body.appendChild(a);
                  a.click();
                  a.remove();
                  URL.revokeObjectURL(url);
                });
            }}
            className="mt-4 flex items-center justify-center gap-2 w-full bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-white py-3 rounded-xl font-semibold shadow-lg shadow-amber-500/20 hover:shadow-xl hover:shadow-amber-500/30 transform hover:-translate-y-0.5 transition-all text-sm"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            Download WO Workflow Presentation (4.9 MB)
          </button>

          {/* Help */}
          <div className="mt-4 sm:mt-5 text-center">
            <p className="text-[11px] sm:text-xs text-slate-400">
              Need help? Contact{' '}
              <span className="text-emerald-600 hover:text-emerald-700 font-semibold cursor-pointer">IT Support</span>
            </p>
          </div>
        </div>
      </div>

      {/* ========== FORGOT PASSWORD MODAL ========== */}
      <Dialog open={forgotOpen} onOpenChange={setForgotOpen}>
        <DialogContent className="sm:max-w-md mx-4">
          <DialogHeader className="text-center sm:text-center">
            <div className="mx-auto h-12 w-12 sm:h-14 sm:w-14 bg-emerald-100 rounded-full flex items-center justify-center mb-2.5">
              <svg className="h-6 w-6 sm:h-7 sm:w-7 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
              </svg>
            </div>
            <DialogTitle className="text-lg sm:text-xl font-bold">Reset Password</DialogTitle>
            <DialogDescription className="text-xs sm:text-sm text-slate-500">Enter your email to receive a password reset link</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleForgotPassword} className="space-y-4">
            <div className="space-y-2">
              <Label className="text-sm font-semibold text-slate-700">Email Address</Label>
              <Input
                type="email"
                value={resetEmail}
                onChange={e => setResetEmail(e.target.value)}
                placeholder="Enter your registered email"
                required
                className="h-11"
              />
            </div>
            <DialogFooter className="gap-2 sm:gap-2">
              <Button type="button" variant="outline" onClick={() => setForgotOpen(false)} className="flex-1">Cancel</Button>
              <Button type="submit" disabled={resetLoading} className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white">
                {resetLoading ? 'Sending...' : 'Send Reset Link'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
