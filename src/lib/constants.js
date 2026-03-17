// Hardcoded AusTender OCDS API base URL — NEVER accept URLs from the client
export const AUSTENDER_API_BASE = 'https://api.tenders.gov.au/ocds/findByDates/contractPublished';

// AusTender contract notice web URL
export const AUSTENDER_CN_URL = 'https://www.tenders.gov.au/Cn/Show';

// Date constraints
export const MIN_DATE = '2022-01-01';
export const MAX_RANGE_DAYS = 90;
export const MAX_PAGES = 10;

// Rate limiting
export const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute
export const RATE_LIMIT_MAX_REQUESTS = 20;      // 20 requests per minute per IP

/**
 * Validate and sanitize a date string.
 * Returns null if invalid.
 */
export function validateDate(dateStr) {
  if (!dateStr || typeof dateStr !== 'string') return null;
  // Must be exactly YYYY-MM-DD
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return null;
  const d = new Date(dateStr + 'T00:00:00Z');
  if (isNaN(d.getTime())) return null;
  // Clamp to minimum
  if (dateStr < MIN_DATE) return MIN_DATE;
  // Don't allow future dates beyond tomorrow (timezone buffer)
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  if (d > tomorrow) return null;
  return dateStr;
}

/**
 * Validate that the date range doesn't exceed MAX_RANGE_DAYS
 */
export function validateRange(from, to) {
  const f = new Date(from + 'T00:00:00Z');
  const t = new Date(to + 'T00:00:00Z');
  const diffDays = (t - f) / (1000 * 60 * 60 * 24);
  if (diffDays < 0) return false;  // from must be before to
  if (diffDays > MAX_RANGE_DAYS) return false;
  return true;
}
