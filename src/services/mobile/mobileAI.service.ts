// ============================================================================
// MOBILE AI ASSISTANT SERVICE — Voice-activated field AI for technicians
// Context-aware recommendations, image recognition, procedural guidance
// ============================================================================

import { createLogger } from '@/lib/logger';
import { db } from '@/lib/db';

const logger = createLogger('mobileAI');

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AIContext {
  workOrderId?: string;
  assetId?: string;
  location?: { lat: number; lng: number };
  currentTask?: string;
  userSkills?: string[];
  previousQueries?: string[];
  assetType?: string;
  failureMode?: string;
}

export interface VoiceCommand {
  id: string;
  transcript: string;
  intent: AIIntent;
  entities: Record<string, string>;
  confidence: number;
  timestamp: string;
  response?: AIResponse;
}

export type AIIntent =
  | 'troubleshoot'
  | 'search_work_order'
  | 'search_asset'
  | 'get_instructions'
  | 'safety_check'
  | 'log_measurement'
  | 'create_note'
  | 'get_recommendations'
  | 'image_assess'
  | 'unknown';

export interface AIResponse {
  text: string;
  speechText?: string;       // Optimized for TTS
  actions?: AIAction[];
  suggestions?: string[];
  confidence: number;
  sources?: string[];
}

export interface AIAction {
  type: 'navigate' | 'create' | 'update' | 'scan' | 'photo' | 'alert';
  target: string;
  params?: Record<string, unknown>;
  label: string;
}

export interface ImageAssessment {
  id: string;
  imageUrl: string;
  damageDetected: boolean;
  severity: 'none' | 'low' | 'medium' | 'high' | 'critical';
  description: string;
  detectedIssues: string[];
  recommendations: string[];
  confidence: number;
  assessedAt: string;
}

export interface ProceduralStep {
  sequence: number;
  title: string;
  description: string;
  warning?: string;
  toolsRequired?: string[];
  estimatedMinutes?: number;
  tips?: string[];
}

export interface SafetyCheckResult {
  checklistId: string;
  item: string;
  status: 'pass' | 'fail' | 'warning';
  details?: string;
  aiConfidence: number;
  timestamp: string;
}

// ---------------------------------------------------------------------------
// Intent patterns for NLP classification
// ---------------------------------------------------------------------------

const INTENT_PATTERNS: Array<{ intent: AIIntent; patterns: RegExp[] }> = [
  { intent: 'troubleshoot', patterns: [/trouble|problem|fault|error|issue|not working|broken|failure|noise|vibration|leak/i] },
  { intent: 'search_work_order', patterns: [/work order|WO-|find.*order|my.*task|assigned/i] },
  { intent: 'search_asset', patterns: [/asset|equipment|machine|pump|motor|compressor|tag/i] },
  { intent: 'get_instructions', patterns: [/how to|instruction|procedure|step.*by|guide|repair|fix|replace|adjust/i] },
  { intent: 'safety_check', patterns: [/safety|ppe|hazard|lockout|permit|danger|warning|loto/i] },
  { intent: 'log_measurement', patterns: [/measurement|reading|record|log|vibration|temperature|pressure|value/i] },
  { intent: 'create_note', patterns: [/note|remember|log|record|document/i] },
  { intent: 'get_recommendations', patterns: [/recommend|suggest|what.*should|best.*practice|spare|part/i] },
  { intent: 'image_assess', patterns: [/assess|analyze|damage|inspect.*image|check.*photo/i] },
];

// ---------------------------------------------------------------------------
// MobileAIService
// ---------------------------------------------------------------------------

export class MobileAIService {

  // =========================================================================
  // VOICE-ACTIVATED TROUBLESHOOTING
  // =========================================================================

  /**
   * Process a voice command transcript into an intent and response.
   */
  static async processVoiceCommand(
    transcript: string,
    context: AIContext = {}
  ): Promise<VoiceCommand> {
    const timer = logger.timer('processVoiceCommand');

    const intent = MobileAIService.classifyIntent(transcript);
    const entities = MobileAIService.extractEntities(transcript, context);

    const command: VoiceCommand = {
      id: `vc-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      transcript,
      intent: intent.type,
      entities,
      confidence: intent.confidence,
      timestamp: new Date().toISOString(),
    };

    try {
      switch (command.intent) {
        case 'troubleshoot':
          command.response = await MobileAIService.troubleshoot(command.transcript, context);
          break;
        case 'search_work_order':
          command.response = await MobileAIService.searchWorkOrders(command.transcript, entities);
          break;
        case 'search_asset':
          command.response = await MobileAIService.searchAssets(command.transcript, entities);
          break;
        case 'get_instructions':
          command.response = await MobileAIService.getProceduralGuidance(command.transcript, context);
          break;
        case 'safety_check':
          command.response = await MobileAIService.performSafetyCheck(command.transcript, context);
          break;
        default:
          command.response = {
            text: `I understood you're asking about "${command.transcript}". Let me help you with that. You can ask me about troubleshooting, work orders, assets, safety, or procedures.`,
            speechText: `I understood you're asking about ${entities.query || 'something'}. You can ask me about troubleshooting, work orders, assets, safety, or procedures.`,
            suggestions: ['Troubleshoot a problem', 'Find my work orders', 'Get repair instructions', 'Check safety requirements'],
            confidence: 0.3,
          };
      }
    } catch (err) {
      logger.error('Error processing voice command', { error: (err as Error).message });
      command.response = {
        text: 'Sorry, I encountered an error processing your request. Please try again or use the manual input.',
        speechText: 'Sorry, I encountered an error. Please try again.',
        confidence: 0,
      };
    }

    logger.info('Voice command processed', {
      intent: command.intent,
      confidence: command.confidence,
      responseLength: command.response?.text.length,
    });
    timer.end();
    return command;
  }

  // =========================================================================
  // INTENT CLASSIFICATION
  // =========================================================================

  /**
   * Classify a natural language query into an AI intent.
   */
  static classifyIntent(text: string): { type: AIIntent; confidence: number } {
    let bestMatch: AIIntent = 'unknown';
    let bestScore = 0;

    for (const { intent, patterns } of INTENT_PATTERNS) {
      for (const pattern of patterns) {
        const match = text.match(pattern);
        if (match) {
          const score = match[0].length / text.length; // Longer match = higher confidence
          if (score > bestScore) {
            bestScore = score;
            bestMatch = intent;
          }
        }
      }
    }

    return {
      type: bestMatch,
      confidence: Math.min(bestScore + 0.3, 0.95), // Boost with base confidence
    };
  }

  /**
   * Extract entities (WO numbers, asset tags, etc.) from a query.
   */
  static extractEntities(text: string, context: AIContext): Record<string, string> {
    const entities: Record<string, string> = {};

    // Extract WO number
    const woMatch = text.match(/WO-\d{6}-\d{4}/i);
    if (woMatch) entities.workOrderNumber = woMatch[0];

    // Extract MR number
    const mrMatch = text.match(/MR-\d{6}-\d{4}/i);
    if (mrMatch) entities.maintenanceRequestNumber = mrMatch[0];

    // Extract asset tag
    const tagMatch = text.match(/(?:asset|tag)[:\s]*([A-Z0-9-]+)/i);
    if (tagMatch) entities.assetTag = tagMatch[1];

    // Extract equipment type
    const equipMatch = text.match(/(?:pump|motor|compressor|valve|fan|bearing|gear|belt|seal)/i);
    if (equipMatch) entities.equipmentType = equipMatch[0].toLowerCase();

    // Fallback: store full query
    entities.query = text;

    // Merge context
    if (context.workOrderId) entities.workOrderId = context.workOrderId;
    if (context.assetId) entities.assetId = context.assetId;

    return entities;
  }

  // =========================================================================
  // TROUBLESHOOTING
  // =========================================================================

  /**
   * Provide troubleshooting guidance based on symptoms described.
   */
  static async troubleshoot(symptom: string, context: AIContext): Promise<AIResponse> {
    // Search for similar past work orders and failure records
    const similarWOs = await db.workOrder.findMany({
      where: {
        OR: [
          { description: { contains: symptom.split(' ').slice(0, 3).join(' ') } },
          { failureDescription: { contains: symptom.split(' ').slice(0, 3).join(' ') } },
        ],
        status: { in: ['completed', 'closed'] },
      },
      take: 5,
      orderBy: { createdAt: 'desc' },
      select: { woNumber: true, title: true, causeDescription: true, actionDescription: true },
    });

    // Search failure records for the asset
    let failureRecords: Array<{ id: string; description: string; cause: string; correctiveAction: string }> = [];
    if (context.assetId) {
      const records = await db.failureRecord.findMany({
        where: { assetId: context.assetId },
        take: 5,
        orderBy: { createdAt: 'desc' },
        select: { id: true, description: true, failureCause: true, correctiveAction: true },
      });
      failureRecords = records.map(r => ({
        id: r.id,
        description: r.description || '',
        cause: r.failureCause || '',
        correctiveAction: r.correctiveAction || '',
      }));
    }

    let text = `Based on your description of "${symptom}", here are my recommendations:\n\n`;

    if (failureRecords.length > 0) {
      text += `**Previous Issues on This Asset:**\n`;
      for (const record of failureRecords) {
        text += `- ${record.description} → Cause: ${record.cause}\n`;
        if (record.correctiveAction) text += `  Fix: ${record.correctiveAction}\n`;
      }
      text += '\n';
    }

    if (similarWOs.length > 0) {
      text += `**Similar Past Work Orders:**\n`;
      for (const wo of similarWOs) {
        text += `- ${wo.woNumber}: ${wo.title}\n`;
        if (wo.causeDescription) text += `  Cause: ${wo.causeDescription}\n`;
        if (wo.actionDescription) text += `  Action: ${wo.actionDescription}\n`;
      }
      text += '\n';
    }

    text += `**Recommended Steps:**\n`;
    text += `1. Verify the symptoms by running diagnostic checks\n`;
    text += `2. Check for common causes: loose connections, worn components, fluid levels\n`;
    text += `3. Refer to the equipment manual for specific troubleshooting procedures\n`;
    text += `4. If the issue persists, escalate to a specialist\n`;

    return {
      text,
      speechText: `Based on your description, I found ${failureRecords.length} similar issues on this asset and ${similarWOs.length} related work orders. I recommend starting with diagnostic checks and reviewing the common causes listed.`,
      actions: [
        { type: 'photo', target: 'capture_damage', label: 'Capture photo of issue' },
        { type: 'create', target: 'maintenance_request', params: { description: symptom }, label: 'Create maintenance request' },
      ],
      suggestions: [
        'Show me repair instructions',
        'What spare parts might I need?',
        'Check safety requirements',
      ],
      confidence: Math.min(0.5 + similarWOs.length * 0.1 + failureRecords.length * 0.1, 0.9),
      sources: failureRecords.length > 0 ? ['failure_records'] : similarWOs.length > 0 ? ['work_orders'] : undefined,
    };
  }

  // =========================================================================
  // NATURAL LANGUAGE WORK ORDER SEARCH
  // =========================================================================

  static async searchWorkOrders(query: string, entities: Record<string, string>): Promise<AIResponse> {
    const where: Record<string, unknown> = {};

    if (entities.workOrderNumber) {
      where.woNumber = entities.workOrderNumber;
    } else {
      const keywords = query.split(' ').filter(w => w.length > 2);
      where.OR = keywords.map(keyword => ({
        OR: [
          { title: { contains: keyword } },
          { description: { contains: keyword } },
        ],
      }));
    }

    const workOrders = await db.workOrder.findMany({
      where,
      take: 5,
      orderBy: { updatedAt: 'desc' },
      select: { id: true, woNumber: true, title: true, status: true, priority: true, assetName: true, plannedStart: true },
    });

    if (workOrders.length === 0) {
      return {
        text: 'I couldn\'t find any matching work orders. Try specifying a WO number like "WO-202401-0001" or describing the task.',
        speechText: 'I couldn\'t find matching work orders. Try a W O number or describe the task.',
        confidence: 0.4,
      };
    }

    let text = `Found ${workOrders.length} work order(s):\n\n`;
    for (const wo of workOrders) {
      const priorityIcon = wo.priority === 'critical' ? '🔴' : wo.priority === 'high' ? '🟠' : wo.priority === 'medium' ? '🟡' : '🟢';
      text += `${priorityIcon} **${wo.woNumber}**: ${wo.title}\n`;
      text += `   Status: ${wo.status} | Priority: ${wo.priority}\n`;
      if (wo.assetName) text += `   Asset: ${wo.assetName}\n`;
      text += '\n';
    }

    return {
      text,
      speechText: `I found ${workOrders.length} work orders. The first one is ${workOrders[0].title}, status ${workOrders[0].status}.`,
      actions: workOrders.map(wo => ({
        type: 'navigate' as const,
        target: 'work_order_detail',
        params: { id: wo.id },
        label: `View ${wo.woNumber}`,
      })),
      confidence: 0.85,
    };
  }

  // =========================================================================
  // ASSET SEARCH
  // =========================================================================

  static async searchAssets(query: string, entities: Record<string, string>): Promise<AIResponse> {
    const where: Record<string, unknown> = {};

    if (entities.assetTag) {
      where.assetTag = entities.assetTag;
    } else {
      where.OR = [
        { name: { contains: query } },
        { assetTag: { contains: query } },
      ];
    }

    const assets = await db.asset.findMany({
      where,
      take: 5,
      select: { id: true, name: true, assetTag: true, status: true, criticality: true, location: true },
    });

    if (assets.length === 0) {
      return {
        text: 'I couldn\'t find any matching assets. Try specifying an asset tag or name.',
        speechText: 'I couldn\'t find matching assets. Try an asset tag or name.',
        confidence: 0.4,
      };
    }

    let text = `Found ${assets.length} asset(s):\n\n`;
    for (const asset of assets) {
      text += `**${asset.name}** (${asset.assetTag})\n`;
      text += `   Status: ${asset.status} | Criticality: ${asset.criticality}\n`;
      if (asset.location) text += `   Location: ${asset.location}\n`;
      text += '\n';
    }

    return {
      text,
      speechText: `I found ${assets.length} assets. ${assets[0].name} is ${assets[0].status}.`,
      actions: assets.map(a => ({
        type: 'navigate' as const,
        target: 'asset_detail',
        params: { id: a.id },
        label: `View ${a.name}`,
      })),
      confidence: 0.85,
    };
  }

  // =========================================================================
  // PROCEDURAL GUIDANCE
  // =========================================================================

  static async getProceduralGuidance(query: string, context: AIContext): Promise<AIResponse> {
    const steps: ProceduralStep[] = [];
    const queryLower = query.toLowerCase();

    // Determine procedure type based on query and context
    if (queryLower.includes('bearing')) {
      steps.push(
        { sequence: 1, title: 'Isolate Equipment', description: 'Shut down and LOTO the equipment', warning: 'Ensure zero energy state', toolsRequired: ['Lock', 'Tag'], estimatedMinutes: 15 },
        { sequence: 2, title: 'Access Bearing', description: 'Remove guards and expose the bearing housing', toolsRequired: ['Wrench set', 'Socket set'], estimatedMinutes: 20 },
        { sequence: 3, title: 'Inspect Bearing', description: 'Check for wear, discoloration, pitting, or play', tips: ['Rotate by hand to feel for roughness', 'Check grease condition'] },
        { sequence: 4, title: 'Replace if Necessary', description: 'Press out old bearing, press in new one', warning: 'Use proper bearing press technique', toolsRequired: ['Bearing puller', 'Bearing press'], estimatedMinutes: 30 },
        { sequence: 5, title: 'Reassemble and Test', description: 'Reinstall guards, remove LOTO, run test', toolsRequired: ['Torque wrench'], estimatedMinutes: 15 },
      );
    } else if (queryLower.includes('seal')) {
      steps.push(
        { sequence: 1, title: 'Depressurize System', description: 'Release all pressure from the system', warning: 'Verify zero pressure with gauge' },
        { sequence: 2, title: 'Remove Old Seal', description: 'Carefully extract the old seal without damaging the shaft', toolsRequired: ['Seal puller', 'Picks'] },
        { sequence: 3, title: 'Clean Surface', description: 'Clean shaft and housing surface thoroughly', tips: ['Use lint-free cloth', 'Apply anti-seize to shaft'] },
        { sequence: 4, title: 'Install New Seal', description: 'Press new seal into place evenly', toolsRequired: ['Seal driver', 'Mallet'] },
        { sequence: 5, title: 'Pressure Test', description: 'Pressurize and check for leaks' },
      );
    } else {
      // Generic procedure
      steps.push(
        { sequence: 1, title: 'Safety First', description: 'Review safety requirements, don PPE, verify LOTO', warning: 'Never skip safety steps' },
        { sequence: 2, title: 'Diagnose', description: 'Identify the root cause of the issue', tips: ['Compare with previous failure records', 'Check similar equipment'] },
        { sequence: 3, title: 'Prepare', description: 'Gather tools, parts, and materials needed' },
        { sequence: 4, title: 'Execute Repair', description: 'Follow equipment-specific repair procedure' },
        { sequence: 5, title: 'Test and Document', description: 'Test the repair, take photos, log measurements' },
      );
    }

    let text = `**Repair Procedure:** ${query}\n\n`;
    for (const step of steps) {
      text += `**Step ${step.sequence}: ${step.title}**\n`;
      text += `${step.description}\n`;
      if (step.warning) text += `⚠️ ${step.warning}\n`;
      if (step.toolsRequired?.length) text += `🔧 Tools: ${step.toolsRequired.join(', ')}\n`;
      if (step.tips?.length) text += `💡 ${step.tips.join('; ')}\n`;
      if (step.estimatedMinutes) text += `⏱️ ~${step.estimatedMinutes} min\n`;
      text += '\n';
    }

    return {
      text,
      speechText: `Here's the procedure for ${query}. There are ${steps.length} steps. Start with safety precautions, then proceed through diagnosis and repair.`,
      actions: [
        { type: 'navigate', target: 'work_order_execution', params: context.workOrderId ? { id: context.workOrderId } : undefined, label: 'Start Execution' },
      ],
      confidence: 0.75,
    };
  }

  // =========================================================================
  // SAFETY CHECK
  // =========================================================================

  static async performSafetyCheck(query: string, context: AIContext): Promise<AIResponse> {
    const checks: SafetyCheckResult[] = [];

    // Generate safety check items based on context
    const safetyItems = [
      { item: 'PPE Requirements', details: 'Verify all required PPE is available and worn' },
      { item: 'Lockout/Tagout', details: 'Ensure LOTO procedures are followed for energy isolation' },
      { item: 'Work Area Clearance', details: 'Area is clear of obstructions and non-essential personnel' },
      { item: 'Fire Safety', details: 'Fire extinguisher accessible, no flammable materials nearby' },
      { item: 'Communication', details: 'Emergency contact information posted and accessible' },
    ];

    for (const si of safetyItems) {
      checks.push({
        checklistId: `safety-${Date.now()}-${Math.random().toString(36).slice(2, 4)}`,
        item: si.item,
        status: 'warning', // Requires manual verification
        details: si.details,
        aiConfidence: 0.7,
        timestamp: new Date().toISOString(),
      });
    }

    // Add work-specific safety from WO
    if (context.workOrderId) {
      const wo = await db.workOrder.findUnique({
        where: { id: context.workOrderId },
        select: { safetyNotes: true, ppeRequired: true },
      });
      if (wo?.safetyNotes) {
        checks.push({
          checklistId: `safety-wo-${Date.now()}`,
          item: 'Work-Specific Safety',
          status: 'warning',
          details: wo.safetyNotes,
          aiConfidence: 0.9,
          timestamp: new Date().toISOString(),
        });
      }
    }

    let text = `**Safety Checklist — ${checks.length} items to verify:**\n\n`;
    for (const check of checks) {
      const icon = check.status === 'pass' ? '✅' : check.status === 'fail' ? '❌' : '⚠️';
      text += `${icon} **${check.item}**: ${check.details}\n\n`;
    }

    return {
      text,
      speechText: `I've prepared a safety checklist with ${checks.length} items. Please verify each item before proceeding with work.`,
      actions: checks.map(c => ({
        type: 'navigate' as const,
        target: 'safety_verification',
        params: { checklistId: c.checklistId },
        label: `Verify: ${c.item}`,
      })),
      confidence: 0.8,
    };
  }

  // =========================================================================
  // IMAGE RECOGNITION (CLIENT-SIDE / AI SIMULATION)
  // =========================================================================

  /**
   * Assess equipment condition from an image.
   * In production, this would call an AI vision API.
   * Returns a structured assessment with detected issues.
   */
  static assessEquipmentImage(imageUrl: string, context: AIContext = {}): ImageAssessment {
    // Simulated AI assessment — in production, replace with actual vision model call
    const assessment: ImageAssessment = {
      id: `ia-${Date.now()}`,
      imageUrl,
      damageDetected: false,
      severity: 'none',
      description: 'Image received for assessment. AI analysis pending.',
      detectedIssues: [],
      recommendations: ['Review the image for visible damage', 'Compare with baseline photos', 'Document any anomalies found'],
      confidence: 0.5,
      assessedAt: new Date().toISOString(),
    };

    logger.info('Image assessment created', { assessmentId: assessment.id, assetId: context.assetId });
    return assessment;
  }

  // =========================================================================
  // CONTEXT-AWARE RECOMMENDATIONS
  // =========================================================================

  /**
   * Get recommendations based on current context (task, asset, location).
   */
  static async getRecommendations(context: AIContext): Promise<AIResponse> {
    const recommendations: string[] = [];

    if (context.workOrderId) {
      const wo = await db.workOrder.findUnique({
        where: { id: context.workOrderId },
        select: { type: true, description: true, assetId: true, priority: true },
      });

      if (wo) {
        recommendations.push(`This is a ${wo.type} work order with ${wo.priority} priority.`);
        recommendations.push('Ensure you have all required tools and materials before starting.');

        // Check if there are open material requests
        if (wo.assetId) {
          const openMaterials = await db.workOrderMaterial.count({
            where: { workOrderId: context.workOrderId, status: { in: ['requested', 'approved'] } },
          });
          if (openMaterials > 0) {
            recommendations.push(`You have ${openMaterials} pending material request(s). Verify they've been issued.`);
          }
        }
      }
    }

    if (context.assetId) {
      const asset = await db.asset.findUnique({
        where: { id: context.assetId },
        select: { name: true, criticality: true, status: true },
      });
      if (asset) {
        recommendations.push(`Asset "${asset.name}" is ${asset.status} with ${asset.criticality} criticality.`);

        // Check for overdue PMs
        const overduePMs = await db.pmSchedule.count({
          where: {
            assetId: context.assetId,
            isActive: true,
            frequencyType: { notIn: ['meter_based', 'custom_hours'] },
            nextDueDate: { lt: new Date() },
          },
        });
        if (overduePMs > 0) {
          recommendations.push(`⚠️ This asset has ${overduePMs} overdue preventive maintenance schedule(s).`);
        }
      }
    }

    return {
      text: recommendations.length > 0
        ? `**Recommendations:**\n\n${recommendations.map(r => `• ${r}`).join('\n')}`
        : 'No specific recommendations for the current context.',
      speechText: recommendations.join('. '),
      confidence: 0.75,
    };
  }

  // =========================================================================
  // HANDS-FREE MODE
  // =========================================================================

  /**
   * Format a response for hands-free voice output.
   */
  static formatForSpeech(response: AIResponse): string {
    if (response.speechText) return response.speechText;

    // Convert markdown to plain text and simplify
    let text = response.text
      .replace(/\*\*/g, '')
      .replace(/\n{2,}/g, '. ')
      .replace(/\n/g, '. ')
      .replace(/[•⚠️🔧💡⏱️🔴🟠🟡🟢✅❌]/g, '');

    // Keep it concise for speech
    if (text.length > 500) {
      text = text.substring(0, 497) + '...';
    }

    return text;
  }
}
