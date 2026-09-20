/**
 * API Client for server-state assertions in Repairs/RWOP E2E tests.
 *
 * All domain mutations still use the role-specific token supplied by the test.
 * User-ID discovery uses the role-filtered /api/users path because unrestricted
 * user queries are intentionally admin-only in production.
 */

const BASE = (process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000').replace(/\/$/, '');

const USERS: Record<string, string> = {
  requester: 'uat_requester',
  supervisor: 'uat_supervisor',
  planner: 'uat_planner',
  tech_single: 'uat_tech_single',
  tech_leader: 'uat_tech_leader',
  tech_assistant: 'uat_tech_assistant',
  storekeeper: 'uat_storekeeper',
  plant_a_user: 'uat_plant_a_user',
  plant_b_user: 'uat_plant_b_user',
  supervisor_plant_a: 'uat_supervisor_plant_a',
  planner_plant_a: 'uat_planner_plant_a',
  supervisor_plant_b: 'uat_supervisor_plant_b',
  planner_plant_b: 'uat_planner_plant_b',
};

const LOOKUP_ROLE_BY_USERNAME: Record<string, string> = {
  uat_requester: 'requester',
  uat_supervisor: 'maintenance_supervisor',
  uat_planner: 'planner',
  uat_tech_single: 'maintenance_technician',
  uat_tech_leader: 'maintenance_technician',
  uat_tech_assistant: 'maintenance_technician',
  uat_storekeeper: 'storekeeper',
  uat_plant_a_user: 'maintenance_technician',
  uat_plant_b_user: 'maintenance_technician',
  uat_supervisor_plant_a: 'maintenance_supervisor',
  uat_planner_plant_a: 'planner',
  uat_supervisor_plant_b: 'maintenance_supervisor',
  uat_planner_plant_b: 'planner',
};

async function readJson(res: Response): Promise<any> {
  const text = await res.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { success: false, error: text };
  }
}

/** Get auth token for a UAT user. */
export async function getToken(userKey: string): Promise<string> {
  const username = USERS[userKey];
  if (!username) throw new Error(`Unknown UAT user key: ${userKey}`);

  const res = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password: 'TestPass123!' }),
  });
  const json = await readJson(res);
  if (!res.ok) throw new Error(`Auth failed for ${userKey}: ${res.status} ${JSON.stringify(json)}`);
  if (!json.data?.token) throw new Error(`No token for ${userKey}`);
  return json.data.token as string;
}

/** Make an authenticated API call. */
export async function apiCall(
  token: string,
  method: string,
  path: string,
  body?: unknown,
) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, data: await readJson(res) };
}

const userCache: Record<string, string> = {};

/**
 * Look up a user's DB ID by username without bypassing production RBAC.
 * /api/users allows authenticated role-filtered queries, while unrestricted
 * queries are admin-only. The role filter is used only for ID discovery.
 */
export async function lookupUserId(token: string, username: string): Promise<string> {
  if (userCache[username]) return userCache[username];

  const role = LOOKUP_ROLE_BY_USERNAME[username];
  if (!role) throw new Error(`No UAT lookup role configured for ${username}`);

  const query = `/api/users?role=${encodeURIComponent(role)}&search=${encodeURIComponent(username)}`;
  const { status, data } = await apiCall(token, 'GET', query);
  if (status !== 200 || !data.success) {
    throw new Error(`Failed to look up user ${username}: ${status} ${JSON.stringify(data)}`);
  }

  const users = data.data as Array<{ id: string; username: string }>;
  const found = users.find((u) => u.username === username);
  if (!found) throw new Error(`User ${username} not found in API response`);
  userCache[username] = found.id;
  return found.id;
}

export async function lookupUserByKey(token: string, userKey: string): Promise<string> {
  const username = USERS[userKey];
  if (!username) throw new Error(`Unknown UAT user key: ${userKey}`);
  return lookupUserId(token, username);
}

const assetCache: Record<string, string> = {};
export async function lookupAssetId(token: string, assetTag: string): Promise<string> {
  if (assetCache[assetTag]) return assetCache[assetTag];
  const { status, data } = await apiCall(token, 'GET', `/api/assets?search=${encodeURIComponent(assetTag)}`);
  if (status !== 200 || !data.success) {
    throw new Error(`Failed to look up asset ${assetTag}: ${status} ${JSON.stringify(data)}`);
  }
  const assets = data.data as Array<{ id: string; assetTag: string }>;
  const found = assets.find((a) => a.assetTag === assetTag);
  if (!found) throw new Error(`Asset ${assetTag} not found`);
  assetCache[assetTag] = found.id;
  return found.id;
}

const plantCache: Record<string, string> = {};
export async function lookupPlantId(token: string, code: string): Promise<string> {
  if (plantCache[code]) return plantCache[code];
  const { status, data } = await apiCall(token, 'GET', '/api/plants');
  if (status !== 200 || !data.success) throw new Error(`Failed to look up plants: ${status} ${JSON.stringify(data)}`);
  const plants = data.data as Array<{ id: string; code: string }>;
  const found = plants.find((p) => p.code === code);
  if (!found) throw new Error(`Plant ${code} not found`);
  plantCache[code] = found.id;
  return found.id;
}

const toolCache: Record<string, string> = {};
export async function lookupToolId(token: string, toolName: string): Promise<string> {
  if (toolCache[toolName]) return toolCache[toolName];
  const { status, data } = await apiCall(token, 'GET', `/api/tools?mode=lookup&search=${encodeURIComponent(toolName)}`);
  if (status !== 200 || !data.success) {
    throw new Error(`Failed to look up tool ${toolName}: ${status} ${JSON.stringify(data)}`);
  }
  const tools = data.data as Array<{ id: string; name: string }>;
  const found = tools.find((t) => t.name === toolName);
  if (!found) throw new Error(`Tool ${toolName} not found`);
  toolCache[toolName] = found.id;
  return found.id;
}

export async function createMR(
  token: string,
  data: {
    title: string;
    description: string;
    assetId?: string;
    assetName?: string;
    priority: string;
    plantId: string;
    supervisorId?: string;
  },
) {
  // UAT requests model a real approval assignment explicitly instead of relying
  // on a test-only production fallback. The production endpoint still validates
  // the supervisor role, active status, and plant membership.
  const supervisorId = data.supervisorId ?? await lookupUserByKey(token, 'supervisor');
  const { status, data: resp } = await apiCall(token, 'POST', '/api/maintenance-requests', {
    ...data,
    assetName: data.assetName ?? (data.assetId ? undefined : data.title),
    supervisorId,
  });
  if (status < 200 || status >= 300) throw new Error(`MR creation failed: ${status} ${JSON.stringify(resp)}`);
  return resp.data;
}

export async function approveMR(token: string, mrId: string) {
  const { status, data: resp } = await apiCall(token, 'POST', `/api/maintenance-requests/${mrId}/approve`, {});
  if (status < 200 || status >= 300) throw new Error(`MR approval failed: ${status} ${JSON.stringify(resp)}`);
  return resp.data;
}

export async function convertMR(
  token: string,
  mrId: string,
  payload?: {
    assignedTo?: string;
    teamLeaderId?: string;
    teamMembers?: Array<{ userId: string; role: string }>;
    assignmentType?: 'direct' | 'via_supervisor';
    assignedSupervisorId?: string;
    tradeActivity?: string;
    workOrderType?: string;
    priority?: string;
  },
) {
  const { status, data: resp } = await apiCall(token, 'POST', `/api/maintenance-requests/${mrId}/convert`, payload || {});
  if (status < 200 || status >= 300) throw new Error(`MR conversion failed: ${status} ${JSON.stringify(resp)}`);
  return resp.data;
}

export async function getMR(token: string, mrId: string) {
  const { status, data: resp } = await apiCall(token, 'GET', `/api/maintenance-requests/${mrId}`);
  if (status !== 200) throw new Error(`MR fetch failed: ${status} ${JSON.stringify(resp)}`);
  return resp.data;
}

export async function assignWO(
  token: string,
  woId: string,
  body: {
    assignedTo?: string;
    teamLeaderId?: string;
    teamMembers?: Array<{ userId: string; role?: string }>;
    assignedSupervisorId?: string;
    assignmentType?: 'direct' | 'via_supervisor';
  },
) {
  const { status, data: resp } = await apiCall(token, 'POST', `/api/work-orders/${woId}/assign`, body);
  if (status < 200 || status >= 300) throw new Error(`WO assignment failed: ${status} ${JSON.stringify(resp)}`);
  return resp.data;
}

export async function acceptWOAssignment(token: string, woId: string) {
  const { status, data: resp } = await apiCall(token, 'POST', `/api/work-orders/${woId}/assignment-response`, {
    response: 'accepted',
  });
  if (status < 200 || status >= 300) throw new Error(`WO assignment acceptance failed: ${status} ${JSON.stringify(resp)}`);
  return resp.data;
}

export async function startWO(token: string, woId: string) {
  const capabilities = await getCapabilities(token, woId);
  if (!capabilities.canStart) {
    await acceptWOAssignment(token, woId);
  }

  const { status, data: resp } = await apiCall(token, 'POST', `/api/work-orders/${woId}/start`, {});
  if (status < 200 || status >= 300) throw new Error(`WO start failed: ${status} ${JSON.stringify(resp)}`);
  return resp.data;
}

export async function logTime(
  token: string,
  woId: string,
  body: { action: string; manualHours?: number; notes?: string },
) {
  const { status, data: resp } = await apiCall(token, 'POST', `/api/work-orders/${woId}/time-logs`, body);
  if (status < 200 || status >= 300) throw new Error(`Time log creation failed: ${status} ${JSON.stringify(resp)}`);
  return resp.data;
}

async function prepareCompletionEvidence(token: string, woId: string) {
  const execution = await apiCall(token, 'PATCH', `/api/work-orders/${woId}/execution-details`, {
    failureDescription: 'UAT-observed equipment failure requiring maintenance intervention',
    causeDescription: 'UAT-confirmed component degradation under operating load',
    actionDescription: 'UAT repair completed and functional checks passed',
  });
  if (execution.status < 200 || execution.status >= 300) {
    throw new Error(`WO execution evidence failed: ${execution.status} ${JSON.stringify(execution.data)}`);
  }

  const form = new FormData();
  const pngSignature = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]);
  form.append('file', new Blob([pngSignature], { type: 'image/png' }), 'uat-completion-evidence.png');
  form.append('category', 'technician_evidence');
  form.append('description', 'Deterministic Repairs UAT completion evidence');

  const response = await fetch(`${BASE}/api/work-orders/${woId}/attachments`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  const body = await readJson(response);
  if (!response.ok) {
    throw new Error(`WO completion attachment failed: ${response.status} ${JSON.stringify(body)}`);
  }
}

export async function completeWO(token: string, woId: string, notes?: string) {
  await prepareCompletionEvidence(token, woId);
  const { status, data: resp } = await apiCall(token, 'POST', `/api/work-orders/${woId}/complete`, { notes });
  if (status < 200 || status >= 300) throw new Error(`WO completion failed: ${status} ${JSON.stringify(resp)}`);
  return resp.data;
}

export async function verifyWO(token: string, woId: string, qualityRating?: number) {
  const { status, data: resp } = await apiCall(token, 'POST', `/api/work-orders/${woId}/verify`, { qualityRating });
  if (status < 200 || status >= 300) throw new Error(`WO verification failed: ${status} ${JSON.stringify(resp)}`);
  return resp.data;
}

export async function requestRework(token: string, woId: string, reason?: string) {
  const { status, data: resp } = await apiCall(token, 'POST', `/api/work-orders/${woId}/verify`, { action: 'rework', reason });
  if (status < 200 || status >= 300) throw new Error(`Rework request failed: ${status} ${JSON.stringify(resp)}`);
  return resp.data;
}

export async function closeWO(token: string, woId: string) {
  const { status, data: resp } = await apiCall(token, 'POST', `/api/work-orders/${woId}/close`, {});
  if (status < 200 || status >= 300) throw new Error(`WO closure failed: ${status} ${JSON.stringify(resp)}`);
  return resp.data;
}

export async function getWO(token: string, woId: string) {
  const { status, data: resp } = await apiCall(token, 'GET', `/api/work-orders/${woId}`);
  if (status !== 200) throw new Error(`WO fetch failed: ${status} ${JSON.stringify(resp)}`);
  return resp.data;
}

export async function getCapabilities(token: string, woId: string) {
  const { status, data: resp } = await apiCall(token, 'GET', `/api/work-orders/${woId}/capabilities`);
  if (status !== 200) throw new Error(`Capabilities fetch failed: ${status} ${JSON.stringify(resp)}`);
  return resp.data;
}

export async function requestAssistance(
  token: string,
  woId: string,
  body: { requestedUserId?: string; requestedTrade?: string; reason?: string; role?: string },
) {
  const { status, data: resp } = await apiCall(token, 'POST', `/api/work-orders/${woId}/team-member-requests`, body);
  if (status < 200 || status >= 300) throw new Error(`Assistance request failed: ${status} ${JSON.stringify(resp)}`);
  return resp.data;
}

export async function approveAssistanceRequest(
  token: string,
  woId: string,
  reqId: string,
  assignUserId?: string,
) {
  const { status, data: resp } = await apiCall(token, 'PUT', `/api/work-orders/${woId}/team-member-requests/${reqId}`, {
    action: 'approve',
    assignUserId,
  });
  if (status < 200 || status >= 300) throw new Error(`Assistance approval failed: ${status} ${JSON.stringify(resp)}`);
  return resp.data;
}

export async function getTeamMemberRequests(token: string, woId: string) {
  const { status, data: resp } = await apiCall(token, 'GET', `/api/work-orders/${woId}/team-member-requests`);
  if (status !== 200) throw new Error(`Team member requests fetch failed: ${status} ${JSON.stringify(resp)}`);
  return resp.data;
}

export async function expectFailure(token: string, method: string, path: string, body?: unknown) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, data: await readJson(res) };
}

export async function initiateHandoverWO(token: string, woId: string, reason?: string) {
  const { status, data } = await apiCall(token, 'POST', `/api/work-orders/${woId}/handover`, { reason });
  if (status < 200 || status >= 300) throw new Error(`Handover failed: ${status} ${JSON.stringify(data)}`);
  return data.data || data;
}

export async function resumeAfterHandoverWO(token: string, woId: string, reason?: string) {
  const { status, data } = await apiCall(token, 'POST', `/api/work-orders/${woId}/handover`, { action: 'resume', reason });
  if (status < 200 || status >= 300) throw new Error(`Resume after handover failed: ${status} ${JSON.stringify(data)}`);
  return data.data || data;
}

export async function requestReworkWO(token: string, woId: string, reason: string, category?: string) {
  const { status, data } = await apiCall(token, 'POST', `/api/work-orders/${woId}/rework`, { reason, category });
  if (status < 200 || status >= 300) throw new Error(`Rework failed: ${status} ${JSON.stringify(data)}`);
  return data.data || data;
}

export async function apiCallWithPlant(
  token: string,
  method: string,
  path: string,
  plantId: string,
  body?: unknown,
) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      'X-Plant-ID': plantId,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, data: await readJson(res) };
}

export async function expectFailureWithPlant(
  token: string,
  method: string,
  path: string,
  plantId: string,
  body?: unknown,
) {
  return apiCallWithPlant(token, method, path, plantId, body);
}
