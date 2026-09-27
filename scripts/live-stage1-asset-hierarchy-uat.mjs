const baseUrl = (process.env.UAT_BASE_URL || 'https://iassetspro.lightworldtech.com').replace(/\/$/, '');
const username = process.env.UAT_USERNAME;
const password = process.env.UAT_PASSWORD;

if (!username || !password) {
  throw new Error('UAT_USERNAME and UAT_PASSWORD are required');
}

async function request(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, options);
  const text = await response.text();
  let json;
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    throw new Error(`${options.method || 'GET'} ${path} returned non-JSON HTTP ${response.status}`);
  }
  if (!response.ok || json.success === false) {
    throw new Error(`${options.method || 'GET'} ${path} failed HTTP ${response.status}: ${json.error || text}`);
  }
  return json;
}

const login = await request('/api/auth/login', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ username, password }),
});
const token = login.data?.token;
if (!token) throw new Error('Login succeeded without a session token');

const authHeaders = { authorization: `Bearer ${token}` };

const plants = await request('/api/plants', { headers: authHeaders });
const plant = (plants.data || []).find((entry) => entry.code === 'TEMA-UAT-01');
if (!plant) throw new Error('Tema Industrial UAT Plant is not available');

const scopedHeaders = { ...authHeaders, 'x-plant-id': plant.id };
const departments = await request(`/api/departments?plantId=${encodeURIComponent(plant.id)}`, { headers: scopedHeaders });
const productionDepartment = (departments.data || []).find((entry) => entry.code === 'PROD');
if (!productionDepartment) throw new Error('Production department is not available');

const categories = await request('/api/asset-categories', { headers: authHeaders });
let category = (categories.data || []).find((entry) => entry.code === 'PROD-MACH');
if (!category) {
  const created = await request('/api/asset-categories', {
    method: 'POST',
    headers: { ...authHeaders, 'content-type': 'application/json' },
    body: JSON.stringify({
      name: 'Production Machinery',
      code: 'PROD-MACH',
      description: 'Industrial production machines commissioned through clean UAT',
    }),
  });
  category = created.data;
}

const assetName = 'Rotary Printing Machine UAT-01';
const assetSearch = await request(
  `/api/assets?search=${encodeURIComponent(assetName)}&plantId=${encodeURIComponent(plant.id)}&limit=50`,
  { headers: scopedHeaders },
);
let asset = (assetSearch.data || []).find((entry) => entry.name === assetName);
if (!asset) {
  const created = await request('/api/assets', {
    method: 'POST',
    headers: { ...scopedHeaders, 'content-type': 'application/json' },
    body: JSON.stringify({
      name: assetName,
      description: 'Clean commissioning UAT machine for deep hierarchy, maintenance, inventory and PM validation',
      categoryId: category.id,
      condition: 'new',
      status: 'operational',
      criticality: 'high',
      location: 'Production Hall A',
      building: 'Main Factory',
      floor: 'Ground',
      area: 'Printing Line 1',
      plantId: plant.id,
      departmentId: productionDepartment.id,
      installedDate: '2026-09-27',
      expectedLifeYears: 15,
      specification: JSON.stringify({
        commissioningPurpose: 'clean_uat',
        hierarchyStandard: 'machine-assembly-subassembly-component-part',
      }),
    }),
  });
  asset = created.data;
}

const componentResponse = await request(
  `/api/component-registry?assetId=${encodeURIComponent(asset.id)}&limit=100`,
  { headers: scopedHeaders },
);
const existing = new Map((componentResponse.data || []).map((entry) => [entry.componentCode, entry]));

async function ensureComponent(definition) {
  const found = existing.get(definition.componentCode);
  if (found) return found;

  const created = await request('/api/component-registry', {
    method: 'POST',
    headers: { ...scopedHeaders, 'content-type': 'application/json' },
    body: JSON.stringify({
      ...definition,
      assetId: asset.id,
      lifecycleStatus: 'operational',
      healthScore: 100,
      operatingHours: 0,
    }),
  });
  existing.set(definition.componentCode, created.data);
  return created.data;
}

const assembly = await ensureComponent({
  componentCode: 'RPM-ASM-DRIVE',
  name: 'Main Drive Assembly',
  componentType: 'assembly',
  criticality: 'critical',
  description: 'Primary rotary printing machine drive assembly',
  manufacturer: '',
  modelNumber: '',
});

const subassembly = await ensureComponent({
  componentCode: 'RPM-SUB-GEARBOX',
  name: 'Gearbox Sub-Assembly',
  componentType: 'subassembly',
  parentId: assembly.id,
  criticality: 'critical',
  description: 'Gear reduction and power transmission sub-assembly',
});

const component = await ensureComponent({
  componentCode: 'RPM-CMP-OUTPUT-SHAFT',
  name: 'Gearbox Output Shaft',
  componentType: 'component',
  parentId: subassembly.id,
  criticality: 'high',
  description: 'Output shaft transferring gearbox torque to printing drive',
});

const part = await ensureComponent({
  componentCode: 'RPM-PRT-BRG-6205',
  name: 'Output Shaft Bearing 6205',
  componentType: 'part',
  parentId: component.id,
  criticality: 'high',
  description: 'Replaceable bearing fitted to the gearbox output shaft',
  expectedLifeHours: 12000,
});

const verify = await request(
  `/api/component-registry?assetId=${encodeURIComponent(asset.id)}&limit=100`,
  { headers: scopedHeaders },
);
const byCode = new Map((verify.data || []).map((entry) => [entry.componentCode, entry]));
const required = ['RPM-ASM-DRIVE', 'RPM-SUB-GEARBOX', 'RPM-CMP-OUTPUT-SHAFT', 'RPM-PRT-BRG-6205'];
for (const code of required) {
  if (!byCode.has(code)) throw new Error(`Hierarchy verification failed: missing ${code}`);
}
if (byCode.get('RPM-SUB-GEARBOX')?.parentId !== assembly.id) throw new Error('Sub-assembly parent verification failed');
if (byCode.get('RPM-CMP-OUTPUT-SHAFT')?.parentId !== subassembly.id) throw new Error('Component parent verification failed');
if (byCode.get('RPM-PRT-BRG-6205')?.parentId !== component.id) throw new Error('Part parent verification failed');

console.log(JSON.stringify({
  success: true,
  plant: { id: plant.id, code: plant.code, name: plant.name },
  department: { id: productionDepartment.id, code: productionDepartment.code, name: productionDepartment.name },
  category: { id: category.id, code: category.code, name: category.name },
  asset: { id: asset.id, assetTag: asset.assetTag, name: asset.name },
  hierarchy: required.map((code) => {
    const entry = byCode.get(code);
    return {
      id: entry.id,
      code: entry.componentCode,
      name: entry.name,
      type: entry.componentType,
      parentId: entry.parentId || null,
    };
  }),
}, null, 2));
