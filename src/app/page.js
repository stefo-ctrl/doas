'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';

// Format currency — numeric sort-safe
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

const PAGE_SIZE = 50;

export default function Home() {
  const [from, setFrom] = useState(daysAgo(30));
  const [to, setTo] = useState(isoDate(new Date()));
  const [contracts, setContracts] = useState([]);
  const [meta, setMeta] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [tab, setTab] = useState('table');
  const [search, setSearch] = useState('');
  const [agencyFilter, setAgencyFilter] = useState('');
  const [sortCol, setSortCol] = useState('value');
  const [sortDir, setSortDir] = useState('desc');
  const [page, setPage] = useState(0);
  const [selectedId, setSelectedId] = useState(null);
  const [activeRange, setActiveRange] = useState(30);

  // Fetch from our own API route
  const fetchContracts = useCallback(async (f, t) => {
    console.log('[DOAS] Fetching:', f, 'to', t);
    setLoading(true);
    setError(null);
    setContracts([]);
    setMeta(null);
    setPage(0);
    setSearch('');
    setAgencyFilter('');
    setSelectedId(null);

    try {
      const res = await fetch(`/api/contracts?from=${f}&to=${t}`);
      const data = await res.json();
      console.log('[DOAS] Response:', res.status, 'contracts:', data.contracts?.length);

      if (!res.ok) {
        throw new Error(data.error || `API returned ${res.status}`);
      }

      setContracts(data.contracts || []);
      setMeta(data.meta || null);
    } catch (err) {
      console.error('[DOAS] Fetch error:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch on mount
  useEffect(() => {
    fetchContracts(from, to);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Quick range
  function setRange(days) {
    const f = daysAgo(days);
    const t = isoDate(new Date());
    setFrom(f);
    setTo(t);
    setActiveRange(days);
    fetchContracts(f, t);
  }

  // Sorting
  function doSort(col) {
    if (sortCol === col) setSortDir(d => d === 'desc' ? 'asc' : 'desc');
    else { setSortCol(col); setSortDir('desc'); }
  }

  // Filtered + sorted
  const filtered = useMemo(() => {
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
    arr = [...arr].sort((a, b) => {
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
    return arr;
  }, [contracts, search, agencyFilter, sortCol, sortDir]);

  // Hero stats
  const heroStats = useMemo(() => {
    const total = contracts.reduce((s, c) => s + c.value, 0);
    const suppliers = new Set(contracts.map(c => c.supplier).filter(Boolean));
    const limited = contracts.filter(c => c.method === 'limited');
    const pct = contracts.length > 0 ? (limited.length / contracts.length * 100) : 0;
    return { total, count: contracts.length, suppliers: suppliers.size, limitedPct: pct, limitedCount: limited.length };
  }, [contracts]);

  // Agencies for filter dropdown
  const agencies = useMemo(() =>
    [...new Set(contracts.map(c => c.agency).filter(Boolean))].sort(),
    [contracts]
  );

  // Agency breakdown for charts
  const agencyBreakdown = useMemo(() => {
    const m = {};
    contracts.forEach(c => { const a = c.agency || 'Unknown'; m[a] = (m[a] || 0) + c.value; });
    return Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, 10);
  }, [contracts]);

  // Method breakdown for charts
  const methodBreakdown = useMemo(() => {
    const m = {};
    contracts.forEach(c => { const k = c.method || 'unknown'; if (!m[k]) m[k] = { n: 0, v: 0 }; m[k].n++; m[k].v += c.value; });
    return Object.entries(m).sort((a, b) => b[1].v - a[1].v);
  }, [contracts]);

  // Top suppliers for charts
  const supplierBreakdown = useMemo(() => {
    const m = {};
    contracts.forEach(c => { const s = c.supplier || 'Unknown'; if (!m[s]) m[s] = { n: 0, v: 0 }; m[s].n++; m[s].v += c.value; });
    return Object.entries(m).sort((a, b) => b[1].v - a[1].v).slice(0, 10);
  }, [contracts]);

  // Value distribution
  const valueDist = useMemo(() => {
    const buckets = [
      { label: '$100M+', min: 1e8, n: 0, v: 0 },
      { label: '$10M–$100M', min: 1e7, max: 1e8, n: 0, v: 0 },
      { label: '$1M–$10M', min: 1e6, max: 1e7, n: 0, v: 0 },
      { label: 'Under $1M', min: 0, max: 1e6, n: 0, v: 0 },
    ];
    contracts.forEach(c => {
      for (const b of buckets) {
        if (c.value >= b.min && (!b.max || c.value < b.max)) { b.n++; b.v += c.value; break; }
      }
    });
    return buckets;
  }, [contracts]);

  // Pagination
  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const pageData = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  // Selected contract for modal
  const selected = selectedId ? contracts.find(c => c.uid === selectedId) : null;

  const methodClass = (m) => {
    if (m === 'open') return 'bg-green-50 text-green-700';
    if (m === 'limited') return 'bg-amber-50 text-amber-700';
    return 'bg-blue-50 text-blue-700';
  };
  const methodLabel = (m) => m === 'open' ? 'Open' : m === 'limited' ? 'Limited' : m === 'selective' ? 'Selective' : (m || '—');

  return (
    <>
      {/* TOP BAR */}
      <div className="sticky top-0 z-50 bg-white border-b border-gray-200 px-7 py-2.5 flex items-center justify-between">
        <div className="flex items-center gap-3.5">
          <span className="font-bold text-[17px] tracking-tight">
            DOAS<span className="inline-block w-[7px] h-[7px] bg-green-500 rounded-full ml-1.5 live-dot" />
          </span>
          <span className="text-[10px] text-gray-400 uppercase tracking-[1.5px] font-medium">
            Department of Australia&apos;s Spending
          </span>
        </div>
        <div className="flex gap-2.5">
          <a href="https://www.tenders.gov.au" target="_blank" rel="noopener noreferrer"
            className="text-[10px] text-gray-400 border border-gray-200 rounded px-2 py-1 hover:text-gray-500 hover:border-gray-300 no-underline">
            source: tenders.gov.au
          </a>
          <a href="https://github.com/austender/austender-ocds-api" target="_blank" rel="noopener noreferrer"
            className="text-[10px] text-gray-400 border border-gray-200 rounded px-2 py-1 hover:text-gray-500 hover:border-gray-300 no-underline">
            OCDS API
          </a>
        </div>
      </div>

      {/* CONTROLS */}
      <div className="px-7 py-2.5 border-b border-gray-100 flex items-center gap-3 flex-wrap bg-gray-50/80">
        <label className="text-[10px] text-gray-400 uppercase tracking-wide font-medium">From</label>
        <input type="date" value={from} min="2022-01-01" onChange={e => setFrom(e.target.value)}
          className="text-xs px-2 py-1.5 border border-gray-200 rounded bg-white" />
        <label className="text-[10px] text-gray-400 uppercase tracking-wide font-medium">To</label>
        <input type="date" value={to} min="2022-01-01" onChange={e => setTo(e.target.value)}
          className="text-xs px-2 py-1.5 border border-gray-200 rounded bg-white" />
        <button onClick={() => fetchContracts(from, to)} disabled={loading}
          className="text-[11px] font-semibold px-3.5 py-1.5 bg-gray-900 text-white border border-gray-900 rounded hover:bg-gray-700 disabled:opacity-30">
          {loading ? 'Fetching…' : 'Fetch'}
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

      {/* HERO STATS */}
      <div className="grid grid-cols-4 border-b border-gray-200 max-md:grid-cols-2 max-sm:grid-cols-1">
        <div className="px-7 py-5 border-r border-gray-200 max-sm:border-r-0">
          <div className="text-[10px] text-gray-400 uppercase tracking-[1.4px] font-medium mb-0.5">Total Contract Value</div>
          <div className="text-[26px] font-bold tracking-tight tabnum">{loading ? '…' : fmtCurrency(heroStats.total)}</div>
          <div className="text-[11px] text-gray-400 mt-0.5">{meta ? `${meta.from} → ${meta.to}` : ''}</div>
        </div>
        <div className="px-7 py-5 border-r border-gray-200 max-sm:border-r-0">
          <div className="text-[10px] text-gray-400 uppercase tracking-[1.4px] font-medium mb-0.5">Contracts Published</div>
          <div className="text-[26px] font-bold tracking-tight tabnum">{loading ? '…' : heroStats.count.toLocaleString()}</div>
          <div className="text-[11px] text-gray-400 mt-0.5">published in period</div>
        </div>
        <div className="px-7 py-5 border-r border-gray-200 max-sm:border-r-0">
          <div className="text-[10px] text-gray-400 uppercase tracking-[1.4px] font-medium mb-0.5">Unique Suppliers</div>
          <div className="text-[26px] font-bold tracking-tight tabnum">{loading ? '…' : heroStats.suppliers.toLocaleString()}</div>
          <div className="text-[11px] text-gray-400 mt-0.5">distinct entities</div>
        </div>
        <div className="px-7 py-5">
          <div className="text-[10px] text-gray-400 uppercase tracking-[1.4px] font-medium mb-0.5">Limited Tender %</div>
          <div className="text-[26px] font-bold tracking-tight tabnum">{loading ? '…' : heroStats.limitedPct.toFixed(1) + '%'}</div>
          <div className="text-[11px] text-gray-400 mt-0.5">{heroStats.limitedCount.toLocaleString()} of {heroStats.count.toLocaleString()} no competitive bid</div>
        </div>
      </div>

      {/* STATUS */}
      <div className="px-7 py-1.5 bg-gray-50/80 border-b border-gray-100 text-[11px] text-gray-400 flex items-center gap-1.5">
        <span className={`inline-block w-1.5 h-1.5 rounded-full ${error ? 'bg-red-500' : loading ? 'bg-amber-400' : 'bg-green-500'}`} />
        {error ? `Error: ${error}` : loading ? 'Fetching from AusTender…' : meta ? `Loaded ${meta.count.toLocaleString()} contracts from ${meta.source}` : 'Ready'}
      </div>

      {/* TABS */}
      <div className="flex border-b border-gray-200 px-7 bg-white">
        {['table', 'charts'].map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-5 py-2.5 text-xs font-semibold border-b-2 transition-all ${tab === t ? 'text-gray-900 border-gray-900' : 'text-gray-400 border-transparent hover:text-gray-600'}`}>
            {t === 'table' ? 'Contracts' : 'Analytics'}
          </button>
        ))}
      </div>

      {/* CONTRACTS TABLE TAB */}
      {tab === 'table' && (
        <div>
          {/* Filter row */}
          <div className="px-3 py-1.5 flex gap-2 items-center border-b border-gray-100 bg-gray-50/80">
            <input placeholder="Search supplier, agency, title…" value={search} onChange={e => { setSearch(e.target.value); setPage(0); }}
              className="text-[11px] px-2 py-1 border border-gray-200 rounded bg-white w-56" />
            <select value={agencyFilter} onChange={e => { setAgencyFilter(e.target.value); setPage(0); }}
              className="text-[11px] px-2 py-1 border border-gray-200 rounded bg-white w-44">
              <option value="">All Agencies</option>
              {agencies.map(a => <option key={a} value={a}>{a.replace(/^Department of /, '')}</option>)}
            </select>
            <span className="ml-auto text-[11px] text-gray-400 tabnum">{filtered.length.toLocaleString()} contracts</span>
          </div>

          {loading ? (
            <div className="py-20 text-center">
              <div className="w-7 h-7 border-2 border-gray-200 border-t-gray-900 rounded-full spinner mx-auto mb-3" />
              <div className="text-xs text-gray-400">Fetching contracts from AusTender…</div>
            </div>
          ) : error ? (
            <div className="m-7 p-5 border border-red-400 rounded-md bg-red-50">
              <h3 className="text-red-600 text-sm font-semibold mb-1">Failed to fetch</h3>
              <p className="text-[13px] text-gray-600">{error}</p>
            </div>
          ) : (
            <>
              <table className="w-full border-collapse text-[13px]">
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
                        className={`px-3 py-2 text-left text-[10px] uppercase tracking-wide font-semibold bg-gray-50 border-b border-gray-200 whitespace-nowrap ${key ? 'cursor-pointer hover:text-gray-900' : ''} ${sortCol === key ? 'text-gray-900' : 'text-gray-400'}`}>
                        {label} {sortCol === key ? (sortDir === 'desc' ? '↓' : '↑') : ''}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {pageData.map(c => (
                    <tr key={c.uid} onClick={() => setSelectedId(c.uid)} className="cursor-pointer hover:bg-gray-50 transition-colors">
                      <td className="px-3 py-2 border-b border-gray-50">
                        <span className={`font-semibold tabnum whitespace-nowrap ${c.value >= 10000000 ? 'text-red-600' : ''}`}>
                          {fmtCurrency(c.value)}
                        </span>
                      </td>
                      <td className="px-3 py-2 border-b border-gray-50 max-w-[200px]">
                        <div className="font-semibold text-[13px]">{c.supplier || 'Not disclosed'}</div>
                        {c.supplierABN && <div className="text-[10px] text-gray-400 mt-px">ABN {c.supplierABN}</div>}
                      </td>
                      <td className="px-3 py-2 border-b border-gray-50 text-xs max-w-[200px]">
                        {c.agency ? c.agency.replace(/^Department of /, 'Dept. ') : '—'}
                      </td>
                      <td className="px-3 py-2 border-b border-gray-50 text-[11px] text-gray-500 max-w-[160px]">{c.category || '—'}</td>
                      <td className="px-3 py-2 border-b border-gray-50">
                        <span className={`text-[9px] uppercase font-semibold tracking-wide px-1.5 py-0.5 rounded ${methodClass(c.method)}`}>
                          {methodLabel(c.method)}
                        </span>
                      </td>
                      <td className="px-3 py-2 border-b border-gray-50 text-[11px] text-gray-500 whitespace-nowrap tabnum">{fmtDate(c.pubDate)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {totalPages > 1 && (
                <div className="px-7 py-3 text-center text-[11px] text-gray-400 border-t border-gray-100 flex items-center justify-center gap-2">
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
        <div className="p-7 grid grid-cols-2 gap-6 max-md:grid-cols-1">
          <ChartCard title="Top Agencies by Value" data={agencyBreakdown}
            format={([name, val]) => ({ label: name.replace(/^Department of /, '').replace(/^Australian /, ''), value: val, display: fmtCurrency(val) })}
            maxVal={agencyBreakdown[0]?.[1] || 1} color="#111" />
          <ChartCard title="Procurement Method" data={methodBreakdown}
            format={([m, d]) => ({
              label: m === 'open' ? 'Open Tender' : m === 'limited' ? 'Limited Tender' : m === 'selective' ? 'Selective' : m,
              value: d.n, display: `${d.n.toLocaleString()} (${(d.n / (contracts.length || 1) * 100).toFixed(0)}%)`,
            })}
            maxVal={contracts.length || 1}
            colorFn={([m]) => m === 'limited' ? '#d97706' : m === 'open' ? '#16a34a' : '#2563eb'} />
          <ChartCard title="Top Suppliers by Value" data={supplierBreakdown}
            format={([name, d]) => ({ label: name.length > 24 ? name.slice(0, 24) + '…' : name, value: d.v, display: fmtCurrency(d.v), title: name })}
            maxVal={supplierBreakdown[0]?.[1]?.v || 1} color="#111" />
          <ChartCard title="Contract Value Distribution" data={valueDist}
            format={(b) => ({ label: b.label, value: b.n, display: `${b.n.toLocaleString()} / ${fmtCurrency(b.v)}` })}
            maxVal={Math.max(...valueDist.map(b => b.n), 1)} color="#111" isArray />
        </div>
      )}

      {/* MODAL */}
      {selected && (
        <div className="fixed inset-0 bg-black/40 z-[200] flex items-center justify-center" onClick={() => setSelectedId(null)}>
          <div className="bg-white rounded-lg w-[520px] max-h-[80vh] overflow-y-auto shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="px-6 py-5 border-b border-gray-100 flex justify-between items-start">
              <div>
                <div className="text-[11px] text-gray-400 mb-1">{selected.cnNumber || selected.ocid}</div>
                <div className={`text-2xl font-bold tabnum ${selected.value >= 10000000 ? 'text-red-600' : ''}`}>{fmtCurrency(selected.value)}</div>
              </div>
              <button onClick={() => setSelectedId(null)} className="w-7 h-7 border border-gray-200 rounded flex items-center justify-center text-gray-400 hover:text-gray-900 hover:border-gray-400">✕</button>
            </div>
            <ModalSection title="Contract">
              <MRow label="Title" value={selected.title || '—'} />
              <MRow label="Status" value={selected.status || '—'} />
              <MRow label="Start" value={fmtDate(selected.startDate)} />
              <MRow label="End" value={fmtDate(selected.endDate)} />
              <MRow label="Published" value={fmtDate(selected.pubDate)} />
            </ModalSection>
            <ModalSection title="Supplier">
              <MRow label="Name" value={selected.supplier || 'Not disclosed'} />
              {selected.supplierABN && <MRow label="ABN" value={selected.supplierABN} />}
            </ModalSection>
            <ModalSection title="Procuring Agency">
              <MRow label="Agency" value={selected.agency || '—'} />
              {selected.division && <MRow label="Division" value={selected.division} />}
            </ModalSection>
            <ModalSection title="Procurement">
              <MRow label="Method" value={selected.method || '—'} />
              {selected.methodDetail && <MRow label="Detail" value={selected.methodDetail} />}
              <MRow label="Category" value={selected.category || '—'} />
            </ModalSection>
            <div className="px-6 py-4 border-t border-gray-100">
              <a href={selected.austenderUrl} target="_blank" rel="noopener noreferrer"
                className="text-xs text-blue-600 hover:underline">
                View on AusTender →
              </a>
            </div>
          </div>
        </div>
      )}

      {/* FOOTER */}
      <div className="px-7 py-5 border-t border-gray-200 text-[10px] text-gray-400 flex justify-between">
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

// Reusable chart card
function ChartCard({ title, data, format, maxVal, color, colorFn, isArray }) {
  return (
    <div className="bg-gray-50 border border-gray-100 rounded-md p-5">
      <h3 className="text-[10px] uppercase tracking-[1.2px] text-gray-400 font-semibold mb-3">{title}</h3>
      {data.map((item, i) => {
        const d = format(item);
        const pct = (d.value / maxVal * 100).toFixed(1);
        const bg = colorFn ? colorFn(item) : (color || '#111');
        return (
          <div key={i} className="flex items-center gap-1.5 mb-1" title={d.title || d.label}>
            <span className="w-[130px] text-[11px] text-gray-500 whitespace-nowrap overflow-hidden text-ellipsis">{d.label}</span>
            <div className="flex-1 h-3 bg-gray-200/60 rounded-sm overflow-hidden">
              <div className="h-full rounded-sm transition-all duration-300" style={{ width: `${pct}%`, background: bg }} />
            </div>
            <span className="w-[75px] text-right text-[11px] font-semibold tabnum whitespace-nowrap">{d.display}</span>
          </div>
        );
      })}
    </div>
  );
}

function ModalSection({ title, children }) {
  return (
    <div className="px-6 py-4 border-b border-gray-50">
      <h4 className="text-[10px] uppercase tracking-wide text-gray-400 font-semibold mb-2">{title}</h4>
      {children}
    </div>
  );
}

function MRow({ label, value }) {
  return (
    <div className="flex justify-between py-1 text-xs">
      <span className="text-gray-500">{label}</span>
      <span className="font-medium text-right max-w-[60%]">{value}</span>
    </div>
  );
}
