import { NextResponse } from 'next/server';
import { AUSTENDER_API_BASE, MAX_PAGES, validateDate, validateRange } from '@/lib/constants';
import { rateLimit } from '@/lib/rate-limit';
import { parseRelease } from '@/lib/parse-ocds';

// Simple in-memory cache: key = "from|to", value = { data, timestamp }
const cache = new Map();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

export async function GET(request) {
  // Rate limit by IP
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || request.headers.get('x-real-ip')
    || 'unknown';

  const rl = rateLimit(ip);
  if (!rl.ok) {
    return NextResponse.json(
      { error: 'Rate limit exceeded. Try again shortly.' },
      {
        status: 429,
        headers: { 'Retry-After': String(rl.retryAfter || 60) },
      }
    );
  }

  // Parse and validate query params
  const { searchParams } = new URL(request.url);
  const rawFrom = searchParams.get('from');
  const rawTo = searchParams.get('to');

  const from = validateDate(rawFrom);
  const to = validateDate(rawTo);

  if (!from || !to) {
    return NextResponse.json(
      { error: 'Invalid date parameters. Use YYYY-MM-DD format, 2022-01-01 onwards.' },
      { status: 400 }
    );
  }

  if (!validateRange(from, to)) {
    return NextResponse.json(
      { error: 'Date range must be positive and no more than 90 days.' },
      { status: 400 }
    );
  }

  // Check cache
  const cacheKey = `${from}|${to}`;
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return NextResponse.json(cached.data, {
      headers: {
        'X-Cache': 'HIT',
        'X-Rate-Limit-Remaining': String(rl.remaining),
      },
    });
  }

  // Fetch from AusTender — URL is hardcoded server-side (SSRF protection)
  const apiUrl = `${AUSTENDER_API_BASE}/${from}T00:00:00Z/${to}T23:59:59Z`;

  try {
    const contracts = [];
    const seen = new Set();
    let url = apiUrl;
    let pages = 0;

    while (url && pages < MAX_PAGES) {
      pages++;
      const resp = await fetch(url, {
        headers: { 'Accept': 'application/json' },
        // 15 second timeout per page
        signal: AbortSignal.timeout(15000),
      });

      if (!resp.ok) {
        throw new Error(`AusTender API returned ${resp.status}`);
      }

      const data = await resp.json();
      const releases = data.releases || [];

      for (const rel of releases) {
        const parsed = parseRelease(rel, seen);
        contracts.push(...parsed);
      }

      // Follow OCDS pagination
      url = (data.links || {}).next || null;
    }

    const result = {
      contracts,
      meta: {
        from,
        to,
        count: contracts.length,
        pages,
        fetchedAt: new Date().toISOString(),
        source: 'api.tenders.gov.au',
      },
    };

    // Cache the result
    cache.set(cacheKey, { data: result, timestamp: Date.now() });

    // Evict old cache entries
    if (cache.size > 100) {
      const now = Date.now();
      for (const [k, v] of cache) {
        if (now - v.timestamp > CACHE_TTL_MS * 2) cache.delete(k);
      }
    }

    return NextResponse.json(result, {
      headers: {
        'X-Cache': 'MISS',
        'X-Rate-Limit-Remaining': String(rl.remaining),
        'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=60',
      },
    });

  } catch (err) {
    console.error('[DOAS API] AusTender fetch error:', err.message);
    return NextResponse.json(
      { error: `Failed to fetch from AusTender: ${err.message}` },
      { status: 502 }
    );
  }
}
