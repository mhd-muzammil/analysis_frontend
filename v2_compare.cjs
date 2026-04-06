// Compare the NEW browser-exported file vs expected
const XLSX = require('xlsx');
const fs = require('fs');

const v2Path = "d:/projects/Analysis Dasboard/renderways Reports/Chennai_20260331_Call_Plan_V2.xlsx";
const expectedPath = "d:/projects/Analysis Dasboard/renderways Reports/Chennai 31th March 2026 Call Plan.xlsx";

const COLUMNS = ['Month', 'Ticket No', 'Case Id', 'Product', 'WIP Aging', 'Location', 'Segment', 'Morning Status', 'Evening Status', 'Current Status-TAT', 'Engg.', 'Contact no.', 'Parts'];

const v2Wb = XLSX.readFile(v2Path, { cellDates: false }); // read raw
const v2Sheet = v2Wb.SheetNames.find(s => s.toLowerCase().includes('open call')) || v2Wb.SheetNames[0];
const v2DataRaw = XLSX.utils.sheet_to_json(v2Wb.Sheets[v2Sheet], { header: 1, defval: '' });

const expWb = XLSX.readFile(expectedPath, { cellDates: false });
const expSheet = expWb.SheetNames.find(s => s.toLowerCase().includes('open call')) || expWb.SheetNames[0];
const expDataRaw = XLSX.utils.sheet_to_json(expWb.Sheets[expSheet], { header: 1, defval: '' });

let out = [];
out.push(`V2 sheets: ${v2Wb.SheetNames.join(', ')}`);
out.push(`V2 rows (raw): ${v2DataRaw.length}`);
out.push(`Expected rows (raw): ${expDataRaw.length}`);

// Find actual data rows (skip header, stop at first all-empty row)
function getDataRows(raw) {
  const rows = [];
  for (let i = 1; i < raw.length; i++) {
    const row = raw[i];
    // Check if row has any ticket-like data
    const ticketNo = String(row[1] ?? '').trim();
    if (ticketNo.startsWith('WO-')) {
      rows.push(row);
    } else if (!row.some(c => String(c).trim() !== '')) {
      // First completely empty row = end of data
      break;
    }
  }
  return rows;
}

const v2Rows = getDataRows(v2DataRaw);
const expRows = getDataRows(expDataRaw);
out.push(`\nV2 WO rows: ${v2Rows.length}`);
out.push(`Expected WO rows: ${expRows.length}`);

// Build maps for ticket-based comparison (ignore row position)
const v2Map = new Map(v2Rows.map(r => [String(r[1]).trim(), r]));
const expMap = new Map(expRows.map(r => [String(r[1]).trim(), r]));

// Check ticket presence
const missingFromV2 = [...expMap.keys()].filter(k => !v2Map.has(k));
const extraInV2 = [...v2Map.keys()].filter(k => !expMap.has(k));
out.push(`\nMissing from V2: ${missingFromV2.length} → ${missingFromV2.join(', ')}`);
out.push(`Extra in V2: ${extraInV2.length} → ${extraInV2.join(', ')}`);

// Cell-by-cell comparison for matching tickets
// Split into "auto-generated" fields (engine controls) and "operator" fields
const autoFields = [0, 1, 2, 3, 4, 5, 6, 9]; // Month, Ticket, CaseId, Product, WIPAging, Location, Segment, CurrentStatus-TAT
const operatorFields = [7, 8, 10, 11, 12]; // MorningStatus, EveningStatus, Engg, ContactNo, Parts

let autoChecks = 0, autoMatches = 0;
let opChecks = 0, opMatches = 0;
const autoMismatches = [];
const opMismatches = [];

for (const [wo, expRow] of expMap) {
  const v2Row = v2Map.get(wo);
  if (!v2Row) continue;

  for (const c of autoFields) {
    autoChecks++;
    let eVal = String(expRow[c] ?? '').trim();
    let vVal = String(v2Row[c] ?? '').trim();
    
    // Normalize Month date serial comparison
    if (c === 0) {
      if (typeof expRow[c] === 'number' && typeof v2Row[c] === 'number') {
        if (expRow[c] === v2Row[c]) { autoMatches++; continue; }
      }
      // If one is Date and other is serial...
      if (v2Row[c] instanceof Date && typeof expRow[c] === 'number') {
        // Convert date to serial
        const serial = Math.floor((v2Row[c].getTime() - new Date(1899, 11, 30).getTime()) / (24*60*60*1000));
        if (serial === expRow[c]) { autoMatches++; continue; }
      }
    }
    
    if (eVal === vVal) { autoMatches++; }
    else { autoMismatches.push({ wo, col: COLUMNS[c], exp: eVal, v2: vVal }); }
  }

  for (const c of operatorFields) {
    opChecks++;
    let eVal = String(expRow[c] ?? '').trim();
    let vVal = String(v2Row[c] ?? '').trim();
    if (eVal === vVal) { opMatches++; }
    else { opMismatches.push({ wo, col: COLUMNS[c], exp: eVal, v2: vVal }); }
  }
}

out.push(`\n${'═'.repeat(50)}`);
out.push(` AUTO-GENERATED FIELD ACCURACY`);
out.push(`${'═'.repeat(50)}`);
out.push(`Checks: ${autoChecks}, Matches: ${autoMatches}, Mismatches: ${autoMismatches.length}`);
out.push(`Accuracy: ${(autoMatches/autoChecks*100).toFixed(1)}%\n`);
for (const m of autoMismatches) {
  out.push(`  ${m.wo} | ${m.col}: EXP="${m.exp}" vs V2="${m.v2}"`);
}

out.push(`\n${'═'.repeat(50)}`);
out.push(` OPERATOR FIELD DIFFERENCES (manual edits)`);
out.push(`${'═'.repeat(50)}`);
out.push(`Checks: ${opChecks}, Matches: ${opMatches}, Diffs: ${opMismatches.length}`);
for (const m of opMismatches) {
  out.push(`  ${m.wo} | ${m.col}: EXP="${m.exp}" vs V2="${m.v2}"`);
}

// Sort order comparison
out.push(`\n${'═'.repeat(50)}`);
out.push(` SORT ORDER`);
out.push(`${'═'.repeat(50)}`);
let sortMatch = 0, sortMismatch = 0;
const maxRows = Math.min(v2Rows.length, expRows.length);
for (let i = 0; i < maxRows; i++) {
  const eWO = String(expRows[i][1]).trim();
  const vWO = String(v2Rows[i][1]).trim();
  if (eWO === vWO) { sortMatch++; }
  else { sortMismatch++; out.push(`  Row ${i+1}: EXP=${eWO} vs V2=${vWO}`); }
}
out.push(`Sort: ${sortMatch} match, ${sortMismatch} mismatch`);

// Summary
out.push(`\n${'═'.repeat(50)}`);
out.push(`       FINAL SCOREBOARD`);
out.push(`${'═'.repeat(50)}`);
out.push(`Auto-gen accuracy: ${(autoMatches/autoChecks*100).toFixed(1)}% (${autoMatches}/${autoChecks})`);
out.push(`Missing tickets: ${missingFromV2.length}`);
out.push(`Extra tickets: ${extraInV2.length}`);
out.push(`Operator diffs: ${opMismatches.length} (expected — manual edits)`);
out.push(`Sort mismatches: ${sortMismatch}`);

fs.writeFileSync('d:/projects/Analysis Dasboard/v2_compare.txt', out.join('\n'));
console.log('Done. Check v2_compare.txt');
