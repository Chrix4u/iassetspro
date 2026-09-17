'use client';

import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { format, formatDistanceToNow } from 'date-fns';
import { toast } from 'sonner';
import { useAuthStore } from '@/stores/authStore';
import { useNavigationStore } from '@/stores/navigationStore';
import { api, apiFetch, getAuthHeaders } from '@/lib/api';
import type { PageName, User, Role, Permission, Module, UserRole, Notification, CompanyProfile } from '@/types';

import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { DateRangePicker, TimePicker } from '@/components/ui/datetime-picker';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog'
import { ResponsiveDialog } from '@/components/shared/ResponsiveDialog';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Users, Plus, Search, Pencil, Trash2, MoreHorizontal, Key, UserPlus,
  UserMinus, Settings, Shield, Eye, CheckCircle2, XCircle, RefreshCw,
  Lock, AlertTriangle, Bell, BellRing, Globe, Link2, Database, Download,
  MapPin, Check, ChevronDown,
  Box, Cpu, History, Smartphone,
  Upload, Archive, Building2, Boxes, Clock, Calendar, Factory, Building,
  PieChart as PieChartIcon, Layers, Cog, Wrench, FlaskConical, HardHat,
  Radio, Ruler, GraduationCap, TriangleAlert, Activity, BrainCircuit,
  GitBranch, ScanLine, Truck, FolderOpen, Target, TrendingUp, Zap, Mail,
  Send, ShieldAlert, ShieldCheck, BarChart3, Package, ClipboardList, Gauge, X,
  AlertCircle, FileBarChart, EyeOff, Save, Wifi, Play, Monitor, HeartPulse, Server, MessageSquare,
  FileDown, FileUp, Info, Filter, ExternalLink, Phone, Hash,
} from 'lucide-react';
import { useTheme } from 'next-themes';
import { EmptyState, getInitials, formatDate, formatDateTime, timeAgo, LoadingSkeleton } from '@/components/shared/helpers';
import { AsyncSearchableSelect, MultiSearchableSelect } from '@/components/ui/searchable-select';
import { usePreferencesStore } from '@/stores/preferencesStore';
import { Sun, Moon, LayoutGrid, List, Volume2, MonitorSpeaker, CalendarDays, Globe2 } from 'lucide-react';

// SettingsUsersPage
export function SettingsUsersPage() {
  const { hasPermission, isAdmin } = useAuthStore();
  const [users, setUsers] = useState<User[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchText, setSearchText] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [viewUser, setViewUser] = useState<User | null>(null);
  const [viewOpen, setViewOpen] = useState(false);
  const [resetPwd, setResetPwd] = useState('');

  const emptyForm = { fullName: '', username: '', email: '', phone: '', staffId: '', department: '', password: '', status: 'active' as string, roleIds: [] as string[] };
  const [createForm, setCreateForm] = useState(emptyForm);
  const [editForm, setEditForm] = useState(emptyForm);

  const loadUsers = useCallback(() => {
    api.get<User[]>('/api/users').then(res => { if (res.success && res.data) setUsers(res.data); setLoading(false); });
  }, []);

  useEffect(() => {
    Promise.all([
      api.get<User[]>('/api/users'),
      api.get<Role[]>('/api/roles'),
    ]).then(([usersRes, rolesRes]) => {
      if (usersRes.success && usersRes.data) setUsers(usersRes.data);
      if (rolesRes.success && rolesRes.data) setRoles(Array.isArray(rolesRes.data) ? rolesRes.data : []);
      setLoading(false);
    });
  }, []);

  const filteredUsers = useMemo(() => {
    if (!searchText.trim()) return users;
    const q = searchText.toLowerCase();
    return users.filter(u => u.fullName.toLowerCase().includes(q) || u.username.toLowerCase().includes(q) || u.email.toLowerCase().includes(q) || (u.staffId || '').toLowerCase().includes(q));
  }, [users, searchText]);

  const handleCreate = async () => {
    if (!createForm.fullName || !createForm.username || !createForm.email || !createForm.password) { toast.error('Please fill required fields'); return; }
    setSaving(true);
    const res = await api.post('/api/users', createForm);
    if (res.success) { toast.success('User created'); setCreateOpen(false); setCreateForm(emptyForm); loadUsers(); } else { toast.error(res.error || 'Failed'); }
    setSaving(false);
  };

  const handleEdit = async () => {
    if (!selectedUser) return;
    setSaving(true);
    const { password: _, ...data } = editForm;
    const res = await api.put(`/api/users/${selectedUser.id}`, data);
    if (res.success) { toast.success('User updated'); setEditOpen(false); setSelectedUser(null); loadUsers(); } else { toast.error(res.error || 'Failed'); }
    setSaving(false);
  };

  const openEdit = (u: User) => {
    setSelectedUser(u);
    setEditForm({ fullName: u.fullName, username: u.username, email: u.email, phone: u.phone || '', staffId: u.staffId || '', department: u.department || '', password: '', status: u.status, roleIds: (u.userRoles as UserRole[])?.map(ur => ur.roleId) || [] });
    setEditOpen(true);
  };

  const handleResetPassword = async () => {
    if (!selectedUser || !resetPwd) { toast.error('Enter a new password'); return; }
    setSaving(true);
    const res = await api.post(`/api/users/${selectedUser.id}/reset-password`, { password: resetPwd });
    if (res.success) { toast.success('Password reset'); setResetOpen(false); setResetPwd(''); setSelectedUser(null); } else { toast.error(res.error || 'Failed'); }
    setSaving(false);
  };

  const toggleStatus = async (u: User) => {
    const newStatus = u.status === 'active' ? 'inactive' : 'active';
    const res = await api.put(`/api/users/${u.id}`, { status: newStatus });
    if (res.success) { toast.success(`User ${newStatus}`); loadUsers(); } else { toast.error(res.error || 'Failed'); }
  };

  if (loading) return <LoadingSkeleton />;

  return (
    <div className="page-content">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Users</h1>
          <p className="text-muted-foreground text-sm mt-1">{users.length} user(s)</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative min-w-[200px] max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Search users..." value={searchText} onChange={e => setSearchText(e.target.value)} className="pl-9" />
          </div>
          {(hasPermission('users.create') || isAdmin()) && <Button onClick={() => setCreateOpen(true)} className="bg-emerald-600 hover:bg-emerald-700 text-white"><Plus className="h-4 w-4 mr-1.5" />Add User</Button>}
        </div>
      </div>

      <Card className="border-0 shadow-sm overflow-hidden dark:bg-card">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>User</TableHead>
                <TableHead className="hidden md:table-cell">Employee Code</TableHead>
                <TableHead className="hidden lg:table-cell">Email</TableHead>
                <TableHead className="hidden lg:table-cell">Department</TableHead>
                <TableHead className="hidden md:table-cell">Roles</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-10">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredUsers.length === 0 ? (
                <TableRow><TableCell colSpan={7} className="h-48"><EmptyState icon={Users} title="No users found" description="No users match your search criteria." /></TableCell></TableRow>
              ) : filteredUsers.map(u => (
                <TableRow key={u.id}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Avatar className="h-7 w-7"><AvatarFallback className="text-[10px] bg-emerald-100 text-emerald-700">{getInitials(u.fullName)}</AvatarFallback></Avatar>
                      <span className="font-medium text-sm">{u.fullName}</span>
                    </div>
                  </TableCell>
                  <TableCell className="font-mono text-xs hidden md:table-cell">{u.staffId || u.username}</TableCell>
                  <TableCell className="text-sm hidden lg:table-cell">{u.email}</TableCell>
                  <TableCell className="text-sm hidden lg:table-cell">{u.department || '-'}</TableCell>
                  <TableCell className="hidden md:table-cell">
                    <div className="flex gap-1 flex-wrap">
                      {u.roles?.map(r => (<Badge key={r.id} variant="outline" style={{ borderColor: r.color || undefined, color: r.color || undefined }} className="text-[10px]">{r.name}</Badge>))}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={u.status === 'active' ? 'default' : 'secondary'} className={u.status === 'active' ? 'bg-emerald-100 text-emerald-700' : ''}>{u.status}</Badge>
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="h-8 w-8"><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => { setSelectedUser(u); setViewUser(u); setViewOpen(true); }}><Eye className="h-3.5 w-3.5 mr-2" />View</DropdownMenuItem>
                        {(hasPermission('users.update') || isAdmin()) && <DropdownMenuItem onClick={() => openEdit(u)}><Pencil className="h-3.5 w-3.5 mr-2" />Edit</DropdownMenuItem>}
                        <DropdownMenuItem onClick={() => { setSelectedUser(u); setResetPwd(''); setResetOpen(true); }}><Key className="h-3.5 w-3.5 mr-2" />Reset Password</DropdownMenuItem>
                        {(hasPermission('users.update') || isAdmin()) && <DropdownMenuItem onClick={() => toggleStatus(u)}>{u.status === 'active' ? <UserPlus className="h-3.5 w-3.5 mr-2" /> : <UserMinus className="h-3.5 w-3.5 mr-2" />}{u.status === 'active' ? 'Deactivate' : 'Activate'}</DropdownMenuItem>}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Card>

      {/* Create Dialog */}
      <ResponsiveDialog open={createOpen} onOpenChange={setCreateOpen}>
        
          <div className="space-y-1.5 mb-4"><h2 className="text-lg font-semibold leading-none tracking-tight">Create User</h2><p className="text-sm text-muted-foreground">Add a new user to the system.</p></div>
          <div className="grid gap-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label>Full Name *</Label><Input value={createForm.fullName} onChange={e => setCreateForm(f => ({ ...f, fullName: e.target.value }))} /></div>
              <div className="space-y-1.5"><Label>Username *</Label><Input value={createForm.username} onChange={e => setCreateForm(f => ({ ...f, username: e.target.value }))} /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label>Employee Code</Label><Input value={createForm.staffId} onChange={e => setCreateForm(f => ({ ...f, staffId: e.target.value }))} placeholder="e.g. EMP-001" /></div>
              <div className="space-y-1.5"><Label>Phone</Label><Input value={createForm.phone} onChange={e => setCreateForm(f => ({ ...f, phone: e.target.value }))} /></div>
            </div>
            <div className="space-y-1.5"><Label>Email *</Label><Input type="email" value={createForm.email} onChange={e => setCreateForm(f => ({ ...f, email: e.target.value }))} /></div>
            <div className="space-y-1.5"><Label>Password *</Label><Input type="password" value={createForm.password} onChange={e => setCreateForm(f => ({ ...f, password: e.target.value }))} /></div>
            <div className="space-y-1.5">
              <Label>Department</Label>
              <AsyncSearchableSelect
                value={createForm.department}
                onValueChange={v => setCreateForm(f => ({ ...f, department: v }))}
                fetchOptions={async () => {
                  const res = await api.get('/api/departments');
                  if (res.success && res.data) {
                    return (Array.isArray(res.data) ? res.data : []).map((d: any) => ({
                      value: d.name,
                      label: `${d.name} (${d.code})`,
                    }));
                  }
                  return [];
                }}
                placeholder="Select department..."
                searchPlaceholder="Search departments..."
              />
            </div>
            <div className="space-y-1.5">
              <Label>Roles</Label>
              <MultiSearchableSelect
                values={createForm.roleIds}
                onValuesChange={roleIds => setCreateForm(f => ({ ...f, roleIds }))}
                options={roles.map(r => ({ value: r.id, label: r.name }))}
                placeholder="Select roles..."
                searchPlaceholder="Search roles..."
              />
            </div>
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select value={createForm.status} onValueChange={v => setCreateForm(f => ({ ...f, status: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="active">Active</SelectItem><SelectItem value="inactive">Inactive</SelectItem></SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex flex-col-reverse gap-2 mt-4 sm:flex-row sm:justify-end">
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={saving} className="bg-emerald-600 hover:bg-emerald-700 text-white">{saving ? <RefreshCw className="h-4 w-4 animate-spin mr-1.5" /> : null}Create User</Button>
          </div>
        
      </ResponsiveDialog>

      {/* Edit Dialog */}
      <ResponsiveDialog open={editOpen} onOpenChange={setEditOpen}>
        
          <div className="space-y-1.5 mb-4"><h2 className="text-lg font-semibold leading-none tracking-tight">Edit User</h2><p className="text-sm text-muted-foreground">Update user information.</p></div>
          <div className="grid gap-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label>Full Name *</Label><Input value={editForm.fullName} onChange={e => setEditForm(f => ({ ...f, fullName: e.target.value }))} /></div>
              <div className="space-y-1.5"><Label>Username</Label><Input value={editForm.username} disabled className="bg-muted" /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label>Employee Code</Label><Input value={editForm.staffId} onChange={e => setEditForm(f => ({ ...f, staffId: e.target.value }))} placeholder="e.g. EMP-001" /></div>
              <div className="space-y-1.5"><Label>Phone</Label><Input value={editForm.phone} onChange={e => setEditForm(f => ({ ...f, phone: e.target.value }))} /></div>
            </div>
            <div className="space-y-1.5"><Label>Email *</Label><Input type="email" value={editForm.email} onChange={e => setEditForm(f => ({ ...f, email: e.target.value }))} /></div>
            <div className="space-y-1.5">
              <Label>Department</Label>
              <AsyncSearchableSelect
                value={editForm.department}
                onValueChange={v => setEditForm(f => ({ ...f, department: v }))}
                fetchOptions={async () => {
                  const res = await api.get('/api/departments');
                  if (res.success && res.data) {
                    return (Array.isArray(res.data) ? res.data : []).map((d: any) => ({
                      value: d.name,
                      label: `${d.name} (${d.code})`,
                    }));
                  }
                  return [];
                }}
                placeholder="Select department..."
                searchPlaceholder="Search departments..."
              />
            </div>
            <div className="space-y-1.5">
              <Label>Roles</Label>
              <MultiSearchableSelect
                values={editForm.roleIds}
                onValuesChange={roleIds => setEditForm(f => ({ ...f, roleIds }))}
                options={roles.map(r => ({ value: r.id, label: r.name }))}
                placeholder="Select roles..."
                searchPlaceholder="Search roles..."
              />
            </div>
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select value={editForm.status} onValueChange={v => setEditForm(f => ({ ...f, status: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="active">Active</SelectItem><SelectItem value="inactive">Inactive</SelectItem></SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex flex-col-reverse gap-2 mt-4 sm:flex-row sm:justify-end">
            <Button variant="outline" onClick={() => setEditOpen(false)}>Cancel</Button>
            <Button onClick={handleEdit} disabled={saving} className="bg-emerald-600 hover:bg-emerald-700 text-white">{saving ? <RefreshCw className="h-4 w-4 animate-spin mr-1.5" /> : null}Save Changes</Button>
          </div>
        
      </ResponsiveDialog>

      {/* Reset Password Dialog */}
      <ResponsiveDialog open={resetOpen} onOpenChange={setResetOpen}>
        
          <div className="space-y-1.5 mb-4"><h2 className="text-lg font-semibold leading-none tracking-tight">Reset Password</h2><p className="text-sm text-muted-foreground">Set a new password for {selectedUser?.fullName}.</p></div>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5"><Label>New Password *</Label><Input type="password" value={resetPwd} onChange={e => setResetPwd(e.target.value)} /></div>
          </div>
          <div className="flex flex-col-reverse gap-2 mt-4 sm:flex-row sm:justify-end">
            <Button variant="outline" onClick={() => setResetOpen(false)}>Cancel</Button>
            <Button onClick={handleResetPassword} disabled={saving} className="bg-emerald-600 hover:bg-emerald-700 text-white">{saving ? <RefreshCw className="h-4 w-4 animate-spin mr-1.5" /> : null}Reset</Button>
          </div>
        
      </ResponsiveDialog>

      {/* View User Profile Sheet */}
      <Sheet open={viewOpen} onOpenChange={(open) => { setViewOpen(open); if (!open) setViewUser(null); }}>
        <SheetContent side="right" className="sm:max-w-lg overflow-y-auto">
          {viewUser && (
            <>
              <SheetHeader>
                <SheetTitle>User Profile</SheetTitle>
                <SheetDescription>View details for {viewUser.fullName}</SheetDescription>
              </SheetHeader>
              <div className="px-4 pb-6 space-y-6">
                {/* Header with avatar */}
                <div className="flex items-center gap-4">
                  <Avatar className="h-14 w-14">
                    <AvatarFallback className="text-lg bg-emerald-100 text-emerald-700 font-semibold">{getInitials(viewUser.fullName)}</AvatarFallback>
                  </Avatar>
                  <div>
                    <h3 className="text-lg font-semibold">{viewUser.fullName}</h3>
                    <p className="text-sm text-muted-foreground font-mono">@{viewUser.username}</p>
                  </div>
                  <Badge variant={viewUser.status === 'active' ? 'default' : 'secondary'} className={viewUser.status === 'active' ? 'bg-emerald-100 text-emerald-700 ml-auto' : 'ml-auto'}>{viewUser.status}</Badge>
                </div>

                <Separator />

                {/* Contact Info */}
                <div className="space-y-3">
                  <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Contact Information</h4>
                  <div className="grid gap-3">
                    {viewUser.staffId && (
                      <div className="flex items-center gap-3">
                        <Hash className="h-4 w-4 text-muted-foreground shrink-0" />
                        <div>
                          <p className="text-xs text-muted-foreground">Employee Code</p>
                          <p className="text-sm font-mono">{viewUser.staffId}</p>
                        </div>
                      </div>
                    )}
                    <div className="flex items-center gap-3">
                      <Mail className="h-4 w-4 text-muted-foreground shrink-0" />
                      <span className="text-sm">{viewUser.email || '-'}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <Phone className="h-4 w-4 text-muted-foreground shrink-0" />
                      <span className="text-sm">{viewUser.phone || '-'}</span>
                    </div>
                    {viewUser.department && (
                      <div className="flex items-center gap-3">
                        <Building2 className="h-4 w-4 text-muted-foreground shrink-0" />
                        <span className="text-sm">{viewUser.department}</span>
                      </div>
                    )}
                  </div>
                </div>

                <Separator />

                {/* Roles */}
                {viewUser.roles && viewUser.roles.length > 0 && (
                  <>
                    <div className="space-y-2">
                      <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Roles</h4>
                      <div className="flex gap-1.5 flex-wrap">
                        {viewUser.roles.map(r => (
                          <Badge key={r.id} variant="outline" style={{ borderColor: r.color || undefined, color: r.color || undefined }}>{r.name}</Badge>
                        ))}
                      </div>
                    </div>
                    <Separator />
                  </>
                )}

                {/* Plant Access */}
                {viewUser.plantAccess && viewUser.plantAccess.length > 0 && (
                  <>
                    <div className="space-y-2">
                      <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Plant Access</h4>
                      <div className="flex gap-1.5 flex-wrap">
                        {viewUser.plantAccess.map(p => (
                          <Badge key={p.id} variant="secondary"><Factory className="h-3 w-3 mr-1" />{p.name}</Badge>
                        ))}
                      </div>
                    </div>
                    <Separator />
                  </>
                )}

                {/* Primary Plant */}
                {viewUser.plant && (
                  <>
                    <div className="flex items-center gap-3">
                      <Factory className="h-4 w-4 text-muted-foreground shrink-0" />
                      <div>
                        <p className="text-xs text-muted-foreground">Primary Plant</p>
                        <p className="text-sm font-medium">{viewUser.plant.name}</p>
                      </div>
                    </div>
                    <Separator />
                  </>
                )}

                {/* Timestamps */}
                <div className="space-y-3">
                  <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Activity</h4>
                  <div className="grid gap-2 text-sm">
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground flex items-center gap-2"><Calendar className="h-3.5 w-3.5" />Created</span>
                      <span>{viewUser.createdAt ? formatDateTime(viewUser.createdAt) : '-'}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground flex items-center gap-2"><RefreshCw className="h-3.5 w-3.5" />Updated</span>
                      <span>{viewUser.updatedAt ? formatDateTime(viewUser.updatedAt) : '-'}</span>
                    </div>
                    {viewUser.lastLoginAt && (
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground flex items-center gap-2"><Clock className="h-3.5 w-3.5" />Last Login</span>
                        <span>{formatDateTime(viewUser.lastLoginAt)}</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
// SettingsRolesPage
export function SettingsRolesPage() {
  const { hasPermission, isAdmin } = useAuthStore();
  const [roles, setRoles] = useState<Role[]>([]);
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedRoleId, setSelectedRoleId] = useState<string>('');
  const [rolePerms, setRolePerms] = useState<string[]>([]);
  const [allRolePerms, setAllRolePerms] = useState<Record<string, string[]>>({});
  const [saving, setSaving] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [selectedRole, setSelectedRole] = useState<Role | null>(null);
  const [savingPerm, setSavingPerm] = useState(false);
  const [permFilter, setPermFilter] = useState('');

  const emptyRoleForm = { name: '', slug: '', description: '', level: 1 };
  const [createForm, setCreateForm] = useState(emptyRoleForm);
  const [editForm, setEditForm] = useState(emptyRoleForm);

  const permissionsByModule = useMemo(() => {
    const map: Record<string, Permission[]> = {};
    if (!Array.isArray(permissions)) return map;
    permissions.forEach(p => { if (!map[p.module]) map[p.module] = []; map[p.module].push(p); });
    return map;
  }, [permissions]);

  useEffect(() => {
    Promise.all([
      api.get<Role[]>('/api/roles'),
      api.get<Permission[]>('/api/permissions'),
    ]).then(([rolesRes, permsRes]) => {
      const r = Array.isArray(rolesRes.data) ? rolesRes.data : [];
      if (rolesRes.success && rolesRes.data) setRoles(r);
      if (r[0]) setSelectedRoleId(r[0].id);
      if (permsRes.success && permsRes.data) {
        const perms = Array.isArray(permsRes.data) ? permsRes.data : (permsRes.data as { all?: Permission[] }).all || [];
        setPermissions(perms);
      }
      setLoading(false);

      // Load permissions for ALL roles in background for summary counts
      r.forEach(role => {
        api.get<{ permissions: Permission[] }>(`/api/roles/${role.id}`).then(res => {
          if (res.success && res.data) {
            const p = (res.data as any).permissions || (res.data as any).rolePermissions || [];
            const permIds = Array.isArray(p) ? p.map((x: any) => typeof x === 'string' ? x : x.id) : [];
            setAllRolePerms(prev => ({ ...prev, [role.id]: permIds }));
          }
        });
      });
    });
  }, []);

  useEffect(() => {
    if (!selectedRoleId) return;
    api.get<{ permissions: Permission[] }>(`/api/roles/${selectedRoleId}`).then(res => {
      if (res.success && res.data) {
        const p = (res.data as any).permissions || (res.data as any).rolePermissions || [];
        const permIds = Array.isArray(p) ? p.map((x: any) => typeof x === 'string' ? x : x.id) : [];
        setRolePerms(permIds);
        setAllRolePerms(prev => ({ ...prev, [selectedRoleId]: permIds }));
      }
    });
  }, [selectedRoleId]);

  const selectedRoleData = roles.find(r => r.id === selectedRoleId);

  const togglePermission = async (permId: string) => {
    const newPerms = rolePerms.includes(permId) ? rolePerms.filter(id => id !== permId) : [...rolePerms, permId];
    setRolePerms(newPerms);
    setSavingPerm(true);
    await api.put(`/api/roles/${selectedRoleId}/permissions`, { permissionIds: newPerms });
    setSavingPerm(false);
  };

  const handleCreateRole = async () => {
    if (!createForm.name || !createForm.slug) { toast.error('Name and slug required'); return; }
    setSaving(true);
    const res = await api.post('/api/roles', createForm);
    if (res.success) { toast.success('Role created'); setCreateOpen(false); setCreateForm(emptyRoleForm); api.get<Role[]>('/api/roles').then(r => { if (r.success && r.data) setRoles(Array.isArray(r.data) ? r.data : []); }); } else { toast.error(res.error || 'Failed'); }
    setSaving(false);
  };

  const openEditRole = (role: Role) => {
    setSelectedRole(role);
    setEditForm({ name: role.name, slug: role.slug, description: role.description || '', level: role.level });
    setEditOpen(true);
  };

  const handleEditRole = async () => {
    if (!selectedRole) return;
    setSaving(true);
    const res = await api.put(`/api/roles/${selectedRole.id}`, { name: editForm.name, description: editForm.description, level: editForm.level });
    if (res.success) { toast.success('Role updated'); setEditOpen(false); api.get<Role[]>('/api/roles').then(r => { if (r.success && r.data) setRoles(Array.isArray(r.data) ? r.data : []); }); } else { toast.error(res.error || 'Failed'); }
    setSaving(false);
  };

  const handleDeleteRole = async (role: Role) => {
    if (role.isSystem) { toast.error('Cannot delete system role'); return; }
    const res = await api.delete(`/api/roles/${role.id}`);
    if (res.success) { toast.success('Role deleted'); if (selectedRoleId === role.id && roles[0]) setSelectedRoleId(roles[0].id); api.get<Role[]>('/api/roles').then(r => { if (r.success && r.data) setRoles(Array.isArray(r.data) ? r.data : []); }); } else { toast.error(res.error || 'Failed'); }
  };

  const totalPerms = permissions.length;
  const selectedPermCount = rolePerms.length;

  const moduleNames = useMemo(() => {
    const entries = Object.entries(permissionsByModule);
    if (!permFilter.trim()) return entries;
    const q = permFilter.toLowerCase();
    return entries
      .map(([mod, perms]) => [mod, perms.filter(p => p.name.toLowerCase().includes(q) || p.slug.toLowerCase().includes(q))])
      .filter(([, perms]) => perms.length > 0);
  }, [permissionsByModule, permFilter]);
  const filteredPermTotal = useMemo(() => moduleNames.reduce((s, [, p]) => s + p.length, 0), [moduleNames]);

  if (loading) return <LoadingSkeleton />;

  return (
    <div className="flex flex-col h-[calc(100vh-3.5rem)]">
      {/* Page header — shrinks, never scrolls */}
      <div className="flex items-center justify-between flex-wrap gap-3 px-4 md:px-6 lg:px-8 py-4 lg:py-5 shrink-0">
        <div>
          <h1 className="text-xl md:text-2xl font-bold tracking-tight">Roles & Permissions</h1>
          <p className="text-muted-foreground text-xs md:text-sm mt-0.5">Manage system roles and their associated permissions</p>
        </div>
        {(hasPermission('roles.create') || isAdmin()) && <Button onClick={() => setCreateOpen(true)} className="bg-emerald-600 hover:bg-emerald-700 text-white text-sm"><Plus className="h-4 w-4 mr-1.5" /><span className="hidden sm:inline">Create</span> Role</Button>}
      </div>

      {/* ─── Mobile: Role selector dropdown above permissions ─── */}
      <div className="lg:hidden px-4 pb-3 shrink-0">
        <div className="relative">
          <Select value={selectedRoleId} onValueChange={setSelectedRoleId}>
            <SelectTrigger className="w-full h-11 pl-3 pr-8">
              <div className="flex items-center gap-2.5">
                {selectedRoleData && (
                  <div className="h-7 w-7 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: (selectedRoleData.color || '#10b981') + '18', color: selectedRoleData.color || '#10b981' }}>
                    <Shield className="h-3.5 w-3.5" />
                  </div>
                )}
                <div className="flex-1 text-left">
                  <p className="text-sm font-medium">{selectedRoleData?.name || 'Select role'}</p>
                  <p className="text-[10px] text-muted-foreground">{selectedPermCount} of {totalPerms} permissions</p>
                </div>
              </div>
            </SelectTrigger>
            <SelectContent className="max-h-64">
              {roles.map(role => {
                const rpIds = allRolePerms[role.id] || [];
                const count = role.id === selectedRoleId ? selectedPermCount : rpIds.length;
                return (
                  <SelectItem key={role.id} value={role.id} className="py-2.5">
                    <div className="flex items-center gap-2.5">
                      <div className="h-6 w-6 rounded-md flex items-center justify-center shrink-0" style={{ backgroundColor: (role.color || '#10b981') + '15', color: role.color || '#10b981' }}>
                        <Shield className="h-3 w-3" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium">{role.name}</p>
                        <p className="text-[10px] text-muted-foreground">{count}/{totalPerms} perms</p>
                      </div>
                    </div>
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
          {/* Mobile action buttons for selected role */}
          {selectedRoleData && (
            <div className="flex items-center gap-1.5 mt-2">
              <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => openEditRole(selectedRoleData)} disabled={!hasPermission('roles.update') && !isAdmin()}>
                <Pencil className="h-3 w-3 mr-1" />Edit
              </Button>
              {!selectedRoleData.isSystem && (hasPermission('roles.delete') || isAdmin()) && (
                <Button variant="outline" size="sm" className="h-8 text-xs text-red-600 border-red-200 hover:bg-red-50" onClick={() => handleDeleteRole(selectedRoleData)}>
                  <Trash2 className="h-3 w-3 mr-1" />Delete
                </Button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Two-column layout on desktop; single column on mobile/tablet */}
      <div className="flex gap-4 flex-1 min-h-0 mx-4 md:mx-6 lg:mx-8 mb-4 md:mb-6 lg:mb-8">

        {/* ─── Left Column: Role List — desktop only (hidden on mobile/tablet) ─── */}
        <Card className="hidden lg:flex border border-border/60 shadow-md w-60 shrink-0 flex-col overflow-hidden bg-muted/40 dark:bg-muted/20">
          <div className="px-4 py-3 border-b bg-muted/30 shrink-0">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Roles ({roles.length})</p>
          </div>
          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            {roles.map(role => {
              const isSelected = selectedRoleId === role.id;
              const rpIds = allRolePerms[role.id] || [];
              const count = isSelected ? selectedPermCount : rpIds.length;
              return (
                <div
                  key={role.id}
                  onClick={() => setSelectedRoleId(role.id)}
                  className={`flex items-center gap-2.5 px-3 py-2.5 rounded-lg transition-all cursor-pointer group ${isSelected ? 'bg-emerald-50 dark:bg-emerald-950/30' : 'hover:bg-muted/60'}`}
                >
                  <div className="h-8 w-8 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: (role.color || '#10b981') + (isSelected ? '28' : '15'), color: role.color || '#10b981' }}>
                    <Shield className="h-3.5 w-3.5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <p className={`text-sm font-medium truncate ${isSelected ? 'text-emerald-700 dark:text-emerald-300' : ''}`}>{role.name}</p>
                      {role.isSystem && <span className="text-[7px] px-1 py-px rounded bg-muted text-muted-foreground font-bold shrink-0">SYS</span>}
                    </div>
                    <p className="text-[10px] text-muted-foreground">{count}/{totalPerms}</p>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild onClick={e => e.stopPropagation()}>
                      <button className="h-5 w-5 flex items-center justify-center rounded opacity-0 group-hover:opacity-100 hover:bg-muted transition-all shrink-0">
                        <MoreHorizontal className="h-3 w-3 text-muted-foreground" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-36">
                      {(hasPermission('roles.update') || isAdmin()) && <DropdownMenuItem onClick={(e) => { e.stopPropagation(); openEditRole(role); }}><Pencil className="h-3 w-3 mr-2" />Edit</DropdownMenuItem>}
                      {!role.isSystem && (hasPermission('roles.delete') || isAdmin()) && <DropdownMenuItem className="text-red-600" onClick={(e) => { e.stopPropagation(); handleDeleteRole(role); }}><Trash2 className="h-3 w-3 mr-2" />Delete</DropdownMenuItem>}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              );
            })}
          </div>
        </Card>

        {/* ─── Right Column: Permissions ─── */}
        <div className="flex-1 min-w-0 flex flex-col">
          {/* Role info header — desktop only (mobile shows selector above) */}
          {selectedRoleData && (
            <div className="hidden lg:flex items-center gap-3 mb-3 shrink-0">
              <div className="h-9 w-9 rounded-lg flex items-center justify-center" style={{ backgroundColor: (selectedRoleData.color || '#10b981') + '18', color: selectedRoleData.color || '#10b981' }}>
                <Shield className="h-4 w-4" />
              </div>
              <div>
                <h2 className="text-base font-semibold">{selectedRoleData.name}</h2>
                <p className="text-xs text-muted-foreground">{selectedRoleData.description || `Level ${selectedRoleData.level}`} &middot; {selectedPermCount} of {totalPerms} permissions enabled</p>
              </div>
            </div>
          )}

          {/* Permission search filter — sticky */}
          <div className="relative shrink-0 mb-3">
            <Search className="absolute left-2.5 md:left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Filter permissions..."
              value={permFilter}
              onChange={e => setPermFilter(e.target.value)}
              className="pl-8 md:pl-9 h-8 md:h-9 text-xs md:text-sm bg-muted/40 dark:bg-muted/20"
            />
            {permFilter && (
              <div className="absolute right-2.5 md:right-3 top-1/2 -translate-y-1/2 flex items-center gap-1.5">
                <span className="text-[10px] text-muted-foreground tabular-nums">{filteredPermTotal} of {totalPerms}</span>
                <button
                  onClick={() => setPermFilter('')}
                  className="h-4 w-4 rounded-full bg-muted-foreground/20 hover:bg-muted-foreground/30 flex items-center justify-center transition-colors"
                >
                  <X className="h-2.5 w-2.5 text-muted-foreground" />
                </button>
              </div>
            )}
          </div>

          {/* Scrollable permission modules */}
          <div className="flex-1 overflow-y-auto space-y-3 md:space-y-4 pr-0 lg:pr-1">
          {moduleNames.map(([module, perms]) => {
            const moduleEnabledCount = perms.filter(p => rolePerms.includes(p.id)).length;
            const allEnabled = moduleEnabledCount === perms.length;
            return (
              <Card key={module} className="border-0 shadow-sm overflow-hidden">
                {/* Module header with master toggle */}
                <div
                  className={`flex items-center justify-between px-3 md:px-4 lg:px-5 py-2.5 md:py-3 lg:py-3.5 border-b transition-colors ${allEnabled ? 'bg-emerald-50/50 dark:bg-emerald-950/20 border-emerald-200/60 dark:border-emerald-800/40' : 'bg-muted/30 border-border/60'}`}
                >
                  <div className="flex items-center gap-2 md:gap-3 min-w-0">
                    <div className={`h-6 w-6 md:h-7 md:w-7 rounded-md flex items-center justify-center shrink-0 ${allEnabled ? 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/40 dark:text-emerald-400' : 'bg-muted text-muted-foreground'}`}>
                      {allEnabled ? <CheckCircle2 className="h-3 w-3 md:h-3.5 md:w-3.5" /> : <Settings className="h-3 w-3 md:h-3.5 md:w-3.5" />}
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs md:text-sm font-semibold truncate">{module.replace(/_/g, ' ')}</p>
                      <p className="text-[10px] text-muted-foreground">{perms.length} permissions</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 md:gap-3 shrink-0">
                    <Badge variant="outline" className={`text-[10px] md:text-[11px] font-medium tabular-nums ${allEnabled ? 'border-emerald-300 text-emerald-600 dark:border-emerald-600 dark:text-emerald-400' : ''}`}>
                      {moduleEnabledCount}/{perms.length}
                    </Badge>
                    <Switch
                      checked={allEnabled}
                      onCheckedChange={() => {
                        if (allEnabled) {
                          const newPerms = rolePerms.filter(pid => !perms.some(p => p.id === pid));
                          setRolePerms(newPerms);
                          setSavingPerm(true);
                          api.put(`/api/roles/${selectedRoleId}/permissions`, { permissionIds: newPerms }).then(() => setSavingPerm(false));
                        } else {
                          const newPerms = [...new Set([...rolePerms, ...perms.map(p => p.id)])];
                          setRolePerms(newPerms);
                          setSavingPerm(true);
                          api.put(`/api/roles/${selectedRoleId}/permissions`, { permissionIds: newPerms }).then(() => setSavingPerm(false));
                        }
                      }}
                    />
                  </div>
                </div>
                {/* Permission items */}
                <div className="p-2 md:p-3 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-1 md:gap-1.5">
                  {perms.map(p => {
                    const isOn = rolePerms.includes(p.id);
                    return (
                      <div
                        key={p.id}
                        role="button"
                        tabIndex={0}
                        className={`flex items-center gap-2 md:gap-2.5 px-2.5 md:px-3 py-1.5 md:py-2 rounded-lg transition-all cursor-pointer ${isOn ? 'bg-emerald-50/70 dark:bg-emerald-950/25' : 'hover:bg-muted/50 active:bg-muted/70'}`}
                        onClick={() => togglePermission(p.id)}
                        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); togglePermission(p.id); } }}
                      >
                        <Switch checked={isOn} onCheckedChange={() => togglePermission(p.id)} className="scale-[0.65] md:scale-[0.72] shrink-0" onClick={e => e.stopPropagation()} />
                        <div className="min-w-0 flex-1">
                          <p className={`text-[11px] md:text-xs font-medium truncate ${isOn ? 'text-emerald-700 dark:text-emerald-300' : ''}`}>{p.name}</p>
                          <p className="hidden sm:block text-[10px] text-muted-foreground/60 truncate">{p.slug}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </Card>
            );
          })}
          </div>
        </div>
      </div>

      {/* Saving indicator */}
      {savingPerm && (
        <div className="fixed bottom-6 right-6 flex items-center gap-2 px-4 py-2.5 rounded-xl bg-card border shadow-lg z-50">
          <RefreshCw className="h-3.5 w-3.5 animate-spin text-emerald-600" />
          <span className="text-xs font-medium text-muted-foreground">Saving permissions...</span>
        </div>
      )}

      {/* Create Role Dialog */}
      <ResponsiveDialog open={createOpen} onOpenChange={setCreateOpen}>
        
          <div className="space-y-1.5 mb-4"><h2 className="text-lg font-semibold leading-none tracking-tight">Create Role</h2><p className="text-sm text-muted-foreground">Add a new role to the system.</p></div>
          <div className="grid gap-4 py-2">
            <div className="space-y-1.5"><Label>Name *</Label><Input value={createForm.name} onChange={e => setCreateForm(f => ({ ...f, name: e.target.value }))} /></div>
            <div className="space-y-1.5"><Label>Slug *</Label><Input value={createForm.slug} onChange={e => setCreateForm(f => ({ ...f, slug: e.target.value }))} placeholder="e.g. technician" /></div>
            <div className="space-y-1.5"><Label>Description</Label><Input value={createForm.description} onChange={e => setCreateForm(f => ({ ...f, description: e.target.value }))} /></div>
            <div className="space-y-1.5"><Label>Level</Label><Input type="number" min={1} max={100} value={createForm.level} onChange={e => setCreateForm(f => ({ ...f, level: parseInt(e.target.value) || 1 }))} /></div>
          </div>
          <div className="flex flex-col-reverse gap-2 mt-4 sm:flex-row sm:justify-end">
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button onClick={handleCreateRole} disabled={saving} className="bg-emerald-600 hover:bg-emerald-700 text-white">{saving ? <RefreshCw className="h-4 w-4 animate-spin mr-1.5" /> : null}Create</Button>
          </div>
        
      </ResponsiveDialog>

      {/* Edit Role Dialog */}
      <ResponsiveDialog open={editOpen} onOpenChange={setEditOpen}>
        
          <div className="space-y-1.5 mb-4"><h2 className="text-lg font-semibold leading-none tracking-tight">Edit Role</h2><p className="text-sm text-muted-foreground">Update role information.</p></div>
          <div className="grid gap-4 py-2">
            <div className="space-y-1.5"><Label>Name *</Label><Input value={editForm.name} onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))} /></div>
            <div className="space-y-1.5"><Label>Slug</Label><Input value={editForm.slug} disabled={selectedRole?.isSystem} onChange={e => setEditForm(f => ({ ...f, slug: e.target.value }))} className={selectedRole?.isSystem ? 'bg-muted' : ''} /></div>
            <div className="space-y-1.5"><Label>Description</Label><Input value={editForm.description} onChange={e => setEditForm(f => ({ ...f, description: e.target.value }))} /></div>
            <div className="space-y-1.5"><Label>Level</Label><Input type="number" min={1} max={100} value={editForm.level} onChange={e => setEditForm(f => ({ ...f, level: parseInt(e.target.value) || 1 }))} /></div>
          </div>
          <div className="flex flex-col-reverse gap-2 mt-4 sm:flex-row sm:justify-end">
            <Button variant="outline" onClick={() => setEditOpen(false)}>Cancel</Button>
            <Button onClick={handleEditRole} disabled={saving} className="bg-emerald-600 hover:bg-emerald-700 text-white">{saving ? <RefreshCw className="h-4 w-4 animate-spin mr-1.5" /> : null}Save</Button>
          </div>
        
      </ResponsiveDialog>
    </div>
  );
}
// moduleIconMap + SettingsModulesPage
const moduleIconMap: Record<string, React.ElementType> = {
  core: Boxes,
  assets: Building2,
  maintenance_requests: ClipboardList,
  work_orders: Wrench,
  inventory: Package,
  pm_schedules: Calendar,
  analytics: BarChart3,
  production: Zap,
  quality: FlaskConical,
  safety: HardHat,
  iot_sensors: Radio,
  calibration: Ruler,
  downtime: Clock,
  meter_readings: Gauge,
  training: GraduationCap,
  risk_assessment: TriangleAlert,
  condition_monitoring: Activity,
  digital_twin: BrainCircuit,
  bom: Layers,
  failure_analysis: AlertCircle,
  rca_analysis: GitBranch,
  capa: ShieldCheck,
  reports: FileBarChart,
  vendors: Truck,
  tools: ScanLine,
  notifications: BellRing,
  documents: FolderOpen,
  modules: Cog,
  kpi_dashboard: PieChartIcon,
  predictive: TrendingUp,
  oee: Target,
  energy: Zap,
  shift_management: Clock,
  erp_integration: Link2,
  forecasting: TrendingUp,
};

export function SettingsModulesPage() {
  const [modules, setModules] = useState<Module[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('licensing');
  const [searchQuery, setSearchQuery] = useState('');
  const { hasPermission } = useAuthStore();
  const refreshModules = useNavigationStore(s => s.refreshModules);
  const canLicense = hasPermission('modules.activate');
  const canManage = hasPermission('modules.manage');

  useEffect(() => {
    let active = true;
    api.get<Module[]>('/api/modules').then(res => {
      if (!active) return;
      if (res.success && res.data) setModules(res.data);
    }).catch(() => {
      // Silently handle error
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, []);

  // Derived stats
  const stats = useMemo(() => {
    const total = modules.length;
    const licensed = modules.filter(m => m.isActive || m.isCore).length;
    const active = modules.filter(m => m.isEnabled || m.isCore).length;
    const core = modules.filter(m => m.isCore).length;
    return { total, licensed, active, core };
  }, [modules]);

  // Filtered modules
  const filteredModules = useMemo(() => {
    if (!searchQuery.trim()) return modules;
    const q = searchQuery.toLowerCase();
    return modules.filter(m =>
      m.name.toLowerCase().includes(q) ||
      m.code.toLowerCase().includes(q) ||
      (m.description || '').toLowerCase().includes(q)
    );
  }, [modules, searchQuery]);

  // Licensing tab shows all modules
  const licensingModules = filteredModules;
  // Activation tab shows only licensed modules
  const activationModules = filteredModules.filter(m => m.isActive || m.isCore);

  const handleLicenseToggle = async (mod: Module) => {
    if (mod.isCore) return;
    const nextIsActive = !mod.isActive;
    const res = await api.patch(`/api/modules/${mod.id}`, { isActive: nextIsActive });
    if (res.success) {
      setModules(prev => prev.map(m => m.id === mod.id ? { ...m, isActive: nextIsActive, isEnabled: nextIsActive ? m.isEnabled : false } : m));
      toast.success(`${mod.name} ${nextIsActive ? 'licensed successfully' : 'license revoked'}`);
      refreshModules(); // sync sidebar immediately
    } else {
      toast.error(res.error || 'Failed to update module license');
    }
  };

  const handleEnableToggle = async (mod: Module) => {
    if (mod.isCore && mod.isEnabled) return;
    if (!mod.isActive && !mod.isCore) {
      toast.error('Module must be licensed by vendor before it can be enabled');
      return;
    }
    const nextIsEnabled = !mod.isEnabled;
    const res = await api.put(`/api/modules/${mod.id}`, { isEnabled: nextIsEnabled });
    if (res.success) {
      setModules(prev => prev.map(m => m.id === mod.id ? { ...m, isEnabled: nextIsEnabled } : m));
      toast.success(`${mod.name} ${nextIsEnabled ? 'activated' : 'deactivated'}`);
      refreshModules(); // sync sidebar immediately
    } else {
      toast.error(res.error || 'Failed to update module');
    }
  };

  const getLicenseStatus = (mod: Module): { label: string; color: string } => {
    if (mod.isCore) return { label: 'Licensed (Core)', color: 'text-emerald-700 bg-emerald-50' };
    if (!mod.isActive) return { label: 'Unlicensed', color: 'text-slate-500 bg-slate-100' };
    if (mod.validUntil && new Date(mod.validUntil) < new Date()) return { label: 'Expired', color: 'text-red-600 bg-red-50' };
    return { label: 'Licensed', color: 'text-emerald-700 bg-emerald-50' };
  };

  const getCardBorderStyle = (mod: Module): string => {
    const isEnabled = mod.isEnabled || mod.isCore;
    const isActive = mod.isActive || mod.isCore;
    if (isEnabled) return 'ring-1 ring-emerald-200 dark:ring-emerald-800 border-0';
    if (isActive) return 'ring-1 ring-amber-200 dark:ring-amber-800 border-0';
    return 'border-0';
  };

  if (loading) return <LoadingSkeleton />;

  return (
    <div className="page-content">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Module Management</h1>
        <p className="text-muted-foreground text-sm mt-0.5">
          Two-tier module system: vendor licensing controls availability, company activation enables features
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
                <Layers className="h-4.5 w-4.5" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground font-medium">Total Modules</p>
                <p className="text-xl font-bold">{stats.total}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-lg bg-violet-50 text-violet-600 flex items-center justify-center">
                <Key className="h-4.5 w-4.5" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground font-medium">Licensed</p>
                <p className="text-xl font-bold">{stats.licensed}<span className="text-sm text-muted-foreground font-normal ml-0.5">/{stats.total}</span></p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
                <CheckCircle2 className="h-4.5 w-4.5" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground font-medium">Active</p>
                <p className="text-xl font-bold">{stats.active}<span className="text-sm text-muted-foreground font-normal ml-0.5">/{stats.total}</span></p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center">
                <Lock className="h-4.5 w-4.5" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground font-medium">Core Modules</p>
                <p className="text-xl font-bold">{stats.core}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs & Search */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="licensing" className="gap-1.5">
              <Shield className="h-3.5 w-3.5" />
              Module Licensing
            </TabsTrigger>
            <TabsTrigger value="activation" className="gap-1.5">
              <CheckCircle2 className="h-3.5 w-3.5" />
              Module Activation
            </TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="relative w-full sm:w-64">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search modules..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="pl-9 h-9"
          />
        </div>
      </div>

      {/* Licensing Tab */}
      {activeTab === 'licensing' && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {licensingModules.map(mod => {
            const Icon = moduleIconMap[mod.code] || Boxes;
            const licenseStatus = getLicenseStatus(mod);
            const borderStyle = getCardBorderStyle(mod);
            const isGreyedOut = !mod.isActive && !mod.isCore;

            return (
              <Card key={mod.id} className={`shadow-sm transition-all hover:shadow-md ${borderStyle} ${isGreyedOut ? 'opacity-60' : ''}`}>
                <CardContent className="p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3 min-w-0">
                      <div className={`h-10 w-10 rounded-lg flex items-center justify-center shrink-0 ${mod.isActive || mod.isCore ? 'bg-emerald-100 text-emerald-600' : 'bg-slate-100 text-slate-400'}`}>
                        <Icon className="h-5 w-5" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="font-semibold text-sm truncate">{mod.name}</h3>
                          {mod.isCore ? (
                            <Badge variant="outline" className="text-[10px] bg-emerald-50 text-emerald-700 border-emerald-200 flex items-center gap-0.5">
                              <Lock className="h-2.5 w-2.5" />
                              CORE
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-[10px] bg-slate-50 text-slate-500 border-slate-200">OPTIONAL</Badge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{mod.description}</p>
                      </div>
                    </div>
                    {canLicense && (
                      <Switch
                        checked={mod.isActive || mod.isCore}
                        onCheckedChange={() => handleLicenseToggle(mod)}
                        disabled={mod.isCore}
                        className="shrink-0"
                      />
                    )}
                  </div>

                  {/* Module meta */}
                  <div className="flex items-center gap-2 mt-3">
                    <Badge variant="outline" className="text-[10px] font-mono">{mod.code}</Badge>
                    <span className="text-[10px] text-muted-foreground">v{mod.version}</span>
                  </div>

                  {/* Status row */}
                  <div className="mt-3 pt-3 border-t grid grid-cols-2 gap-2">
                    <div>
                      <p className="text-[10px] text-muted-foreground mb-0.5">License Status</p>
                      <span className={`inline-flex items-center text-[11px] font-medium px-1.5 py-0.5 rounded ${licenseStatus.color}`}>
                        {licenseStatus.label}
                      </span>
                    </div>
                    <div>
                      <p className="text-[10px] text-muted-foreground mb-0.5">Activation</p>
                      <div className="flex items-center gap-1.5">
                        <div className={`h-1.5 w-1.5 rounded-full ${mod.isEnabled || mod.isCore ? 'bg-emerald-500' : 'bg-slate-300'}`} />
                        <span className="text-[11px] font-medium">{mod.isEnabled || mod.isCore ? 'Active' : 'Inactive'}</span>
                      </div>
                    </div>
                  </div>

                  {/* License period & licensed by */}
                  {mod.isActive && (mod.validFrom || mod.validUntil || mod.licensedAt) && (
                    <div className="mt-2.5 pt-2.5 border-t space-y-1">
                      {mod.validFrom && mod.validUntil && (
                        <p className="text-[10px] text-muted-foreground">
                          <Calendar className="inline h-3 w-3 mr-1 -mt-px" />
                          {format(new Date(mod.validFrom), 'MMM d, yyyy')} — {format(new Date(mod.validUntil), 'MMM d, yyyy')}
                        </p>
                      )}
                      {mod.licensedAt && (
                        <p className="text-[10px] text-muted-foreground">
                          <Clock className="inline h-3 w-3 mr-1 -mt-px" />
                          Licensed {formatDistanceToNow(new Date(mod.licensedAt), { addSuffix: true })}
                          {mod.licensedByUser && <> by {mod.licensedByUser.fullName}</>}
                        </p>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
          {licensingModules.length === 0 && (
            <div className="col-span-full flex flex-col items-center justify-center py-12 text-muted-foreground">
              <Search className="h-8 w-8 mb-2" />
              <p className="text-sm font-medium">No modules found</p>
              <p className="text-xs">Try adjusting your search query</p>
            </div>
          )}
        </div>
      )}

      {/* Activation Tab */}
      {activeTab === 'activation' && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {activationModules.map(mod => {
            const Icon = moduleIconMap[mod.code] || Boxes;
            const borderStyle = getCardBorderStyle(mod);
            const isEnabled = mod.isEnabled || mod.isCore;

            return (
              <Card key={mod.id} className={`shadow-sm transition-all hover:shadow-md ${borderStyle}`}>
                <CardContent className="p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3 min-w-0">
                      <div className={`h-10 w-10 rounded-lg flex items-center justify-center shrink-0 ${isEnabled ? 'bg-emerald-100 text-emerald-600' : 'bg-amber-50 text-amber-500'}`}>
                        <Icon className="h-5 w-5" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="font-semibold text-sm truncate">{mod.name}</h3>
                          {mod.isCore ? (
                            <Badge variant="outline" className="text-[10px] bg-emerald-50 text-emerald-700 border-emerald-200 flex items-center gap-0.5">
                              <Lock className="h-2.5 w-2.5" />
                              CORE
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-[10px] bg-slate-50 text-slate-500 border-slate-200">OPTIONAL</Badge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{mod.description}</p>
                      </div>
                    </div>
                    {canManage && (
                      <Switch
                        checked={isEnabled}
                        onCheckedChange={() => handleEnableToggle(mod)}
                        disabled={mod.isCore && mod.isEnabled}
                        className="shrink-0"
                      />
                    )}
                  </div>

                  {/* Module meta */}
                  <div className="flex items-center gap-2 mt-3">
                    <Badge variant="outline" className="text-[10px] font-mono">{mod.code}</Badge>
                    <span className="text-[10px] text-muted-foreground">v{mod.version}</span>
                  </div>

                  {/* Status row */}
                  <div className="mt-3 pt-3 border-t grid grid-cols-2 gap-2">
                    <div>
                      <p className="text-[10px] text-muted-foreground mb-0.5">Status</p>
                      <div className="flex items-center gap-1.5">
                        <div className={`h-1.5 w-1.5 rounded-full ${isEnabled ? 'bg-emerald-500' : 'bg-amber-400'}`} />
                        <span className={`text-[11px] font-medium ${isEnabled ? 'text-emerald-700' : 'text-amber-600'}`}>
                          {isEnabled ? 'Active' : 'Inactive'}
                        </span>
                      </div>
                    </div>
                    <div>
                      <p className="text-[10px] text-muted-foreground mb-0.5">Licensed</p>
                      <div className="flex items-center gap-1.5">
                        <CheckCircle2 className="h-3 w-3 text-emerald-500" />
                        <span className="text-[11px] font-medium text-emerald-700">Yes</span>
                      </div>
                    </div>
                  </div>

                  {/* Activated date */}
                  {mod.activatedAt && (
                    <div className="mt-2.5 pt-2.5 border-t">
                      <p className="text-[10px] text-muted-foreground">
                        <CheckCircle2 className="inline h-3 w-3 mr-1 -mt-px text-emerald-500" />
                        Activated {formatDistanceToNow(new Date(mod.activatedAt), { addSuffix: true })}
                      </p>
                    </div>
                  )}

                  {/* Inactive notice */}
                  {!isEnabled && !mod.isCore && (
                    <div className="mt-2.5 pt-2.5 border-t">
                      <p className="text-[10px] text-amber-600 bg-amber-50 rounded px-2 py-1">
                        <AlertTriangle className="inline h-3 w-3 mr-1 -mt-px" />
                        Module is licensed but not yet activated
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
          {activationModules.length === 0 && (
            <div className="col-span-full flex flex-col items-center justify-center py-12 text-muted-foreground">
              <Key className="h-8 w-8 mb-2" />
              <p className="text-sm font-medium">No licensed modules</p>
              <p className="text-xs">License modules from the licensing tab first</p>
            </div>
          )}
        </div>
      )}

      {/* Permission notice */}
      {!canLicense && !canManage && (
        <Card className="border-0 shadow-sm bg-amber-50">
          <CardContent className="p-4 flex items-center gap-3">
            <ShieldAlert className="h-5 w-5 text-amber-500 shrink-0" />
            <p className="text-sm text-amber-700">
              You need <strong>modules.activate</strong> or <strong>modules.manage</strong> permission to manage modules. Contact your administrator.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
// CompanyProfilePage
const defaultCompanyProfile: CompanyProfile = {
  id: '',
  companyName: '',
  tradingName: '',
  address: '',
  city: '',
  region: '',
  country: 'Ghana',
  postalCode: '',
  phone: '',
  email: '',
  website: '',
  industry: '',
  employeeCount: '',
  fiscalYearStart: 'January',
  timezone: 'Africa/Accra',
  currency: 'GHS',
  dateFormat: 'DD/MM/YYYY',
  isSetupComplete: false,
  createdAt: '',
  updatedAt: '',
};

export function CompanyProfilePage() {
  const [form, setForm] = useState<CompanyProfile>(defaultCompanyProfile);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    api.get<CompanyProfile>('/api/company-profile').then(res => {
      if (res.success && res.data) setForm(res.data);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const handleChange = (field: keyof CompanyProfile, value: string) => {
    setForm(prev => ({ ...prev, [field]: value }));
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      toast.error('File too large. Maximum size is 2MB');
      return;
    }
    if (!['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/svg+xml'].includes(file.type)) {
      toast.error('Invalid file type. Allowed: PNG, JPEG, GIF, WebP, SVG');
      return;
    }
    setUploading(true);
    const formData = new FormData();
    formData.append('file', file);
    try {
      const res = await api.post('/api/upload', formData);
      if (res.success && res.data?.url) {
        // Save the logo URL to company profile
        const profileRes = await api.put('/api/company-profile', { ...form, logo: res.data.url, isSetupComplete: true });
        if (profileRes.success && profileRes.data) {
          setForm(profileRes.data);
          toast.success('Logo uploaded successfully');
        } else {
          toast.error(profileRes.error || 'Failed to save logo');
        }
      } else {
        toast.error(res.error || 'Failed to upload logo');
      }
    } catch {
      toast.error('Failed to upload logo');
    }
    setUploading(false);
    // Reset file input
    e.target.value = '';
  };

  const handleRemoveLogo = async () => {
    setUploading(true);
    try {
      const profileRes = await api.put('/api/company-profile', { ...form, logo: null, isSetupComplete: true });
      if (profileRes.success && profileRes.data) {
        setForm(profileRes.data);
        toast.success('Logo removed');
      } else {
        toast.error(profileRes.error || 'Failed to remove logo');
      }
    } catch {
      toast.error('Failed to remove logo');
    }
    setUploading(false);
  };

  const handleSave = async () => {
    if (!form.companyName.trim()) {
      toast.error('Company name is required');
      return;
    }
    setSaving(true);
    const res = await api.put<CompanyProfile>('/api/company-profile', {
      ...form,
      isSetupComplete: true,
    });
    if (res.success && res.data) {
      setForm(res.data);
      toast.success('Company profile saved successfully');
    } else {
      toast.error(res.error || 'Failed to save company profile');
    }
    setSaving(false);
  };

  if (loading) return <LoadingSkeleton />;

  return (
    <div className="page-content">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Company Profile</h1>
        <p className="text-muted-foreground text-sm mt-1">Manage your organization details and information</p>
      </div>

      <div className="grid gap-6 max-w-3xl">
        {/* Company Logo Card */}
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-4">
            <CardTitle className="text-base">Company Logo</CardTitle>
            <CardDescription>Upload your company logo for branding (PNG, JPEG, WebP, SVG — max 2MB)</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-4">
              <div className="h-20 w-20 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shrink-0 overflow-hidden border-2 border-white/20 shadow-sm">
                {form.logo ? (
                  <img src={form.logo} alt="Company Logo" className="h-full w-full object-cover" />
                ) : (
                  <Factory className="h-8 w-8 text-white" />
                )}
              </div>
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  <label className="cursor-pointer inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors">
                    <Upload className="h-3.5 w-3.5" />
                    {uploading ? 'Uploading...' : 'Upload Logo'}
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/gif,image/webp,image/svg+xml"
                      className="hidden"
                      onChange={handleLogoUpload}
                      disabled={uploading}
                    />
                  </label>
                  {form.logo && (
                    <Button variant="ghost" size="sm" className="h-7 text-xs text-destructive hover:text-destructive hover:bg-destructive/10" onClick={handleRemoveLogo} disabled={uploading}>
                      <Trash2 className="h-3 w-3 mr-1" />Remove
                    </Button>
                  )}
                </div>
                {uploading && (
                  <div className="w-32 h-1.5 bg-muted rounded-full overflow-hidden">
                    <div className="h-full bg-primary rounded-full animate-pulse w-full" />
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Company Details */}
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-4">
            <CardTitle className="text-base">Company Details</CardTitle>
            <CardDescription>Basic information about your organization</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="companyName" className="text-sm font-medium">Company Name *</Label>
                <Input
                  id="companyName"
                  value={form.companyName}
                  onChange={e => handleChange('companyName', e.target.value)}
                  placeholder="Enter legal company name"
                  className="h-10"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="tradingName" className="text-sm font-medium">Trading Name</Label>
                <Input
                  id="tradingName"
                  value={form.tradingName || ''}
                  onChange={e => handleChange('tradingName', e.target.value)}
                  placeholder="Enter trading/brand name"
                  className="h-10"
                />
              </div>
              <div className="sm:col-span-2 space-y-2">
                <Label htmlFor="address" className="text-sm font-medium">Address</Label>
                <Textarea
                  id="address"
                  value={form.address || ''}
                  onChange={e => handleChange('address', e.target.value)}
                  placeholder="Enter street address"
                  rows={2}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="city" className="text-sm font-medium">City</Label>
                <Input
                  id="city"
                  value={form.city || ''}
                  onChange={e => handleChange('city', e.target.value)}
                  placeholder="Enter city"
                  className="h-10"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="region" className="text-sm font-medium">Region / State</Label>
                <Input
                  id="region"
                  value={form.region || ''}
                  onChange={e => handleChange('region', e.target.value)}
                  placeholder="Enter region or state"
                  className="h-10"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="country" className="text-sm font-medium">Country</Label>
                <Input
                  id="country"
                  value={form.country || ''}
                  onChange={e => handleChange('country', e.target.value)}
                  placeholder="Enter country"
                  className="h-10"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="postalCode" className="text-sm font-medium">Postal Code</Label>
                <Input
                  id="postalCode"
                  value={form.postalCode || ''}
                  onChange={e => handleChange('postalCode', e.target.value)}
                  placeholder="Enter postal code"
                  className="h-10"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Contact Information */}
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-4">
            <CardTitle className="text-base">Contact Information</CardTitle>
            <CardDescription>How people can reach your organization</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="phone" className="text-sm font-medium">Phone</Label>
                <Input
                  id="phone"
                  value={form.phone || ''}
                  onChange={e => handleChange('phone', e.target.value)}
                  placeholder="+233 XX XXX XXXX"
                  className="h-10"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="cemail" className="text-sm font-medium">Email</Label>
                <Input
                  id="cemail"
                  type="email"
                  value={form.email || ''}
                  onChange={e => handleChange('email', e.target.value)}
                  placeholder="info@company.com"
                  className="h-10"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="website" className="text-sm font-medium">Website</Label>
                <Input
                  id="website"
                  value={form.website || ''}
                  onChange={e => handleChange('website', e.target.value)}
                  placeholder="https://www.company.com"
                  className="h-10"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Industry & Size */}
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-4">
            <CardTitle className="text-base">Industry &amp; Organization</CardTitle>
            <CardDescription>Industry and organization size details</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label className="text-sm font-medium">Industry</Label>
                <Select value={form.industry || ''} onValueChange={v => handleChange('industry', v)}>
                  <SelectTrigger className="h-10">
                    <SelectValue placeholder="Select industry" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="manufacturing">Manufacturing</SelectItem>
                    <SelectItem value="energy">Energy &amp; Utilities</SelectItem>
                    <SelectItem value="construction">Construction</SelectItem>
                    <SelectItem value="healthcare">Healthcare</SelectItem>
                    <SelectItem value="transportation">Transportation &amp; Logistics</SelectItem>
                    <SelectItem value="mining">Mining &amp; Resources</SelectItem>
                    <SelectItem value="oil_gas">Oil &amp; Gas</SelectItem>
                    <SelectItem value="telecommunications">Telecommunications</SelectItem>
                    <SelectItem value="food_beverage">Food &amp; Beverage</SelectItem>
                    <SelectItem value="pharmaceutical">Pharmaceutical</SelectItem>
                    <SelectItem value="real_estate">Real Estate &amp; Facilities</SelectItem>
                    <SelectItem value="government">Government &amp; Public Sector</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-medium">Number of Employees</Label>
                <Select value={form.employeeCount || ''} onValueChange={v => handleChange('employeeCount', v)}>
                  <SelectTrigger className="h-10">
                    <SelectValue placeholder="Select range" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1-10">1 - 10</SelectItem>
                    <SelectItem value="11-50">11 - 50</SelectItem>
                    <SelectItem value="51-200">51 - 200</SelectItem>
                    <SelectItem value="201-500">201 - 500</SelectItem>
                    <SelectItem value="501-1000">501 - 1,000</SelectItem>
                    <SelectItem value="1001-5000">1,001 - 5,000</SelectItem>
                    <SelectItem value="5001+">5,001+</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-medium">Currency</Label>
                <div className="h-10 border border-input bg-muted px-3 flex items-center text-sm text-muted-foreground rounded-md">₵ — Ghana Cedis</div>
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-medium">Timezone</Label>
                <Select value={form.timezone || 'Africa/Accra'} onValueChange={v => handleChange('timezone', v)}>
                  <SelectTrigger className="h-10">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Africa/Accra">GMT (Africa/Accra)</SelectItem>
                    <SelectItem value="Africa/Lagos">WAT (Africa/Lagos)</SelectItem>
                    <SelectItem value="UTC">UTC</SelectItem>
                    <SelectItem value="Europe/London">GMT (Europe/London)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Save Button */}
        <div className="flex justify-end">
          <Button
            onClick={handleSave}
            disabled={saving}
            className="bg-emerald-600 hover:bg-emerald-700 text-white min-w-[140px]"
          >
            {saving ? (
              <span className="flex items-center gap-2">
                <RefreshCw className="h-4 w-4 animate-spin" />
                Saving...
              </span>
            ) : (
              'Save Changes'
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// SETTINGS - PLANTS
// ============================================================================

// SettingsPlantsPage
export function SettingsPlantsPage() {
  const { hasPermission, isAdmin } = useAuthStore();
  const [plants, setPlants] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: '', code: '', location: '', country: '', city: '' });

  const loadPlants = useCallback(() => {
    api.get<any[]>('/api/plants').then(res => { if (res.success && res.data) setPlants(Array.isArray(res.data) ? res.data : []); setLoading(false); });
  }, []);

  useEffect(() => { loadPlants(); }, [loadPlants]);

  const openCreate = () => { setEditId(null); setForm({ name: '', code: '', location: '', country: '', city: '' }); setDialogOpen(true); };
  const openEdit = (p: any) => { setEditId(p.id); setForm({ name: p.name, code: p.code, location: p.location || '', country: p.country || '', city: p.city || '' }); setDialogOpen(true); };

  const handleSave = async () => {
    if (!form.name || !form.code) { toast.error('Name and code required'); return; }
    setSaving(true);
    const res = editId ? await api.put(`/api/plants/${editId}`, form) : await api.post('/api/plants', form);
    if (res.success) { toast.success(editId ? 'Plant updated' : 'Plant created'); setDialogOpen(false); loadPlants(); } else { toast.error(res.error || 'Failed'); }
    setSaving(false);
  };

  const handleDelete = async (p: any) => {
    const res = await api.delete(`/api/plants/${p.id}`);
    if (res.success) { toast.success('Plant deleted'); loadPlants(); } else { toast.error(res.error || 'Failed'); }
  };

  if (loading) return <LoadingSkeleton />;

  return (
    <div className="page-content">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Plants</h1>
          <p className="text-muted-foreground text-sm mt-1">Manage plant locations and facilities</p>
        </div>
        {(hasPermission('system_settings.update') || isAdmin()) && <Button onClick={openCreate} className="bg-emerald-600 hover:bg-emerald-700 text-white"><Plus className="h-4 w-4 mr-1.5" />Add Plant</Button>}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {plants.length === 0 ? (
          <div className="col-span-full"><EmptyState icon={Factory} title="No plants" description="Create your first plant to get started." /></div>
        ) : plants.map(p => (
          <Card key={p.id} className="border-0 shadow-sm dark:bg-card">
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center dark:bg-emerald-900/30 dark:text-emerald-400"><Factory className="h-5 w-5" /></div>
                  <div>
                    <CardTitle className="text-sm">{p.name}</CardTitle>
                    <CardDescription className="text-xs font-mono">{p.code}</CardDescription>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <Badge variant="outline" className={p.isActive ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-400 dark:border-emerald-800' : 'bg-slate-50 text-slate-500 border-slate-200'}>
                    {p.isActive ? 'Active' : 'Inactive'}
                  </Badge>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="h-7 w-7"><MoreHorizontal className="h-3.5 w-3.5" /></Button></DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      {(hasPermission('system_settings.update') || isAdmin()) && <DropdownMenuItem onClick={() => openEdit(p)}><Pencil className="h-3.5 w-3.5 mr-2" />Edit</DropdownMenuItem>}
                      {(hasPermission('system_settings.update') || isAdmin()) && <DropdownMenuItem className="text-red-600" onClick={() => handleDelete(p)}><Trash2 className="h-3.5 w-3.5 mr-2" />Delete</DropdownMenuItem>}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-1.5 text-xs text-muted-foreground">
                {p.location && <div className="flex items-center gap-1.5"><MapPin className="h-3 w-3" />{p.location}</div>}
                {(p.city || p.country) && <div>{p.city}{p.city && p.country ? ', ' : ''}{p.country}</div>}
                <div className="flex items-center gap-2 pt-1">
                  {(p as any)._count?.departments !== undefined && (
                    <Badge variant="outline" className="text-[10px]"><Building2 className="h-2.5 w-2.5 mr-1" />{(p as any)._count.departments} Dept(s)</Badge>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <ResponsiveDialog open={dialogOpen} onOpenChange={setDialogOpen}>
        
          <div className="space-y-1.5 mb-4"><h2 className="text-lg font-semibold leading-none tracking-tight">{editId ? 'Edit Plant' : 'Create Plant'}</h2><p className="text-sm text-muted-foreground">{editId ? 'Update plant details.' : 'Add a new plant location.'}</p></div>
          <div className="grid gap-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label>Name *</Label><Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} /></div>
              <div className="space-y-1.5"><Label>Code *</Label><Input value={form.code} onChange={e => setForm(f => ({ ...f, code: e.target.value }))} /></div>
            </div>
            <div className="space-y-1.5"><Label>Location</Label><Input value={form.location} onChange={e => setForm(f => ({ ...f, location: e.target.value }))} placeholder="Street address" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label>City</Label><Input value={form.city} onChange={e => setForm(f => ({ ...f, city: e.target.value }))} /></div>
              <div className="space-y-1.5"><Label>Country</Label><Input value={form.country} onChange={e => setForm(f => ({ ...f, country: e.target.value }))} /></div>
            </div>
          </div>
          <div className="flex flex-col-reverse gap-2 mt-4 sm:flex-row sm:justify-end">
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving} className="bg-emerald-600 hover:bg-emerald-700 text-white">{saving ? <RefreshCw className="h-4 w-4 animate-spin mr-1.5" /> : null}{editId ? 'Save' : 'Create'}</Button>
          </div>
        
      </ResponsiveDialog>
    </div>
  );
}

// ============================================================================
// SETTINGS - DEPARTMENTS
// ============================================================================

export function SettingsDepartmentsPage() {
  const { hasPermission, isAdmin } = useAuthStore();
  const [departments, setDepartments] = useState<any[]>([]);
  const [plants, setPlants] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: '', code: '', plantId: '', parentId: '', supervisorId: '' });

  const loadData = useCallback(() => {
    Promise.all([api.get<any[]>('/api/departments'), api.get<any[]>('/api/plants')]).then(([deptRes, plantRes]) => {
      if (deptRes.success && deptRes.data) setDepartments(Array.isArray(deptRes.data) ? deptRes.data : []);
      if (plantRes.success && plantRes.data) setPlants(Array.isArray(plantRes.data) ? plantRes.data : []);
      setLoading(false);
    });
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const openCreate = () => { setEditId(null); setForm({ name: '', code: '', plantId: '', parentId: '', supervisorId: '' }); setDialogOpen(true); };
  const openEdit = (d: any) => { setEditId(d.id); setForm({ name: d.name, code: d.code, plantId: d.plantId || '', parentId: d.parentId || '', supervisorId: d.supervisorId || '' }); setDialogOpen(true); };

  const handleSave = async () => {
    if (!form.name || !form.code) { toast.error('Name and code required'); return; }
    setSaving(true);
    const res = editId ? await api.put(`/api/departments/${editId}`, form) : await api.post('/api/departments', form);
    if (res.success) { toast.success(editId ? 'Department updated' : 'Department created'); setDialogOpen(false); loadData(); } else { toast.error(res.error || 'Failed'); }
    setSaving(false);
  };

  const handleDelete = async (d: any) => {
    if (d._count?.children > 0) { toast.error('Cannot delete department with children'); return; }
    const res = await api.delete(`/api/departments/${d.id}`);
    if (res.success) { toast.success('Department deleted'); loadData(); } else { toast.error(res.error || 'Failed'); }
  };

  if (loading) return <LoadingSkeleton />;

  return (
    <div className="page-content">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Departments</h1>
          <p className="text-muted-foreground text-sm mt-1">Manage organizational departments</p>
        </div>
        {(hasPermission('system_settings.update') || isAdmin()) && <Button onClick={openCreate} className="bg-emerald-600 hover:bg-emerald-700 text-white"><Plus className="h-4 w-4 mr-1.5" />Add Department</Button>}
      </div>
      <Card className="border-0 shadow-sm dark:bg-card overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Code</TableHead>
                <TableHead className="hidden md:table-cell">Plant</TableHead>
                <TableHead className="hidden lg:table-cell">Supervisor</TableHead>
                <TableHead className="hidden md:table-cell">Children</TableHead>
                <TableHead className="w-10">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {departments.length === 0 ? (
                <TableRow><TableCell colSpan={6} className="h-48"><EmptyState icon={Building2} title="No departments" description="Create your first department." /></TableCell></TableRow>
              ) : departments.map(d => (
                <TableRow key={d.id}>
                  <TableCell className="font-medium text-sm">{d.name}</TableCell>
                  <TableCell className="font-mono text-xs">{d.code}</TableCell>
                  <TableCell className="text-sm hidden md:table-cell">{d.plant?.name || '-'}</TableCell>
                  <TableCell className="text-sm hidden lg:table-cell">{(d as any).supervisor?.fullName || d.supervisorId || '-'}</TableCell>
                  <TableCell className="hidden md:table-cell">
                    {(d as any)._count?.children !== undefined ? (
                      <Badge variant="outline" className="text-[10px]">{(d as any)._count.children}</Badge>
                    ) : '-'}
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="h-8 w-8"><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {(hasPermission('system_settings.update') || isAdmin()) && <DropdownMenuItem onClick={() => openEdit(d)}><Pencil className="h-3.5 w-3.5 mr-2" />Edit</DropdownMenuItem>}
                        {(hasPermission('system_settings.update') || isAdmin()) && <DropdownMenuItem className="text-red-600" onClick={() => handleDelete(d)}><Trash2 className="h-3.5 w-3.5 mr-2" />Delete</DropdownMenuItem>}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Card>

      <ResponsiveDialog open={dialogOpen} onOpenChange={setDialogOpen}>
        
          <div className="space-y-1.5 mb-4"><h2 className="text-lg font-semibold leading-none tracking-tight">{editId ? 'Edit Department' : 'Create Department'}</h2><p className="text-sm text-muted-foreground">{editId ? 'Update department details.' : 'Add a new department.'}</p></div>
          <div className="grid gap-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label>Name *</Label><Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} /></div>
              <div className="space-y-1.5"><Label>Code *</Label><Input value={form.code} onChange={e => setForm(f => ({ ...f, code: e.target.value }))} /></div>
            </div>
            <div className="space-y-1.5">
              <Label>Plant</Label>
              <AsyncSearchableSelect
                value={form.plantId}
                onValueChange={v => setForm(f => ({ ...f, plantId: v }))}
                fetchOptions={async () => {
                  const res = await api.get('/api/plants');
                  if (res.success && res.data) {
                    return (Array.isArray(res.data) ? res.data : []).map((p: any) => ({
                      value: p.id,
                      label: p.name,
                    }));
                  }
                  return [];
                }}
                placeholder="Select plant..."
                searchPlaceholder="Search plants..."
              />
            </div>
            <div className="space-y-1.5">
              <Label>Parent Department</Label>
              <AsyncSearchableSelect
                value={form.parentId}
                onValueChange={v => setForm(f => ({ ...f, parentId: v }))}
                fetchOptions={async () => {
                  const res = await api.get('/api/departments');
                  if (res.success && res.data) {
                    return (Array.isArray(res.data) ? res.data : [])
                      .filter((d: any) => d.id !== editId)
                      .map((d: any) => ({ value: d.id, label: d.name }));
                  }
                  return [];
                }}
                placeholder="None (top-level)"
                searchPlaceholder="Search departments..."
              />
            </div>
            <div className="space-y-1.5">
              <Label>Supervisor</Label>
              <AsyncSearchableSelect
                value={form.supervisorId}
                onValueChange={v => setForm(f => ({ ...f, supervisorId: v }))}
                fetchOptions={async () => {
                  const res = await api.get('/api/users');
                  if (res.success && res.data) {
                    return (Array.isArray(res.data) ? res.data : []).map((u: any) => ({
                      value: u.id,
                      label: u.fullName,
                    }));
                  }
                  return [];
                }}
                placeholder="Select supervisor..."
                searchPlaceholder="Search users..."
              />
            </div>
          </div>
          <div className="flex flex-col-reverse gap-2 mt-4 sm:flex-row sm:justify-end">
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving} className="bg-emerald-600 hover:bg-emerald-700 text-white">{saving ? <RefreshCw className="h-4 w-4 animate-spin mr-1.5" /> : null}{editId ? 'Save' : 'Create'}</Button>
          </div>
        
      </ResponsiveDialog>
    </div>
  );
}

// ============================================================================
// NOTIFICATIONS CENTER
// ============================================================================

interface NotifPreferences {
  channels: { inApp: boolean; email: boolean; emailAddr: string; sms: boolean; phone: string };
  quietHours: { enabled: boolean; start: string; end: string; timezone: string };
  types: Record<string, boolean>;
}

interface NotifPagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

const TYPE_COLORS: Record<string, string> = {
  mr_assigned: 'bg-sky-100 text-sky-600 dark:bg-sky-900/30 dark:text-sky-400',
  mr_approved: 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400',
  mr_rejected: 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400',
  mr_cancelled: 'bg-slate-100 text-slate-500 dark:bg-slate-800/30 dark:text-slate-400',
  wo_assigned: 'bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400',
  wo_started: 'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400',
  wo_completed: 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400',
  wo_closed: 'bg-slate-100 text-slate-500 dark:bg-slate-800/30 dark:text-slate-400',
  wo_on_hold: 'bg-orange-100 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400',
  wo_cancelled: 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400',
  wo_approved: 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400',
  safety_incident: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  safety_alert: 'bg-orange-100 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400',
  quality_ncr: 'bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400',
  quality_inspection: 'bg-sky-100 text-sky-600 dark:bg-sky-900/30 dark:text-sky-400',
  quality_audit: 'bg-violet-100 text-violet-600 dark:bg-violet-900/30 dark:text-violet-400',
  system: 'bg-slate-100 text-slate-600 dark:bg-slate-800/50 dark:text-slate-400',
  info: 'bg-slate-50 text-slate-500 dark:bg-slate-800/30 dark:text-slate-400',
};

const TYPE_ICONS: Record<string, React.ElementType> = {
  mr_assigned: ClipboardList,
  mr_approved: CheckCircle2,
  mr_rejected: XCircle,
  mr_cancelled: XCircle,
  wo_assigned: Wrench,
  wo_started: Play,
  wo_completed: CheckCircle2,
  wo_closed: Check,
  wo_on_hold: Clock,
  wo_cancelled: XCircle,
  wo_approved: CheckCircle2,
  safety_incident: AlertTriangle,
  safety_alert: AlertTriangle,
  quality_ncr: AlertCircle,
  quality_inspection: Search,
  quality_audit: Eye,
  system: Settings,
  info: MessageSquare,
};

const CATEGORY_OPTIONS = [
  { value: 'all', label: 'All Types' },
  { value: 'work_orders', label: 'Work Orders' },
  { value: 'maintenance', label: 'Maintenance' },
  { value: 'safety', label: 'Safety' },
  { value: 'quality', label: 'Quality' },
  { value: 'system', label: 'System' },
];

const READ_OPTIONS = [
  { value: 'all', label: 'All' },
  { value: 'unread', label: 'Unread' },
  { value: 'read', label: 'Read' },
];

const PREF_TYPE_LABELS: Record<string, { label: string; desc: string }> = {
  woAssigned: { label: 'Work Order Assigned', desc: 'When a work order is assigned to you' },
  woStatusChange: { label: 'WO Status Updates', desc: 'Status changes on your work orders' },
  mrApprovedRejected: { label: 'MR Decisions', desc: 'Maintenance request approval/rejection' },
  pmDue: { label: 'PM Schedule Due', desc: 'Preventive maintenance reminders' },
  lowStockAlert: { label: 'Low Stock Alerts', desc: 'Inventory items below reorder point' },
  assetConditionAlert: { label: 'Asset Condition', desc: 'Degraded asset condition readings' },
  systemNotifications: { label: 'System Updates', desc: 'System updates and maintenance windows' },
  safetyAlerts: { label: 'Safety Alerts', desc: 'Safety incidents and near-misses' },
  qualityAlerts: { label: 'Quality Alerts', desc: 'NCRs and failed inspections' },
};

export function NotificationsPage() {
  const navigate = useNavigationStore(s => s.navigate);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [unreadCount, setUnreadCount] = useState(0);
  const [pagination, setPagination] = useState<NotifPagination>({ page: 1, limit: 20, total: 0, totalPages: 0 });
  const [activeTab, setActiveTab] = useState<'inbox' | 'preferences'>('inbox');

  // Filters
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [readFilter, setReadFilter] = useState('all');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // Selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Preferences
  const [prefs, setPrefs] = useState<NotifPreferences | null>(null);
  const [prefsLoading, setPrefsLoading] = useState(false);
  const [prefsSaving, setPrefsSaving] = useState(false);

  // Build query params
  const buildQuery = useCallback(() => {
    const params: string[] = [];
    params.push(`page=${pagination.page}`);
    params.push(`limit=${pagination.limit}`);
    if (categoryFilter !== 'all') params.push(`category=${categoryFilter}`);
    if (readFilter !== 'all') params.push(`read=${readFilter}`);
    if (startDate) params.push(`startDate=${startDate}`);
    if (endDate) params.push(`endDate=${endDate}`);
    return params.length > 0 ? '?' + params.join('&') : '';
  }, [pagination.page, pagination.limit, categoryFilter, readFilter, startDate, endDate]);

  const loadNotifications = useCallback(() => {
    setLoading(true);
    const query = buildQuery();
    api.get(`/api/notifications${query}`).then(res => {
      if (res.success && res.data) {
        const d = res.data as Record<string, unknown>;
        const notifs = (d.notifications || []) as Notification[];
        const pag = (d.pagination || {}) as NotifPagination;
        setNotifications(notifs);
        setPagination(pag);
        setUnreadCount((d.unreadCount || 0) as number);
        setSelectedIds(new Set());
        setExpandedId(null);
      }
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [buildQuery]);

  useEffect(() => { loadNotifications(); }, [loadNotifications]);

  // Load preferences
  const loadPrefs = useCallback(() => {
    setPrefsLoading(true);
    api.get('/api/notifications/preferences').then(res => {
      if (res.success && res.data) setPrefs(res.data as NotifPreferences);
      setPrefsLoading(false);
    }).catch(() => setPrefsLoading(false));
  }, []);

  // Reset page when filters change
  useEffect(() => { setPagination(p => ({ ...p, page: 1 })); }, [categoryFilter, readFilter, startDate, endDate]);

  // Clear date filters
  const clearFilters = () => {
    setCategoryFilter('all');
    setReadFilter('all');
    setStartDate('');
    setEndDate('');
  };

  const hasActiveFilters = categoryFilter !== 'all' || readFilter !== 'all' || startDate || endDate;

  // Mark single as read/unread
  const toggleRead = async (n: Notification) => {
    await api.put(`/api/notifications/${n.id}`, { read: !n.isRead });
    setNotifications(prev => prev.map(x => x.id === n.id ? { ...x, isRead: !n.isRead } : x));
    setUnreadCount(prev => n.isRead ? prev + 1 : Math.max(0, prev - 1));
  };

  // Mark all as read
  const markAllRead = async () => {
    await api.put('/api/notifications', { all: true, read: true });
    setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
    setUnreadCount(0);
    toast.success('All notifications marked as read');
  };

  // Mark selected as read
  const markSelectedRead = async () => {
    if (selectedIds.size === 0) return;
    await api.put('/api/notifications', { ids: Array.from(selectedIds), read: true });
    setNotifications(prev => prev.map(n => selectedIds.has(n.id) ? { ...n, isRead: true } : n));
    const newlyRead = notifications.filter(n => selectedIds.has(n.id) && !n.isRead).length;
    setUnreadCount(prev => Math.max(0, prev - newlyRead));
    setSelectedIds(new Set());
    toast.success(`${selectedIds.size} notification(s) marked as read`);
  };

  // Delete single notification
  const deleteNotification = async (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    await api.delete(`/api/notifications/${id}`);
    const wasUnread = notifications.find(n => n.id === id)?.isRead === false;
    setNotifications(prev => prev.filter(n => n.id !== id));
    setPagination(prev => ({ ...prev, total: prev.total - 1 }));
    if (wasUnread) setUnreadCount(prev => Math.max(0, prev - 1));
    setSelectedIds(prev => { const next = new Set(prev); next.delete(id); return next; });
    toast.success('Notification deleted');
  };

  // Delete selected notifications
  const deleteSelected = async () => {
    if (selectedIds.size === 0) return;
    await api.delete(`/api/notifications?ids=${Array.from(selectedIds).join(',')}`);
    const deletedCount = selectedIds.size;
    const deletedUnread = notifications.filter(n => selectedIds.has(n.id) && !n.isRead).length;
    setNotifications(prev => prev.filter(n => !selectedIds.has(n.id)));
    setPagination(prev => ({ ...prev, total: prev.total - deletedCount }));
    setUnreadCount(prev => Math.max(0, prev - deletedUnread));
    setSelectedIds(new Set());
    toast.success(`${deletedCount} notification(s) deleted`);
  };

  // Delete all read
  const deleteAllRead = async () => {
    await api.put('/api/notifications', { deleteRead: true });
    const readCount = notifications.filter(n => n.isRead).length;
    setNotifications(prev => prev.filter(n => !n.isRead));
    setPagination(prev => ({ ...prev, total: prev.total - readCount }));
    toast.success(`${readCount} read notification(s) deleted`);
  };

  // Toggle select
  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === notifications.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(notifications.map(n => n.id)));
    }
  };

  // Go to action URL
  const goToAction = (n: Notification) => {
    if (!n.actionUrl) return;
    // Parse actionUrl like "mr-detail?id=xxx" or "wo-detail?id=xxx"
    const [pagePart, queryPart] = n.actionUrl.split('?');
    const params: Record<string, string> = {};
    if (queryPart) {
      const qs = new URLSearchParams(queryPart);
      qs.forEach((v, k) => { params[k] = v; });
    }
    navigate(pagePart as PageName, params);
  };

  // Save preferences
  const savePrefs = async () => {
    if (!prefs) return;
    setPrefsSaving(true);
    await api.put('/api/notifications/preferences', prefs);
    toast.success('Notification preferences saved');
    setPrefsSaving(false);
  };

  const allSelected = notifications.length > 0 && selectedIds.size === notifications.length;

  if (activeTab === 'preferences') {
    return (
      <div className="page-content">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Notification Preferences</h1>
            <p className="text-muted-foreground text-sm mt-1">Configure how and when you receive notifications</p>
          </div>
          <Button variant="outline" onClick={() => setActiveTab('inbox')} className="gap-1.5">
            <Bell className="h-4 w-4" />Back to Inbox
          </Button>
        </div>

        {prefsLoading && !prefs ? <LoadingSkeleton /> : !prefs ? (
          <EmptyState icon={Settings} title="Could not load preferences" description="Please try again later." />
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
            {/* Channels */}
            <Card className="border-0 shadow-sm">
              <CardHeader><CardTitle className="text-base">Notification Channels</CardTitle><CardDescription>Choose where to receive notifications</CardDescription></CardHeader>
              <CardContent className="space-y-5">
                <div className="flex items-center justify-between">
                  <div><Label className="text-sm font-medium">In-App Notifications</Label><p className="text-xs text-muted-foreground mt-0.5">Receive notifications within the application</p></div>
                  <Switch checked={prefs.channels.inApp} onCheckedChange={v => setPrefs(p => ({ ...p!, channels: { ...p!.channels, inApp: v } }))} />
                </div>
                <Separator />
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div><Label className="text-sm font-medium">Email Notifications</Label><p className="text-xs text-muted-foreground mt-0.5">Receive notifications via email</p></div>
                    <Switch checked={prefs.channels.email} onCheckedChange={v => setPrefs(p => ({ ...p!, channels: { ...p!.channels, email: v } }))} />
                  </div>
                  {prefs.channels.email && (
                    <div className="space-y-2 pl-1"><Label className="text-xs">Email Address</Label><Input value={prefs.channels.emailAddr} onChange={e => setPrefs(p => ({ ...p!, channels: { ...p!.channels, emailAddr: e.target.value } }))} placeholder="you@company.com" /></div>
                  )}
                </div>
                <Separator />
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div><Label className="text-sm font-medium">SMS Notifications</Label><p className="text-xs text-muted-foreground mt-0.5">Receive critical alerts via SMS</p></div>
                    <Switch checked={prefs.channels.sms} onCheckedChange={v => setPrefs(p => ({ ...p!, channels: { ...p!.channels, sms: v } }))} />
                  </div>
                  {prefs.channels.sms && (
                    <div className="space-y-2 pl-1"><Label className="text-xs">Phone Number</Label><Input value={prefs.channels.phone} onChange={e => setPrefs(p => ({ ...p!, channels: { ...p!.channels, phone: e.target.value } }))} placeholder="+1 234 567 8900" /></div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Quiet Hours */}
            <Card className="border-0 shadow-sm">
              <CardHeader><CardTitle className="text-base">Quiet Hours</CardTitle><CardDescription>Pause non-critical notifications during specified hours</CardDescription></CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <div><Label className="text-sm font-medium">Enable Quiet Hours</Label><p className="text-xs text-muted-foreground mt-0.5">Only urgent alerts will be sent</p></div>
                  <Switch checked={prefs.quietHours.enabled} onCheckedChange={v => setPrefs(p => ({ ...p!, quietHours: { ...p!.quietHours, enabled: v } }))} />
                </div>
                {prefs.quietHours.enabled && (
                  <>
                    <div className="grid grid-cols-2 gap-4">
                      <TimePicker label="Start Time" value={prefs.quietHours.start || undefined} onChange={v => setPrefs(p => ({ ...p!, quietHours: { ...p!.quietHours, start: v } }))} />
                      <TimePicker label="End Time" value={prefs.quietHours.end || undefined} onChange={v => setPrefs(p => ({ ...p!, quietHours: { ...p!.quietHours, end: v } }))} />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs">Timezone</Label>
                      <Select value={prefs.quietHours.timezone} onValueChange={v => setPrefs(p => ({ ...p!, quietHours: { ...p!.quietHours, timezone: v } }))}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="UTC">UTC</SelectItem>
                          <SelectItem value="America/New_York">Eastern Time</SelectItem>
                          <SelectItem value="America/Chicago">Central Time</SelectItem>
                          <SelectItem value="America/Los_Angeles">Pacific Time</SelectItem>
                          <SelectItem value="Europe/London">London (GMT)</SelectItem>
                          <SelectItem value="Africa/Accra">Accra (GMT)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>

            {/* Notification Types */}
            <Card className="lg:col-span-2 border-0 shadow-sm">
              <CardHeader><CardTitle className="text-base">Notification Types</CardTitle><CardDescription>Toggle specific notification categories</CardDescription></CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-1">
                  {Object.entries(PREF_TYPE_LABELS).map(([key, { label, desc }]) => (
                    <div key={key} className="flex items-center justify-between py-3 border-b last:border-0">
                      <div><Label className="text-sm font-medium">{label}</Label><p className="text-xs text-muted-foreground mt-0.5">{desc}</p></div>
                      <Switch checked={prefs.types[key] ?? true} onCheckedChange={v => setPrefs(p => ({ ...p!, types: { ...p!.types, [key]: v } }))} />
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {prefs && (
          <div className="mt-6 flex items-center gap-3">
            <Button onClick={savePrefs} disabled={prefsSaving}>
              {prefsSaving ? <><RefreshCw className="h-4 w-4 mr-2 animate-spin" />Saving...</> : 'Save Preferences'}
            </Button>
            <Button variant="outline" onClick={loadPrefs}>Reset</Button>
          </div>
        )}
      </div>
    );
  }

  // Inbox tab
  return (
    <div className="page-content">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Notification Center</h1>
          <p className="text-muted-foreground text-sm mt-1">
            {unreadCount > 0 ? `${unreadCount} unread notification${unreadCount !== 1 ? 's' : ''}` : 'All caught up!'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => { setActiveTab('preferences'); loadPrefs(); }} className="gap-1.5">
            <Settings className="h-4 w-4" />Preferences
          </Button>
          {unreadCount > 0 && (
            <Button variant="outline" size="sm" onClick={markAllRead} className="gap-1.5">
              <Check className="h-4 w-4" />Mark All Read
            </Button>
          )}
        </div>
      </div>

      {/* Filter Bar */}
      <Card className="border-0 shadow-sm mt-4">
        <CardContent className="p-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-muted-foreground" />
              <span className="text-xs font-medium text-muted-foreground">Filters:</span>
            </div>

            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="w-[160px] h-8 text-xs"><SelectValue placeholder="Category" /></SelectTrigger>
              <SelectContent>
                {CATEGORY_OPTIONS.map(opt => (
                  <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={readFilter} onValueChange={setReadFilter}>
              <SelectTrigger className="w-[120px] h-8 text-xs"><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                {READ_OPTIONS.map(opt => (
                  <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <DateRangePicker from={startDate || undefined} to={endDate || undefined} onChange={(f, t) => { setStartDate(f || ''); setEndDate(t || ''); }} />

            {hasActiveFilters && (
              <Button variant="ghost" size="sm" className="h-8 text-xs gap-1" onClick={clearFilters}>
                <X className="h-3 w-3" />Clear
              </Button>
            )}

            <div className="ml-auto flex items-center gap-2">
              {/* Bulk actions */}
              {selectedIds.size > 0 && (
                <>
                  <span className="text-xs text-muted-foreground">{selectedIds.size} selected</span>
                  <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={markSelectedRead}>
                    <Check className="h-3 w-3" />Mark Read
                  </Button>
                  <Button variant="destructive" size="sm" className="h-7 text-xs gap-1" onClick={deleteSelected}>
                    <Trash2 className="h-3 w-3" />Delete
                  </Button>
                </>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Notification List */}
      {loading ? (
        <LoadingSkeleton />
      ) : notifications.length === 0 ? (
        <Card className="border-0 shadow-sm mt-4">
          <CardContent className="py-16">
            <EmptyState
              icon={Bell}
              title={hasActiveFilters ? 'No matching notifications' : 'No notifications'}
              description={hasActiveFilters
                ? 'Try adjusting your filters to find what you\'re looking for.'
                : 'You\'re all caught up! New notifications will appear here.'}
            />
          </CardContent>
        </Card>
      ) : (
        <div className="mt-4 space-y-2">
          {/* Select all bar */}
          <div className="flex items-center gap-3 px-2 py-1.5">
            <Checkbox checked={allSelected} onCheckedChange={toggleSelectAll} />
            <span className="text-xs text-muted-foreground">Select all ({notifications.length})</span>
            <div className="ml-auto">
              {notifications.some(n => n.isRead) && (
                <Button variant="ghost" size="sm" className="h-7 text-xs gap-1 text-muted-foreground hover:text-red-500" onClick={deleteAllRead}>
                  <Trash2 className="h-3 w-3" />Delete all read
                </Button>
              )}
            </div>
          </div>

          {/* Notification items */}
          {notifications.map(n => {
            const Icon = TYPE_ICONS[n.type] || MessageSquare;
            const colorClass = TYPE_COLORS[n.type] || TYPE_COLORS.info;
            const isExpanded = expandedId === n.id;
            const isSelected = selectedIds.has(n.id);

            return (
              <Card
                key={n.id}
                className={`border-0 shadow-sm transition-all hover:shadow-md dark:bg-card ${
                  !n.isRead ? 'border-l-4 border-l-emerald-500 dark:border-l-emerald-400' : 'opacity-75'
                } ${isSelected ? 'ring-2 ring-emerald-500/50' : ''}`}
              >
                <CardContent className="p-0">
                  <div className="flex items-start gap-3 p-4">
                    {/* Checkbox */}
                    <div className="flex items-center pt-1">
                      <Checkbox checked={isSelected} onCheckedChange={() => toggleSelect(n.id)} />
                    </div>

                    {/* Type icon */}
                    <button className="shrink-0 mt-0.5" onClick={() => toggleRead(n)} title={n.isRead ? 'Mark as unread' : 'Mark as read'}>
                      <div className={`h-9 w-9 rounded-lg flex items-center justify-center ${colorClass}`}>
                        <Icon className="h-4 w-4" />
                      </div>
                    </button>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div
                        className="cursor-pointer"
                        onClick={() => setExpandedId(isExpanded ? null : n.id)}
                      >
                        <div className="flex items-center gap-2">
                          <p className={`text-sm ${!n.isRead ? 'font-semibold' : 'font-medium text-muted-foreground'}`}>{n.title}</p>
                          {!n.isRead && <span className="h-2 w-2 rounded-full bg-emerald-500 shrink-0" />}
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0 ml-auto shrink-0 font-normal">
                            {n.type.replace(/_/g, ' ')}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{n.message}</p>
                        <p className="text-[11px] text-muted-foreground/60 mt-1">{timeAgo(n.createdAt)}</p>
                      </div>

                      {/* Expanded detail */}
                      {isExpanded && (
                        <div className="mt-3 pt-3 border-t border-border/50 space-y-3 animate-in fade-in-0 slide-in-from-top-1 duration-200">
                          <div className="rounded-lg bg-muted/40 border p-4">
                            <p className="text-sm leading-relaxed">{n.message}</p>
                          </div>
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                            <div className="space-y-1">
                              <span className="text-muted-foreground">Type</span>
                              <Badge variant="outline" className="text-[10px] uppercase tracking-wider font-semibold">
                                {n.type.replace(/_/g, ' ')}
                              </Badge>
                            </div>
                            {n.entityType && (
                              <div className="space-y-1">
                                <span className="text-muted-foreground">Entity</span>
                                <Badge variant="outline" className="text-[10px] uppercase tracking-wider">
                                  {n.entityType.replace(/_/g, ' ')}
                                </Badge>
                              </div>
                            )}
                            <div className="space-y-1">
                              <span className="text-muted-foreground">Status</span>
                              <div className="flex items-center gap-1.5">
                                <span className={`h-2 w-2 rounded-full ${n.isRead ? 'bg-muted-foreground/40' : 'bg-emerald-500'}`} />
                                <span className="font-medium">{n.isRead ? 'Read' : 'Unread'}</span>
                              </div>
                            </div>
                            <div className="space-y-1">
                              <span className="text-muted-foreground">Received</span>
                              <span className="font-medium">
                                {n.createdAt ? format(new Date(n.createdAt), 'MMM d, yyyy \'at\' h:mm a') : '—'}
                              </span>
                            </div>
                          </div>

                          {/* Action buttons */}
                          <div className="flex items-center gap-2 pt-1">
                            <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => toggleRead(n)}>
                              {n.isRead ? <><EyeOff className="h-3 w-3" />Mark Unread</> : <><Check className="h-3 w-3" />Mark Read</>}
                            </Button>
                            {n.actionUrl && (
                              <Button size="sm" className="h-7 text-xs gap-1" onClick={() => goToAction(n)}>
                                <ExternalLink className="h-3 w-3" />View Details
                              </Button>
                            )}
                            <Button size="sm" variant="destructive" className="h-7 text-xs gap-1 ml-auto" onClick={e => deleteNotification(n.id, e)}>
                              <Trash2 className="h-3 w-3" />Delete
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Quick delete (collapsed) */}
                    {!isExpanded && (
                      <button
                        className="shrink-0 p-1.5 rounded-md hover:bg-red-50 dark:hover:bg-red-950/30 text-muted-foreground hover:text-red-500 transition-colors"
                        onClick={e => deleteNotification(n.id, e)}
                        title="Delete notification"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}

          {/* Pagination */}
          {pagination.totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 pt-4">
              <Button
                variant="outline"
                size="sm"
                className="h-8 text-xs"
                disabled={pagination.page <= 1}
                onClick={() => setPagination(p => ({ ...p, page: p.page - 1 }))}
              >
                Previous
              </Button>
              <span className="text-xs text-muted-foreground">
                Page {pagination.page} of {pagination.totalPages} ({pagination.total} total)
              </span>
              <Button
                variant="outline"
                size="sm"
                className="h-8 text-xs"
                disabled={pagination.page >= pagination.totalPages}
                onClick={() => setPagination(p => ({ ...p, page: p.page + 1 }))}
              >
                Next
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// AUDIT LOGS
// ============================================================================

export function AuditLogsPage() {
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [entityFilter, setEntityFilter] = useState('all');
  const [actionFilter, setActionFilter] = useState('all');

  const fetchLogs = useCallback((entity: string, action: string) => {
    let url = '/api/audit-logs';
    const params: string[] = [];
    if (entity !== 'all') params.push(`entityType=${entity}`);
    if (action !== 'all') params.push(`action=${action}`);
    if (params.length) url += '?' + params.join('&');
    api.get<any[]>(url).then(res => { if (res.success && res.data) setLogs(Array.isArray(res.data) ? res.data : []); setLoading(false); });
  }, []);

  useEffect(() => { fetchLogs(entityFilter, actionFilter); }, [entityFilter, actionFilter, fetchLogs]);

  const handleEntityChange = (value: string) => { setLoading(true); setEntityFilter(value); };
  const handleActionChange = (value: string) => { setLoading(true); setActionFilter(value); };

  const actionColors: Record<string, string> = {
    create: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
    update: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
    delete: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  };

  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (loading) return <LoadingSkeleton />;

  return (
    <div className="page-content">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Audit Logs</h1>
        <p className="text-muted-foreground text-sm mt-1">Track all system changes and actions</p>
      </div>
      <div className="filter-row flex flex-wrap gap-3">
        <Select value={entityFilter} onValueChange={handleEntityChange}>
          <SelectTrigger className="w-[180px]"><SelectValue placeholder="Entity Type" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Entities</SelectItem>
            <SelectItem value="maintenance_request">Maintenance Request</SelectItem>
            <SelectItem value="work_order">Work Order</SelectItem>
            <SelectItem value="user">User</SelectItem>
            <SelectItem value="role">Role</SelectItem>
            <SelectItem value="plant">Plant</SelectItem>
            <SelectItem value="department">Department</SelectItem>
            <SelectItem value="asset">Asset</SelectItem>
          </SelectContent>
        </Select>
        <Select value={actionFilter} onValueChange={handleActionChange}>
          <SelectTrigger className="w-[150px]"><SelectValue placeholder="Action" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Actions</SelectItem>
            <SelectItem value="create">Create</SelectItem>
            <SelectItem value="update">Update</SelectItem>
            <SelectItem value="delete">Delete</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <Card className="border-0 shadow-sm dark:bg-card overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Timestamp</TableHead>
                <TableHead>User</TableHead>
                <TableHead>Action</TableHead>
                <TableHead className="hidden md:table-cell">Entity Type</TableHead>
                <TableHead className="hidden md:table-cell">Entity ID</TableHead>
                <TableHead className="w-10"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {logs.length === 0 ? (
                <TableRow><TableCell colSpan={6} className="h-48"><EmptyState icon={Eye} title="No audit logs" description="No logs match your filter criteria." /></TableCell></TableRow>
              ) : logs.map(log => (
                <React.Fragment key={log.id}>
                  <TableRow className="cursor-pointer" onClick={() => setExpandedId(expandedId === log.id ? null : log.id)}>
                    <TableCell className="text-xs text-muted-foreground">{formatDateTime(log.createdAt)}</TableCell>
                    <TableCell className="text-sm">{(log as any).user?.fullName || log.userId || '-'}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={`text-[10px] ${actionColors[log.action] || ''}`}>{log.action?.toUpperCase()}</Badge>
                    </TableCell>
                    <TableCell className="text-xs font-mono hidden md:table-cell">{log.entityType || '-'}</TableCell>
                    <TableCell className="text-xs font-mono hidden md:table-cell">{log.entityId ? log.entityId.slice(0, 8) + '...' : '-'}</TableCell>
                    <TableCell>
                      <Button variant="ghost" size="icon" className="h-7 w-7">
                        <ChevronDown className={`h-3.5 w-3.5 transition-transform ${expandedId === log.id ? 'rotate-180' : ''}`} />
                      </Button>
                    </TableCell>
                  </TableRow>
                  {expandedId === log.id && (
                    <TableRow>
                      <TableCell colSpan={6} className="bg-muted/30 px-8 py-3">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          {log.oldValues && (
                            <div>
                              <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1">Old Values</p>
                              <pre className="text-xs bg-background rounded-lg p-3 overflow-x-auto max-h-40 dark:bg-card">{typeof log.oldValues === 'string' ? log.oldValues : JSON.stringify(log.oldValues, null, 2)}</pre>
                            </div>
                          )}
                          {log.newValues && (
                            <div>
                              <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1">New Values</p>
                              <pre className="text-xs bg-background rounded-lg p-3 overflow-x-auto max-h-40 dark:bg-card">{typeof log.newValues === 'string' ? log.newValues : JSON.stringify(log.newValues, null, 2)}</pre>
                            </div>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                </React.Fragment>
              ))}
            </TableBody>
          </Table>
        </div>
      </Card>
    </div>
  );
}

// ============================================================================
// ASSETS PAGE
// ============================================================================

// General/Notifications/Integrations/Backup
export function SettingsGeneralPage() {
  const [profile, setProfile] = useState<CompanyProfile>(defaultCompanyProfile);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [workOrderDefaults, setWorkOrderDefaults] = useState({
    safetyNotes: '',
    ppeRequired: '',
    notes: '',
  });
  const [savingWorkOrderDefaults, setSavingWorkOrderDefaults] = useState(false);

  useEffect(() => {
    Promise.all([
      api.get<CompanyProfile>('/api/company-profile'),
      api.get<{ safetyNotes: string; ppeRequired: string; notes: string }>('/api/settings/work-order-defaults'),
    ]).then(([profileRes, defaultsRes]) => {
      if (profileRes.success && profileRes.data) {
        setProfile(prev => ({ ...prev, ...profileRes.data }));
      }
      if (defaultsRes.success && defaultsRes.data) {
        setWorkOrderDefaults({
          safetyNotes: defaultsRes.data.safetyNotes || '',
          ppeRequired: defaultsRes.data.ppeRequired || '',
          notes: defaultsRes.data.notes || '',
        });
      }
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const handleChange = (field: keyof CompanyProfile, value: string) => {
    setProfile(prev => ({ ...prev, [field]: value }));
  };

  const handleSave = async () => {
    if (!profile.companyName.trim()) { toast.error('Company name is required'); return; }
    setSaving(true);
    try {
      const res = await api.put('/api/company-profile', {
        companyName: profile.companyName,
        tradingName: profile.tradingName,
        address: profile.address,
        city: profile.city,
        region: profile.region,
        country: profile.country,
        postalCode: profile.postalCode,
        phone: profile.phone,
        email: profile.email,
        website: profile.website,
        industry: profile.industry,
        employeeCount: profile.employeeCount,
        fiscalYearStart: profile.fiscalYearStart,
        timezone: profile.timezone,
        currency: profile.currency,
        dateFormat: profile.dateFormat,
      });
      if (res.success) {
        toast.success('General settings saved');
      } else {
        toast.error(res.error || 'Failed to save settings');
      }
    } catch {
      toast.error('Failed to save settings');
    }
    setSaving(false);
  };

  const handleSaveWorkOrderDefaults = async () => {
    setSavingWorkOrderDefaults(true);
    try {
      const res = await api.put('/api/settings/work-order-defaults', workOrderDefaults);
      if (res.success) {
        toast.success('Work order form defaults saved');
      } else {
        toast.error(res.error || 'Failed to save work order defaults');
      }
    } catch {
      toast.error('Failed to save work order defaults');
    }
    setSavingWorkOrderDefaults(false);
  };

  if (loading) {
    return (
      <div className="page-content flex items-center justify-center min-h-[40vh]">
        <div className="text-center"><RefreshCw className="h-6 w-6 animate-spin mx-auto mb-2 text-muted-foreground" /><p className="text-sm text-muted-foreground">Loading settings…</p></div>
      </div>
    );
  }

  return (
    <div className="page-content">
      <div><h1 className="text-2xl font-bold tracking-tight">General Settings</h1><p className="text-muted-foreground mt-1">Configure system-wide preferences and defaults</p></div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="lg:col-span-2 border-amber-200 dark:border-amber-900/50">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2"><ClipboardList className="h-4 w-4" />Work Order Form Defaults</CardTitle>
            <CardDescription>
              Optional defaults copied into new work orders and Maintenance Request → Work Order conversion forms. Planners can edit them for each job. Leave a field empty to use no default.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Default Safety Notes</Label>
              <Textarea
                rows={3}
                value={workOrderDefaults.safetyNotes}
                onChange={e => setWorkOrderDefaults(current => ({ ...current, safetyNotes: e.target.value }))}
                placeholder="Example: isolate equipment and follow the approved LOTO procedure before work begins."
              />
            </div>
            <div className="space-y-2">
              <Label>Default PPE Required</Label>
              <Input
                value={workOrderDefaults.ppeRequired}
                onChange={e => setWorkOrderDefaults(current => ({ ...current, ppeRequired: e.target.value }))}
                placeholder="Example: helmet, safety glasses, gloves, safety boots"
              />
            </div>
            <div className="space-y-2">
              <Label>Default General Notes</Label>
              <Textarea
                rows={2}
                value={workOrderDefaults.notes}
                onChange={e => setWorkOrderDefaults(current => ({ ...current, notes: e.target.value }))}
                placeholder="Optional standing instructions for newly planned work orders"
              />
            </div>
            <div className="flex justify-end">
              <Button onClick={handleSaveWorkOrderDefaults} disabled={savingWorkOrderDefaults} className="bg-emerald-600 hover:bg-emerald-700 text-white">
                {savingWorkOrderDefaults ? <RefreshCw className="h-4 w-4 mr-1.5 animate-spin" /> : <Save className="h-4 w-4 mr-1.5" />}
                Save Work Order Defaults
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Company Info */}
        <Card>
          <CardHeader><CardTitle className="text-base">Company Info</CardTitle><CardDescription>Organization identification and address</CardDescription></CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2"><Label>Company Name *</Label><Input value={profile.companyName || ''} onChange={e => handleChange('companyName', e.target.value)} placeholder="Legal company name" /></div>
            <div className="space-y-2"><Label>Trading Name</Label><Input value={profile.tradingName || ''} onChange={e => handleChange('tradingName', e.target.value)} placeholder="Display / brand name" /></div>
            <div className="space-y-2"><Label>Address</Label><Textarea value={profile.address || ''} onChange={e => handleChange('address', e.target.value)} placeholder="Street address" rows={2} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2"><Label>City</Label><Input value={profile.city || ''} onChange={e => handleChange('city', e.target.value)} placeholder="City" /></div>
              <div className="space-y-2"><Label>Region / State</Label><Input value={profile.region || ''} onChange={e => handleChange('region', e.target.value)} placeholder="Region" /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2"><Label>Country</Label><Input value={profile.country || ''} onChange={e => handleChange('country', e.target.value)} placeholder="Country" /></div>
              <div className="space-y-2"><Label>Postal Code</Label><Input value={profile.postalCode || ''} onChange={e => handleChange('postalCode', e.target.value)} placeholder="Postal code" /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2"><Label>Phone</Label><Input value={profile.phone || ''} onChange={e => handleChange('phone', e.target.value)} placeholder="+233 XX XXX XXXX" /></div>
              <div className="space-y-2"><Label>Email</Label><Input type="email" value={profile.email || ''} onChange={e => handleChange('email', e.target.value)} placeholder="info@company.com" /></div>
            </div>
            <div className="space-y-2"><Label>Website</Label><Input value={profile.website || ''} onChange={e => handleChange('website', e.target.value)} placeholder="https://www.company.com" /></div>
          </CardContent>
        </Card>

        {/* Business Details */}
        <Card>
          <CardHeader><CardTitle className="text-base">Business Details</CardTitle><CardDescription>Industry and organization information</CardDescription></CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Industry</Label>
              <Select value={profile.industry || ''} onValueChange={v => handleChange('industry', v)}>
                <SelectTrigger><SelectValue placeholder="Select industry" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="manufacturing">Manufacturing</SelectItem>
                  <SelectItem value="energy">Energy &amp; Utilities</SelectItem>
                  <SelectItem value="construction">Construction</SelectItem>
                  <SelectItem value="healthcare">Healthcare</SelectItem>
                  <SelectItem value="transportation">Transportation &amp; Logistics</SelectItem>
                  <SelectItem value="mining">Mining &amp; Resources</SelectItem>
                  <SelectItem value="oil_gas">Oil &amp; Gas</SelectItem>
                  <SelectItem value="telecommunications">Telecommunications</SelectItem>
                  <SelectItem value="food_beverage">Food &amp; Beverage</SelectItem>
                  <SelectItem value="pharmaceutical">Pharmaceutical</SelectItem>
                  <SelectItem value="real_estate">Real Estate &amp; Facilities</SelectItem>
                  <SelectItem value="government">Government &amp; Public Sector</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Number of Employees</Label>
              <Select value={profile.employeeCount || ''} onValueChange={v => handleChange('employeeCount', v)}>
                <SelectTrigger><SelectValue placeholder="Select range" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="1-10">1 - 10</SelectItem>
                  <SelectItem value="11-50">11 - 50</SelectItem>
                  <SelectItem value="51-200">51 - 200</SelectItem>
                  <SelectItem value="201-500">201 - 500</SelectItem>
                  <SelectItem value="501-1000">501 - 1,000</SelectItem>
                  <SelectItem value="1001-5000">1,001 - 5,000</SelectItem>
                  <SelectItem value="5001+">5,001+</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Fiscal Year Start</Label>
              <Select value={profile.fiscalYearStart || 'January'} onValueChange={v => handleChange('fiscalYearStart', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {['January','February','March','April','May','June','July','August','September','October','November','December'].map(m => (
                    <SelectItem key={m} value={m}>{m}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Separator />

            {/* System Information */}
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">System Information</p>
              {[
                { label: 'Version', value: '2.0.0' },
                { label: 'Environment', value: 'Production' },
                { label: 'Database', value: 'MySQL' },
              ].map(r => (
                <div key={r.label} className="flex justify-between items-center py-2 border-b last:border-0"><span className="text-sm text-muted-foreground">{r.label}</span><span className="text-sm font-medium">{r.value}</span></div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Display Settings */}
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle className="text-base">Display Settings</CardTitle><CardDescription>Regional preferences, locale, and formatting</CardDescription></CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="space-y-2">
                <Label>Timezone</Label>
                <Select value={profile.timezone || 'UTC'} onValueChange={v => handleChange('timezone', v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="UTC">UTC</SelectItem>
                    <SelectItem value="Africa/Accra">GMT (Africa/Accra)</SelectItem>
                    <SelectItem value="Africa/Lagos">WAT (Africa/Lagos)</SelectItem>
                    <SelectItem value="America/New_York">Eastern Time</SelectItem>
                    <SelectItem value="America/Chicago">Central Time</SelectItem>
                    <SelectItem value="America/Denver">Mountain Time</SelectItem>
                    <SelectItem value="America/Los_Angeles">Pacific Time</SelectItem>
                    <SelectItem value="Europe/London">London (GMT)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Currency</Label>
                <div className="h-10 border border-input bg-muted px-3 flex items-center text-sm text-muted-foreground rounded-md">₵ — Ghana Cedis</div>
              </div>
              <div className="space-y-2">
                <Label>Date Format</Label>
                <Select value={profile.dateFormat || 'DD/MM/YYYY'} onValueChange={v => handleChange('dateFormat', v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="DD/MM/YYYY">DD/MM/YYYY</SelectItem>
                    <SelectItem value="MM/DD/YYYY">MM/DD/YYYY</SelectItem>
                    <SelectItem value="YYYY-MM-DD">YYYY-MM-DD</SelectItem>
                    <SelectItem value="DD-MMM-YYYY">DD-MMM-YYYY</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Language</Label>
                <Select value="en" onValueChange={() => { /* placeholder for future i18n */ }}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="en">English</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Email Configuration (SMTP) — only visible to admins / system_settings.update */}
      <SmtpConfigCard />

      {/* Escalation Settings — only visible to admins */}
      <EscalationSettingsCard />

      <Button onClick={handleSave} disabled={saving}>{saving ? <><RefreshCw className="h-4 w-4 mr-2 animate-spin" />Saving...</> : 'Save Changes'}</Button>
    </div>
  );
}

// ─── SMTP Configuration Card ─────────────────────────────────────────────────
interface SmtpConfig {
  host: string;
  port: string;
  secure: boolean;
  user: string;
  pass: string;
  from: string;
}

function SmtpConfigCard() {
  const { hasPermission: hp, isAdmin: isAdm, user } = useAuthStore();
  const canManage = hp('system_settings.update') || isAdm();

  const [smtp, setSmtp] = useState<SmtpConfig>({
    host: '',
    port: '587',
    secure: false,
    user: '',
    pass: '',
    from: '',
  });
  const [showPass, setShowPass] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [sendingTest, setSendingTest] = useState(false);
  const [connStatus, setConnStatus] = useState<'idle' | 'success' | 'fail' | 'testing'>('idle');
  const [testEmailStatus, setTestEmailStatus] = useState<'idle' | 'success' | 'fail'>('idle');

  useEffect(() => {
    api.get<SmtpConfig>('/api/settings/smtp-config').then(res => {
      if (res.success && res.data) {
        setSmtp(prev => ({ ...prev, ...res.data, pass: '' }));
      }
    });
  }, []);

  const handleSaveSmtp = async () => {
    setSaving(true);
    const res = await api.put('/api/settings/smtp-config', smtp);
    if (res.success) {
      toast.success('SMTP configuration saved');
    } else {
      toast.error(res.error || 'Failed to save SMTP config');
    }
    setSaving(false);
  };

  const handleTestConnection = async () => {
    setConnStatus('testing');
    try {
      const res = await api.get('/api/settings/smtp-status');
      if (res.success && (res.data as any)?.connected) {
        setConnStatus('success');
        toast.success('SMTP connection successful');
      } else {
        setConnStatus('fail');
        toast.error('SMTP connection failed');
      }
    } catch {
      setConnStatus('fail');
      toast.error('Unable to test SMTP connection');
    }
  };

  const handleSendTestEmail = async () => {
    setSendingTest(true);
    setTestEmailStatus('idle');
    try {
      const res = await api.post('/api/settings/test-email', { email: user?.email });
      if (res.success) {
        setTestEmailStatus('success');
        toast.success(res.message || 'Test email sent');
      } else {
        setTestEmailStatus('fail');
        toast.error(res.error || 'Failed to send test email');
      }
    } catch {
      setTestEmailStatus('fail');
      toast.error('Failed to send test email');
    }
    setSendingTest(false);
  };

  if (!canManage) return null;

  return (
    <Card className="lg:col-span-2">
      <CardHeader>
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-lg bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
            <Mail className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
          </div>
          <div>
            <CardTitle className="text-base">Email Configuration (SMTP)</CardTitle>
            <CardDescription>Configure outgoing email for system notifications</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <div className="space-y-2">
            <Label>SMTP Host</Label>
            <Input
              value={smtp.host}
              onChange={e => setSmtp(s => ({ ...s, host: e.target.value }))}
              placeholder="smtp.example.com"
            />
          </div>
          <div className="space-y-2">
            <Label>SMTP Port</Label>
            <Input
              value={smtp.port}
              onChange={e => setSmtp(s => ({ ...s, port: e.target.value }))}
              placeholder="587"
            />
          </div>
          <div className="space-y-2">
            <Label>From Email</Label>
            <Input
              value={smtp.from}
              onChange={e => setSmtp(s => ({ ...s, from: e.target.value }))}
              placeholder="noreply@company.com"
            />
          </div>
          <div className="space-y-2">
            <Label>Username</Label>
            <Input
              value={smtp.user}
              onChange={e => setSmtp(s => ({ ...s, user: e.target.value }))}
              placeholder="SMTP username"
            />
          </div>
          <div className="space-y-2">
            <Label>Password</Label>
            <div className="relative">
              <Input
                type={showPass ? 'text' : 'password'}
                value={smtp.pass}
                onChange={e => setSmtp(s => ({ ...s, pass: e.target.value }))}
                placeholder="••••••••"
              />
              <button
                type="button"
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                onClick={() => setShowPass(v => !v)}
              >
                {showPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>
          <div className="flex items-end gap-3">
            <div className="flex items-center gap-2">
              <Switch
                checked={smtp.secure}
                onCheckedChange={v => setSmtp(s => ({ ...s, secure: v }))}
              />
              <Label>Use SSL/TLS</Label>
            </div>
          </div>
        </div>

        <Separator />

        <div className="flex flex-wrap items-center gap-3">
          <Button
            onClick={handleSaveSmtp}
            disabled={saving}
            size="sm"
            className="bg-emerald-600 hover:bg-emerald-700 text-white"
          >
            {saving ? <RefreshCw className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Save className="h-3.5 w-3.5 mr-1.5" />}
            Save SMTP Config
          </Button>
          <Button
            onClick={handleTestConnection}
            disabled={testing || !smtp.host}
            variant="outline"
            size="sm"
          >
            {testing ? <RefreshCw className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Wifi className="h-3.5 w-3.5 mr-1.5" />}
            Test Connection
          </Button>
          <Button
            onClick={handleSendTestEmail}
            disabled={sendingTest || !smtp.host}
            variant="outline"
            size="sm"
          >
            {sendingTest ? <RefreshCw className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Send className="h-3.5 w-3.5 mr-1.5" />}
            Send Test Email
          </Button>

          {/* Connection status indicators */}
          {connStatus === 'success' && (
            <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 gap-1">
              <CheckCircle2 className="h-3 w-3" /> Connected
            </Badge>
          )}
          {connStatus === 'fail' && (
            <Badge className="bg-red-100 text-red-700 border-red-200 gap-1">
              <XCircle className="h-3 w-3" /> Connection Failed
            </Badge>
          )}
          {testEmailStatus === 'success' && (
            <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 gap-1">
              <CheckCircle2 className="h-3 w-3" /> Email Sent
            </Badge>
          )}
          {testEmailStatus === 'fail' && (
            <Badge className="bg-red-100 text-red-700 border-red-200 gap-1">
              <XCircle className="h-3 w-3" /> Email Failed
            </Badge>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Escalation Settings Card ──────────────────────────────────────────────
interface EscalationConfigData {
  enabled: boolean;
  maintenanceRequests: { enabled: boolean; level1ThresholdHours: number; level2ThresholdHours: number; cooldownMinutes: number };
  workOrders: { enabled: boolean; level1ThresholdHours: number; level2ThresholdHours: number; cooldownMinutes: number };
  safetyIncidents: { enabled: boolean; level1ThresholdHours: number; level2ThresholdHours: number; cooldownMinutes: number };
  lastCheckAt: string | null;
  lastCheckResults: {
    maintenanceRequests: { checked: number; level1: number; level2: number; skipped: number };
    workOrders: { checked: number; level1: number; level2: number; skipped: number };
    safetyIncidents: { checked: number; level1: number; level2: number; skipped: number };
  } | null;
}

function EscalationSettingsCard() {
  const { hasPermission: hp, isAdmin: isAdm } = useAuthStore();
  const canManage = hp('system_settings.update') || isAdm();

  const [config, setConfig] = useState<EscalationConfigData>({
    enabled: true,
    maintenanceRequests: { enabled: true, level1ThresholdHours: 24, level2ThresholdHours: 48, cooldownMinutes: 360 },
    workOrders: { enabled: true, level1ThresholdHours: 0, level2ThresholdHours: 48, cooldownMinutes: 360 },
    safetyIncidents: { enabled: true, level1ThresholdHours: 4, level2ThresholdHours: 8, cooldownMinutes: 240 },
    lastCheckAt: null,
    lastCheckResults: null,
  });
  const [saving, setSaving] = useState(false);
  const [runningCheck, setRunningCheck] = useState(false);
  const [checkResult, setCheckResult] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    api.get<EscalationConfigData>('/api/escalation/config').then(res => {
      if (res.success && res.data) setConfig(res.data as EscalationConfigData);
      setLoaded(true);
    });
  }, []);

  const handleSave = async () => {
    setSaving(true);
    const res = await api.put('/api/escalation/config', config);
    if (res.success) {
      toast.success('Escalation settings saved');
    } else {
      toast.error(res.error || 'Failed to save escalation settings');
    }
    setSaving(false);
  };

  const handleRunCheck = async () => {
    setRunningCheck(true);
    setCheckResult(null);
    try {
      const res = await api.post<{ message: string; results: NonNullable<EscalationConfigData['lastCheckResults']> }>('/api/escalation/check');
      if (res.success && res.data) {
        setCheckResult(res.data.message || 'Check complete');
        toast.success(res.data.message || 'Escalation check complete');
        // Refresh config to get updated lastCheckAt
        api.get<EscalationConfigData>('/api/escalation/config').then(r => {
          if (r.success && r.data) setConfig(r.data as EscalationConfigData);
        });
      } else {
        setCheckResult(res.error || 'Check failed');
        toast.error(res.error || 'Escalation check failed');
      }
    } catch (err: any) {
      setCheckResult(err.message || 'Check failed');
      toast.error('Failed to run escalation check');
    }
    setRunningCheck(false);
  };

  if (!canManage || !loaded) return null;

  const totalEscalated = config.lastCheckResults
    ? (config.lastCheckResults.maintenanceRequests.level1 + config.lastCheckResults.maintenanceRequests.level2
      + config.lastCheckResults.workOrders.level1 + config.lastCheckResults.workOrders.level2
      + config.lastCheckResults.safetyIncidents.level1 + config.lastCheckResults.safetyIncidents.level2)
    : 0;

  return (
    <Card className="mt-6">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              Escalation Settings
            </CardTitle>
            <CardDescription>Auto-escalate overdue maintenance requests, work orders, and safety incidents</CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Label htmlFor="esc-enabled" className="text-sm">Auto-Escalation</Label>
            <Switch
              id="esc-enabled"
              checked={config.enabled}
              onCheckedChange={v => setConfig(c => ({ ...c, enabled: v }))}
            />
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* Summary of last check */}
        {config.lastCheckAt && (
          <div className="rounded-lg border border-border/60 bg-muted/30 p-3 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Last check</span>
              <span className="font-medium">{new Date(config.lastCheckAt).toLocaleString()}</span>
            </div>
            {config.lastCheckResults && (
              <>
                <div className="grid grid-cols-3 gap-3">
                  <div className="text-center">
                    <p className="text-lg font-bold text-amber-600">{config.lastCheckResults.maintenanceRequests.level1 + config.lastCheckResults.maintenanceRequests.level2}</p>
                    <p className="text-[10px] text-muted-foreground">MR Escalated</p>
                  </div>
                  <div className="text-center">
                    <p className="text-lg font-bold text-orange-600">{config.lastCheckResults.workOrders.level1 + config.lastCheckResults.workOrders.level2}</p>
                    <p className="text-[10px] text-muted-foreground">WO Escalated</p>
                  </div>
                  <div className="text-center">
                    <p className="text-lg font-bold text-red-600">{config.lastCheckResults.safetyIncidents.level1 + config.lastCheckResults.safetyIncidents.level2}</p>
                    <p className="text-[10px] text-muted-foreground">Safety Escalated</p>
                  </div>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Total items checked</span>
                  <span className="font-medium">{config.lastCheckResults.maintenanceRequests.checked + config.lastCheckResults.workOrders.checked + config.lastCheckResults.safetyIncidents.checked}</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Total skipped (cooldown)</span>
                  <span className="font-medium">{config.lastCheckResults.maintenanceRequests.skipped + config.lastCheckResults.workOrders.skipped + config.lastCheckResults.safetyIncidents.skipped}</span>
                </div>
              </>
            )}
          </div>
        )}

        <Separator />

        {/* Threshold Configuration */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Maintenance Requests */}
          <div className="space-y-3 rounded-lg border border-border/60 p-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold">Maintenance Requests</p>
              <Switch
                checked={config.maintenanceRequests.enabled}
                onCheckedChange={v => setConfig(c => ({
                  ...c, maintenanceRequests: { ...c.maintenanceRequests, enabled: v },
                }))}
                className="scale-90"
              />
            </div>
            <div className="space-y-2">
              <div className="space-y-1">
                <Label className="text-xs">Level 1 (hrs) — Supervisor</Label>
                <Input
                  type="number"
                  min={1}
                  max={720}
                  value={config.maintenanceRequests.level1ThresholdHours}
                  onChange={e => setConfig(c => ({
                    ...c, maintenanceRequests: { ...c.maintenanceRequests, level1ThresholdHours: parseInt(e.target.value) || 24 },
                  }))}
                  className="h-8 text-xs"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Level 2 (hrs) — Manager</Label>
                <Input
                  type="number"
                  min={1}
                  max={720}
                  value={config.maintenanceRequests.level2ThresholdHours}
                  onChange={e => setConfig(c => ({
                    ...c, maintenanceRequests: { ...c.maintenanceRequests, level2ThresholdHours: parseInt(e.target.value) || 48 },
                  }))}
                  className="h-8 text-xs"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Cooldown (min)</Label>
                <Input
                  type="number"
                  min={30}
                  max={1440}
                  value={config.maintenanceRequests.cooldownMinutes}
                  onChange={e => setConfig(c => ({
                    ...c, maintenanceRequests: { ...c.maintenanceRequests, cooldownMinutes: parseInt(e.target.value) || 360 },
                  }))}
                  className="h-8 text-xs"
                />
              </div>
            </div>
          </div>

          {/* Work Orders */}
          <div className="space-y-3 rounded-lg border border-border/60 p-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold">Work Orders</p>
              <Switch
                checked={config.workOrders.enabled}
                onCheckedChange={v => setConfig(c => ({
                  ...c, workOrders: { ...c.workOrders, enabled: v },
                }))}
                className="scale-90"
              />
            </div>
            <div className="space-y-2">
              <div className="space-y-1">
                <Label className="text-xs">Level 1 (hrs) — Technician+Supv</Label>
                <Input
                  type="number"
                  min={0}
                  max={720}
                  value={config.workOrders.level1ThresholdHours}
                  onChange={e => setConfig(c => ({
                    ...c, workOrders: { ...c.workOrders, level1ThresholdHours: parseInt(e.target.value) || 0 },
                  }))}
                  className="h-8 text-xs"
                />
                <p className="text-[10px] text-muted-foreground">0 = based on plannedEnd only</p>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Level 2 (hrs) — Manager</Label>
                <Input
                  type="number"
                  min={1}
                  max={720}
                  value={config.workOrders.level2ThresholdHours}
                  onChange={e => setConfig(c => ({
                    ...c, workOrders: { ...c.workOrders, level2ThresholdHours: parseInt(e.target.value) || 48 },
                  }))}
                  className="h-8 text-xs"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Cooldown (min)</Label>
                <Input
                  type="number"
                  min={30}
                  max={1440}
                  value={config.workOrders.cooldownMinutes}
                  onChange={e => setConfig(c => ({
                    ...c, workOrders: { ...c.workOrders, cooldownMinutes: parseInt(e.target.value) || 360 },
                  }))}
                  className="h-8 text-xs"
                />
              </div>
            </div>
          </div>

          {/* Safety Incidents */}
          <div className="space-y-3 rounded-lg border border-red-200 dark:border-red-900/40 p-3 bg-red-50/30 dark:bg-red-950/10">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-red-700 dark:text-red-400">Safety Incidents</p>
              <Switch
                checked={config.safetyIncidents.enabled}
                onCheckedChange={v => setConfig(c => ({
                  ...c, safetyIncidents: { ...c.safetyIncidents, enabled: v },
                }))}
                className="scale-90"
              />
            </div>
            <div className="space-y-2">
              <div className="space-y-1">
                <Label className="text-xs">Level 1 (hrs) — Officer</Label>
                <Input
                  type="number"
                  min={1}
                  max={720}
                  value={config.safetyIncidents.level1ThresholdHours}
                  onChange={e => setConfig(c => ({
                    ...c, safetyIncidents: { ...c.safetyIncidents, level1ThresholdHours: parseInt(e.target.value) || 4 },
                  }))}
                  className="h-8 text-xs"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Level 2 (hrs) — Plant Manager</Label>
                <Input
                  type="number"
                  min={1}
                  max={720}
                  value={config.safetyIncidents.level2ThresholdHours}
                  onChange={e => setConfig(c => ({
                    ...c, safetyIncidents: { ...c.safetyIncidents, level2ThresholdHours: parseInt(e.target.value) || 8 },
                  }))}
                  className="h-8 text-xs"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Cooldown (min)</Label>
                <Input
                  type="number"
                  min={30}
                  max={1440}
                  value={config.safetyIncidents.cooldownMinutes}
                  onChange={e => setConfig(c => ({
                    ...c, safetyIncidents: { ...c.safetyIncidents, cooldownMinutes: parseInt(e.target.value) || 240 },
                  }))}
                  className="h-8 text-xs"
                />
              </div>
            </div>
          </div>
        </div>

        <Separator />

        {/* Action buttons */}
        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={handleSave} disabled={saving || !config.enabled} size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-white">
            {saving ? <RefreshCw className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Save className="h-3.5 w-3.5 mr-1.5" />}
            Save Settings
          </Button>
          <Button
            onClick={handleRunCheck}
            disabled={runningCheck}
            variant="outline"
            size="sm"
            className="border-amber-300 text-amber-700 hover:bg-amber-50 dark:border-amber-700 dark:text-amber-400 dark:hover:bg-amber-950/30"
          >
            {runningCheck ? <RefreshCw className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Play className="h-3.5 w-3.5 mr-1.5" />}
            Run Escalation Check Now
          </Button>
          {checkResult && (
            <p className="text-xs text-muted-foreground">{checkResult}</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export function SettingsNotificationsPage() {
  const [saving, setSaving] = useState(false);
  const [channels, setChannels] = useState(() => {
    try { const s = localStorage.getItem('iassetspro_notif_settings'); if (s) { const saved = JSON.parse(s); return saved.channels || { inApp: true, email: true, emailAddr: 'admin@company.com', sms: false, phone: '' }; } } catch { /* ignore */ }
    return { inApp: true, email: true, emailAddr: 'admin@company.com', sms: false, phone: '' };
  });
  const [quietHours, setQuietHours] = useState(() => {
    try { const s = localStorage.getItem('iassetspro_notif_settings'); if (s) { const saved = JSON.parse(s); return saved.quietHours || { enabled: false, start: '22:00', end: '07:00', timezone: 'UTC' }; } } catch { /* ignore */ }
    return { enabled: false, start: '22:00', end: '07:00', timezone: 'UTC' };
  });
  const [notifTypes, setNotifTypes] = useState(() => {
    try { const s = localStorage.getItem('iassetspro_notif_settings'); if (s) { const saved = JSON.parse(s); return saved.notifTypes || { woAssigned: true, woStatusChange: true, mrApprovedRejected: true, pmDue: true, lowStockAlert: true, assetConditionAlert: false, systemNotifications: true }; } } catch { /* ignore */ }
    return { woAssigned: true, woStatusChange: true, mrApprovedRejected: true, pmDue: true, lowStockAlert: true, assetConditionAlert: false, systemNotifications: true };
  });

  const typeLabels: Record<string, { label: string; desc: string }> = {
    woAssigned: { label: 'WO Assigned', desc: 'When a work order is assigned to you' },
    woStatusChange: { label: 'WO Status Change', desc: 'Status updates on work orders you follow' },
    mrApprovedRejected: { label: 'MR Approved/Rejected', desc: 'Maintenance request approval decisions' },
    pmDue: { label: 'PM Due', desc: 'Preventive maintenance schedule reminders' },
    lowStockAlert: { label: 'Low Stock Alert', desc: 'Inventory items below reorder point' },
    assetConditionAlert: { label: 'Asset Condition Alert', desc: 'Assets with degraded condition readings' },
    systemNotifications: { label: 'System Notifications', desc: 'System updates, maintenance windows' },
  };

  const handleSave = async () => {
    setSaving(true);
    localStorage.setItem('iassetspro_notif_settings', JSON.stringify({ channels, quietHours, notifTypes }));
    toast.success('Notification preferences saved');
    setSaving(false);
  };

  return (
    <div className="page-content">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Notification Preferences</h1>
        <p className="text-muted-foreground mt-1">Configure how and when you receive notifications</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Notification Channels */}
        <Card>
          <CardHeader><CardTitle className="text-base">Notification Channels</CardTitle><CardDescription>Choose where to receive notifications</CardDescription></CardHeader>
          <CardContent className="space-y-5">
            <div className="flex items-center justify-between">
              <div><Label className="text-sm font-medium">In-App Notifications</Label><p className="text-xs text-muted-foreground mt-0.5">Receive notifications within the application</p></div>
              <Switch checked={channels.inApp} onCheckedChange={v => setChannels(c => ({ ...c, inApp: v }))} />
            </div>
            <Separator />
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div><Label className="text-sm font-medium">Email Notifications</Label><p className="text-xs text-muted-foreground mt-0.5">Receive notifications via email</p></div>
                <Switch checked={channels.email} onCheckedChange={v => setChannels(c => ({ ...c, email: v }))} />
              </div>
              {channels.email && (
                <div className="space-y-2 pl-1"><Label className="text-xs">Email Address</Label><Input value={channels.emailAddr} onChange={e => setChannels(c => ({ ...c, emailAddr: e.target.value }))} placeholder="admin@company.com" /></div>
              )}
            </div>
            <Separator />
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div><Label className="text-sm font-medium">SMS Notifications</Label><p className="text-xs text-muted-foreground mt-0.5">Receive critical alerts via SMS</p></div>
                <Switch checked={channels.sms} onCheckedChange={v => setChannels(c => ({ ...c, sms: v }))} />
              </div>
              {channels.sms && (
                <div className="space-y-2 pl-1"><Label className="text-xs">Phone Number</Label><Input value={channels.phone} onChange={e => setChannels(c => ({ ...c, phone: e.target.value }))} placeholder="+1 234 567 8900" /></div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Quiet Hours */}
        <Card>
          <CardHeader><CardTitle className="text-base">Quiet Hours</CardTitle><CardDescription>Pause non-critical notifications during specified hours</CardDescription></CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div><Label className="text-sm font-medium">Enable Quiet Hours</Label><p className="text-xs text-muted-foreground mt-0.5">Only urgent alerts will be sent</p></div>
              <Switch checked={quietHours.enabled} onCheckedChange={v => setQuietHours(q => ({ ...q, enabled: v }))} />
            </div>
            {quietHours.enabled && (
              <>
                <div className="grid grid-cols-2 gap-4">
                  <TimePicker label="Start Time" value={quietHours.start || undefined} onChange={v => setQuietHours(q => ({ ...q, start: v }))} />
                  <TimePicker label="End Time" value={quietHours.end || undefined} onChange={v => setQuietHours(q => ({ ...q, end: v }))} />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs">Timezone</Label>
                  <Select value={quietHours.timezone} onValueChange={v => setQuietHours(q => ({ ...q, timezone: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="UTC">UTC</SelectItem>
                      <SelectItem value="America/New_York">Eastern Time</SelectItem>
                      <SelectItem value="America/Chicago">Central Time</SelectItem>
                      <SelectItem value="America/Los_Angeles">Pacific Time</SelectItem>
                      <SelectItem value="Europe/London">London (GMT)</SelectItem>
                      <SelectItem value="Africa/Accra">Accra (GMT)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Notification Types */}
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle className="text-base">Notification Types</CardTitle><CardDescription>Toggle specific notification categories</CardDescription></CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-1">
              {Object.entries(typeLabels).map(([key, { label, desc }]) => (
                <div key={key} className="flex items-center justify-between py-3 border-b last:border-0">
                  <div><Label className="text-sm font-medium">{label}</Label><p className="text-xs text-muted-foreground mt-0.5">{desc}</p></div>
                  <Switch checked={notifTypes[key as keyof typeof notifTypes]} onCheckedChange={v => setNotifTypes(n => ({ ...n, [key]: v }))} />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <Button onClick={handleSave} disabled={saving}>{saving ? <><RefreshCw className="h-4 w-4 mr-2 animate-spin" />Saving...</> : 'Save Preferences'}</Button>
    </div>
  );
}
export function SettingsIntegrationsPage() {
  const [configOpen, setConfigOpen] = useState(false);
  const [selected, setSelected] = useState<any>(null);
  const [configForm, setConfigForm] = useState({ url: '', apiKey: '', username: '', password: '', webhookUrl: '', clientId: '', clientSecret: '', senderName: '' });
  const [testSmsPhone, setTestSmsPhone] = useState('');
  const [testSmsLoading, setTestSmsLoading] = useState(false);
  const [testSmsResult, setTestSmsResult] = useState<{ success: boolean; message: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [serverConfigs, setServerConfigs] = useState<Record<string, any>>({});

  const defaultIntegrations = [
    { id: 'erp', name: 'ERP Integration', description: 'Connect to your enterprise resource planning system for data synchronization', icon: Server, connected: false, fields: ['url', 'apiKey', 'username', 'password'] },
    { id: 'iot', name: 'IoT Platform', description: 'Stream sensor data from IoT devices and gateways into iAssetsPro', icon: Cpu, connected: false, fields: ['url', 'apiKey'] },
    { id: 'email', name: 'Email Server', description: 'Configure SMTP settings for email notifications and reports delivery', icon: Mail, connected: false, fields: ['url', 'username', 'password'] },
    { id: 'sms', name: 'SMS Gateway (Hubtel)', description: 'Send critical alerts via SMS using Hubtel\'s Programmable SMS API', icon: Smartphone, connected: false, fields: ['clientId', 'clientSecret', 'senderName'], provider: 'hubtel' },
    { id: 'webhooks', name: 'Webhooks', description: 'Send real-time event notifications to external systems via webhooks', icon: Globe, connected: false, fields: ['webhookUrl'] },
    { id: 'ldap', name: 'LDAP / Active Directory', description: 'Sync users and authenticate via your organization\'s directory service', icon: Shield, connected: false, fields: ['url', 'username', 'password'] },
  ];

  const [integrations, setIntegrations] = useState(defaultIntegrations);

  useEffect(() => {
    api.get<Record<string, any>>('/api/settings/integrations').then(res => {
      if (res.success && res.data) {
        setServerConfigs(res.data);
        setIntegrations(prev => prev.map(i => ({ ...i, connected: !!res.data?.[i.id] })));
      }
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const openConfig = (integ: any) => {
    setSelected(integ);
    const stored = serverConfigs[integ.id];
    if (stored) {
      setConfigForm({ url: stored.url || '', apiKey: stored.apiKey || '', username: stored.username || '', password: stored.password || '', webhookUrl: stored.webhookUrl || '', clientId: stored.clientId || '', clientSecret: stored.clientSecret || '', senderName: stored.senderName || '' });
    } else {
      setConfigForm({ url: '', apiKey: '', username: '', password: '', webhookUrl: '', clientId: '', clientSecret: '', senderName: '' });
    }
    setTestSmsPhone('');
    setTestSmsResult(null);
    setConfigOpen(true);
  };

  const handleSave = async () => {
    if (!selected) return;
    setSaving(true);
    try {
      const res = await api.put('/api/settings/integrations', {
        integrationId: selected.id,
        config: { ...configForm, connected: true },
      });
      if (res.success) {
        setServerConfigs(prev => ({ ...prev, [selected.id]: { ...configForm, connected: true } }));
        setIntegrations(prev => prev.map(i => i.id === selected.id ? { ...i, connected: true } : i));
        toast.success(`${selected.name} configuration saved`);
      } else {
        toast.error(res.error || 'Failed to save configuration');
      }
    } catch {
      toast.error('Failed to save configuration');
    }
    setConfigOpen(false);
    setSelected(null);
    setSaving(false);
  };

  if (loading) return <LoadingSkeleton />;

  return (
    <div className="page-content">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Integrations</h1>
        <p className="text-muted-foreground mt-1">Connect with third-party systems and external services</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {integrations.map(integ => {
          const I = integ.icon;
          return (
            <Card key={integ.id} className="hover:shadow-md transition-shadow">
              <CardContent className="p-5">
                <div className="flex items-start gap-4">
                  <div className={`h-10 w-10 rounded-lg flex items-center justify-center ${integ.connected ? 'bg-emerald-50 dark:bg-emerald-900/30' : 'bg-muted'}`}>
                    <I className={`h-5 w-5 ${integ.connected ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground'}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-semibold text-sm">{integ.name}</h3>
                      <Badge variant="outline" className={`text-[10px] ${integ.connected ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-slate-50 text-slate-500 border-slate-200'}`}>
                        {integ.connected ? (
                          <span className="flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />Connected</span>
                        ) : 'Not Connected'}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mb-3 line-clamp-2">{integ.description}</p>
                    <Button variant={integ.connected ? 'outline' : 'default'} size="sm" className={integ.connected ? '' : 'bg-emerald-600 hover:bg-emerald-700 text-white'} onClick={() => openConfig(integ)}>
                      {integ.connected ? <><Settings className="h-3.5 w-3.5 mr-1" />Configure</> : <><Link2 className="h-3.5 w-3.5 mr-1" />Connect</>}
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Configure Dialog */}
      <ResponsiveDialog open={configOpen} onOpenChange={setConfigOpen}>
        
          <div className="space-y-1.5 mb-4">
            <h2 className="text-lg font-semibold leading-none tracking-tight">{selected?.connected ? 'Configure' : 'Connect'} {selected?.name}</h2>
            <p className="text-sm text-muted-foreground">{selected?.description}</p>
          </div>
          <div className="space-y-4">
            {selected?.fields?.includes('url') && (
              <div className="space-y-2"><Label>Server URL</Label><Input value={configForm.url} onChange={e => setConfigForm(f => ({ ...f, url: e.target.value }))} placeholder="https://example.com/api" /></div>
            )}
            {selected?.fields?.includes('apiKey') && (
              <div className="space-y-2"><Label>API Key</Label><Input type="password" value={configForm.apiKey} onChange={e => setConfigForm(f => ({ ...f, apiKey: e.target.value }))} placeholder="Enter API key" /></div>
            )}
            {selected?.fields?.includes('username') && (
              <div className="space-y-2"><Label>Username</Label><Input value={configForm.username} onChange={e => setConfigForm(f => ({ ...f, username: e.target.value }))} placeholder="Username" /></div>
            )}
            {selected?.fields?.includes('password') && (
              <div className="space-y-2"><Label>Password</Label><Input type="password" value={configForm.password} onChange={e => setConfigForm(f => ({ ...f, password: e.target.value }))} placeholder="Password" /></div>
            )}
            {selected?.fields?.includes('webhookUrl') && (
              <div className="space-y-2"><Label>Webhook URL</Label><Input value={configForm.webhookUrl} onChange={e => setConfigForm(f => ({ ...f, webhookUrl: e.target.value }))} placeholder="https://your-server.com/webhook" /></div>
            )}
            {/* Hubtel SMS-specific fields */}
            {selected?.fields?.includes('clientId') && (
              <div className="space-y-2">
                <Label>Hubtel Client ID</Label>
                <Input value={configForm.clientId} onChange={e => setConfigForm(f => ({ ...f, clientId: e.target.value }))} placeholder="e.g. abcd1234" />
                <p className="text-[11px] text-muted-foreground">Found in Hubtel → Messaging → Manage → Programmable SMS → API Keys</p>
              </div>
            )}
            {selected?.fields?.includes('clientSecret') && (
              <div className="space-y-2">
                <Label>Hubtel Client Secret</Label>
                <Input type="password" value={configForm.clientSecret} onChange={e => setConfigForm(f => ({ ...f, clientSecret: e.target.value }))} placeholder="Your Hubtel Client Secret" />
              </div>
            )}
            {selected?.fields?.includes('senderName') && (
              <div className="space-y-2">
                <Label>Sender Name</Label>
                <Input value={configForm.senderName} onChange={e => setConfigForm(f => ({ ...f, senderName: e.target.value }))} placeholder="e.g. iAssetsPro (max 11 chars)" maxLength={11} />
                <p className="text-[11px] text-muted-foreground">Alphanumeric name registered on your Hubtel account. This is what recipients see as the sender.</p>
              </div>
            )}
            {/* Test SMS button (only for SMS integration when connected) */}
            {selected?.id === 'sms' && selected?.connected && (
              <div className="pt-2 border-t space-y-3">
                <p className="text-sm font-medium">Send Test SMS</p>
                <div className="flex gap-2">
                  <Input value={testSmsPhone} onChange={e => { setTestSmsPhone(e.target.value); setTestSmsResult(null); }} placeholder="233XXXXXXXXX" className="flex-1" />
                  <Button variant="outline" size="sm" disabled={testSmsLoading || !testSmsPhone} onClick={async () => {
                    setTestSmsLoading(true);
                    setTestSmsResult(null);
                    try {
                      const res = await api.post('/api/settings/test-sms', { to: testSmsPhone });
                      setTestSmsResult({ success: !!res.success, message: res.success ? `SMS sent! Message ID: ${res.data?.messageId}` : (res.error || 'Failed') });
                    } catch { setTestSmsResult({ success: false, message: 'Request failed' }); }
                    setTestSmsLoading(false);
                  }}>
                    {testSmsLoading ? 'Sending...' : 'Test'}
                  </Button>
                </div>
                {testSmsResult && (
                  <p className={`text-xs ${testSmsResult.success ? 'text-emerald-600' : 'text-red-500'}`}>{testSmsResult.message}</p>
                )}
              </div>
            )}
          </div>
          <div className="flex flex-col-reverse gap-2 mt-4 sm:flex-row sm:justify-end">
            <Button variant="outline" onClick={() => setConfigOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving} className="bg-emerald-600 hover:bg-emerald-700 text-white">{saving ? 'Saving...' : selected?.connected ? 'Save Configuration' : 'Connect'}</Button>
          </div>
        
      </ResponsiveDialog>
    </div>
  );
}
export function SecuritySettingsPage() {
  const { user } = useAuthStore();
  const [sessions, setSessions] = useState<Array<{
    id: string;
    token: string;
    isCurrent: boolean;
    createdAt: string;
    lastSeen: string;
    expiresAt: string;
  }>>([]);
  const [sessionsLoading, setSessionsLoading] = useState(true);

  // Password form state
  const [currentPwd, setCurrentPwd] = useState('');
  const [newPwd, setNewPwd] = useState('');
  const [confirmPwd, setConfirmPwd] = useState('');
  const [showCurrentPwd, setShowCurrentPwd] = useState(false);
  const [showNewPwd, setShowNewPwd] = useState(false);
  const [showConfirmPwd, setShowConfirmPwd] = useState(false);
  const [changingPwd, setChangingPwd] = useState(false);

  const loadSessions = useCallback(() => {
    setSessionsLoading(true);
    api.get<typeof sessions>('/api/sessions').then(res => {
      if (res.success && res.data) setSessions(res.data);
      setSessionsLoading(false);
    }).catch(() => setSessionsLoading(false));
  }, []);

  useEffect(() => {
    loadSessions();
  }, [loadSessions]);

  // Password strength
  const passwordChecks = useMemo(() => ({
    minLength: newPwd.length >= 8,
    hasUppercase: /[A-Z]/.test(newPwd),
    hasLowercase: /[a-z]/.test(newPwd),
    hasNumber: /[0-9]/.test(newPwd),
    hasSpecial: /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?`~]/.test(newPwd),
  }), [newPwd]);

  const checkCount = Object.values(passwordChecks).filter(Boolean).length;
  const passwordStrength = newPwd.length === 0 ? 0 : checkCount <= 2 ? 20 : checkCount <= 3 ? 40 : checkCount <= 4 ? 75 : 100;
  const strengthLabel = passwordStrength === 0 ? '' : passwordStrength <= 20 ? 'Weak' : passwordStrength <= 40 ? 'Fair' : passwordStrength <= 75 ? 'Good' : 'Strong';
  const strengthColor = passwordStrength <= 20 ? 'bg-red-500' : passwordStrength <= 40 ? 'bg-amber-500' : passwordStrength <= 75 ? 'bg-yellow-500' : 'bg-emerald-500';

  const handleChangePassword = async () => {
    if (!currentPwd || !newPwd || !confirmPwd) { toast.error('All fields are required'); return; }
    setChangingPwd(true);
    const res = await api.post('/api/users/change-password', {
      currentPassword: currentPwd,
      newPassword: newPwd,
      confirmPassword: confirmPwd,
    });
    if (res.success) {
      toast.success(res.data?.message || 'Password changed successfully');
      setCurrentPwd('');
      setNewPwd('');
      setConfirmPwd('');
      loadSessions(); // Refresh sessions since other sessions were revoked
    } else {
      toast.error(res.error || 'Failed to change password');
    }
    setChangingPwd(false);
  };

  const handleRevokeSession = async (sessionId: string) => {
    const res = await api.delete(`/api/sessions/${sessionId}`);
    if (res.success) {
      toast.success('Session revoked');
      loadSessions();
    } else {
      toast.error(res.error || 'Failed to revoke session');
    }
  };

  const handleRevokeAllOthers = async () => {
    const res = await apiFetch('/api/sessions', { method: 'DELETE', body: JSON.stringify({ all: true }) });
    if (res.success) {
      toast.success(res.data?.message || 'All other sessions revoked');
      loadSessions();
    } else {
      toast.error(res.error || 'Failed to revoke sessions');
    }
  };

  const currentSession = sessions.find(s => s.isCurrent);
  const otherSessions = sessions.filter(s => !s.isCurrent);

  return (
    <div className="page-content">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Security Settings</h1>
        <p className="text-muted-foreground mt-1">Manage your password and active sessions</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Change Password */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-lg bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
                <Lock className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
              </div>
              <div>
                <CardTitle className="text-base">Change Password</CardTitle>
                <CardDescription>Update your account password</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Current Password */}
            <div className="space-y-2">
              <Label>Current Password</Label>
              <div className="relative">
                <Input
                  type={showCurrentPwd ? 'text' : 'password'}
                  value={currentPwd}
                  onChange={e => setCurrentPwd(e.target.value)}
                  placeholder="Enter current password"
                />
                <button
                  type="button"
                  onClick={() => setShowCurrentPwd(!showCurrentPwd)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                >
                  {showCurrentPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {/* New Password */}
            <div className="space-y-2">
              <Label>New Password</Label>
              <div className="relative">
                <Input
                  type={showNewPwd ? 'text' : 'password'}
                  value={newPwd}
                  onChange={e => setNewPwd(e.target.value)}
                  placeholder="Enter new password"
                />
                <button
                  type="button"
                  onClick={() => setShowNewPwd(!showNewPwd)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                >
                  {showNewPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {/* Password Strength Indicator */}
            {newPwd.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Password strength</span>
                  <span className={passwordStrength <= 40 ? 'text-red-600 font-medium' : passwordStrength <= 75 ? 'text-amber-600 font-medium' : 'text-emerald-600 font-medium'}>
                    {strengthLabel}
                  </span>
                </div>
                <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                  <div className={`h-full rounded-full transition-all duration-300 ${strengthColor}`} style={{ width: `${passwordStrength}%` }} />
                </div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                  {[
                    { key: 'minLength' as const, label: `At least 8 characters` },
                    { key: 'hasUppercase' as const, label: 'One uppercase letter' },
                    { key: 'hasLowercase' as const, label: 'One lowercase letter' },
                    { key: 'hasNumber' as const, label: 'One number' },
                    { key: 'hasSpecial' as const, label: 'One special character' },
                  ].map(req => (
                    <div key={req.key} className="flex items-center gap-1.5 text-xs">
                      {passwordChecks[req.key]
                        ? <CheckCircle2 className="h-3 w-3 text-emerald-500 shrink-0" />
                        : <XCircle className="h-3 w-3 text-muted-foreground/50 shrink-0" />
                      }
                      <span className={passwordChecks[req.key] ? 'text-emerald-700 dark:text-emerald-400' : 'text-muted-foreground'}>
                        {req.label}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Confirm Password */}
            <div className="space-y-2">
              <Label>Confirm New Password</Label>
              <div className="relative">
                <Input
                  type={showConfirmPwd ? 'text' : 'password'}
                  value={confirmPwd}
                  onChange={e => setConfirmPwd(e.target.value)}
                  placeholder="Re-enter new password"
                  className={confirmPwd && confirmPwd !== newPwd ? 'border-red-300 focus-visible:ring-red-300' : ''}
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPwd(!showConfirmPwd)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                >
                  {showConfirmPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {confirmPwd && confirmPwd !== newPwd && (
                <p className="text-xs text-red-500 flex items-center gap-1">
                  <AlertCircle className="h-3 w-3" />Passwords do not match
                </p>
              )}
            </div>

            <Button
              onClick={handleChangePassword}
              disabled={changingPwd || !currentPwd || !newPwd || !confirmPwd || newPwd !== confirmPwd || checkCount < 5}
              className="bg-emerald-600 hover:bg-emerald-700 text-white w-full"
            >
              {changingPwd ? <><RefreshCw className="h-4 w-4 mr-2 animate-spin" />Changing Password...</> : <><Lock className="h-4 w-4 mr-2" />Change Password</>}
            </Button>
          </CardContent>
        </Card>

        {/* Active Sessions */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="h-8 w-8 rounded-lg bg-sky-100 dark:bg-sky-900/30 flex items-center justify-center">
                  <Smartphone className="h-4 w-4 text-sky-600 dark:text-sky-400" />
                </div>
                <div>
                  <CardTitle className="text-base">Active Sessions</CardTitle>
                  <CardDescription>Devices logged into your account</CardDescription>
                </div>
              </div>
              {otherSessions.length > 0 && (
                <Button variant="outline" size="sm" className="text-xs text-red-600 border-red-200 hover:bg-red-50 hover:text-red-700"
                  onClick={handleRevokeAllOthers}
                >
                  <ShieldAlert className="h-3 w-3 mr-1" />
                  Revoke All Others
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {sessionsLoading ? (
              <div className="space-y-3">
                {[1, 2].map(i => (
                  <div key={i} className="flex items-center gap-3 p-3 rounded-lg bg-muted/50 animate-pulse">
                    <div className="h-9 w-9 rounded-lg bg-muted" />
                    <div className="flex-1 space-y-1.5">
                      <div className="h-3 w-24 rounded bg-muted" />
                      <div className="h-2 w-16 rounded bg-muted" />
                    </div>
                  </div>
                ))}
              </div>
            ) : sessions.length === 0 ? (
              <div className="text-center py-8">
                <Smartphone className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">No active sessions</p>
              </div>
            ) : (
              <div className="space-y-3">
                {/* Current session */}
                {currentSession && (
                  <div className="flex items-start gap-3 p-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200/60 dark:border-emerald-800/40">
                    <div className="h-9 w-9 rounded-lg bg-emerald-100 dark:bg-emerald-900/40 flex items-center justify-center shrink-0 mt-0.5">
                      <Monitor className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">Current Session</span>
                        <Badge className="bg-emerald-100 text-emerald-700 text-[10px] border-0">Current</Badge>
                      </div>
                      <p className="text-[11px] text-muted-foreground mt-0.5 font-mono">{currentSession.token}</p>
                      <div className="flex items-center gap-3 mt-1.5 text-[11px] text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          Last active: {formatDistanceToNow(new Date(currentSession.lastSeen), { addSuffix: true })}
                        </span>
                      </div>
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        Expires {formatDistanceToNow(new Date(currentSession.expiresAt))}
                      </p>
                    </div>
                  </div>
                )}

                {/* Other sessions */}
                {otherSessions.map(session => (
                  <div key={session.id} className="flex items-start gap-3 p-3 rounded-lg bg-muted/40 hover:bg-muted/60 transition-colors">
                    <div className="h-9 w-9 rounded-lg bg-muted flex items-center justify-center shrink-0 mt-0.5">
                      <Smartphone className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className="text-sm font-medium">Other Device</span>
                      <p className="text-[11px] text-muted-foreground mt-0.5 font-mono">{session.token}</p>
                      <div className="flex items-center gap-3 mt-1.5 text-[11px] text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          Last active: {formatDistanceToNow(new Date(session.lastSeen), { addSuffix: true })}
                        </span>
                      </div>
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        Created {format(new Date(session.createdAt), 'MMM d, yyyy HH:mm')}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 px-2 text-red-600 hover:text-red-700 hover:bg-red-50 shrink-0"
                      onClick={() => handleRevokeSession(session.id)}
                    >
                      <XCircle className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}

            {sessions.length > 0 && (
              <div className="mt-4 pt-3 border-t">
                <p className="text-[11px] text-muted-foreground flex items-center gap-1.5">
                  <ShieldCheck className="h-3 w-3" />
                  {sessions.length} active session{sessions.length !== 1 ? 's' : ''} &middot; Changing password will revoke all other sessions
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export function SettingsBackupPage() {
  const { isAdmin: isUserAdmin } = useAuthStore();
  const [backingUp, setBackingUp] = useState(false);
  const [backupHistory, setBackupHistory] = useState<Array<{
    id: string; date: string; type: string; size: string; status: string; recordCount?: number; version?: string;
  }>>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);

  // Restore state
  const [restoreFile, setRestoreFile] = useState<File | null>(null);
  const [restorePreview, setRestorePreview] = useState<{
    preview: true;
    backup: { format: string; version: string; exportedAt: string; systemInfo: Record<string, any> };
    tables: Record<string, { count: number; conflicts: number }>;
    totals: { records: number; conflicts: number };
  } | null>(null);
  const [restoring, setRestoring] = useState(false);
  const [restoreResult, setRestoreResult] = useState<{
    preview: false;
    results: Record<string, { created: number; updated: number }>;
    totals: { created: number; updated: number };
  } | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const fileInputRef = React.useRef<HTMLInputElement>(null);

  // Load backup history
  const loadBackupHistory = useCallback(() => {
    api.get('/api/backups').then(res => {
      if (res.success && res.data) setBackupHistory(res.data);
      setLoadingHistory(false);
    }).catch(() => setLoadingHistory(false));
  }, []);

  useEffect(() => {
    loadBackupHistory();
  }, [loadBackupHistory]);

  const lastBackup = backupHistory.find(b => b.status === 'completed');
  const completedBackups = backupHistory.filter(b => b.status === 'completed');

  const summaryCards = [
    {
      label: 'Last Backup',
      value: lastBackup?.date ? format(new Date(lastBackup.date), 'MMM d, HH:mm') : 'Never',
      icon: History,
      color: 'text-emerald-600 bg-emerald-50 dark:bg-emerald-900/30 dark:text-emerald-400',
    },
    {
      label: 'Total Backups',
      value: completedBackups.length.toString(),
      icon: Layers,
      color: 'text-violet-600 bg-violet-50 dark:bg-violet-900/30 dark:text-violet-400',
    },
    {
      label: 'Latest Records',
      value: lastBackup?.recordCount ? lastBackup.recordCount.toLocaleString() : '—',
      icon: Database,
      color: 'text-amber-600 bg-amber-50 dark:bg-amber-900/30 dark:text-amber-400',
    },
    {
      label: 'Format Version',
      value: lastBackup?.version || '—',
      icon: FileBarChart,
      color: 'text-rose-600 bg-rose-50 dark:bg-rose-900/30 dark:text-rose-400',
    },
  ];

  // ── Create Backup ──────────────────────────────────────────────────────
  const handleBackup = async () => {
    setBackingUp(true);
    try {
      const response = await api.getRaw('/api/backups', { method: 'POST' });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        toast.error(errorData.error || 'Backup failed');
        setBackingUp(false);
        return;
      }

      // Extract filename from Content-Disposition
      const contentDisposition = response.headers.get('content-disposition') || '';
      const totalRecords = response.headers.get('x-total-records') || '0';
      let filename = `iassetspro-backup-${new Date().toISOString().slice(0, 10)}.json`;
      const filenameMatch = contentDisposition.match(/filename="?([^";\n]+)"?/);
      if (filenameMatch) filename = filenameMatch[1];

      // Download the file
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);

      loadBackupHistory();
      toast.success(`Backup completed — ${parseInt(totalRecords, 10).toLocaleString()} records exported`);
    } catch (err: any) {
      toast.error(err.message || 'Backup failed');
    }
    setBackingUp(false);
  };

  // ── Restore: file selection ────────────────────────────────────────────
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file && (file.name.endsWith('.json'))) {
      setRestoreFile(file);
      setRestorePreview(null);
      setRestoreResult(null);
    } else {
      toast.error('Please upload a .json backup file');
    }
  }, []);

  const onFileSelected = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setRestoreFile(file);
      setRestorePreview(null);
      setRestoreResult(null);
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, []);

  // ── Restore: preview ───────────────────────────────────────────────────
  const handlePreviewRestore = async () => {
    if (!restoreFile) return;
    setRestoring(true);
    setRestorePreview(null);
    setRestoreResult(null);
    try {
      const formData = new FormData();
      formData.append('file', restoreFile);
      formData.append('confirm', 'false');

      const res = await apiFetch('/api/backups/restore', {
        method: 'POST',
        body: formData,
      });

      if (res.success && res.data) {
        setRestorePreview(res.data as typeof restorePreview);
      } else {
        toast.error(res.error || 'Failed to preview backup');
      }
    } catch (err: any) {
      toast.error(err.message || 'Preview failed');
    }
    setRestoring(false);
  };

  // ── Restore: execute ───────────────────────────────────────────────────
  const handleExecuteRestore = async () => {
    if (!restoreFile) return;
    setRestoring(true);
    setRestoreResult(null);
    try {
      const formData = new FormData();
      formData.append('file', restoreFile);
      formData.append('confirm', 'true');

      const res = await apiFetch('/api/backups/restore', {
        method: 'POST',
        body: formData,
      });

      if (res.success && res.data) {
        setRestoreResult(res.data as typeof restoreResult);
        toast.success(`Restore complete — ${res.data.totals.created} created, ${res.data.totals.updated} updated`);
      } else {
        toast.error(res.error || 'Restore failed');
      }
    } catch (err: any) {
      toast.error(err.message || 'Restore failed');
    }
    setRestoring(false);
  };

  // ── Reset restore state ────────────────────────────────────────────────
  const resetRestore = useCallback(() => {
    setRestoreFile(null);
    setRestorePreview(null);
    setRestoreResult(null);
  }, []);

  return (
    <div className="page-content">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Backup & Restore</h1>
        <p className="text-muted-foreground mt-1">Create system backups, download data, and restore from backup files</p>
      </div>
      <input ref={fileInputRef} type="file" accept=".json" className="hidden" onChange={onFileSelected} />

      {/* ── Summary Cards ─────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {summaryCards.map(k => { const I = k.icon; return (
          <Card key={k.label}>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className={`h-10 w-10 rounded-lg ${k.color} flex items-center justify-center`}>
                  <I className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-lg font-bold">{k.value}</p>
                  <p className="text-xs text-muted-foreground">{k.label}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        ); })}
      </div>

      {/* ── Create Backup Card ────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <Database className="h-4 w-4 text-emerald-600" />
                Create Backup
              </CardTitle>
              <CardDescription className="mt-1.5">
                Export all system data from the database as a JSON file. This includes all plants, assets,
                work orders, inventory, users, and configuration data.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
            <Button
              onClick={handleBackup}
              disabled={backingUp}
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
              size="lg"
            >
              {backingUp ? (
                <>
                  <RefreshCw className="h-5 w-5 mr-2 animate-spin" />
                  Exporting Data...
                </>
              ) : (
                <>
                  <Download className="h-5 w-5 mr-2" />
                  Create Backup Now
                </>
              )}
            </Button>
            {backingUp && (
              <div className="w-full sm:w-64">
                <Progress value={undefined} className="h-2 [&>[data-slot=progress-indicator]]:bg-emerald-600" />
                <p className="text-xs text-muted-foreground mt-1.5">Querying all tables and building archive...</p>
              </div>
            )}
          </div>
          <Alert className="mt-4">
            <Info className="h-4 w-4" />
            <AlertTitle>Server-side Export</AlertTitle>
            <AlertDescription className="text-xs">
              The backup is generated on the server from the live database. Sensitive fields (passwords, sessions, tokens) are excluded.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>

      {/* ── Restore Card ──────────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <Archive className="h-4 w-4 text-amber-600" />
                Restore from Backup
              </CardTitle>
              <CardDescription className="mt-1.5">
                Upload a backup file to preview and restore system data. Existing records are updated; new records are created.
              </CardDescription>
            </div>
            {restoreFile && (
              <Button variant="ghost" size="sm" onClick={resetRestore} className="text-muted-foreground">
                <X className="h-4 w-4 mr-1" />
                Clear
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-5">
          {/* Upload Zone */}
          {!restoreFile && (
            <div
              className={`border-2 border-dashed rounded-xl p-10 text-center transition-all cursor-pointer ${
                dragOver
                  ? 'border-amber-400 bg-amber-50/50 dark:bg-amber-900/10'
                  : 'hover:border-amber-300 hover:bg-amber-50/20 dark:hover:border-amber-700'
              }`}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload className={`h-12 w-12 mx-auto mb-3 transition-colors ${dragOver ? 'text-amber-500' : 'text-muted-foreground/60'}`} />
              <p className="text-sm font-medium mb-1">Drag & drop backup file here</p>
              <p className="text-xs text-muted-foreground mb-4">or click to browse (.json files only)</p>
              <Badge variant="outline" className="text-[11px]">Accepts iAssetsPro backup files v2.0.0+</Badge>
            </div>
          )}

          {/* Selected File Info */}
          {restoreFile && !restorePreview && !restoreResult && (
            <div className="rounded-lg border p-4 space-y-4">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-amber-50 dark:bg-amber-900/30 flex items-center justify-center">
                  <FileBarChart className="h-5 w-5 text-amber-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{restoreFile.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {(restoreFile.size / 1024).toFixed(1)} KB &middot; {restoreFile.type || 'application/json'}
                  </p>
                </div>
                <Badge variant="outline" className="text-[11px]">Ready</Badge>
              </div>
              <Button
                onClick={handlePreviewRestore}
                disabled={restoring}
                className="w-full bg-amber-600 hover:bg-amber-700 text-white"
              >
                {restoring ? (
                  <><RefreshCw className="h-4 w-4 mr-2 animate-spin" />Analyzing Backup...</>
                ) : (
                  <><Eye className="h-4 w-4 mr-2" />Preview Restore</>
                )}
              </Button>
            </div>
          )}

          {/* Preview Results */}
          {restorePreview && (
            <div className="rounded-lg border p-4 space-y-4">
              {/* Backup Info */}
              <div className="flex items-start justify-between">
                <div>
                  <h4 className="text-sm font-semibold flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                    Backup File Valid
                  </h4>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Exported {formatDistanceToNow(new Date(restorePreview.backup.exportedAt), { addSuffix: true })}
                    {' '}&middot; Version {restorePreview.backup.version}
                  </p>
                </div>
                <Badge variant="outline" className="text-[11px] bg-amber-50 text-amber-700 border-amber-200">
                  Preview Mode
                </Badge>
              </div>

              {/* System Info */}
              {restorePreview.backup.systemInfo && (
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                  {[
                    { label: 'Company', value: restorePreview.backup.systemInfo.companyName },
                    { label: 'Plants', value: restorePreview.backup.systemInfo.plantCount },
                    { label: 'Users', value: restorePreview.backup.systemInfo.userCount },
                    { label: 'Assets', value: restorePreview.backup.systemInfo.assetCount },
                    { label: 'Work Orders', value: restorePreview.backup.systemInfo.workOrderCount },
                  ].filter(s => s.value && s.value !== 'N/A').map(s => (
                    <div key={s.label} className="bg-muted/40 rounded-md px-3 py-2 text-center">
                      <p className="text-sm font-bold">{typeof s.value === 'number' ? s.value.toLocaleString() : s.value}</p>
                      <p className="text-[10px] text-muted-foreground">{s.label}</p>
                    </div>
                  ))}
                </div>
              )}

              {/* Conflict Warning */}
              {restorePreview.totals.conflicts > 0 && (
                <Alert className="border-amber-200 bg-amber-50/50 dark:border-amber-800 dark:bg-amber-900/10">
                  <AlertTriangle className="h-4 w-4 text-amber-600" />
                  <AlertTitle className="text-amber-800 dark:text-amber-300">
                    {restorePreview.totals.conflicts} potential conflict{restorePreview.totals.conflicts !== 1 ? 's' : ''}
                  </AlertTitle>
                  <AlertDescription className="text-xs text-amber-700 dark:text-amber-400">
                    Existing records with matching unique keys will be updated. No data will be deleted.
                  </AlertDescription>
                </Alert>
              )}

              {/* Table Breakdown */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
                  <span>Table breakdown</span>
                  <span>{restorePreview.totals.records.toLocaleString()} total records</span>
                </div>
                <ScrollArea className="max-h-48">
                  <div className="space-y-1">
                    {Object.entries(restorePreview.tables).map(([table, info]) => (
                      <div key={table} className="flex items-center justify-between text-xs bg-muted/30 rounded-md px-3 py-1.5">
                        <span className="font-medium capitalize">{table.replace(/([A-Z])/g, ' $1').trim()}</span>
                        <div className="flex items-center gap-2">
                          <span className="text-muted-foreground">{info.count} records</span>
                          {info.conflicts > 0 && (
                            <Badge variant="outline" className="text-[10px] bg-amber-50 text-amber-700 border-amber-200">
                              {info.conflicts} update
                            </Badge>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </div>

              {/* Action Buttons */}
              <div className="flex flex-col sm:flex-row gap-3 pt-2">
                <Button
                  onClick={handleExecuteRestore}
                  disabled={restoring}
                  className="bg-red-600 hover:bg-red-700 text-white flex-1"
                >
                  {restoring ? (
                    <><RefreshCw className="h-4 w-4 mr-2 animate-spin" />Restoring Data...</>
                  ) : (
                    <><Upload className="h-4 w-4 mr-2" />Execute Restore</>
                  )}
                </Button>
                <Button variant="outline" onClick={resetRestore} disabled={restoring}>
                  Cancel
                </Button>
              </div>
              {restoring && (
                <Progress value={undefined} className="h-2 [&>[data-slot=progress-indicator]]:bg-red-600" />
              )}
            </div>
          )}

          {/* Restore Result */}
          {restoreResult && (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50/30 dark:border-emerald-800 dark:bg-emerald-900/10 p-4 space-y-4">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                <h4 className="text-sm font-semibold text-emerald-800 dark:text-emerald-300">Restore Completed Successfully</h4>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="text-center bg-white/60 dark:bg-black/20 rounded-lg p-3">
                  <p className="text-2xl font-bold text-emerald-600">{restoreResult.totals.created.toLocaleString()}</p>
                  <p className="text-xs text-muted-foreground">Records Created</p>
                </div>
                <div className="text-center bg-white/60 dark:bg-black/20 rounded-lg p-3">
                  <p className="text-2xl font-bold text-amber-600">{restoreResult.totals.updated.toLocaleString()}</p>
                  <p className="text-xs text-muted-foreground">Records Updated</p>
                </div>
              </div>

              {/* Per-table results */}
              <ScrollArea className="max-h-48">
                <div className="space-y-1">
                  {Object.entries(restoreResult.results)
                    .filter(([, r]) => r.created > 0 || r.updated > 0)
                    .map(([table, info]) => (
                    <div key={table} className="flex items-center justify-between text-xs bg-white/40 dark:bg-black/10 rounded-md px-3 py-1.5">
                      <span className="font-medium capitalize">{table.replace(/([A-Z])/g, ' $1').trim()}</span>
                      <div className="flex items-center gap-2">
                        {info.created > 0 && (
                          <Badge variant="outline" className="text-[10px] bg-emerald-50 text-emerald-700 border-emerald-200">
                            +{info.created} created
                          </Badge>
                        )}
                        {info.updated > 0 && (
                          <Badge variant="outline" className="text-[10px] bg-amber-50 text-amber-700 border-amber-200">
                            {info.updated} updated
                          </Badge>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>

              <Button variant="outline" onClick={resetRestore} className="w-full">
                Done
              </Button>
            </div>
          )}

          {/* Safety Notice */}
          {!restoreFile && !restorePreview && !restoreResult && (
            <Alert>
              <Shield className="h-4 w-4" />
              <AlertTitle>Safety & Rate Limiting</AlertTitle>
              <AlertDescription className="text-xs">
                Restore requires admin privileges. Maximum 1 restore per 30 minutes. Restore uses upsert logic — existing records
                are updated by unique key, new records are created. No data is ever deleted.
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {/* ── Backup History Table ──────────────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <History className="h-4 w-4" />
              Backup History
            </CardTitle>
            {backupHistory.length > 0 && (
              <Badge variant="outline" className="text-[11px]">
                {completedBackups.length} successful
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {!loadingHistory && backupHistory.length === 0 ? (
            <div className="text-center py-8">
              <Database className="h-10 w-10 text-muted-foreground/30 mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">No backups yet</p>
              <p className="text-xs text-muted-foreground">Create your first backup using the button above</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Version</TableHead>
                    <TableHead>Records</TableHead>
                    <TableHead>Size</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {backupHistory.slice(0, 20).map(b => (
                    <TableRow key={b.id}>
                      <TableCell className="text-sm">{formatDateTime(b.date)}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-[11px]">{b.type}</Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">{b.version || '—'}</TableCell>
                      <TableCell className="text-sm">{b.recordCount ? b.recordCount.toLocaleString() : '—'}</TableCell>
                      <TableCell className="text-sm">{b.size}</TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={`text-[11px] ${
                            b.status === 'completed'
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                              : 'bg-red-50 text-red-700 border-red-200'
                          }`}
                        >
                          {b.status === 'completed' ? (
                            <span className="flex items-center gap-1"><CheckCircle2 className="h-3 w-3" />Success</span>
                          ) : (
                            <span className="flex items-center gap-1"><XCircle className="h-3 w-3" />Failed</span>
                          )}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
          {backupHistory.length > 20 && (
            <p className="text-xs text-muted-foreground mt-3 text-center">
              Showing 20 of {backupHistory.length} backups
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ============================================================================
// MAIN APP SHELL
// ============================================================================

// ============================================================================
// CHAT PAGE
// ============================================================================

interface ChatConversation {
  id: string;
  name: string;
  type: string;
  lastMessage?: { content: string; createdAt: string; senderId: string; senderName?: string };
  unreadCount: number;
  participants: { userId: string; name: string }[];
}

interface ChatMessage {
  id: string;
  content: string;
  senderId: string;
  senderName?: string;
  messageType: string;
  createdAt: string;
}

// ============================================================================
// SystemHealthPage
// ============================================================================

interface SystemHealthData {
  status: string;
  timestamp: string;
  uptime: string;
  uptimeSeconds: number;
  memory: {
    rss: string;
    heapUsed: string;
    heapTotal: string;
    external: string;
    rssBytes: number;
    heapUsedBytes: number;
    heapTotalBytes: number;
  };
  database: {
    totalRecords: number;
    dbSize: string;
    dbSizeBytes: number;
    tables: number;
  };
  users: {
    total: number;
    roles: number;
    permissions: number;
    activeSessions: number;
  };
  organization: {
    plants: number;
    departments: number;
  };
  modules: {
    assets: number;
    workOrders: number;
    maintenanceRequests: number;
    inventoryItems: number;
    safetyIncidents: number;
    qualityInspections: number;
    productionOrders: number;
    pmSchedules: number;
  };
  overdue: {
    workOrders: number;
    breachedSlas: number;
    total: number;
  };
  recentActivity: {
    id: string;
    action: string;
    entity: string;
    entityId: string;
    details: string;
    user: { fullName: string; username: string } | null;
    createdAt: string;
  }[];
}

export function SystemHealthPage() {
  const { isAdmin } = useAuthStore();
  const [data, setData] = useState<SystemHealthData | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<string>('');

  const fetchHealth = useCallback(() => {
    api.get<SystemHealthData>('/api/admin/system-health').then(res => {
      if (res.success && res.data) {
        setData(res.data);
        setLastRefresh(new Date().toLocaleTimeString());
      }
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetchHealth();
    const interval = setInterval(fetchHealth, 60000);
    return () => clearInterval(interval);
  }, [fetchHealth]);

  const heapPercent = data ? Math.round((data.memory.heapUsedBytes / data.memory.heapTotalBytes) * 100) : 0;
  const isHealthy = data?.status === 'healthy';
  const hasWarnings = data ? data.overdue.total > 0 : false;

  if (!isAdmin()) {
    return (
      <div className="page-content">
        <div className="flex items-center justify-center min-h-[400px]">
          <EmptyState icon={ShieldAlert} title="Access Denied" description="System Health is available to administrators only." />
        </div>
      </div>
    );
  }

  if (loading) return <LoadingSkeleton />;

  if (!data) {
    return (
      <div className="page-content">
        <div className="flex items-center justify-center min-h-[400px]">
          <EmptyState icon={AlertCircle} title="Unable to Load" description="Failed to fetch system health data." />
        </div>
      </div>
    );
  }

  return (
    <div className="page-content">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3 mb-6">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight">System Health</h1>
            <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${
              hasWarnings
                ? 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400'
                : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400'
            }`}>
              <span className={`h-2 w-2 rounded-full ${hasWarnings ? 'bg-amber-500' : 'bg-emerald-500 animate-pulse'}`} />
              {hasWarnings ? 'Warnings' : 'All Systems Go'}
            </div>
          </div>
          <p className="text-muted-foreground text-sm mt-1">
            Auto-refreshes every 60s &middot; Last: {lastRefresh}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchHealth}>
          <RefreshCw className="h-4 w-4 mr-1.5" />Refresh Now
        </Button>
      </div>

      {/* Top Row: System Status + Database + Active Users */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
        {/* System Status */}
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold">System Status</CardTitle>
              <div className="h-8 w-8 rounded-lg bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
                <Server className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
              </div>
            </div>
          </CardHeader>
          <CardContent className="pt-0 space-y-3">
            <div className="flex items-center gap-2">
              <span className={`h-3 w-3 rounded-full ${isHealthy ? 'bg-emerald-500 shadow-sm shadow-emerald-200 dark:shadow-emerald-900' : 'bg-red-500'}`} />
              <span className="text-sm font-medium capitalize">{data.status}</span>
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Uptime</span>
                <span className="font-medium tabular-nums">{data.uptime}</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Heap Usage</span>
                <span className="font-medium tabular-nums">{heapPercent}%</span>
              </div>
              <div className="w-full bg-muted rounded-full h-1.5">
                <div
                  className={`h-1.5 rounded-full transition-all ${heapPercent > 80 ? 'bg-amber-500' : 'bg-emerald-500'}`}
                  style={{ width: `${Math.min(heapPercent, 100)}%` }}
                />
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">RSS Memory</span>
                <span className="font-medium tabular-nums">{data.memory.rss}</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Heap</span>
                <span className="font-medium tabular-nums">{data.memory.heapUsed} / {data.memory.heapTotal}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Database */}
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold">Database</CardTitle>
              <div className="h-8 w-8 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                <Database className="h-4 w-4 text-blue-600 dark:text-blue-400" />
              </div>
            </div>
          </CardHeader>
          <CardContent className="pt-0 space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Total Records</span>
              <span className="font-semibold text-sm tabular-nums">{data.database.totalRecords.toLocaleString()}</span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">DB Size</span>
              <span className="font-medium tabular-nums">{data.database.dbSize}</span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Tables</span>
              <span className="font-medium tabular-nums">{data.database.tables}</span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Plants</span>
              <span className="font-medium tabular-nums">{data.organization.plants}</span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Departments</span>
              <span className="font-medium tabular-nums">{data.organization.departments}</span>
            </div>
          </CardContent>
        </Card>

        {/* Active Users */}
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold">Active Users</CardTitle>
              <div className="h-8 w-8 rounded-lg bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center">
                <Users className="h-4 w-4 text-violet-600 dark:text-violet-400" />
              </div>
            </div>
          </CardHeader>
          <CardContent className="pt-0 space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Total Users</span>
              <span className="font-semibold text-sm tabular-nums">{data.users.total}</span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Active Sessions</span>
              <span className="font-medium tabular-nums">{data.users.activeSessions}</span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Roles</span>
              <span className="font-medium tabular-nums">{data.users.roles}</span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Permissions</span>
              <span className="font-medium tabular-nums">{data.users.permissions}</span>
            </div>
            <div className="mt-2 pt-2 border-t">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Overdue WOs</span>
                <Badge variant="outline" className={`text-[10px] font-medium ${data.overdue.workOrders > 0 ? 'border-amber-300 text-amber-600' : 'border-emerald-300 text-emerald-600'}`}>
                  {data.overdue.workOrders}
                </Badge>
              </div>
              <div className="flex items-center justify-between text-xs mt-1.5">
                <span className="text-muted-foreground">Breached SLAs</span>
                <Badge variant="outline" className={`text-[10px] font-medium ${data.overdue.breachedSlas > 0 ? 'border-red-300 text-red-600' : 'border-emerald-300 text-emerald-600'}`}>
                  {data.overdue.breachedSlas}
                </Badge>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Module Statistics */}
      <Card className="border-0 shadow-sm mb-4">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold">Module Statistics</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
            {([
              { label: 'Assets', value: data.modules.assets, icon: Building2, color: 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400' },
              { label: 'Work Orders', value: data.modules.workOrders, icon: ClipboardList, color: 'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400' },
              { label: 'Requests', value: data.modules.maintenanceRequests, icon: MessageSquare, color: 'bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400' },
              { label: 'Inventory', value: data.modules.inventoryItems, icon: Package, color: 'bg-violet-100 text-violet-600 dark:bg-violet-900/30 dark:text-violet-400' },
              { label: 'Safety', value: data.modules.safetyIncidents, icon: HardHat, color: 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400' },
              { label: 'Quality', value: data.modules.qualityInspections, icon: ShieldCheck, color: 'bg-cyan-100 text-cyan-600 dark:bg-cyan-900/30 dark:text-cyan-400' },
              { label: 'Production', value: data.modules.productionOrders, icon: Factory, color: 'bg-orange-100 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400' },
              { label: 'PM Schedules', value: data.modules.pmSchedules, icon: Clock, color: 'bg-pink-100 text-pink-600 dark:bg-pink-900/30 dark:text-pink-400' },
            ] as const).map((mod) => (
              <div key={mod.label} className="flex flex-col items-center gap-1.5 p-3 rounded-lg bg-muted/40 dark:bg-muted/20">
                <div className={`h-9 w-9 rounded-lg ${mod.color} flex items-center justify-center`}>
                  <mod.icon className="h-4 w-4" />
                </div>
                <span className="text-base font-bold tabular-nums">{mod.value.toLocaleString()}</span>
                <span className="text-[10px] text-muted-foreground text-center leading-tight">{mod.label}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Recent Activity */}
      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold">Recent Activity</CardTitle>
          <CardDescription className="text-xs">Last 10 audit log entries</CardDescription>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Action</TableHead>
                  <TableHead className="text-xs">Entity</TableHead>
                  <TableHead className="text-xs hidden md:table-cell">Details</TableHead>
                  <TableHead className="text-xs hidden sm:table-cell">User</TableHead>
                  <TableHead className="text-xs">Time</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.recentActivity?.length === 0 ? (
                  <TableRow><TableCell colSpan={5} className="h-32 text-center text-sm text-muted-foreground">No recent activity</TableCell></TableRow>
                ) : data.recentActivity.map((entry) => (
                  <TableRow key={entry.id}>
                    <TableCell>
                      <Badge variant="outline" className="text-[10px] font-mono">{entry.action}</Badge>
                    </TableCell>
                    <TableCell className="text-xs">
                      <span className="font-medium">{entry.entity}</span>
                      {entry.entityId && <span className="text-muted-foreground ml-1 font-mono text-[10px]">#{entry.entityId.slice(0, 8)}</span>}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground hidden md:table-cell max-w-[200px] truncate">
                      {entry.details || '—'}
                    </TableCell>
                    <TableCell className="text-xs hidden sm:table-cell">
                      {entry.user ? entry.user.fullName : 'System'}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                      {timeAgo(entry.createdAt)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}


// ============================================================================
// User Preferences Page
// ============================================================================

export function UserPreferencesPage() {
  const { preferences, savePreferences, resetPreferences } = usePreferencesStore();
  const { theme, setTheme } = useTheme();
  const user = useAuthStore(s => s.user);
  const [saving, setSaving] = useState(false);

  const [display, setDisplay] = useState(preferences.display);
  const [notifPrefs, setNotifPrefs] = useState(preferences.notifications);
  const [dateTime, setDateTime] = useState(preferences.dateTime);

  useEffect(() => {
    setDisplay(preferences.display);
    setNotifPrefs(preferences.notifications);
    setDateTime(preferences.dateTime);
  }, [preferences]);

  const handleSave = async () => {
    setSaving(true);
    const ok = await savePreferences({ display, notifications: notifPrefs, dateTime });
    if (ok) toast.success('Preferences saved');
    else toast.error('Failed to save preferences');
    setSaving(false);
  };

  const handleReset = () => {
    resetPreferences();
    toast.info('Preferences reset to defaults');
  };

  return (
    <div className="page-content max-w-3xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">My Preferences</h1>
        <p className="text-muted-foreground text-sm mt-1">Customize your workspace experience</p>
      </div>
      <div className="space-y-6">
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-3">
              <Avatar className="h-10 w-10 border-2 border-primary/20">
                <AvatarFallback className="text-sm font-bold bg-primary/10 text-primary">
                  {user ? getInitials(user.fullName) : '?'}
                </AvatarFallback>
              </Avatar>
              <div>
                <CardTitle className="text-base">{user?.fullName}</CardTitle>
                <CardDescription className="text-xs">{user?.username} · {user?.email}</CardDescription>
              </div>
            </div>
          </CardHeader>
        </Card>

        <Card className="border-0 shadow-sm">
          <CardHeader>
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-lg bg-blue-100 dark:bg-blue-950/40 flex items-center justify-center">
                <Monitor className="h-4 w-4 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <CardTitle className="text-sm">Display</CardTitle>
                <CardDescription>Customize how information is displayed</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5"><Label className="text-sm">Default Landing Page</Label><p className="text-xs text-muted-foreground">Page shown after login</p></div>
              <Select value={display.defaultPage} onValueChange={v => setDisplay(d => ({ ...d, defaultPage: v }))}>
                <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {[{ value: 'dashboard', label: 'Dashboard' }, { value: 'maintenance-work-orders', label: 'Work Orders' }, { value: 'maintenance-requests', label: 'Maintenance Requests' }, { value: 'assets-machines', label: 'Assets' }, { value: 'notifications', label: 'Notifications' }].map(o => (<SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>))}
                </SelectContent>
              </Select>
            </div>
            <Separator />
            <div className="flex items-center justify-between">
              <div className="space-y-0.5"><Label className="text-sm">Items Per Page</Label><p className="text-xs text-muted-foreground">Default list size for tables</p></div>
              <Select value={String(display.itemsPerPage)} onValueChange={v => setDisplay(d => ({ ...d, itemsPerPage: parseInt(v) }))}>
                <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {[{ v: 10, l: '10' }, { v: 25, l: '25' }, { v: 50, l: '50' }, { v: 100, l: '100' }].map(o => (<SelectItem key={o.v} value={String(o.v)}>{o.l} items</SelectItem>))}
                </SelectContent>
              </Select>
            </div>
            <Separator />
            <div className="flex items-center justify-between">
              <div className="space-y-0.5"><Label className="text-sm">Compact Mode</Label><p className="text-xs text-muted-foreground">Reduce spacing in tables and lists</p></div>
              <Switch checked={display.compactMode} onCheckedChange={v => setDisplay(d => ({ ...d, compactMode: v }))} />
            </div>
            <Separator />
            <div className="flex items-center justify-between">
              <div className="space-y-0.5"><Label className="text-sm">Theme</Label><p className="text-xs text-muted-foreground">Appearance of the interface</p></div>
              <div className="flex items-center gap-1 border rounded-lg p-1">
                {([['light', Sun, 'Light'], ['dark', Moon, 'Dark'], ['system', Monitor, 'System']] as const).map(([t, Icon, lbl]) => (
                  <button key={t} onClick={() => setTheme(t)} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${theme === t ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}><Icon className="h-3.5 w-3.5" />{lbl}</button>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm">
          <CardHeader>
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-lg bg-amber-100 dark:bg-amber-950/40 flex items-center justify-center"><Bell className="h-4 w-4 text-amber-600 dark:text-amber-400" /></div>
              <div><CardTitle className="text-sm">Notifications</CardTitle><CardDescription>Configure notification behavior</CardDescription></div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5"><Label className="text-sm">Notification Sound</Label><p className="text-xs text-muted-foreground">Play sound on new notifications</p></div>
              <Switch checked={notifPrefs.soundEnabled} onCheckedChange={v => setNotifPrefs(n => ({ ...n, soundEnabled: v }))} />
            </div>
            <Separator />
            <div className="flex items-center justify-between">
              <div className="space-y-0.5"><Label className="text-sm">Desktop Notifications</Label><p className="text-xs text-muted-foreground">Show browser push notifications</p></div>
              <Switch checked={notifPrefs.desktopNotifications} onCheckedChange={v => {
                if (v && typeof Notification !== 'undefined' && Notification.permission !== 'granted') {
                  Notification.requestPermission().then(perm => { if (perm === 'granted') setNotifPrefs(n => ({ ...n, desktopNotifications: true })); else toast.error('Permission denied'); });
                } else { setNotifPrefs(n => ({ ...n, desktopNotifications: v })); }
              }} />
            </div>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm">
          <CardHeader>
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-lg bg-purple-100 dark:bg-purple-950/40 flex items-center justify-center"><CalendarDays className="h-4 w-4 text-purple-600 dark:text-purple-400" /></div>
              <div><CardTitle className="text-sm">Date & Time</CardTitle><CardDescription>Configure date and time formatting</CardDescription></div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5"><Label className="text-sm">Date Format</Label><p className="text-xs text-muted-foreground">How dates are displayed</p></div>
              <Select value={dateTime.dateFormat} onValueChange={v => setDateTime(d => ({ ...d, dateFormat: v }))}>
                <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {[{ value: 'YYYY-MM-DD', label: '2025-01-15 (ISO)' }, { value: 'MM/DD/YYYY', label: '01/15/2025 (US)' }, { value: 'DD/MM/YYYY', label: '15/01/2025 (EU)' }].map(f => (<SelectItem key={f.value} value={f.value}><span className="font-mono text-xs">{f.label}</span></SelectItem>))}
                </SelectContent>
              </Select>
            </div>
            <Separator />
            <div className="flex items-center justify-between">
              <div className="space-y-0.5"><Label className="text-sm">Timezone</Label><p className="text-xs text-muted-foreground">Used for date calculations</p></div>
              <Badge variant="outline" className="font-mono text-xs max-w-48 truncate"><Globe2 className="h-3 w-3 mr-1" />{dateTime.timezone}</Badge>
            </div>
          </CardContent>
        </Card>

        <div className="flex items-center justify-between pt-2 pb-6">
          <Button variant="outline" onClick={handleReset} className="text-muted-foreground"><RefreshCw className="h-3.5 w-3.5 mr-1.5" />Reset to Defaults</Button>
          <Button onClick={handleSave} disabled={saving} className="bg-emerald-600 hover:bg-emerald-700 text-white">{saving ? <RefreshCw className="h-4 w-4 animate-spin mr-1.5" /> : <Save className="h-4 w-4 mr-1.5" />}Save Preferences</Button>
        </div>
      </div>
    </div>
  );
}
