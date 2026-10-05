import { NextRequest, NextResponse } from 'next/server';
import { getSessionAsync, isAdmin } from '@/lib/auth';
import { db } from '@/lib/db';
import bcrypt from 'bcryptjs';

export const dynamic = 'force-dynamic';

// Supported import modules with their validation schemas
const SUPPORTED_IMPORT_MODULES = ['assets', 'inventory', 'users', 'plants', 'departments'] as const;

interface ImportRecord {
  total: number;
  imported: number;
  skipped: number;
  errors: string[];
}

interface ImportResult {
  assets?: ImportRecord;
  inventory?: ImportRecord;
  users?: ImportRecord;
  plants?: ImportRecord;
  departments?: ImportRecord;
  summary: {
    totalRecords: number;
    importedCount: number;
    skippedCount: number;
    errorCount: number;
  };
}

// Validation schemas for each module
const ASSET_REQUIRED_FIELDS = ['name', 'assetTag', 'plantId'];
const INVENTORY_REQUIRED_FIELDS = ['itemCode', 'name', 'plantId'];
const USER_REQUIRED_FIELDS = ['username', 'email', 'fullName', 'password'];
const PLANT_REQUIRED_FIELDS = ['name', 'code'];
const DEPARTMENT_REQUIRED_FIELDS = ['name', 'code', 'plantId'];

function validateRequiredFields(record: Record<string, unknown>, requiredFields: string[], moduleName: string): string | null {
  for (const field of requiredFields) {
    if (!record[field]) {
      return `${moduleName}: Missing required field "${field}"`;
    }
  }
  return null;
}

async function importAssets(records: Record<string, unknown>[], currentUserId: string): Promise<ImportRecord> {
  const result: ImportRecord = { total: records.length, imported: 0, skipped: 0, errors: [] };

  for (let i = 0; i < records.length; i++) {
    const record = records[i];
    try {
      const validationError = validateRequiredFields(record, ASSET_REQUIRED_FIELDS, `Asset #${i + 1}`);
      if (validationError) {
        result.errors.push(validationError);
        continue;
      }

      // Check for existing asset by assetTag
      const existing = await db.asset.findUnique({
        where: { assetTag: String(record.assetTag) },
      });

      if (existing) {
        result.skipped++;
        continue;
      }

      // Asset.category is required. Use an explicit category when supplied,
      // otherwise resolve a default category and fail this row if none exists.
      let categoryId = record.categoryId ? String(record.categoryId) : undefined;
      if (categoryId) {
        const category = await db.assetCategory.findUnique({ where: { id: categoryId }, select: { id: true } });
        if (!category) {
          result.errors.push(`Asset #${i + 1}: Category not found`);
          continue;
        }
      } else {
        const defaultCategory = await db.assetCategory.findFirst({ select: { id: true } });
        if (!defaultCategory) {
          result.errors.push(`Asset #${i + 1}: No asset category is available`);
          continue;
        }
        categoryId = defaultCategory.id;
      }

      const plantId = String(record.plantId);
      const plant = await db.plant.findUnique({ where: { id: plantId }, select: { id: true } });
      if (!plant) {
        result.errors.push(`Asset #${i + 1}: Plant not found`);
        continue;
      }

      let departmentId: string | undefined;
      if (record.departmentId) {
        departmentId = String(record.departmentId);
        const department = await db.department.findUnique({ where: { id: departmentId }, select: { plantId: true } });
        if (!department) {
          result.errors.push(`Asset #${i + 1}: Department not found`);
          continue;
        }
        if (department.plantId !== plantId) {
          result.errors.push(`Asset #${i + 1}: Department must belong to the same plant`);
          continue;
        }
      }

      await db.asset.create({
        data: {
          name: String(record.name),
          assetTag: String(record.assetTag),
          description: record.description ? String(record.description) : null,
          category: { connect: { id: categoryId } },
          serialNumber: record.serialNumber ? String(record.serialNumber) : null,
          manufacturer: record.manufacturer ? String(record.manufacturer) : null,
          model: record.model ? String(record.model) : null,
          condition: record.condition ? String(record.condition) : 'new',
          status: record.status ? String(record.status) : 'operational',
          criticality: record.criticality ? String(record.criticality) : 'medium',
          location: record.location ? String(record.location) : null,
          building: record.building ? String(record.building) : null,
          floor: record.floor ? String(record.floor) : null,
          area: record.area ? String(record.area) : null,
          plant: { connect: { id: plantId } },
          department: departmentId ? { connect: { id: departmentId } } : undefined,
          purchaseDate: record.purchaseDate ? new Date(String(record.purchaseDate)) : null,
          purchaseCost: record.purchaseCost ? Number(record.purchaseCost) : null,
          warrantyExpiry: record.warrantyExpiry ? new Date(String(record.warrantyExpiry)) : null,
          installedDate: record.installedDate ? new Date(String(record.installedDate)) : null,
          expectedLifeYears: record.expectedLifeYears ? Number(record.expectedLifeYears) : null,
          currentValue: record.currentValue ? Number(record.currentValue) : null,
          depreciationRate: record.depreciationRate ? Number(record.depreciationRate) : null,
          createdBy: { connect: { id: currentUserId } },
          isActive: record.isActive !== false,
          specification: record.specification ? String(record.specification) : '{}',
        },
      });
      result.imported++;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      result.errors.push(`Asset #${i + 1} (${record.name || 'unknown'}): ${msg}`);
    }
  }

  return result;
}

async function importInventory(records: Record<string, unknown>[], currentUserId: string): Promise<ImportRecord> {
  const result: ImportRecord = { total: records.length, imported: 0, skipped: 0, errors: [] };

  for (let i = 0; i < records.length; i++) {
    const record = records[i];
    try {
      const validationError = validateRequiredFields(record, INVENTORY_REQUIRED_FIELDS, `Inventory #${i + 1}`);
      if (validationError) {
        result.errors.push(validationError);
        continue;
      }

      // Check for existing inventory item by itemCode
      const existing = await db.inventoryItem.findUnique({
        where: { itemCode: String(record.itemCode) },
      });

      if (existing) {
        result.skipped++;
        continue;
      }

      const plantId = String(record.plantId);
      const plant = await db.plant.findUnique({ where: { id: plantId }, select: { id: true } });
      if (!plant) {
        result.errors.push(`Inventory #${i + 1}: Plant not found`);
        continue;
      }

      await db.inventoryItem.create({
        data: {
          itemCode: String(record.itemCode),
          name: String(record.name),
          description: record.description ? String(record.description) : null,
          category: record.category ? String(record.category) : 'other',
          unitOfMeasure: record.unitOfMeasure ? String(record.unitOfMeasure) : 'each',
          currentStock: record.currentStock ? Number(record.currentStock) : 0,
          minStockLevel: record.minStockLevel ? Number(record.minStockLevel) : 0,
          maxStockLevel: record.maxStockLevel ? Number(record.maxStockLevel) : null,
          reorderQuantity: record.reorderQuantity ? Number(record.reorderQuantity) : null,
          unitCost: record.unitCost ? Number(record.unitCost) : null,
          supplier: record.supplier ? String(record.supplier) : null,
          supplierPartNumber: record.supplierPartNumber ? String(record.supplierPartNumber) : null,
          location: record.location ? String(record.location) : null,
          binLocation: record.binLocation ? String(record.binLocation) : null,
          shelfLocation: record.shelfLocation ? String(record.shelfLocation) : null,
          plantId,
          locationId: record.locationId ? String(record.locationId) : null,
          supplierId: record.supplierId ? String(record.supplierId) : null,
          isActive: record.isActive !== false,
          specification: record.specification ? String(record.specification) : '{}',
          imageUrls: record.imageUrls ? String(record.imageUrls) : '[]',
          createdById: currentUserId,
        },
      });
      result.imported++;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      result.errors.push(`Inventory #${i + 1} (${record.itemCode || 'unknown'}): ${msg}`);
    }
  }

  return result;
}

async function importUsers(records: Record<string, unknown>[], currentUserId: string): Promise<ImportRecord> {
  const result: ImportRecord = { total: records.length, imported: 0, skipped: 0, errors: [] };

  for (let i = 0; i < records.length; i++) {
    const record = records[i];
    try {
      const validationError = validateRequiredFields(record, USER_REQUIRED_FIELDS, `User #${i + 1}`);
      if (validationError) {
        result.errors.push(validationError);
        continue;
      }

      // Check for existing user by username or email
      const existing = await db.user.findFirst({
        where: {
          OR: [
            { username: String(record.username) },
            { email: String(record.email) },
          ],
        },
      });

      if (existing) {
        result.skipped++;
        continue;
      }

      // Hash password
      const passwordHash = await bcrypt.hash(String(record.password), 12);

      await db.user.create({
        data: {
          username: String(record.username),
          email: String(record.email),
          fullName: String(record.fullName),
          passwordHash,
          staffId: record.staffId ? String(record.staffId) : null,
          phone: record.phone ? String(record.phone) : null,
          department: record.department ? String(record.department) : null,
          status: record.status ? String(record.status) : 'active',
          isVendorAdmin: record.isVendorAdmin === true,
        },
      });
      result.imported++;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      result.errors.push(`User #${i + 1} (${record.username || 'unknown'}): ${msg}`);
    }
  }

  return result;
}

async function importPlants(records: Record<string, unknown>[]): Promise<ImportRecord> {
  const result: ImportRecord = { total: records.length, imported: 0, skipped: 0, errors: [] };

  for (let i = 0; i < records.length; i++) {
    const record = records[i];
    try {
      const validationError = validateRequiredFields(record, PLANT_REQUIRED_FIELDS, `Plant #${i + 1}`);
      if (validationError) {
        result.errors.push(validationError);
        continue;
      }

      // Check for existing plant by code
      const existing = await db.plant.findUnique({
        where: { code: String(record.code) },
      });

      if (existing) {
        result.skipped++;
        continue;
      }

      await db.plant.create({
        data: {
          name: String(record.name),
          code: String(record.code),
          location: record.location ? String(record.location) : null,
          country: record.country ? String(record.country) : null,
          city: record.city ? String(record.city) : null,
          isActive: record.isActive !== false,
        },
      });
      result.imported++;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      result.errors.push(`Plant #${i + 1} (${record.code || 'unknown'}): ${msg}`);
    }
  }

  return result;
}

async function importDepartments(records: Record<string, unknown>[]): Promise<ImportRecord> {
  const result: ImportRecord = { total: records.length, imported: 0, skipped: 0, errors: [] };

  for (let i = 0; i < records.length; i++) {
    const record = records[i];
    try {
      const validationError = validateRequiredFields(record, DEPARTMENT_REQUIRED_FIELDS, `Department #${i + 1}`);
      if (validationError) {
        result.errors.push(validationError);
        continue;
      }

      // Check for existing department by code + plantId
      const existing = await db.department.findFirst({
        where: {
          code: String(record.code),
          plantId: String(record.plantId),
        },
      });

      if (existing) {
        result.skipped++;
        continue;
      }

      await db.department.create({
        data: {
          name: String(record.name),
          code: String(record.code),
          plantId: String(record.plantId),
          supervisorId: record.supervisorId ? String(record.supervisorId) : null,
        },
      });
      result.imported++;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      result.errors.push(`Department #${i + 1} (${record.code || 'unknown'}): ${msg}`);
    }
  }

  return result;
}

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization');
    const token = authHeader?.replace('Bearer ', '');
    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const session = await getSessionAsync(token);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!isAdmin(session)) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    // Parse multipart form data
    const formData = await req.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ error: 'No file uploaded. Please provide a JSON file.' }, { status: 400 });
    }

    if (!file.name.endsWith('.json')) {
      return NextResponse.json({ error: 'Invalid file type. Only JSON files are accepted.' }, { status: 400 });
    }

    // Read and parse file content
    const text = await file.text();
    let data: Record<string, unknown>;

    try {
      data = JSON.parse(text);
    } catch {
      return NextResponse.json({ error: 'Invalid JSON file. Please check the file format.' }, { status: 400 });
    }

    // Validate structure - expect { data: { assets: [...], inventory: [...], ... } }
    // or a flat structure with module keys at root
    let importPayload: Record<string, unknown[]>;
    if (data.data && typeof data.data === 'object' && !Array.isArray(data.data)) {
      // New format: { data: { assets: [...], ... } }
      importPayload = data.data as Record<string, unknown[]>;
    } else {
      // Flat format: { assets: [...], ... }
      importPayload = data as Record<string, unknown[]>;
    }

    // Validate that at least one supported module exists
    const foundModules = SUPPORTED_IMPORT_MODULES.filter(m => {
      const records = importPayload[m];
      return Array.isArray(records) && records.length > 0;
    });

    if (foundModules.length === 0) {
      return NextResponse.json({
        error: `No importable data found. Supported modules: ${SUPPORTED_IMPORT_MODULES.join(', ')}`,
      }, { status: 400 });
    }

    // Import each module
    const result: ImportResult = {
      summary: { totalRecords: 0, importedCount: 0, skippedCount: 0, errorCount: 0 },
    };

    // Import order matters: plants → departments → users → assets → inventory
    const importOrder = ['plants', 'departments', 'users', 'assets', 'inventory'] as const;

    for (const modKey of importOrder) {
      const records = importPayload[modKey];
      if (!Array.isArray(records) || records.length === 0) continue;

      const typedRecords = records as Record<string, unknown>[];

      let moduleResult: ImportRecord;
      switch (modKey) {
        case 'assets':
          moduleResult = await importAssets(typedRecords, session.userId);
          break;
        case 'inventory':
          moduleResult = await importInventory(typedRecords, session.userId);
          break;
        case 'users':
          moduleResult = await importUsers(typedRecords, session.userId);
          break;
        case 'plants':
          moduleResult = await importPlants(typedRecords);
          break;
        case 'departments':
          moduleResult = await importDepartments(typedRecords);
          break;
        default:
          continue;
      }

      result[modKey] = moduleResult;
      result.summary.totalRecords += moduleResult.total;
      result.summary.importedCount += moduleResult.imported;
      result.summary.skippedCount += moduleResult.skipped;
      result.summary.errorCount += moduleResult.errors.length;
    }

    return NextResponse.json({
      success: true,
      data: result,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Import failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
