export interface PlanLimitFigures {
  quota: number;
  pagesPerPdf: number;
  maxFileSizeMB: number;
}

/**
 * Keeps feature checklist strings in sync with numeric plan limits
 * so admin updates to quota, pages per doc, or file size reflect automatically.
 */
export function syncPlanFeatureBullets(
  features: string[],
  limits: PlanLimitFigures
): string[] {
  if (!Array.isArray(features)) return [];

  const quota = Math.max(1, Number(limits.quota) || 10);
  const pages = Math.max(1, Number(limits.pagesPerPdf) || 5);
  const maxMB = Math.max(1, Number(limits.maxFileSizeMB) || 4);

  return features.map((raw) => {
    let text = raw.trim();
    if (!text) return raw;

    // 1. Sync document/file quota counts (e.g. "50 documents quota", "Up to 10 files/mo")
    if (
      /^(?:up to\s+)?\d[\d,]*\s*(?:\+\s*)?(?:documents?|docs|files?)\b/i.test(
        text
      )
    ) {
      text = text.replace(
        /^((?:up to\s+)?)\d[\d,]*/i,
        `$1${quota.toLocaleString()}`
      );
    }

    // 2. Sync pages/slides per document counts (e.g. "25 pages per PDF / Slide", "50 pages or slides per document")
    if (
      /\b\d[\d,]*\s+(?:pages?|slides?)(?:\s+or\s+slides)?\s*(?:per|\/)\s*(?:pdf|doc|document|file|slide)/i.test(
        text
      )
    ) {
      text = text.replace(
        /\b\d[\d,]*(\s+(?:pages?|slides?)(?:\s+or\s+slides)?\s*(?:per|\/)\s*(?:pdf|doc|document|file|slide))/i,
        `${pages.toLocaleString()}$1`
      );
    }

    // 3. Sync MB file size limits (e.g. "16MB file size limit", "4 MB max file size")
    if (
      /\b\d+(?:\.\d+)?\s*MB\b/i.test(text) &&
      /(?:file|size|limit|max|upload)/i.test(text)
    ) {
      text = text.replace(/\b\d+(?:\.\d+)?(\s*MB\b)/i, `${maxMB}$1`);
    }

    return text;
  });
}

/**
 * Builds the displayed feature list for Billing/Subscription views,
 * syncing numbers and guaranteeing document quota is included cleanly.
 */
export function buildPlanDisplayFeatures(
  plan: PlanLimitFigures & { features?: string[] }
): string[] {
  const synced = syncPlanFeatureBullets(plan.features || [], plan);
  const hasQuotaLine = synced.some((f) =>
    /(?:documents?|docs|files?)\s*(?:quota|included|limit|max|per\s+month|\/mo)/i.test(
      f
    )
  );
  const hasPagesLine = synced.some((f) => /\b(?:pages?|slides?)\b/i.test(f));
  const hasSizeLine = synced.some((f) => /\bMB\b/i.test(f));

  const result: string[] = [];
  if (!hasQuotaLine) {
    result.push(`${plan.quota.toLocaleString()} documents included per month`);
  }
  if (!hasPagesLine) {
    result.push(`Up to ${plan.pagesPerPdf} pages / slides per document`);
  }
  if (!hasSizeLine) {
    result.push(`${plan.maxFileSizeMB}MB maximum file size limit`);
  }

  return [...result, ...synced];
}

