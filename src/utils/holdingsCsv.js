function parseCsvLine(line) {
  const values = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    const next = line[i + 1];

    if (ch === '"') {
      if (inQuotes && next === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (ch === ',' && !inQuotes) {
      values.push(current.trim());
      current = '';
      continue;
    }

    current += ch;
  }

  values.push(current.trim());
  return values;
}

function normalizeHeader(value) {
  return String(value || '').trim().toLowerCase();
}

function parseNumber(value) {
  const cleaned = String(value ?? '')
    .replace(/,/g, '')
    .replace(/[^\d.-]/g, '')
    .trim();
  const num = Number(cleaned);
  return Number.isFinite(num) ? num : 0;
}

function findHeaderIndex(rows) {
  return rows.findIndex((row) =>
    row.some((cell) => {
      const c = normalizeHeader(cell);
      return (
        c.includes('ticker') ||
        c.includes('code') ||
        c.includes('name') ||
        c.includes('qty') ||
        c.includes('종목') ||
        c.includes('수량')
      );
    })
  );
}

function findColumnIndex(header, candidates) {
  const normalized = header.map(normalizeHeader);
  for (const key of candidates) {
    const idx = normalized.findIndex((h) => h === key || h.includes(key));
    if (idx !== -1) return idx;
  }
  return -1;
}

export function parseHoldingsCsvText(text, tickerMap = {}) {
  const lines = String(text || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length === 0) return [];

  const rows = lines.map(parseCsvLine);
  const headerIdx = Math.max(findHeaderIndex(rows), 0);
  const header = rows[headerIdx];
  const dataRows = rows.slice(headerIdx + 1).filter((row) => row.length > 0);

  const idx = {
    cls: findColumnIndex(header, ['asset_class', 'class', '자산군']),
    name: findColumnIndex(header, ['name', 'etf', '종목명', '상품명', '명칭']),
    code: findColumnIndex(header, ['ticker', 'code', '종목코드', '티커', '코드']),
    qty: findColumnIndex(header, ['qty', 'quantity', '수량', '잔고수량']),
    price: findColumnIndex(header, ['price', 'current_price', '현재가', '단가']),
    amt: findColumnIndex(header, ['amount', 'amt', '평가금액']),
    costAmt: findColumnIndex(header, ['cost_amount', 'costamt', 'principal', 'principal_amount', '매입금액', '원금']),
  };

  const parsed = dataRows
    .map((row) => {
      const etf = idx.name >= 0 ? row[idx.name] || '' : '';
      const code = idx.code >= 0 ? row[idx.code] || '' : '';
      const qty = idx.qty >= 0 ? parseNumber(row[idx.qty]) : 0;
      const price = idx.price >= 0 ? parseNumber(row[idx.price]) : 0;
      const amt = idx.amt >= 0 ? parseNumber(row[idx.amt]) : qty * price;
      const costAmt = idx.costAmt >= 0 ? parseNumber(row[idx.costAmt]) : 0;

      const fromMap = tickerMap[etf] || tickerMap[code] || null;
      const cls =
        (idx.cls >= 0 ? row[idx.cls] : '') ||
        fromMap?.assetClass ||
        '미국주식';

      return {
        etf,
        code,
        cls,
        qty,
        price,
        amt,
        costAmt,
      };
    })
    .filter((item) => item.etf || item.code)
    .filter((item) => item.qty > 0 || item.amt > 0);

  return parsed;
}

export function buildHoldingsCsvTemplate() {
  const header = ['asset_class', 'name', 'ticker', 'qty', 'price', 'amount', 'cost_amount'];
  const sampleRows = [
    ['미국주식', '1Q 미국S&P500', '360750', '15', '12000', '180000', '170000'],
    ['현금MMF', 'CMA RP', 'CASH', '0', '0', '2500000', '2500000'],
    ['해외채권', 'KODEX 미국채10년', '381170', '22', '10250', '225500', '230000'],
  ];

  return [header, ...sampleRows]
    .map((row) => row.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(','))
    .join('\n');
}
