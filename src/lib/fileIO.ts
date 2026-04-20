import * as XLSX from 'xlsx';
import Papa from 'papaparse';
import type { ClassifiedRow } from './types';
import { COLUMNS } from './types';
import { buildSummaryTable, buildEngineerBreakdown, findCol } from './engine';

// ── Parse CSV (latin-1 safe via FileReader) ──
export function parseCSV(file: File): Promise<Record<string, unknown>[]> {
  return new Promise((resolve, reject) => {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      encoding: 'latin1',
      complete: (result) => resolve(result.data as Record<string, unknown>[]),
      error: (err: Error) => reject(err),
    });
  });
}

// ── Parse XLSX ──
export function parseXLSX(file: File): Promise<{
  sheets: string[];
  data: Record<string, Record<string, unknown>[]>;
}> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target!.result as ArrayBuffer);
        const wb = XLSX.read(data, { type: 'array', cellDates: true });
        const result: Record<string, Record<string, unknown>[]> = {};
        for (const name of wb.SheetNames) {
          result[name] = XLSX.utils.sheet_to_json(wb.Sheets[name], { defval: '' });
        }
        resolve({ sheets: wb.SheetNames, data: result });
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });
}

// ── Find "Open Call" sheet (case-insensitive) ──
export function findOpenCallSheet(sheets: string[]): string | null {
  const patterns = ['open call', 'opencall', 'data', 'summary', 'report'];
  for (const p of patterns) {
    const found = sheets.find(s => s.toLowerCase().includes(p));
    if (found) return found;
  }
  return sheets[0] ?? null;
}

// ── Detect ASP cities from Flex data ──
export function detectCities(data: Record<string, unknown>[]): string[] {
  const cities = new Set<string>();
  const cityAliases = ['ASP City', 'ASPCity', 'City', 'Location', 'Branch'];
  
  for (const row of data) {
    const city = findCol(row, cityAliases);
    if (city) cities.add(city);
  }
  return [...cities].sort();
}

// ── Row to array in column order ──
function rowToArray(row: ClassifiedRow): (string | number)[] {
  return [
    row.month,
    row.ticketNo,
    row.caseId,
    row.product,
    row.wipAging,
    row.location,
    row.segment,
    row.hpOwner,
    row.flexStatus,
    row.morningStatus,
    row.eveningStatus,
    row.currentStatusTAT,
    row.engg,
    row.contactNo,
    row.parts,
    row.wipChanged,
  ];
}

// ── Export Summary to XLSX (Only the 18-metric table) ──
export function exportSummaryXLSX(
  rows: ClassifiedRow[],
  engineersCount: number,
  city: string,
  dateStr: string
) {
  const wb = XLSX.utils.book_new();
  const summaryData = buildSummaryTable(rows, engineersCount);
  const engBreakdown = buildEngineerBreakdown(rows);
  
  const finalSummaryData = [...summaryData, [], [], ...engBreakdown];
  const wsSummary = XLSX.utils.aoa_to_sheet(finalSummaryData);
  
  wsSummary['!cols'] = [{ wch: 10 }, { wch: 35 }, { wch: 15 }];
  XLSX.utils.book_append_sheet(wb, wsSummary, 'Summary');

  const filename = `${city}_${dateStr}_Summary_Counts.xlsx`;
  XLSX.writeFile(wb, filename);
  return filename;
}

// ── Build Pivot Table data: Segment + Morning Report (rows) × WIP Aging (cols) ──
function buildPivotSheet(allRows: ClassifiedRow[]): (string | number)[][] {
  // Collect all unique WIP Aging values, Segments, and Morning Report statuses
  const wipSet = new Set<number>();
  const segmentSet = new Set<string>();
  // countMap[segment][status][wipKey] = count
  const countMap: Record<string, Record<string, Partial<Record<number | 'blank', number>>>> = {};

  for (const row of allRows) {
    const status = (row.morningStatus || '').trim();
    const statusKey = status === '' ? '(blank)' : status;
    const segment = (row.segment || '').trim();
    const segKey = segment === '' ? '(blank)' : segment;
    const wip = row.wipAging ?? NaN;
    const wipKey: number | 'blank' = isNaN(wip) ? 'blank' : wip;

    segmentSet.add(segKey);
    if (wipKey !== 'blank') wipSet.add(wipKey as number);

    if (!countMap[segKey]) countMap[segKey] = {};
    if (!countMap[segKey][statusKey]) countMap[segKey][statusKey] = {};
    countMap[segKey][statusKey][wipKey] = (countMap[segKey][statusKey][wipKey] || 0) + 1;
  }

  // Sort WIP aging numerically, push (blank) to end
  const wipCols: (number | 'blank')[] = [...wipSet].sort((a, b) => a - b);
  const hasBlankWip = allRows.some(r => r.wipAging === undefined || r.wipAging === null || isNaN(r.wipAging));
  if (hasBlankWip) wipCols.push('blank');

  // Sorted segments and collect all statuses across all segments
  const segments = [...segmentSet].filter(s => s !== '(blank)').sort();
  if (segmentSet.has('(blank)')) segments.push('(blank)');

  const allStatuses = new Set<string>();
  for (const seg of segments) {
    for (const st of Object.keys(countMap[seg] || {})) {
      allStatuses.add(st);
    }
  }
  const statuses = [...allStatuses].filter(s => s !== '(blank)').sort();
  if (allStatuses.has('(blank)')) statuses.push('(blank)');

  const result: (string | number)[][] = [];

  // Row 1: Title row
  result.push(['Count of Ticket No', '', 'Column Labels', ...Array(wipCols.length).fill('')]);

  // Row 2: Header row — "Segment", "Row Labels", then each WIP aging value, then "Grand Total"
  const headerRow: (string | number)[] = [
    'Segment',
    'Row Labels',
    ...wipCols.map(w => w === 'blank' ? '(blank)' : w),
    'Grand Total',
  ];
  result.push(headerRow);

  // Data rows — one per (Segment × Morning Report status) with counts
  for (const seg of segments) {
    for (const status of statuses) {
      const counts = countMap[seg]?.[status];
      if (!counts) continue; // skip empty combos

      const row: (string | number)[] = [seg, status];
      let rowTotal = 0;
      for (const wip of wipCols) {
        const count = counts[wip] || 0;
        row.push(count > 0 ? count : '');
        rowTotal += count;
      }
      row.push(rowTotal);
      result.push(row);
    }
  }

  // Grand Total row
  const grandRow: (string | number)[] = ['', 'Grand Total'];
  let grandTotal = 0;
  for (const wip of wipCols) {
    let colSum = 0;
    for (const seg of segments) {
      for (const status of statuses) {
        colSum += countMap[seg]?.[status]?.[wip] || 0;
      }
    }
    grandRow.push(colSum > 0 ? colSum : '');
    grandTotal += colSum;
  }
  grandRow.push(grandTotal);
  result.push(grandRow);

  return result;
}

// ── Export Call Plan to XLSX (Main Data, Closed OTB & Pivot Table) ──
export function exportCallPlanXLSX(
  rows: ClassifiedRow[],
  dropped: ClassifiedRow[],
  city: string,
  dateStr: string
) {
  const wb = XLSX.utils.book_new();

  // 1. Open Call sheet
  const outputRows = rows.filter(r => r.classification !== 'DROPPED');
  const header = [...COLUMNS];
  const dataRows = outputRows.map(rowToArray);
  const wsOpen = XLSX.utils.aoa_to_sheet([header, ...dataRows]);

  wsOpen['!cols'] = [
    { wch: 12 }, { wch: 16 }, { wch: 14 }, { wch: 35 }, { wch: 10 },
    { wch: 18 }, { wch: 10 }, { wch: 18 }, { wch: 18 }, { wch: 14 },
    { wch: 18 }, { wch: 18 },
    { wch: 28 }, { wch: 12 }, { wch: 14 }, { wch: 20 },
  ];
  XLSX.utils.book_append_sheet(wb, wsOpen, 'Open Call');

  // 2. Dropped sheet
  if (dropped.length > 0) {
    const droppedData = [header, ...dropped.map(rowToArray)];
    const ws2 = XLSX.utils.aoa_to_sheet(droppedData);
    ws2['!cols'] = wsOpen['!cols'];
    XLSX.utils.book_append_sheet(wb, ws2, 'Closed(OTB)');
  }

  // 3. Pivot Table sheet — Segment + Morning Report × WIP Aging cross-tab
  const pivotData = buildPivotSheet(rows);
  const wsPivot = XLSX.utils.aoa_to_sheet(pivotData);

  // Set column widths
  const pivotColWidths: { wch: number }[] = [{ wch: 16 }, { wch: 28 }];
  const lastColIdx = (pivotData[1]?.length || 3) - 1;
  for (let i = 2; i <= lastColIdx; i++) {
    pivotColWidths.push({ wch: i === lastColIdx ? 12 : 6 });
  }
  wsPivot['!cols'] = pivotColWidths;

  // Add autofilter on the header row (Row 2) — covers Segment + Row Labels + WIP columns
  const lastColLetter = XLSX.utils.encode_col(lastColIdx);
  const lastDataRow = pivotData.length;
  wsPivot['!autofilter'] = { ref: `A2:${lastColLetter}${lastDataRow}` };

  XLSX.utils.book_append_sheet(wb, wsPivot, 'Pivot Table');

  const filename = `${city}_${dateStr}_Call_Plan.xlsx`;
  XLSX.writeFile(wb, filename);
  return filename;
}

// ── Export current view to CSV ──
export function exportCSV(rows: ClassifiedRow[], filename: string) {
  const header = [...COLUMNS];
  const dataRows = rows.map(rowToArray);
  const csv = Papa.unparse([header, ...dataRows]);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
