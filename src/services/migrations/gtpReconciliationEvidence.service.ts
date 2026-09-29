export type GtpEvidenceRecord = {
  workOrderNo?: string | number | null;
  equipmentCode?: string | null;
  description?: string | null;
  equipmentDescription?: string | null;
  technicianReport?: string | null;
  trade?: string | null;
  workOrderType?: string | null;
};

export type GtpEvidenceSuggestion = {
  equipmentCode: string;
  matchScore: number;
  sharedTerms: string[];
  supportCount: number;
  examples: Array<{ workOrderNo: string; description: string; trade: string }>;
};

const STOP_WORDS = new Set([
  'and', 'the', 'for', 'from', 'with', 'into', 'onto', 'this', 'that', 'work', 'repair',
  'replace', 'replacement', 'check', 'inspect', 'inspection', 'service', 'maintenance',
  'machine', 'equipment', 'unit', 'system', 'area', 'section', 'fault', 'issue',
  'job', 'carry', 'carried', 'attend', 'attended', 'fix', 'fixed', 'change', 'changed',
]);

const normalize = (value: unknown) =>
  String(value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');

const canonicalToken = (token: string): string => {
  // Lightweight morphology only. Keep industrial nouns such as "line" intact,
  // while reconciling source-language variants like chock/chocked and leaks/leaking.
  if (token.length > 5 && token.endsWith('ing')) return token.slice(0, -3);
  if (token.length > 4 && token.endsWith('ed')) {
    const stem = token.slice(0, -2);
    return stem.endsWith('k') ? stem : stem;
  }
  if (token.length > 4 && token.endsWith('es')) return token.slice(0, -2);
  if (token.length > 3 && token.endsWith('s')) return token.slice(0, -1);
  return token;
};

const tokens = (...values: unknown[]): Set<string> => new Set(
  normalize(values.filter(Boolean).join(' '))
    .split(' ')
    .map(canonicalToken)
    .filter((token) => token.length >= 3 && !STOP_WORDS.has(token)),
);

const similarity = (target: Set<string>, candidate: Set<string>): { score: number; shared: string[] } => {
  if (!target.size || !candidate.size) return { score: 0, shared: [] };
  const shared = [...target].filter((token) => candidate.has(token));
  if (shared.length < 2) return { score: 0, shared };
  return {
    score: shared.length / Math.sqrt(target.size * candidate.size),
    shared,
  };
};

export function rankGtpHistoricalEvidence(
  target: GtpEvidenceRecord,
  candidates: GtpEvidenceRecord[],
  limit = 3,
): GtpEvidenceSuggestion[] {
  const targetTokens = tokens(target.description, target.equipmentDescription, target.technicianReport);
  const byCode = new Map<string, {
    equipmentCode: string;
    score: number;
    sharedTerms: string[];
    supportCount: number;
    examples: Array<{ workOrderNo: string; description: string; trade: string }>;
  }>();

  for (const candidate of candidates) {
    const equipmentCode = String(candidate.equipmentCode ?? '').trim();
    if (!equipmentCode) continue;

    const candidateTokens = tokens(candidate.description, candidate.equipmentDescription, candidate.technicianReport);
    const lexical = similarity(targetTokens, candidateTokens);
    if (lexical.score <= 0) continue;

    let score = lexical.score;
    if (target.trade && normalize(target.trade) === normalize(candidate.trade)) score += 0.08;
    if (target.workOrderType && normalize(target.workOrderType) === normalize(candidate.workOrderType)) score += 0.04;
    if (score < 0.28) continue;

    const example = {
      workOrderNo: String(candidate.workOrderNo ?? ''),
      description: candidate.description || candidate.equipmentDescription || '',
      trade: candidate.trade || '',
    };
    const existing = byCode.get(equipmentCode);
    if (!existing) {
      byCode.set(equipmentCode, {
        equipmentCode,
        score,
        sharedTerms: lexical.shared.slice(0, 6),
        supportCount: 1,
        examples: [example],
      });
      continue;
    }

    existing.supportCount += 1;
    if (existing.examples.length < 3) existing.examples.push(example);
    if (score > existing.score) {
      existing.score = score;
      existing.sharedTerms = lexical.shared.slice(0, 6);
    }
  }

  return [...byCode.values()]
    .sort((a, b) => b.score - a.score || b.supportCount - a.supportCount || a.equipmentCode.localeCompare(b.equipmentCode))
    .slice(0, Math.max(0, limit))
    .map(({ score, ...candidate }) => ({
      ...candidate,
      matchScore: Math.min(0.99, Number(score.toFixed(2))),
    }));
}


export function canDirectlyApplyGtpEvidence(
  suggestions: GtpEvidenceSuggestion[],
  index: number,
  hasUniqueResolvedAsset: boolean,
): boolean {
  if (!hasUniqueResolvedAsset || index !== 0) return false;
  const candidate = suggestions[index];
  if (!candidate || candidate.matchScore < 0.70 || candidate.supportCount < 2) return false;
  const runnerUp = suggestions[1];
  if (!runnerUp) return true;
  return candidate.matchScore - runnerUp.matchScore >= 0.12;
}
