// End-to-end: Generate XLSX using correct Data sheet and compare to expected
const XLSX = require('xlsx');
const fs = require('fs');

const flexPath = "d:/projects/Analysis Dasboard/renderways Reports/Renderways_Technologies Technologies Private Limited.xlsx";
const yestPath = "d:/projects/Analysis Dasboard/renderways Reports/Chennai 30th March 2026 Call Plan.xlsx";
const expectedPath = "d:/projects/Analysis Dasboard/renderways Reports/Chennai 31th March 2026 Call Plan.xlsx";
const outputPath = "d:/projects/Analysis Dasboard/renderways Reports/Chennai_20260331_Call_Plan_FIXED.xlsx";

// ── Helper functions (mirror engine.ts exactly) ──
function cleanPhone(raw) {
  let s = String(raw ?? '').trim();
  s = s.replace(/\.0$/, '');
  s = s.replace(/\D/g, '');
  if (s.length === 12 && s.startsWith('91')) s = s.slice(2);
  return s;
}

function parseFlexDate(raw) {
  if (!raw) return null;
  try {
    const cleaned = String(raw).replace(' UTC', '');
    const d = new Date(cleaned);
    return isNaN(d.getTime()) ? null : d;
  } catch { return null; }
}

function mapSegment(otcCode, bizSegment) {
  const otc = (otcCode ?? '').toLowerCase();
  if (otc.includes('trade')) return 'Trade';
  if (otc.includes('install') || otc.includes('05f')) return 'Install';
  const seg = (bizSegment ?? '').toLowerCase();
  if (seg === 'computing') return 'Pc';
  if (seg === 'printing') return 'print';
  return bizSegment || '';
}

function calcAging(createTime, reportDate) {
  const created = parseFlexDate(createTime);
  if (!created) return 0;
  const diff = reportDate.getTime() - created.getTime();
  return Math.max(0, Math.floor(diff / (1000 * 60 * 60 * 24)));
}

const woPattern = /^WO-\d{9}$/;
function isValidWO(id) { return woPattern.test((id ?? '').trim()); }

// ── Read files (simulating browser with cellDates) ──
const flexWb = XLSX.readFile(flexPath, { cellDates: true });
const flexData = XLSX.utils.sheet_to_json(flexWb.Sheets['Data'], { defval: '' });

const yestWb = XLSX.readFile(yestPath, { cellDates: true });
const openCallSheet = yestWb.SheetNames.find(s => s.toLowerCase() === 'open call') || yestWb.SheetNames[0];
const yestData = XLSX.utils.sheet_to_json(yestWb.Sheets[openCallSheet], { defval: '' });

const reportDate = new Date('2026-03-31T00:00:00');

// ── Detect format ──
function detectFlexFormat(flexRaw) {
  if (flexRaw.length === 0) return 'csv';
  const sample = flexRaw[0];
  const hasCreateTime = 'Create Time' in sample && String(sample['Create Time'] ?? '').trim().length > 0;
  const hasWipAging = 'WIP Aging' in sample;
  if (hasWipAging && !hasCreateTime) return 'xlsx';
  return 'csv';
}
const format = detectFlexFormat(flexData);

// ── STEP 1: Filter & Deduplicate Flex ──
const flexMap = new Map();
for (const raw of flexData) {
  const ticketNo = String(raw['Ticket No'] ?? '').trim();
  if (!isValidWO(ticketNo)) continue;
  const aspCity = String(raw['ASP City'] ?? '').trim();
  if (aspCity.toLowerCase() !== 'chennai') continue;
  flexMap.set(ticketNo, raw);
}

// ── STEP 2: Load yesterday's Open Call ──
const rtplMap = new Map();
for (const raw of yestData) {
  const ticketNo = String(raw['Ticket No'] ?? '').trim();
  if (!isValidWO(ticketNo)) continue;
  rtplMap.set(ticketNo, raw);
}

// ── STEP 3 & 4: Build output ──
const pending = [];
const newRows = [];

for (const [ticketNo, flexRow] of flexMap) {
  const yesterday = rtplMap.get(ticketNo);
  if (yesterday) {
    // PENDING: carry from yesterday
    const monthVal = yesterday['Month'];
    let monthStr = '';
    if (monthVal instanceof Date) {
      monthStr = monthVal; // Keep as Date for XLSX
    } else if (monthVal != null && String(monthVal).trim() !== '' && String(monthVal) !== 'NaT') {
      monthStr = String(monthVal).trim();
    }

    pending.push({
      month: monthStr,
      ticketNo,
      caseId: String(yesterday['Case Id'] ?? '').trim() || yesterday['Case Id'],
      product: String(yesterday['Product'] ?? '').trim(),
      wipAging: (parseInt(String(yesterday['WIP Aging'] ?? '0'), 10) || 0) + 1,
      location: String(yesterday['Location'] ?? '').trim(),
      segment: String(yesterday['Segment'] ?? '').trim(),
      morningStatus: String(yesterday['Morning Status'] ?? '').trim(),
      eveningStatus: '',
      currentStatusTAT: String(yesterday['Current Status-TAT'] ?? '').trim(),
      engg: String(yesterday['Engg.'] ?? '').trim(),
      contactNo: String(yesterday['Contact no.'] ?? '').trim(),
      parts: String(yesterday['Parts'] ?? '').trim(),
      classification: 'PENDING'
    });
  } else {
    // NEW: populate from Flex
    let aging;
    const wipAgingRaw = parseInt(String(flexRow['WIP Aging'] ?? '0'), 10) || 0;
    if (format === 'xlsx' && wipAgingRaw > 0) {
      aging = wipAgingRaw;
    } else {
      aging = calcAging(String(flexRow['Create Time'] ?? ''), reportDate);
    }

    newRows.push({
      month: '',
      ticketNo,
      caseId: String(flexRow['Case Id'] ?? '').trim() || flexRow['Case Id'],
      product: String(flexRow['Product Name'] ?? '').trim(),
      wipAging: aging,
      location: String(flexRow['Customer City'] ?? '').trim(),
      segment: mapSegment(String(flexRow['WO OTC Code'] ?? ''), String(flexRow['Business Segment'] ?? '')),
      morningStatus: '',
      eveningStatus: '',
      currentStatusTAT: '',
      engg: '',
      contactNo: cleanPhone(flexRow['Customer Phone No']),
      parts: '',
      classification: 'NEW'
    });
  }
}

// Sort
pending.sort((a, b) => b.wipAging - a.wipAging);
newRows.sort((a, b) => b.wipAging - a.wipAging);

const all = [...pending, ...newRows];

// ── Build XLSX ──
const COLUMNS = ['Month', 'Ticket No', 'Case Id', 'Product', 'WIP Aging', 'Location', 'Segment', 'Morning Status', 'Evening Status', 'Current Status-TAT', 'Engg.', 'Contact no.', 'Parts'];

function rowToArray(row) {
  return [
    row.month,
    row.ticketNo,
    row.caseId,
    row.product,
    row.wipAging,
    row.location,
    row.segment,
    row.morningStatus,
    row.eveningStatus,
    row.currentStatusTAT,
    row.engg,
    row.contactNo,
    row.parts,
  ];
}

const header = [...COLUMNS];
const dataRows = all.map(rowToArray);

// Summary rows
let actionableCount = 0;
const engCounts = new Map();
for (const row of all) {
  if (row.morningStatus.toLowerCase() === 'actionable') actionableCount++;
  if (row.engg) engCounts.set(row.engg, (engCounts.get(row.engg) ?? 0) + 1);
}
const summaryLines = [];
for (let i = 0; i < 4; i++) summaryLines.push(new Array(13).fill(''));
const actionRow = new Array(13).fill('');
actionRow[5] = `Actionable-${actionableCount}`;
summaryLines.push(actionRow);
const sorted = [...engCounts.entries()].sort((a, b) => b[1] - a[1]);
for (const [eng, count] of sorted) {
  const engRow = new Array(13).fill('');
  engRow[5] = `${eng}-${count}`;
  summaryLines.push(engRow);
}

const sheetData = [header, ...dataRows, ...summaryLines];
const wb = XLSX.utils.book_new();
const ws = XLSX.utils.aoa_to_sheet(sheetData);
XLSX.utils.book_append_sheet(wb, ws, 'Open Call');
XLSX.writeFile(wb, outputPath);

// ── Compare with Expected ──
const expWb = XLSX.readFile(expectedPath);
const expSheet = expWb.SheetNames.find(s => s.toLowerCase().includes('open call')) || expWb.SheetNames[0];
const expDataRaw = XLSX.utils.sheet_to_json(expWb.Sheets[expSheet], { header: 1, defval: '' });
const fixedWb = XLSX.readFile(outputPath);
const fixedDataRaw = XLSX.utils.sheet_to_json(fixedWb.Sheets['Open Call'], { header: 1, defval: '' });

let out = [];
out.push(`PENDING: ${pending.length}, NEW: ${newRows.length}, TOTAL: ${all.length}`);
out.push(`Expected data rows (excl header): ${expDataRaw.length - 1}`);
out.push(`Fixed data rows (excl header): ${fixedDataRaw.length - 1}`);

// Compare row-by-row (up to data rows only, not summary)
const maxCompare = Math.min(all.length + 1, expDataRaw.length); // +1 for header
let matchCount = 0;
let mismatchCount = 0;
let totalCells = 0;
let matchingCells = 0;

for (let r = 1; r < maxCompare; r++) { // skip header
  const expRow = expDataRaw[r] || [];
  const fixRow = fixedDataRaw[r] || [];
  let rowMatch = true;
  
  for (let c = 0; c < 13; c++) {
    totalCells++;
    let eVal = String(expRow[c] ?? '').trim();
    let fVal = String(fixRow[c] ?? '').trim();
    
    // Normalize dates (Excel serial numbers)
    if (c === 0 && typeof expRow[c] === 'number' && typeof fixRow[c] !== 'undefined') {
      // Both should be serial dates or both empty
      if (typeof fixRow[c] === 'number' || fixRow[c] instanceof Date) {
        // Compare as serial dates
        let eSerial = typeof expRow[c] === 'number' ? expRow[c] : null;
        let fSerial = typeof fixRow[c] === 'number' ? fixRow[c] : null;
        if (fixRow[c] instanceof Date) {
          fSerial = Math.floor((fixRow[c].getTime() - new Date(1899, 11, 30).getTime()) / (24*60*60*1000));
        }
        if (eSerial === fSerial) {
          matchingCells++;
          continue;
        }
      }
    }
    
    if (eVal === fVal) {
      matchingCells++;
    } else {
      rowMatch = false;
    }
  }
  
  if (rowMatch) matchCount++;
  else mismatchCount++;
}

out.push(`\nRow-level: ${matchCount} matching, ${mismatchCount} mismatching out of ${maxCompare - 1} rows`);
out.push(`Cell-level: ${matchingCells} matching out of ${totalCells} (${(matchingCells/totalCells*100).toFixed(1)}%)`);

// Show specific mismatches
out.push(`\n--- MISMATCHES ---`);
for (let r = 1; r < maxCompare; r++) {
  const expRow = expDataRaw[r] || [];
  const fixRow = fixedDataRaw[r] || [];
  
  for (let c = 0; c < 13; c++) {
    let eVal = String(expRow[c] ?? '').trim();
    let fVal = String(fixRow[c] ?? '').trim();
    
    // Skip date comparison (col 0)
    if (c === 0 && (typeof expRow[c] === 'number' || expRow[c] instanceof Date)) continue;
    
    if (eVal !== fVal) {
      const colName = COLUMNS[c];
      const wo = String(fixRow[1] ?? expRow[1] ?? '').trim();
      out.push(`  R${r} ${wo} | ${colName}: EXP="${eVal}" vs FIX="${fVal}"`);
    }
  }
}

// Sort order check
out.push(`\n--- SORT ORDER ---`);
let sortMismatches = 0;
for (let r = 1; r < maxCompare; r++) {
  const expWO = String(expDataRaw[r]?.[1] ?? '').trim();
  const fixWO = String(fixedDataRaw[r]?.[1] ?? '').trim();
  if (expWO !== fixWO) {
    sortMismatches++;
    out.push(`  R${r}: EXP=${expWO} vs FIX=${fixWO}`);
  }
}
out.push(`Sort mismatches: ${sortMismatches}`);

fs.writeFileSync('d:/projects/Analysis Dasboard/fixed_compare.txt', out.join('\n'));
console.log('Done. Results in fixed_compare.txt');
