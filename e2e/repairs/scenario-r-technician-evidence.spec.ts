/**
 * Scenario R — Technician Photos & Evidence (UAT-18)
 *
 * Browser proof for the technician evidence workflow:
 * - select multiple files in one picker action
 * - remove a queued file before upload
 * - upload multiple evidence files on the first attempt
 * - verify persisted storage/download content
 * - remove persisted evidence and verify server/UI counts reconcile
 */
import { test, expect } from '@playwright/test';
import { authenticateAs, navigateToWODetail } from './helpers/auth';
import {
  apiCall,
  approveMR,
  convertMR,
  createMR,
  getToken,
  lookupAssetId,
  lookupPlantId,
  lookupUserByKey,
  startWO,
} from './helpers/api';

const BASE = (process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000').replace(/\/$/, '');

test('UAT-18: technician uploads multiple evidence files first try and can remove persisted evidence', async ({ browser }) => {
  test.setTimeout(120_000);

  const requesterToken = await getToken('requester');
  const supervisorToken = await getToken('supervisor');
  const plannerToken = await getToken('planner');
  const technicianToken = await getToken('tech_single');

  const plantId = await lookupPlantId(plannerToken, 'PLANT-A');
  const assetId = await lookupAssetId(plannerToken, 'UAT-PUMP-001');
  const supervisorId = await lookupUserByKey(plannerToken, 'supervisor');
  const technicianId = await lookupUserByKey(plannerToken, 'tech_single');
  const suffix = `${Date.now()}`.slice(-8);
  const firstName = `uat-evidence-a-${suffix}.txt`;
  const secondName = `uat-evidence-b-${suffix}.csv`;
  const firstBody = `UAT evidence A ${suffix}\nBearing inspection photograph notes\n`;
  const secondBody = `point,value\nvibration,0.45\nrun,${suffix}\n`;

  const mr = await createMR(requesterToken, {
    title: `UAT technician evidence ${suffix}`,
    description: 'Verify first-attempt multi-file evidence upload and removal from a technician work order.',
    assetId,
    priority: 'medium',
    plantId,
    supervisorId,
  });
  await approveMR(supervisorToken, mr.id);
  const wo = await convertMR(plannerToken, mr.id, {
    assignedTo: technicianId,
    assignedSupervisorId: supervisorId,
    assignmentType: 'direct',
    tradeActivity: 'mechanical',
    workOrderType: 'corrective',
    priority: 'medium',
  });
  await startWO(technicianToken, wo.id);

  const context = await browser.newContext();
  await authenticateAs(context, 'tech_single');
  const page = await context.newPage();
  await navigateToWODetail(page, wo.id);

  const fileInput = page.locator('input[type="file"][multiple]');
  const description = page.getByPlaceholder('Evidence description for selected files (optional)');

  await test.step('Queue removal works before upload without losing the other selected file', async () => {
    await expect(page.getByText('Photos & Evidence')).toBeVisible();
    await fileInput.setInputFiles([
      { name: firstName, mimeType: 'text/plain', buffer: Buffer.from(firstBody) },
      { name: secondName, mimeType: 'text/csv', buffer: Buffer.from(secondBody) },
    ]);
    await expect(page.getByText('2 files selected')).toBeVisible();
    await expect(page.getByText(firstName)).toBeVisible();
    await expect(page.getByText(secondName)).toBeVisible();

    await page.getByRole('button', { name: `Remove ${secondName} from upload queue` }).click();
    await expect(page.getByText('1 file selected')).toBeVisible();
    await expect(page.getByText(firstName)).toBeVisible();
    await expect(page.getByText(secondName)).toBeHidden();
  });

  await test.step('First upload click persists both selected evidence files', async () => {
    await fileInput.setInputFiles([
      { name: firstName, mimeType: 'text/plain', buffer: Buffer.from(firstBody) },
      { name: secondName, mimeType: 'text/csv', buffer: Buffer.from(secondBody) },
    ]);
    await expect(page.getByText('2 files selected')).toBeVisible();
    await description.fill('UAT technician evidence first-attempt multi-upload');

    const uploads: number[] = [];
    page.on('response', (response) => {
      if (response.request().method() === 'POST' && response.url().includes(`/api/work-orders/${wo.id}/attachments`)) {
        uploads.push(response.status());
      }
    });

    await page.getByRole('button', { name: 'Upload 2 Files' }).click();
    await expect(page.getByText('2 evidence files uploaded')).toBeVisible();
    await expect(page.getByText(firstName)).toBeVisible();
    await expect(page.getByText(secondName)).toBeVisible();
    expect(uploads).toEqual([201, 201]);
  });

  let firstAttachmentId = '';
  let secondAttachmentId = '';
  await test.step('Persisted evidence is downloadable from object storage with the original bytes', async () => {
    const list = await apiCall(
      technicianToken,
      'GET',
      `/api/work-orders/${wo.id}/attachments?category=technician_evidence`,
    );
    expect(list.status).toBe(200);
    const attachments = list.data.data as Array<any>;
    const first = attachments.find((attachment) => attachment.fileName === firstName);
    const second = attachments.find((attachment) => attachment.fileName === secondName);
    expect(first).toBeTruthy();
    expect(second).toBeTruthy();
    expect(first.description).toContain('[technician_evidence]');
    expect(second.description).toContain('[technician_evidence]');
    firstAttachmentId = first.id;
    secondAttachmentId = second.id;

    const download = await fetch(`${BASE}/api/work-orders/${wo.id}/attachments/${firstAttachmentId}`, {
      headers: { Authorization: `Bearer ${technicianToken}` },
    });
    expect(download.status).toBe(200);
    expect(download.headers.get('content-type')).toContain('text/plain');
    expect(await download.text()).toBe(firstBody);
  });

  await test.step('Uploader removes persisted evidence through the browser and storage record disappears', async () => {
    const deleteResponsePromise = page.waitForResponse((response) =>
      response.request().method() === 'DELETE' && response.url().includes(`/api/work-orders/${wo.id}/attachments/${firstAttachmentId}`),
    );
    await page.getByRole('button', { name: `Remove ${firstName}` }).click();
    const deleteResponse = await deleteResponsePromise;
    expect(deleteResponse.status()).toBe(200);
    await expect(page.getByText('Evidence removed')).toBeVisible();
    await expect(page.getByText(firstName)).toBeHidden();
    await expect(page.getByText(secondName)).toBeVisible();

    const listAfterDelete = await apiCall(
      technicianToken,
      'GET',
      `/api/work-orders/${wo.id}/attachments?category=technician_evidence`,
    );
    expect(listAfterDelete.status).toBe(200);
    const remaining = listAfterDelete.data.data as Array<any>;
    expect(remaining.some((attachment) => attachment.id === firstAttachmentId)).toBe(false);
    expect(remaining.some((attachment) => attachment.id === secondAttachmentId)).toBe(true);

    const deletedDownload = await fetch(`${BASE}/api/work-orders/${wo.id}/attachments/${firstAttachmentId}`, {
      headers: { Authorization: `Bearer ${technicianToken}` },
    });
    expect(deletedDownload.status).toBe(404);
  });

  await test.step('Clean up timer and remaining evidence', async () => {
    await page.getByRole('button', { name: `Remove ${secondName}` }).click();
    await expect(page.getByText(secondName)).toBeHidden();

    const stopTimer = await apiCall(technicianToken, 'POST', `/api/work-orders/${wo.id}/time-logs/stop`, {});
    expect([200, 409]).toContain(stopTimer.status);
  });

  await context.close();
});
