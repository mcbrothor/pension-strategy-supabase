function downloadBlob(filename, content, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function escapeCsvCell(value) {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

export function exportCsv(filename, rows = []) {
  const content = ["\uFEFF", rows.join("\n")].join("");
  downloadBlob(filename, content, "text/csv;charset=utf-8;");
}

export function buildTransactionsCsvRows(transactions = []) {
  const header = [
    "trade_date",
    "ticker",
    "name",
    "asset_class",
    "side",
    "quantity",
    "price",
    "fee",
    "memo",
  ].map(escapeCsvCell).join(",");

  const body = transactions.map((item) => [
    item.tradeDate,
    item.ticker,
    item.name,
    item.assetClass,
    item.side,
    item.quantity,
    item.price,
    item.fee,
    item.memo,
  ].map(escapeCsvCell).join(","));

  return [header, ...body];
}

export function buildPerformanceCsvRows(model = {}) {
  const rows = [
    ["metric", "value"],
    ["total", model.total ?? ""],
    ["snapshot_return", model.performance?.periodReturn ?? ""],
    ["benchmark_name", model.benchmark?.name ?? ""],
    ["benchmark_return", model.benchmark?.periodReturn ?? ""],
    ["alpha", model.alpha ?? ""],
    ["unrealized_return", model.performance?.unrealizedReturn ?? ""],
    ["realized_pnl", model.performance?.realizedPnl ?? ""],
    ["benchmark_gap_1y", model.performance?.benchmarkGap1Y ?? ""],
    ["benchmark_gap_3y", model.performance?.benchmarkGap3Y ?? ""],
  ];
  return rows.map((row) => row.map(escapeCsvCell).join(","));
}

export function buildPerformanceSummaryRows(model = {}, benchmarkOverride = null) {
  const benchmark = benchmarkOverride || model.benchmark || {};
  const alpha =
    model.performance?.periodReturn != null && benchmark?.periodReturn != null
      ? model.performance.periodReturn - benchmark.periodReturn
      : model.alpha ?? null;

  return [
    ["metric", "value"],
    ["total", model.total ?? ""],
    ["strategy", model.displayStrategyName ?? model.strategy?.name ?? ""],
    ["account_type", model.accountType ?? ""],
    ["snapshot_return", model.performance?.periodReturn ?? ""],
    ["annualized_return", model.performance?.annualizedReturn ?? ""],
    ["benchmark_name", benchmark?.name ?? ""],
    ["benchmark_return", benchmark?.periodReturn ?? ""],
    ["alpha", alpha ?? ""],
    ["unrealized_return", model.performance?.unrealizedReturn ?? ""],
    ["unrealized_pnl", model.performance?.unrealizedPnl ?? ""],
    ["realized_pnl", model.performance?.realizedPnl ?? ""],
    ["total_fees", model.performance?.totalFees ?? ""],
    ["benchmark_gap_1y", model.performance?.benchmarkGap1Y ?? ""],
    ["benchmark_gap_3y", model.performance?.benchmarkGap3Y ?? ""],
  ];
}

export function buildHoldingsTableRows(holdings = []) {
  return [
    ["asset_tag", "name", "ticker", "current_weight", "target_weight", "drift_pp", "amount", "cost_amount", "pnl_pct"],
    ...holdings.map((holding) => [
      holding.assetClassTag ?? holding.cls ?? "",
      holding.displayName ?? holding.etf ?? holding.name ?? "",
      holding.code ?? holding.ticker ?? "",
      holding.cur ?? "",
      holding.target ?? "",
      holding.diff ?? "",
      holding.amt ?? "",
      holding.costAmt ?? "",
      holding.pnlPct ?? "",
    ]),
  ];
}

export function exportExcelTable(filename, title, headers = [], rows = []) {
  const headHtml = headers.map((header) => `<th>${escapeHtml(header)}</th>`).join("");
  const rowHtml = rows.map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join("")}</tr>`).join("");
  const html = `<!DOCTYPE html>
  <html>
  <head>
    <meta charset="UTF-8" />
    <style>
      table { border-collapse: collapse; width: 100%; }
      th, td { border: 1px solid #cccccc; padding: 6px 8px; font-size: 12px; }
      th { background: #f3f4f6; text-align: left; }
      h1 { font-size: 16px; }
    </style>
  </head>
  <body>
    <h1>${escapeHtml(title)}</h1>
    <table>
      <thead><tr>${headHtml}</tr></thead>
      <tbody>${rowHtml}</tbody>
    </table>
  </body>
  </html>`;
  downloadBlob(filename, `\uFEFF${html}`, "application/vnd.ms-excel;charset=utf-8;");
}

function buildSheetTable(title, rows = []) {
  const normalizedRows = Array.isArray(rows) ? rows : [];
  const tableRows = normalizedRows
    .map((row) => `<tr>${(Array.isArray(row) ? row : [row]).map((cell) => `<td>${escapeHtml(cell)}</td>`).join("")}</tr>`)
    .join("");

  return `
    <table>
      <tbody>
        <tr><td colspan="${Math.max((normalizedRows[0] || []).length, 1)}" style="font-size:16px;font-weight:700;background:#eef6ff;">${escapeHtml(title)}</td></tr>
        ${tableRows}
      </tbody>
    </table>
  `;
}

export function exportExcelWorkbook(filename, sheets = []) {
  const safeSheets = sheets.filter((sheet) => sheet?.name);
  const worksheetXml = safeSheets
    .map(
      (sheet) => `
      <x:ExcelWorksheet>
        <x:Name>${escapeHtml(sheet.name)}</x:Name>
        <x:WorksheetOptions><x:DisplayGridlines/></x:WorksheetOptions>
      </x:ExcelWorksheet>`
    )
    .join("");

  const body = safeSheets
    .map(
      (sheet) => `
      <div id="${escapeHtml(sheet.name)}" class="sheet">
        ${buildSheetTable(sheet.title || sheet.name, sheet.rows || [])}
      </div>`
    )
    .join("");

  const html = `<!DOCTYPE html>
  <html xmlns:o="urn:schemas-microsoft-com:office:office"
        xmlns:x="urn:schemas-microsoft-com:office:excel"
        xmlns="http://www.w3.org/TR/REC-html40">
  <head>
    <meta charset="UTF-8" />
    <!--[if gte mso 9]><xml>
      <x:ExcelWorkbook>
        <x:ExcelWorksheets>${worksheetXml}
        </x:ExcelWorksheets>
      </x:ExcelWorkbook>
    </xml><![endif]-->
    <style>
      .sheet { page-break-after: always; }
      table { border-collapse: collapse; width: 100%; margin-bottom: 12px; }
      td { border: 1px solid #cccccc; padding: 6px 8px; font-size: 12px; }
    </style>
  </head>
  <body>${body}</body>
  </html>`;

  downloadBlob(filename, `\uFEFF${html}`, "application/vnd.ms-excel;charset=utf-8;");
}
