// Simple in-memory rate limiter
// For production at scale, use Vercel Edge Middleware or Upstash Redis
// This works well for moderate traffic on a single serverless instance

const hits = new Map();

const WINDOW_MS = 60 * 1000; // 1 minute
const MAX_HITS = 20;         // 20 requests per window per IP

export function rateLimit(ip) {
  const now = Date.now();
  const key = ip || 'unknown';
  
  // Clean up old entries periodically
  if (hits.size > 10000) {
    for (const [k, v] of hits) {
      if (now - v.windowStart > WINDOW_MS * 2) hits.delete(k);
    }
  }

  const record = hits.get(key);

  if (!record || now - record.windowStart > WINDOW_MS) {
    // New window
    hits.set(key, { windowStart: now, count: 1 });
    return { ok: true, remaining: MAX_HITS - 1 };
  }

  record.count++;
  if (record.count > MAX_HITS) {
    return { ok: false, remaining: 0, retryAfter: Math.ceil((WINDOW_MS - (now - record.windowStart)) / 1000) };
  }

  return { ok: true, remaining: MAX_HITS - record.count };
}
