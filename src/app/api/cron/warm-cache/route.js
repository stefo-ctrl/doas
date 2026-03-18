import { NextResponse } from 'next/server';

/**
 * Vercel Cron Job — runs every 5 minutes to pre-warm the cache
 * for the default 30-day date range so first-time visitors get instant data.
 */
export async function GET(request) {
  // Verify this is a legitimate cron invocation (Vercel sets this header)
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}` && process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const now = new Date();
  const to = now.toISOString().split('T')[0];
  const from = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  const baseUrl = process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : 'http://localhost:3000';

  try {
    const res = await fetch(`${baseUrl}/api/contracts?from=${from}&to=${to}`, {
      headers: { 'Accept': 'application/json' },
    });
    const data = await res.json();

    console.log(`[DOAS Cron] Warmed cache: ${data.meta?.count || 0} contracts for ${from} → ${to}`);

    return NextResponse.json({
      ok: true,
      contracts: data.meta?.count || 0,
      from,
      to,
      cachedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error('[DOAS Cron] Warm cache failed:', err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
