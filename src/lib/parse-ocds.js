import { AUSTENDER_CN_URL } from './constants';

/**
 * Parse an OCDS release into clean contract objects.
 * Handles deduplication, value parsing, supplier extraction.
 */
export function parseRelease(rel, seen) {
  const results = [];
  const contracts = rel.contracts || [];
  const tender = rel.tender || {};
  const parties = rel.parties || [];
  const awards = rel.awards || [];

  // Find procuring entity from parties (buyer info isn't in standard fields)
  const procurer = parties.find(p => p.roles && p.roles.includes('procuringEntity'));

  for (const c of contracts) {
    const uid = rel.ocid + '::' + (c.id || '0');
    if (seen.has(uid)) continue;
    seen.add(uid);

    // Extract supplier — try awards first, then parties
    let supplierName = '';
    let supplierABN = '';

    for (const aw of awards) {
      if (aw.suppliers && aw.suppliers.length > 0) {
        supplierName = aw.suppliers[0].name || '';
        const ids = aw.suppliers[0].additionalIdentifiers;
        if (ids) {
          const abn = ids.find(x => x.scheme === 'ABN');
          if (abn) supplierABN = abn.id || '';
        }
        break;
      }
    }

    if (!supplierName) {
      const sup = parties.find(p => p.roles && p.roles.includes('supplier'));
      if (sup) {
        supplierName = sup.name || '';
        if (sup.additionalIdentifiers) {
          const abn = sup.additionalIdentifiers.find(x => x.scheme === 'ABN');
          if (abn) supplierABN = abn.id || '';
        }
      }
    }

    // Category from items classification
    const items = c.items || [];
    const category = items.length > 0 && items[0].classification
      ? (items[0].classification.description || items[0].classification.id || '')
      : '';

    // Parse value as number — handle strings, nulls, NaN
    let value = 0;
    if (c.value && c.value.amount != null) {
      value = Number(c.value.amount);
      if (isNaN(value)) value = 0;
    }

    // Build the AusTender verification URL
    // OCDS ocid format: "ocds-fffffb-CN1234567" — extract after the second hyphen
    // The actual link uses the release ID which maps to the CN page
    const cnNumber = rel.ocid ? rel.ocid.replace(/^ocds-[a-z0-9]+-/, '') : '';
    const austenderUrl = cnNumber
      ? `${AUSTENDER_CN_URL}/${cnNumber}`
      : `https://www.tenders.gov.au/cn/search`;

    results.push({
      uid,
      ocid: rel.ocid || '',
      cnId: c.id || '',
      cnNumber,
      title: c.title || tender.title || '',
      value,
      status: c.status || '',
      startDate: c.period ? c.period.startDate || '' : '',
      endDate: c.period ? c.period.endDate || '' : '',
      pubDate: rel.date || '',
      supplier: supplierName,
      supplierABN,
      agency: procurer ? procurer.name || '' : '',
      division: procurer && procurer.contactPoint ? (procurer.contactPoint.division || '') : '',
      method: tender.procurementMethod || '',
      methodDetail: tender.procurementMethodDetails || '',
      category,
      austenderUrl,
    });
  }

  return results;
}
