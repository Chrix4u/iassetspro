/** UAT NNI 1 title-level exclusions. Never infer component provenance from unrelated work orders. */
export const EXCLUDED_NNI1_HISTORY = /\b(?:wall(?:[\s-]+mounted)?[\s-]+fans?|concrete|gutters?|azoic(?:[\s/-]+(?:machine|m\/c))?|nni[\s-]*(?:(?:machine|m\/c)[\s#-]*)?(?:2|ii))\b/i;

export function isExcludedNni1HistoryTitle(title: string): boolean {
  return EXCLUDED_NNI1_HISTORY.test(title);
}
