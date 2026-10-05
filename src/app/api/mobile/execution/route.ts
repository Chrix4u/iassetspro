// ============================================================================
// POST /api/mobile/execution — Submit field execution updates
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { getSession, isAdmin } from '@/lib/auth';
import { db } from '@/lib/db';
import { createLogger } from '@/lib/logger';
import { authorizeWorkOrderExecutionAccess } from '@/lib/plant-auth-helpers';
import { isWorkOrderExecutionMember } from '@/services/workOrderAccess.service';

const logger = createLogger('api:mobile:execution');

export async function POST(req: NextRequest) {
  try {
    const session = getSession(req);
    if (!session) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const {
      workOrderId,
      action,
      checklistStepId,
      checklistStatus,
      measurement,
      voiceNote,
      completionData,
    } = body;

    if (!workOrderId || !action) {
      return NextResponse.json({ success: false, error: 'workOrderId and action are required' }, { status: 400 });
    }

    // Reuse the canonical plant + execution-member boundary. This keeps the
    // mobile execution surface aligned with the Repairs/RWOP authorization model.
    const workOrderAuth = await authorizeWorkOrderExecutionAccess(req, session, workOrderId);
    if (!workOrderAuth.ok) return workOrderAuth.response;
    if (!isAdmin(session) && !isWorkOrderExecutionMember(session, workOrderAuth.entity)) {
      return NextResponse.json({ success: false, error: 'Work order execution access denied' }, { status: 403 });
    }

    const wo = await db.workOrder.findUnique({ where: { id: workOrderId } });
    if (!wo) {
      return NextResponse.json({ success: false, error: 'Work order not found' }, { status: 404 });
    }

    let result: Record<string, unknown> = {};

    switch (action) {
      case 'update_checklist': {
        // Store checklist step completion in WO notes or a JSON field
        const currentNotes = wo.notes || '{}';
        let notesData: Record<string, unknown>;
        try {
          notesData = JSON.parse(currentNotes);
        } catch {
          notesData = { text: currentNotes };
        }

        if (!notesData.checklist) notesData.checklist = {};
        (notesData.checklist as Record<string, unknown>)[checklistStepId] = {
          status: checklistStatus,
          updatedAt: new Date().toISOString(),
          updatedBy: session.userId,
        };

        await db.workOrder.update({
          where: { id: workOrderId },
          data: { notes: JSON.stringify(notesData) },
        });

        result = { stepId: checklistStepId, status: checklistStatus };
        break;
      }

      case 'record_measurement': {
        if (!measurement) {
          return NextResponse.json({ success: false, error: 'Measurement data required' }, { status: 400 });
        }

        // Store measurement in work order notes
        const currentNotes = wo.notes || '{}';
        let notesData: Record<string, unknown>;
        try {
          notesData = JSON.parse(currentNotes);
        } catch {
          notesData = { text: currentNotes };
        }

        if (!notesData.measurements) notesData.measurements = [];
        (notesData.measurements as unknown[]).push({
          ...measurement,
          recordedAt: new Date().toISOString(),
          recordedBy: session.userId,
        });

        await db.workOrder.update({
          where: { id: workOrderId },
          data: { notes: JSON.stringify(notesData) },
        });

        result = measurement;
        break;
      }

      case 'add_voice_note': {
        if (!voiceNote) {
          return NextResponse.json({ success: false, error: 'Voice note data required' }, { status: 400 });
        }

        // Add voice note as a work order comment
        await db.workOrderComment.create({
          data: {
            workOrderId,
            userId: session.userId,
            content: `[Voice Note] Duration: ${voiceNote.durationSeconds}s${voiceNote.transcript ? `\nTranscript: ${voiceNote.transcript}` : ''}`,
          },
        });

        result = { voiceNoteId: voiceNote.id };
        break;
      }

      case 'complete_step': {
        // Track time log for step completion
        await db.workOrderTimeLog.create({
          data: {
            workOrderId,
            userId: session.userId,
            action: 'resume',
            notes: `Step completed: ${checklistStepId}`,
          },
        });

        result = { stepId: checklistStepId, completed: true };
        break;
      }

      case 'submit_completion': {
        if (!completionData) {
          return NextResponse.json({ success: false, error: 'Completion data required' }, { status: 400 });
        }

        // Update work order with completion data
        await db.workOrder.update({
          where: { id: workOrderId },
          data: {
            causeDescription: completionData.causeDescription || wo.causeDescription,
            actionDescription: completionData.actionDescription || wo.actionDescription,
            failureDescription: completionData.failureDescription || wo.failureDescription,
            notes: completionData.notes ? JSON.stringify({
              completionNotes: completionData.notes,
              signatureData: completionData.signatureData,
              completedViaMobile: true,
            }) : wo.notes,
          },
        });

        result = { workOrderId, completionSubmitted: true };
        break;
      }

      default:
        return NextResponse.json({ success: false, error: `Unknown action: ${action}` }, { status: 400 });
    }

    logger.info('Execution update processed', { workOrderId, action, userId: session.userId });

    return NextResponse.json({ success: true, data: result });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Execution update failed';
    logger.error('Execution POST error', error instanceof Error ? error : { error: message });
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
