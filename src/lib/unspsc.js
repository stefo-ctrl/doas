/**
 * UNSPSC top-level category code to human-readable label mapping.
 * Covers the most common codes appearing in AusTender data.
 * Falls back to raw code/description for unknown codes.
 */
const UNSPSC_MAP = {
  '10': 'Live Animals & Plants',
  '11': 'Mineral & Textile Materials',
  '12': 'Chemicals & Fertilisers',
  '13': 'Resin & Rosin Products',
  '14': 'Paper & Packaging',
  '15': 'Fuel & Lubricants',
  '20': 'Mining Equipment',
  '21': 'Agricultural Machinery',
  '22': 'Building Materials',
  '23': 'Industrial Equipment',
  '24': 'Material Handling',
  '25': 'Vehicles & Transport',
  '26': 'Tyres & Tubes',
  '27': 'Tools & Hardware',
  '30': 'Structural Components',
  '31': 'Manufacturing Components',
  '32': 'Electronic Components',
  '39': 'Lighting & Electrical',
  '40': 'HVAC & Plumbing',
  '41': 'Laboratory Equipment',
  '42': 'Medical Equipment',
  '43': 'IT Equipment & Software',
  '44': 'Office Equipment',
  '45': 'Printing Equipment',
  '46': 'Defence & Security',
  '47': 'Cleaning Equipment',
  '48': 'Catering Equipment',
  '49': 'Sports & Recreation',
  '50': 'Food & Beverages',
  '51': 'Pharmaceuticals',
  '52': 'Furniture & Furnishings',
  '53': 'Clothing & Textiles',
  '54': 'Timekeeping & Jewellery',
  '55': 'Published Products & Media',
  '56': 'Furniture & Decor',
  '60': 'Livestock & Agricultural Services',
  '70': 'Farming & Fishing Services',
  '71': 'Mining & Drilling Services',
  '72': 'Building & Construction',
  '73': 'Industrial Processing Services',
  '76': 'Industrial Cleaning',
  '77': 'Environmental Services',
  '78': 'Transport & Logistics',
  '80': 'Management & Business Services',
  '81': 'Engineering & Research',
  '82': 'Advertising & Marketing',
  '83': 'Utilities',
  '84': 'Financial Services',
  '85': 'Healthcare Services',
  '86': 'Education & Training',
  '90': 'Travel & Accommodation',
  '91': 'Personal & Domestic Services',
  '92': 'National Defence',
  '93': 'Public Administration',
  '94': 'Community & Social Services',
  '95': 'Land & Property Services',
};

/**
 * Convert a raw category string to a human-readable label.
 * Handles UNSPSC codes (e.g., "86000000"), descriptions, or empty strings.
 */
export function humanCategory(raw) {
  if (!raw) return '';

  // If it looks like a UNSPSC numeric code (e.g., "86000000" or "86101700")
  const codeMatch = raw.match(/^(\d{2})/);
  if (codeMatch && /^\d+$/.test(raw.trim())) {
    const prefix = codeMatch[1];
    return UNSPSC_MAP[prefix] || raw;
  }

  // If it's already a description, return as-is but truncate if too long
  if (raw.length > 40) return raw.slice(0, 38) + '…';
  return raw;
}
