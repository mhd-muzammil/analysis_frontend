// Full end-to-end test: Simulate browser flow and compare output cell-by-cell
const XLSX = require('xlsx');
const fs = require('fs');

const flexPath = "d:/projects/Analysis Dasboard/renderways Reports/Renderways_Technologies Technologies Private Limited.xlsx";
const yestPath = "d:/projects/Analysis Dasboard/renderways Reports/Chennai 30th March 2026 Call Plan.xlsx";
const expectedPath = "d:/projects/Analysis Dasboard/renderways Reports/Chennai 31th March 2026 Call Plan.xlsx";
const generatedPath = "d:/projects/Analysis Dasboard/renderways Reports/Chennai_20260331_Call_Plan.xlsx";

const out = [];
function log(msg) { out.push(msg); }

// ══════════════════════════════════════════════════
// 1. FIRST: Diagnose the generated file
// ══════════════════════════════════════════════════
log("═══════════════════════════════════════════════");
log(" PART 1: DIAGNOSING GENERATED FILE");
log("═══════════════════════════════════════════════\n");

const genWb = XLSX.readFile(generatedPath);
log(`Generated sheets: ${genWb.SheetNames.join(', ')}`);
const genSheet = genWb.SheetNames[0];
const genData = XLSX.utils.sheet_to_json(genWb.Sheets[genSheet], { defval: "" });
log(`Generated row count: ${genData.length}`);
if (genData.length > 0) {
  log(`\nGenerated Row 1 (first data row):`);
  log(JSON.stringify(genData[0], null, 2));
  log(`\nGenerated Row 2:`);
  if (genData[1]) log(JSON.stringify(genData[1], null, 2));
  
  // Check WIP Aging values
  const agings = genData.map(r => ({ wo: r['Ticket No'], aging: r['WIP Aging'], type: typeof r['WIP Aging'], classification: r['Classification'] }));
  log(`\nWIP Aging analysis (first 10):`);
  for (const a of agings.slice(0, 10)) {
    log(`  ${a.wo}: WIP Aging=${JSON.stringify(a.aging)} (type: ${a.type})`);
  }
  
  const emptyAging = agings.filter(a => a.aging === '' || a.aging === undefined || a.aging === null || (typeof a.aging === 'number' && isNaN(a.aging)));
  log(`\nRows with empty/NaN WIP Aging: ${emptyAging.length} out of ${agings.length}`);
}

// ══════════════════════════════════════════════════
// 2. Check how parseXLSX reads Flex file  
// ══════════════════════════════════════════════════
log("\n═══════════════════════════════════════════════");
log(" PART 2: FLEX XLSX PARSING (as browser does)");
log("═══════════════════════════════════════════════\n");

const flexWb = XLSX.readFile(flexPath, { cellDates: true });
log(`Flex sheets: ${flexWb.SheetNames.join(', ')}`);
const flexSheet1 = flexWb.SheetNames[0]; // Browser takes first sheet
log(`First sheet name: "${flexSheet1}"`);
const flexDataSheet1 = XLSX.utils.sheet_to_json(flexWb.Sheets[flexSheet1], { defval: "" });
log(`First sheet row count: ${flexDataSheet1.length}`);
if (flexDataSheet1.length > 0) {
  log(`First sheet column headers: ${Object.keys(flexDataSheet1[0]).join(', ')}`);
  log(`Sample row: ${JSON.stringify(flexDataSheet1[0], null, 2)}`);
}

// Also check the Data sheet specifically (which is what we use in verify.cjs)
if (flexWb.SheetNames.includes('Data')) {
  const flexDataCorrect = XLSX.utils.sheet_to_json(flexWb.Sheets['Data'], { defval: "" });
  log(`\n"Data" sheet row count: ${flexDataCorrect.length}`);
  if (flexDataCorrect.length > 0) {
    log(`"Data" sheet columns: ${Object.keys(flexDataCorrect[0]).join(', ')}`);
  }
} else {
  log(`\nWARNING: No "Data" sheet found!`);
}

// ══════════════════════════════════════════════════
// 3. Check how parseXLSX reads yesterday's file
// ══════════════════════════════════════════════════
log("\n═══════════════════════════════════════════════");
log(" PART 3: YESTERDAY XLSX PARSING (as browser does)");
log("═══════════════════════════════════════════════\n");

const yestWb = XLSX.readFile(yestPath, { cellDates: true });
log(`Yesterday sheets: ${yestWb.SheetNames.join(', ')}`);
const openCallSheet = yestWb.SheetNames.find(s => s.toLowerCase() === 'open call') || yestWb.SheetNames[0];
log(`Detected "Open Call" sheet: "${openCallSheet}"`);
const yestData = XLSX.utils.sheet_to_json(yestWb.Sheets[openCallSheet], { defval: "" });
log(`Yesterday row count: ${yestData.length}`);
if (yestData.length > 0) {
  log(`Yesterday columns: ${Object.keys(yestData[0]).join(', ')}`);
  log(`Sample yesterday row: ${JSON.stringify(yestData[0], null, 2)}`);
  
  // Check WIP Aging parsing
  const woRows = yestData.filter(r => String(r['Ticket No'] ?? '').trim().startsWith('WO-'));
  log(`\nWO rows found: ${woRows.length}`);
  for (const r of woRows.slice(0, 5)) {
    const agVal = r['WIP Aging'];
    log(`  ${r['Ticket No']}: WIP Aging = ${JSON.stringify(agVal)} (type: ${typeof agVal}), parseInt = ${parseInt(String(agVal ?? '0'), 10)}`);
  }
}

// ══════════════════════════════════════════════════
// 4. Simulate engine: EXACT browser flow
// ══════════════════════════════════════════════════
log("\n═══════════════════════════════════════════════");
log(" PART 4: SIMULATE ENGINE (exact browser flow)");
log("═══════════════════════════════════════════════\n");

// Browser uses flexData = parsed.data[parsed.sheets[0]]
// This is sheets[0], NOT "Data" — this is likely the bug!
const browserFlexData = flexDataSheet1;
const browserYestData = yestData;

// Replicate detectFlexFormat
function detectFlexFormat(flexRaw) {
  if (flexRaw.length === 0) return 'csv';
  const sample = flexRaw[0];
  const hasCreateTime = 'Create Time' in sample && String(sample['Create Time'] ?? '').trim().length > 0;
  const hasWipAging = 'WIP Aging' in sample;
  if (hasWipAging && !hasCreateTime) return 'xlsx';
  return 'csv';
}

const format = detectFlexFormat(browserFlexData);
log(`Detected format: ${format}`);

// Check ASP City detection
const cities = new Set();
for (const row of browserFlexData) {
  const city = String(row['ASP City'] ?? '').trim();
  if (city) cities.add(city);
}
log(`Detected cities: ${[...cities].join(', ')}`);

// Count WOs matching Chennai
let chennaiCount = 0;
const woPattern = /^WO-\d{9}$/;
for (const row of browserFlexData) {
  const wo = String(row['Ticket No'] ?? '').trim();
  const city = String(row['ASP City'] ?? '').trim();
  if (woPattern.test(wo) && city.toLowerCase() === 'chennai') chennaiCount++;
}
log(`Chennai WOs in first sheet: ${chennaiCount}`);

fs.writeFileSync('d:/projects/Analysis Dasboard/fulltest_output.txt', out.join('\n'));
