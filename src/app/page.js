'use client';

import { useState, useEffect, useMemo, useCallback, useRef, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { humanCategory } from '@/lib/unspsc';

// ── Helpers ──────────────────────────────────────────────

function fmtCurrency(v) {
  if (typeof v !== 'number' || isNaN(v)) return '$0';
  if (v >= 1e9) return '$' + (v / 1e9).toFixed(2) + 'B';
  if (v >= 1e6) return '$' + (v / 1e6).toFixed(1) + 'M';
  if (v >= 1e3) return '$' + (v / 1e3).toFixed(0) + 'K';
  return '$' + Math.round(v).toLocaleString();
}

function fmtDate(s) {
  if (!s) return '—';
  try {
    return new Date(s).toLocaleDateString('en-AU', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch { return '—'; }
}

function isoDate(d) { return d.toISOString().split('T')[0]; }

function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return isoDate(d);
}

function computeStats(arr) {
  const total = arr.reduce((s, c) => s + c.value, 0);
  const suppliers = new Set(arr.map(c => c.supplier).filter(Boolean));
  const limited = arr.filter(c => c.method === 'limited');
  const pct = arr.length > 0 ? (limited.length / arr.length * 100) : 0;
  return { total, count: arr.length, suppliers: suppliers.size, limitedPct: pct, limitedCount: limited.length };
}

/** Check if a contract's pubDate falls within [from, to] inclusive */
function inDateRange(c, from, to) {
  const d = (c.pubDate || '').slice(0, 10); // YYYY-MM-DD
  if (!d) return true; // include contracts with no date
  return d >= from && d <= to;
}

const PAGE_SIZE = 50;
const FETCH_TIMEOUT_MS = 45000;

// ── Main Component ───────────────────────────────────────

export default function Page() {
  return (
    <Suspense fallback={<div className="py-20 text-center text-xs text-gray-400">Loading…</div>}>
      <Home />
    </Suspense>
  );
}

function Home() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // ── State ──
  // allContracts = full 90-day dataset from the API (the "pool")
  // from/to = the currently selected view range (filters client-side from the pool)
  const [allContracts, setAllContracts] = useState([]);
  const [poolRange, setPoolRange] = useState(null); // { from, to } of what's loaded
  const [meta, setMeta] = useState(null);
  const [loading, setLoading] = useState(false);
  const [loadingMsg, setLoadingMsg] = useState('');
  const [error, setError] = useState(null);

  const [from, setFrom] = useState(() => searchParams.get('from') || daysAgo(30));
  const [to, setTo] = useState(() => searchParams.get('to') || isoDate(new Date()));
  const [tab, setTab] = useState(() => searchParams.get('tab') || 'table');
  const [search, setSearch] = useState(() => searchParams.get('q') || '');
  const [agencyFilter, setAgencyFilter] = useState(() => searchParams.get('agency') || '');
  const [sortCol, setSortCol] = useState('value');
  const [sortDir, setSortDir] = useState('desc');
  const [page, setPage] = useState(0);
  const [selectedId, setSelectedId] = useState(null);
  const [activeRange, setActiveRange] = useState(30);
  const modalRef = useRef(null);

  const isFiltered = search !== '' || agencyFilter !== '';

  // ── URL sync ──
  useEffect(() => {
    const params = new URLSearchParams();
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    if (tab !== 'table') params.set('tab', tab);
    if (search) params.set('q', search);
    if (agencyFilter) params.set('agency', agencyFilter);
    const str = params.toString();
    router.replace(str ? `?${str}` : '/', { scroll: false });
  }, [from, to, tab, search, agencyFilter, router]);

  function clearFilters() {
    setSearch('');
    setAgencyFilter('');
    setPage(0);
  }

  // ── API fetch — loads data into the pool ──
  const fetchFromAPI = useCallback(async (f, t) => {
    console.log('[DOAS] Fetching from API:', f, 'to', t);
    setLoading(true);
    setLoadingMsg('Connecting to AusTender…');
    setError(null);
    setPage(0);
    setSelectedId(null);

    const timer = setTimeout(() => {
      setLoadingMsg('Still loading — AusTender can be slow for large date ranges…');
    }, 5000);

    const timeout = setTimeout(() => {
      setLoading(false);
      setError('Request timed out. AusTender may be slow — try a shorter date range.');
    }, FETCH_TIMEOUT_MS);

    try {
      const res = await fetch(`/api/contracts?from=${f}&to=${t}`);
      clearTimeout(timeout);
      clearTimeout(timer);
      const data = await res.json();
      console.log('[DOAS] Response:', res.status, 'contracts:', data.contracts?.length);

      if (!res.ok) throw new Error(data.error || `API returned ${res.status}`);

      setAllContracts(data.contracts || []);
      setPoolRange({ from: f, to: t });
      setMeta(data.meta || null);
    } catch (err) {
      clearTimeout(timeout);
      clearTimeout(timer);
      if (err.name !== 'AbortError') {
        console.error('[DOAS] Fetch error:', err);
        setError(err.message);
      }
    } finally {
      clearTimeout(timeout);
      clearTimeout(timer);
      setLoading(false);
      setLoadingMsg('');
    }
  }, []);

  // On mount: fetch 90 days (the max pool). This is the one slow load.
  useEffect(() => {
    fetchFromAPI(daysAgo(90), isoDate(new Date()));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Quick range buttons — just update the view window, no API call
  function setRange(days) {
    const f = daysAgo(days);
    const t = isoDate(new Date());
    setFrom(f);
    setTo(t);
    setActiveRange(days);
    setPage(0);
    setSearch('');
    setAgencyFilter('');
    setSelectedId(null);
    // Only fetch if requested range exceeds what's in the pool
    if (poolRange && f >= poolRange.from && t <= poolRange.to) {
      // Data already loaded — instant, no API call
      return;
    }
    fetchFromAPI(f, t);
  }

  // Manual Fetch button — always calls API (for custom date ranges)
  function handleManualFetch() {
    // If the requested range is within the pool, just update the view
    if (poolRange && from >= poolRange.from && to <= poolRange.to) {
      setPage(0);
      setSelectedId(null);
      return;
    }
    fetchFromAPI(from, to);
  }

  function doSort(col) {
    if (sortCol === col) setSortDir(d => d === 'desc' ? 'asc' : 'desc');
    else { setSortCol(col); setSortDir('desc'); }
  }

  // Escape closes modal
  useEffect(() => {
    function handleKey(e) {
      if (e.key === 'Escape' && selectedId) setSelectedId(null);
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [selectedId]);

  // ── Derived data ──

  // Step 1: Slice the pool by the selected date range (instant)
  const contracts = useMemo(() => {
    if (!from || !to) return allContracts;
    return allContracts.filter(c => inDateRange(c, from, to));
  }, [allContracts, from, to]);

  // Step 2: Apply search + agency filters
  const filteredUnsorted = useMemo(() => {
    let arr = contracts;
    if (search) {
      const q = search.toLowerCase();
      arr = arr.filter(c =>
        (c.supplier || '').toLowerCase().includes(q) ||
        (c.agency || '').toLowerCase().includes(q) ||
        (c.title || '').toLowerCase().includes(q) ||
        (c.cnNumber || '').toLowerCase().includes(q)
      );
    }
    if (agencyFilter) {
      arr = arr.filter(c => c.agency === agencyFilter);
    }
    return arr;
  }, [contracts, search, agencyFilter]);

  // Step 3: Sort for table display
  const filtered = useMemo(() => {
    return [...filteredUnsorted].sort((a, b) => {
      let av, bv;
      switch (sortCol) {
        case 'value': return sortDir === 'desc' ? b.value - a.value : a.value - b.value;
        case 'date':
          av = a.pubDate || ''; bv = b.pubDate || '';
          return sortDir === 'desc' ? (bv > av ? 1 : bv < av ? -1 : 0) : (av > bv ? 1 : av < bv ? -1 : 0);
        case 'supplier':
          av = (a.supplier || '').toLowerCase(); bv = (b.supplier || '').toLowerCase();
          return sortDir === 'desc' ? (bv > av ? 1 : bv < av ? -1 : 0) : (av > bv ? 1 : av < bv ? -1 : 0);
        case 'agency':
          av = (a.agency || '').toLowerCase(); bv = (b.agency || '').toLowerCase();
          return sortDir === 'desc' ? (bv > av ? 1 : bv < av ? -1 : 0) : (av > bv ? 1 : av < bv ? -1 : 0);
        default: return sortDir === 'desc' ? b.value - a.value : a.value - b.value;
      }
    });
  }, [filteredUnsorted, sortCol, sortDir]);

  // Stats: from filtered view (reacts to dates + search + agency instantly)
  const heroStats = useMemo(() => computeStats(filteredUnsorted), [filteredUnsorted]);
  const totalStats = useMemo(() => computeStats(contracts), [contracts]);

  const agencies = useMemo(() =>
    [...new Set(contracts.map(c => c.agency).filter(Boolean))].sort(),
    [contracts]
  );

  const highlights = useMemo(() =>
    [...filteredUnsorted].sort((a, b) => b.value - a.value).slice(0, 5),
    [filteredUnsorted]
  );

  const supplierStats = useMemo(() => {
    if (!selectedId) return null;
    const sel = contracts.find(c => c.uid === selectedId);
    if (!sel) return null;
    const sameSupplier = contracts.filter(c => c.supplier === sel.supplier && c.uid !== sel.uid);
    const sameAgency = contracts.filter(c => c.agency === sel.agency && c.uid !== sel.uid);
    return {
      supplierCount: sameSupplier.length,
      supplierTotal: sameSupplier.reduce((s, c) => s + c.value, 0),
      agencyCount: sameAgency.length,
      agencyTotal: sameAgency.reduce((s, c) => s + c.value, 0),
    };
  }, [contracts, selectedId]);

  // Chart breakdowns
  const agencyBreakdown = useMemo(() => {
    const m = {};
    filteredUnsorted.forEach(c => { const a = c.agency || 'Unknown'; m[a] = (m[a] || 0) + c.value; });
    return Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, 10);
  }, [filteredUnsorted]);

  const methodBreakdown = useMemo(() => {
    const m = {};
    filteredUnsorted.forEach(c => { const k = c.method || 'unknown'; if (!m[k]) m[k] = { n: 0, v: 0 }; m[k].n++; m[k].v += c.value; });
    return Object.entries(m).sort((a, b) => b[1].v - a[1].v);
  }, [filteredUnsorted]);

  const supplierBreakdown = useMemo(() => {
    const m = {};
    filteredUnsorted.forEach(c => { const s = c.supplier || 'Unknown'; if (!m[s]) m[s] = { n: 0, v: 0 }; m[s].n++; m[s].v += c.value; });
    return Object.entries(m).sort((a, b) => b[1].v - a[1].v).slice(0, 10);
  }, [filteredUnsorted]);

  const valueDist = useMemo(() => {
    const buckets = [
      { label: '$100M+', min: 1e8, n: 0, v: 0 },
      { label: '$10M–$100M', min: 1e7, max: 1e8, n: 0, v: 0 },
      { label: '$1M–$10M', min: 1e6, max: 1e7, n: 0, v: 0 },
      { label: 'Under $1M', min: 0, max: 1e6, n: 0, v: 0 },
    ];
    filteredUnsorted.forEach(c => {
      for (const b of buckets) {
        if (c.value >= b.min && (!b.max || c.value < b.max)) { b.n++; b.v += c.value; break; }
      }
    });
    return buckets;
  }, [filteredUnsorted]);

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const pageData = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const selected = selectedId ? allContracts.find(c => c.uid === selectedId) : null;

  // Focus modal on open
  useEffect(() => {
    if (selected && modalRef.current) modalRef.current.focus();
  });

  const methodClass = (m) => {
    if (m === 'open') return 'bg-green-50 text-green-700';
    if (m === 'limited') return 'bg-amber-50 text-amber-700';
    return 'bg-blue-50 text-blue-700';
  };
  const methodLabel = (m) => m === 'open' ? 'Open' : m === 'limited' ? 'Limited' : m === 'selective' ? 'Selective' : (m || '—');

  // Is the current view range within the loaded pool? (i.e., no API call needed)
  const isWithinPool = poolRange && from >= poolRange.from && to <= poolRange.to;

  // ── Render ──

  return (
    <>
      {/* TOP BAR */}
      <div className="sticky top-0 z-50 bg-white border-b border-gray-200 px-4 sm:px-7 py-2.5 flex items-center justify-between">
        <div className="flex items-center gap-2 sm:gap-3.5">
          <span className="font-bold text-[17px] tracking-tight">
            DOAS<span className="inline-block w-[7px] h-[7px] bg-green-500 rounded-full ml-1.5 live-dot" />
          </span>
          <span className="text-[10px] text-gray-400 uppercase tracking-[1.5px] font-medium hidden sm:inline">
            Department of Australia&apos;s Spending
          </span>
        </div>
        <div className="flex gap-2.5">
          <a href="https://www.tenders.gov.au" target="_blank" rel="noopener noreferrer"
            className="text-[10px] text-gray-400 border border-gray-200 rounded px-2 py-1 hover:text-gray-500 hover:border-gray-300 no-underline hidden sm:inline-block">
            source: tenders.gov.au
          </a>
          <a href="https://github.com/austender/austender-ocds-api" target="_blank" rel="noopener noreferrer"
            className="text-[10px] text-gray-400 border border-gray-200 rounded px-2 py-1 hover:text-gray-500 hover:border-gray-300 no-underline hidden sm:inline-block">
            OCDS API
          </a>
        </div>
      </div>

      {/* CONTROLS */}
      <div className="px-4 sm:px-7 py-2.5 border-b border-gray-100 flex items-center gap-2 sm:gap-3 flex-wrap bg-gray-50/80">
        <label className="text-[10px] text-gray-400 uppercase tracking-wide font-medium">From</label>
        <input type="date" value={from} min="2022-01-01" onChange={e => { setFrom(e.target.value); setPage(0); }}
          className="text-xs px-2 py-1.5 border border-gray-200 rounded bg-white" />
        <label className="text-[10px] text-gray-400 uppercase tracking-wide font-medium">To</label>
        <input type="date" value={to} min="2022-01-01" onChange={e => { setTo(e.target.value); setPage(0); }}
          className="text-xs px-2 py-1.5 border border-gray-200 rounded bg-white" />
        <button onClick={handleManualFetch} disabled={loading}
          className="text-[11px] font-semibold px-3.5 py-1.5 bg-gray-900 text-white border border-gray-900 rounded hover:bg-gray-700 disabled:opacity-30">
          {loading ? 'Fetching…' : isWithinPool ? 'Refresh' : 'Fetch'}
        </button>
        <div className="flex gap-1 ml-auto">
          {[7, 14, 30, 90].map(d => (
            <button key={d} onClick={() => setRange(d)}
              className={`text-[10px] font-medium px-2.5 py-1 rounded border ${activeRange === d ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-500 border-gray-200 hover:border-gray-400'}`}>
              {d}d
            </button>
          ))}
        </div>
      </div>

      {/* ACTIVE FILTER BANNER */}
      {isFiltered && !loading && (
        <div className="px-4 sm:px-7 py-2 bg-gray-900 text-white flex items-center justify-between">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-[10px] uppercase tracking-wide font-medium opacity-60 shrink-0">Showing</span>
            {agencyFilter && <span className="text-[12px] font-semibold truncate">{agencyFilter}</span>}
            {search && <span className="text-[12px] font-semibold truncate">{agencyFilter ? ' matching ' : ''}&ldquo;{search}&rdquo;</span>}
            <span className="text-[11px] opacity-50 shrink-0">— {filteredUnsorted.length.toLocaleString()} of {contracts.length.toLocaleString()}</span>
          </div>
          <button onClick={clearFilters}
            className="text-[10px] font-medium px-2.5 py-1 rounded border border-white/30 hover:bg-white/10 transition-colors shrink-0">
            Clear filters
          </button>
        </div>
      )}

      {/* HERO STATS */}
      <div className="grid grid-cols-2 sm:grid-cols-4 border-b border-gray-200">
        <div className="px-4 sm:px-7 py-4 sm:py-5 border-r border-b sm:border-b-0 border-gray-200">
          <div className="text-[10px] text-gray-400 uppercase tracking-[1.4px] font-medium mb-0.5">Total Contract Value</div>
          <div className="text-xl sm:text-[26px] font-bold tracking-tight tabnum">{loading ? '…' : fmtCurrency(heroStats.total)}</div>
          <div className="text-[11px] text-gray-400 mt-0.5">
            {isFiltered && !loading ? `of ${fmtCurrency(totalStats.total)} total` : !loading && from && to ? `${from} → ${to}` : ''}
          </div>
        </div>
        <div className="px-4 sm:px-7 py-4 sm:py-5 sm:border-r border-b sm:border-b-0 border-gray-200">
          <div className="text-[10px] text-gray-400 uppercase tracking-[1.4px] font-medium mb-0.5">Contracts</div>
          <div className="text-xl sm:text-[26px] font-bold tracking-tight tabnum">{loading ? '…' : heroStats.count.toLocaleString()}</div>
          <div className="text-[11px] text-gray-400 mt-0.5">
            {isFiltered && !loading ? `of ${totalStats.count.toLocaleString()} total` : 'published in period'}
          </div>
        </div>
        <div className="px-4 sm:px-7 py-4 sm:py-5 border-r border-gray-200">
          <div className="text-[10px] text-gray-400 uppercase tracking-[1.4px] font-medium mb-0.5">Suppliers</div>
          <div className="text-xl sm:text-[26px] font-bold tracking-tight tabnum">{loading ? '…' : heroStats.suppliers.toLocaleString()}</div>
          <div className="text-[11px] text-gray-400 mt-0.5">
            {isFiltered && !loading ? `of ${totalStats.suppliers.toLocaleString()} total` : 'distinct entities'}
          </div>
        </div>
        <div className="px-4 sm:px-7 py-4 sm:py-5">
          <div className="text-[10px] text-gray-400 uppercase tracking-[1.4px] font-medium mb-0.5">Limited Tender</div>
          <div className="text-xl sm:text-[26px] font-bold tracking-tight tabnum">{loading ? '…' : heroStats.limitedPct.toFixed(1) + '%'}</div>
          <div className="text-[11px] text-gray-400 mt-0.5">
            {heroStats.limitedCount.toLocaleString()} of {heroStats.count.toLocaleString()} no competitive bid
          </div>
        </div>
      </div>

      {/* HIGHLIGHTS */}
      {!loading && !error && highlights.length > 0 && !isFiltered && (
        <div className="px-4 sm:px-7 py-4 border-b border-gray-200 bg-gray-50/50">
          <div className="text-[10px] text-gray-400 uppercase tracking-[1.4px] font-semibold mb-2.5">Largest contracts this period</div>
          <div className="flex gap-3 overflow-x-auto pb-1">
            {highlights.map(c => (
              <button key={c.uid} onClick={() => setSelectedId(c.uid)}
                className="shrink-0 w-52 bg-white border border-gray-200 rounded-md p-3 text-left hover:border-gray-400 hover:shadow-sm transition-all">
                <div className={`text-lg font-bold tabnum ${c.value >= 10000000 ? 'text-red-600' : ''}`}>{fmtCurrency(c.value)}</div>
                <div className="text-[12px] font-semibold mt-1 truncate">{c.supplier || 'Not disclosed'}</div>
                <div className="text-[11px] text-gray-400 truncate">{c.agency ? c.agency.replace(/^Department of /, '') : '—'}</div>
                <span className={`mt-1.5 inline-block text-[9px] uppercase font-semibold tracking-wide px-1.5 py-0.5 rounded ${methodClass(c.method)}`}>
                  {methodLabel(c.method)}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* STATUS */}
      <div className="px-4 sm:px-7 py-1.5 bg-gray-50/80 border-b border-gray-100 text-[11px] text-gray-400 flex items-center gap-1.5">
        <span className={`inline-block w-1.5 h-1.5 rounded-full ${error ? 'bg-red-500' : loading ? 'bg-amber-400' : 'bg-green-500'}`} />
        {error ? `Error: ${error}`
          : loading ? (loadingMsg || 'Fetching from AusTender…')
          : meta ? `${contracts.length.toLocaleString()} contracts in view (${allContracts.length.toLocaleString()} loaded from ${meta.source})`
          : 'Ready'}
      </div>

      {/* TABS */}
      <div className="flex border-b border-gray-200 px-4 sm:px-7 bg-white">
        {['table', 'charts'].map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 sm:px-5 py-2.5 text-xs font-semibold border-b-2 transition-all ${tab === t ? 'text-gray-900 border-gray-900' : 'text-gray-400 border-transparent hover:text-gray-600'}`}>
            {t === 'table' ? 'Contracts' : 'Analytics'}
          </button>
        ))}
      </div>

      {/* CONTRACTS TABLE TAB */}
      {tab === 'table' && (
        <div>
          <div className="px-3 py-1.5 flex gap-2 items-center border-b border-gray-100 bg-gray-50/80 flex-wrap">
            <input placeholder="Search supplier, agency, title…" value={search} onChange={e => { setSearch(e.target.value); setPage(0); }}
              className="text-[11px] px-2 py-1 border border-gray-200 rounded bg-white w-full sm:w-56" />
            <select value={agencyFilter} onChange={e => { setAgencyFilter(e.target.value); setPage(0); }}
              className="text-[11px] px-2 py-1 border border-gray-200 rounded bg-white w-full sm:w-44">
              <option value="">All Agencies</option>
              {agencies.map(a => <option key={a} value={a}>{a.replace(/^Department of /, '')}</option>)}
            </select>
            {isFiltered && (
              <button onClick={clearFilters}
                className="text-[10px] font-medium text-gray-500 hover:text-gray-900 px-2 py-1 border border-gray-200 rounded bg-white hover:border-gray-400 transition-colors">
                Clear
              </button>
            )}
            <span className="ml-auto text-[11px] text-gray-400 tabnum shrink-0">
              {filtered.length.toLocaleString()} {isFiltered ? `of ${contracts.length.toLocaleString()} ` : ''}contracts
            </span>
          </div>

          {loading ? (
            <div className="py-20 text-center">
              <div className="w-7 h-7 border-2 border-gray-200 border-t-gray-900 rounded-full spinner mx-auto mb-3" />
              <div className="text-xs text-gray-400">{loadingMsg || 'Fetching contracts from AusTender…'}</div>
            </div>
          ) : error ? (
            <div className="m-4 sm:m-7 p-5 border border-red-400 rounded-md bg-red-50">
              <h3 className="text-red-600 text-sm font-semibold mb-1">Failed to fetch</h3>
              <p className="text-[13px] text-gray-600 mb-3">{error}</p>
              <div className="flex gap-2">
                <button onClick={() => fetchFromAPI(from, to)}
                  className="text-[11px] font-semibold px-3 py-1.5 bg-gray-900 text-white rounded hover:bg-gray-700">Retry</button>
                <button onClick={() => setRange(7)}
                  className="text-[11px] font-medium px-3 py-1.5 border border-gray-300 rounded text-gray-600 hover:border-gray-400">Try last 7 days</button>
              </div>
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-16 text-center">
              <div className="text-gray-300 text-4xl mb-3">&#8709;</div>
              <div className="text-sm text-gray-500 mb-1">
                {isFiltered ? 'No contracts match your filters.' : `No contracts published between ${from} and ${to}.`}
              </div>
              <div className="text-xs text-gray-400 mb-4">
                {isFiltered ? 'Try broadening your search or clearing filters.' : 'Try expanding your date range.'}
              </div>
              <div className="flex gap-2 justify-center">
                {isFiltered && (
                  <button onClick={clearFilters} className="text-[11px] font-medium px-3 py-1.5 border border-gray-300 rounded text-gray-600 hover:border-gray-400">Clear filters</button>
                )}
                <button onClick={() => setRange(30)} className="text-[11px] font-semibold px-3 py-1.5 bg-gray-900 text-white rounded hover:bg-gray-700">Try last 30 days</button>
              </div>
            </div>
          ) : (
            <>
              {/* Desktop table */}
              <table className="w-full border-collapse text-[13px] hidden sm:table">
                <thead className="sticky top-[45px] z-10">
                  <tr>
                    {[
                      { key: 'value', label: 'Value' },
                      { key: 'supplier', label: 'Supplier' },
                      { key: 'agency', label: 'Agency' },
                      { key: null, label: 'Category' },
                      { key: null, label: 'Method' },
                      { key: 'date', label: 'Published' },
                    ].map(({ key, label }) => (
                      <th key={label} onClick={key ? () => doSort(key) : undefined}
                        aria-sort={sortCol === key ? (sortDir === 'desc' ? 'descending' : 'ascending') : undefined}
                        className={`px-3 py-2 text-left text-[10px] uppercase tracking-wide font-semibold bg-gray-50 border-b border-gray-200 whitespace-nowrap ${key ? 'cursor-pointer hover:text-gray-900' : ''} ${sortCol === key ? 'text-gray-900' : 'text-gray-400'}`}>
                        {label} {sortCol === key ? (sortDir === 'desc' ? '↓' : '↑') : ''}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {pageData.map(c => (
                    <tr key={c.uid} onClick={() => setSelectedId(c.uid)} onKeyDown={e => { if (e.key === 'Enter') setSelectedId(c.uid); }}
                      tabIndex={0} role="button" aria-label={`${c.supplier || 'Unknown'} — ${fmtCurrency(c.value)}`}
                      className="cursor-pointer hover:bg-gray-50 transition-colors focus:bg-blue-50 focus:outline-none">
                      <td className="px-3 py-2 border-b border-gray-50"><span className={`font-semibold tabnum whitespace-nowrap ${c.value >= 10000000 ? 'text-red-600' : ''}`}>{fmtCurrency(c.value)}</span></td>
                      <td className="px-3 py-2 border-b border-gray-50 max-w-[200px]">
                        <div className="font-semibold text-[13px]">{c.supplier || 'Not disclosed'}</div>
                        {c.supplierABN && <div className="text-[10px] text-gray-400 mt-px">ABN {c.supplierABN}</div>}
                      </td>
                      <td className="px-3 py-2 border-b border-gray-50 text-xs max-w-[200px]">{c.agency ? c.agency.replace(/^Department of /, 'Dept. ') : '—'}</td>
                      <td className="px-3 py-2 border-b border-gray-50 text-[11px] text-gray-500 max-w-[160px]">{humanCategory(c.category) || '—'}</td>
                      <td className="px-3 py-2 border-b border-gray-50">
                        <span className={`text-[9px] uppercase font-semibold tracking-wide px-1.5 py-0.5 rounded ${methodClass(c.method)}`}>{methodLabel(c.method)}</span>
                      </td>
                      <td className="px-3 py-2 border-b border-gray-50 text-[11px] text-gray-500 whitespace-nowrap tabnum">{fmtDate(c.pubDate)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* Mobile cards */}
              <div className="sm:hidden divide-y divide-gray-100">
                {pageData.map(c => (
                  <button key={c.uid} onClick={() => setSelectedId(c.uid)} className="w-full px-4 py-3 text-left hover:bg-gray-50 transition-colors">
                    <div className="flex justify-between items-start">
                      <div className="min-w-0 flex-1">
                        <div className="font-semibold text-[13px] truncate">{c.supplier || 'Not disclosed'}</div>
                        <div className="text-[11px] text-gray-400 truncate">{c.agency ? c.agency.replace(/^Department of /, '') : '—'}</div>
                      </div>
                      <div className="text-right ml-3 shrink-0">
                        <div className={`font-bold tabnum ${c.value >= 10000000 ? 'text-red-600' : ''}`}>{fmtCurrency(c.value)}</div>
                        <div className="text-[10px] text-gray-400 tabnum">{fmtDate(c.pubDate)}</div>
                      </div>
                    </div>
                    <div className="flex gap-2 mt-1.5">
                      <span className={`text-[9px] uppercase font-semibold tracking-wide px-1.5 py-0.5 rounded ${methodClass(c.method)}`}>{methodLabel(c.method)}</span>
                      {c.category && <span className="text-[10px] text-gray-400 truncate">{humanCategory(c.category)}</span>}
                    </div>
                  </button>
                ))}
              </div>

              {totalPages > 1 && (
                <div className="px-4 sm:px-7 py-3 text-center text-[11px] text-gray-400 border-t border-gray-100 flex items-center justify-center gap-2">
                  {page > 0 && <button onClick={() => setPage(p => p - 1)} className="px-3 py-1 border border-gray-200 rounded bg-white text-gray-600 hover:border-gray-400">← Prev</button>}
                  <span>Page {page + 1} of {totalPages}</span>
                  {page < totalPages - 1 && <button onClick={() => setPage(p => p + 1)} className="px-3 py-1 border border-gray-200 rounded bg-white text-gray-600 hover:border-gray-400">Next →</button>}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ANALYTICS TAB */}
      {tab === 'charts' && (
        <div className="p-4 sm:p-7 grid grid-cols-1 sm:grid-cols-2 gap-6">
          {isFiltered && (
            <div className="col-span-full text-[11px] text-gray-500 flex items-center gap-2 mb-1">
              <span>Analytics for {agencyFilter ? agencyFilter : 'filtered results'}{search ? ` matching "${search}"` : ''}</span>
              <button onClick={clearFilters} className="text-gray-400 hover:text-gray-900 underline">Show all</button>
            </div>
          )}
          <ChartCard title="Top Agencies by Value" data={agencyBreakdown}
            format={([name, val]) => ({ label: name.replace(/^Department of /, '').replace(/^Australian /, ''), value: val, display: fmtCurrency(val) })}
            maxVal={agencyBreakdown[0]?.[1] || 1} color="#111" />
          <ChartCard title="Procurement Method" data={methodBreakdown}
            format={([m, d]) => ({
              label: m === 'open' ? 'Open Tender' : m === 'limited' ? 'Limited Tender' : m === 'selective' ? 'Selective' : m,
              value: d.n, display: `${d.n.toLocaleString()} (${(d.n / (filteredUnsorted.length || 1) * 100).toFixed(0)}%)`,
            })}
            maxVal={filteredUnsorted.length || 1}
            colorFn={([m]) => m === 'limited' ? '#d97706' : m === 'open' ? '#16a34a' : '#2563eb'} />
          <ChartCard title="Top Suppliers by Value" data={supplierBreakdown}
            format={([name, d]) => ({ label: name.length > 24 ? name.slice(0, 24) + '…' : name, value: d.v, display: fmtCurrency(d.v), title: name })}
            maxVal={supplierBreakdown[0]?.[1]?.v || 1} color="#111" />
          <ChartCard title="Contract Value Distribution" data={valueDist}
            format={(b) => ({ label: b.label, value: b.n, display: `${b.n.toLocaleString()} / ${fmtCurrency(b.v)}` })}
            maxVal={Math.max(...valueDist.map(b => b.n), 1)} color="#111" />
        </div>
      )}

      {/* MODAL */}
      {selected && (
        <div className="fixed inset-0 bg-black/40 z-[200] flex items-center justify-center p-4" onClick={() => setSelectedId(null)} role="dialog" aria-modal="true" aria-label="Contract details">
          <div ref={modalRef} tabIndex={-1} className="bg-white rounded-lg w-full max-w-[520px] max-h-[80vh] overflow-y-auto shadow-2xl focus:outline-none" onClick={e => e.stopPropagation()}>
            <div className="px-5 sm:px-6 py-5 border-b border-gray-100 flex justify-between items-start">
              <div>
                <div className="text-[11px] text-gray-400 mb-1">{selected.cnNumber || selected.ocid}</div>
                <div className={`text-2xl font-bold tabnum ${selected.value >= 10000000 ? 'text-red-600' : ''}`}>{fmtCurrency(selected.value)}</div>
              </div>
              <button onClick={() => setSelectedId(null)} aria-label="Close" className="w-7 h-7 border border-gray-200 rounded flex items-center justify-center text-gray-400 hover:text-gray-900 hover:border-gray-400">✕</button>
            </div>
            <ModalSection title="Contract">
              <MRow label="Title" value={selected.title || '—'} />
              <MRow label="Status" value={selected.status || '—'} />
              <MRow label="Start" value={fmtDate(selected.startDate)} />
              <MRow label="End" value={fmtDate(selected.endDate)} />
              <MRow label="Published" value={fmtDate(selected.pubDate)} />
              <MRow label="Category" value={humanCategory(selected.category) || '—'} />
            </ModalSection>
            <ModalSection title="Supplier">
              <MRow label="Name" value={selected.supplier || 'Not disclosed'} />
              {selected.supplierABN && <MRow label="ABN" value={selected.supplierABN} />}
              {supplierStats && supplierStats.supplierCount > 0 && (
                <MRow label="Also in this period" value={`${supplierStats.supplierCount} other contracts (${fmtCurrency(supplierStats.supplierTotal)})`} />
              )}
            </ModalSection>
            <ModalSection title="Procuring Agency">
              <MRow label="Agency" value={selected.agency || '—'} />
              {selected.division && <MRow label="Division" value={selected.division} />}
              {supplierStats && supplierStats.agencyCount > 0 && (
                <MRow label="Agency total this period" value={`${supplierStats.agencyCount + 1} contracts (${fmtCurrency(supplierStats.agencyTotal + selected.value)})`} />
              )}
            </ModalSection>
            <ModalSection title="Procurement">
              <MRow label="Method" value={selected.method || '—'} />
              {selected.methodDetail && <MRow label="Detail" value={selected.methodDetail} />}
            </ModalSection>
            <div className="px-5 sm:px-6 py-4 border-t border-gray-100">
              <a href={selected.austenderUrl} target="_blank" rel="noopener noreferrer" className="text-xs font-semibold text-blue-600 hover:underline">View on AusTender →</a>
            </div>
          </div>
        </div>
      )}

      {/* FOOTER */}
      <div className="px-4 sm:px-7 py-5 border-t border-gray-200 text-[10px] text-gray-400 flex flex-col sm:flex-row justify-between gap-2">
        <div>
          DOAS — Department of Australia&apos;s Spending. Data from{' '}
          <a href="https://www.tenders.gov.au" target="_blank" rel="noopener noreferrer" className="text-gray-500 hover:underline">AusTender</a>{' '}
          via <a href="https://github.com/austender/austender-ocds-api" target="_blank" rel="noopener noreferrer" className="text-gray-500 hover:underline">OCDS API</a>.{' '}
          Licensed <a href="https://creativecommons.org/licenses/by/3.0/au/" target="_blank" rel="noopener noreferrer" className="text-gray-500 hover:underline">CC BY 3.0 AU</a>.
        </div>
        <div>Australian Government Procurement Data</div>
      </div>
    </>
  );
}

// ── Subcomponents ──

function ChartCard({ title, data, format, maxVal, color, colorFn }) {
  return (
    <div className="bg-gray-50 border border-gray-100 rounded-md p-4 sm:p-5">
      <h3 className="text-[10px] uppercase tracking-[1.2px] text-gray-400 font-semibold mb-3">{title}</h3>
      {data.map((item, i) => {
        const d = format(item);
        const pct = (d.value / maxVal * 100).toFixed(1);
        const bg = colorFn ? colorFn(item) : (color || '#111');
        return (
          <div key={i} className="flex items-center gap-1.5 mb-1" title={d.title || d.label}>
            <span className="w-[100px] sm:w-[130px] text-[11px] text-gray-500 whitespace-nowrap overflow-hidden text-ellipsis">{d.label}</span>
            <div className="flex-1 h-3 bg-gray-200/60 rounded-sm overflow-hidden">
              <div className="h-full rounded-sm transition-all duration-300" style={{ width: `${pct}%`, background: bg }} />
            </div>
            <span className="w-[65px] sm:w-[75px] text-right text-[11px] font-semibold tabnum whitespace-nowrap">{d.display}</span>
          </div>
        );
      })}
    </div>
  );
}

function ModalSection({ title, children }) {
  return (
    <div className="px-5 sm:px-6 py-4 border-b border-gray-50">
      <h4 className="text-[10px] uppercase tracking-wide text-gray-400 font-semibold mb-2">{title}</h4>
      {children}
    </div>
  );
}

function MRow({ label, value }) {
  return (
    <div className="flex justify-between py-1 text-xs gap-2">
      <span className="text-gray-500 shrink-0">{label}</span>
      <span className="font-medium text-right max-w-[65%] break-words">{value}</span>
    </div>
  );
}
