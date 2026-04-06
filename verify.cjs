const XLSX = require('xlsx');
const fs = require('fs');

const flexPath = "d:/projects/Analysis Dasboard/renderways Reports/Renderways_Technologies Technologies Private Limited.xlsx";
const yestPath = "d:/projects/Analysis Dasboard/renderways Reports/Chennai 30th March 2026 Call Plan.xlsx";
const expectedPath = "d:/projects/Analysis Dasboard/renderways Reports/Chennai 31th March 2026 Call Plan.xlsx";

let out = [];
function log(msg) { out.push(msg); }

// ── ENGINE LOGIC (mirrors updated engine.ts exactly) ──

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

function isValidWO(id) {
  return /^WO-\d{9}$/.test((id ?? '').trim());
}

try {
  let flexWb = XLSX.readFile(flexPath);
  let flexData = XLSX.utils.sheet_to_json(flexWb.Sheets["Data"], { defval: "" });

  let yestWb = XLSX.readFile(yestPath);
  let yestSheet = yestWb.SheetNames.find(s => s.toLowerCase().includes("open call")) || yestWb.SheetNames[0];
  let yestData = XLSX.utils.sheet_to_json(yestWb.Sheets[yestSheet], { defval: "" });

  let expWb = XLSX.readFile(expectedPath);
  let expSheet = expWb.SheetNames.find(s => s.toLowerCase().includes("open call")) || expWb.SheetNames[0];
  let expData = XLSX.utils.sheet_to_json(expWb.Sheets[expSheet], { defval: "" });

  // Detect format
  const hasCreateTime = flexData.length > 0 && 'Create Time' in flexData[0] &&
    String(flexData[0]['Create Time'] ?? '').trim().length > 0;
  const hasWipAging = flexData.length > 0 && 'WIP Aging' in flexData[0];
  const format = (hasWipAging && !hasCreateTime) ? 'xlsx' : 'csv';
  log(`Detected Flex format: ${format}`);

  // STEP 1: Filter & deduplicate Flex for Chennai
  const flexMap = new Map();
  for (const raw of flexData) {
    const ticketNo = String(raw['Ticket No'] ?? '').trim();
    if (!isValidWO(ticketNo)) continue;
    const aspCity = String(raw['ASP City'] ?? '').trim();
    if (aspCity.toLowerCase() !== 'chennai') continue;
    flexMap.set(ticketNo, raw);
  }

  // STEP 2: Load yesterday's
  const rtplMap = new Map();
  for (const raw of yestData) {
    const ticketNo = String(raw['Ticket No'] ?? '').trim();
    if (!isValidWO(ticketNo)) continue;
    rtplMap.set(ticketNo, raw);
  }

  const reportDate = new Date('2026-03-31T00:00:00');

  // STEP 3: pending rows (preserve yesterday's order)
  for (const [ticketNo, yesterday] of rtplMap) {
    if (flexMap.has(ticketNo)) {
      const monthVal = yesterday['Month'];
      let monthStr = '';
      if (monthVal instanceof Date) {
        monthStr = monthVal.toLocaleDateString('en-GB');
      } else if (monthVal != null && String(monthVal).trim() !== '' && String(monthVal) !== 'NaT') {
        monthStr = String(monthVal).trim();
      }

      pendingRows.push({
        month: monthStr,
        ticketNo,
        caseId: String(yesterday['Case Id'] ?? '').trim(),
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
    }
  }

  // STEP 4: new rows
  for (const [ticketNo, flexRow] of flexMap) {
    if (!rtplMap.has(ticketNo)) {
      // WIP Aging: use pre-calculated from XLSX
      let aging;
      const wipAgingRaw = parseInt(String(flexRow['WIP Aging'] ?? '0'), 10) || 0;
      if (format === 'xlsx' && wipAgingRaw > 0) {
        aging = wipAgingRaw;
      } else {
        aging = calcAging(String(flexRow['Create Time'] ?? ''), reportDate);
      }

      const phone = cleanPhone(flexRow['Customer Phone No']);

      newRows.push({
        month: '',
        ticketNo,
        caseId: String(flexRow['Case Id'] ?? '').trim(),
        product: String(flexRow['Product Name'] ?? '').trim(),
        wipAging: aging,
        location: String(flexRow['Customer City'] ?? '').trim(),
        segment: mapSegment(String(flexRow['WO OTC Code'] ?? ''), String(flexRow['Business Segment'] ?? '')),
        morningStatus: '',
        eveningStatus: '',
        currentStatusTAT: '',  // BLANK for new rows
        engg: '',
        contactNo: phone,
        parts: '',
        classification: 'NEW'
      });
    }
  }

  // Sort: WIP Aging desc, stable sort preserves Flex insertion order for ties
  pendingRows.sort((a, b) => b.wipAging - a.wipAging);
  newRows.sort((a, b) => b.wipAging - a.wipAging);

  const generatedAll = [...pendingRows, ...newRows];

  log(`PENDING: ${pendingRows.length}, NEW: ${newRows.length}, TOTAL: ${generatedAll.length}`);

  // ── LOAD EXPECTED ──
  const expectedRows = [];
  for (const raw of expData) {
    const ticketNo = String(raw['Ticket No'] ?? '').trim();
    if (!isValidWO(ticketNo)) continue;
    const monthVal = raw['Month'];
    let monthStr = '';
    if (monthVal instanceof Date) {
      monthStr = monthVal.toLocaleDateString('en-GB');
    } else if (monthVal != null && String(monthVal).trim() !== '' && String(monthVal) !== 'NaT') {
      monthStr = String(monthVal).trim();
    }
    expectedRows.push({
      month: monthStr, ticketNo,
      caseId: String(raw['Case Id'] ?? '').trim(),
      product: String(raw['Product'] ?? '').trim(),
      wipAging: parseInt(String(raw['WIP Aging'] ?? '0'), 10) || 0,
      location: String(raw['Location'] ?? '').trim(),
      segment: String(raw['Segment'] ?? '').trim(),
      morningStatus: String(raw['Morning Status'] ?? '').trim(),
      eveningStatus: String(raw['Evening Status'] ?? '').trim(),
      currentStatusTAT: String(raw['Current Status-TAT'] ?? '').trim(),
      engg: String(raw['Engg.'] ?? '').trim(),
      contactNo: String(raw['Contact no.'] ?? '').trim(),
      parts: String(raw['Parts'] ?? '').trim(),
    });
  }

  // ── CELL-BY-CELL COMPARISON ──
  const genMap = new Map();
  for (const r of generatedAll) genMap.set(r.ticketNo, r);
  const expMap = new Map();
  for (const r of expectedRows) expMap.set(r.ticketNo, r);

  const missingFromGen = [...expMap.keys()].filter(wo => !genMap.has(wo));
  const extraInGen = [...genMap.keys()].filter(wo => !expMap.has(wo));

  log(`\n--- TICKET PRESENCE ---`);
  log(`Missing from generated: ${missingFromGen.length}`);
  missingFromGen.forEach(wo => log(`  MISSING: ${wo}`));
  log(`Extra in generated: ${extraInGen.length}`);
  extraInGen.forEach(wo => log(`  EXTRA: ${wo}`));

  // Auto-generated fields: these MUST match (bugs if they don't)
  const AUTO_FIELDS = ['month', 'ticketNo', 'caseId', 'product', 'wipAging', 'segment', 'currentStatusTAT'];
  // Operator fields: these differ because the operator edits them manually AFTER generation
  const OPERATOR_FIELDS = ['morningStatus', 'eveningStatus', 'engg', 'parts', 'location', 'contactNo'];

  const LABELS = {
    month: 'Month', ticketNo: 'Ticket No', caseId: 'Case Id', product: 'Product',
    wipAging: 'WIP Aging', location: 'Location', segment: 'Segment',
    morningStatus: 'Morning Status', eveningStatus: 'Evening Status',
    currentStatusTAT: 'Current Status-TAT', engg: 'Engg.', contactNo: 'Contact no.', parts: 'Parts'
  };

  let autoMismatches = 0;
  let operatorMismatches = 0;
  let totalAutoChecks = 0;
  let totalOperatorChecks = 0;

  log(`\n--- AUTO-GENERATED FIELD MISMATCHES (BUGS in our engine) ---`);
  for (const [wo, expRow] of expMap) {
    const genRow = genMap.get(wo);
    if (!genRow) continue;
    for (const field of AUTO_FIELDS) {
      totalAutoChecks++;
      const genVal = String(genRow[field] ?? '').trim();
      const expVal = String(expRow[field] ?? '').trim();
      if (genVal !== expVal) {
        autoMismatches++;
        log(`  [${genRow.classification}] ${wo} | ${LABELS[field]}: GEN="${genVal}" vs EXP="${expVal}"`);
      }
    }
  }

  log(`\n--- OPERATOR-EDITABLE FIELD MISMATCHES (Expected - operator fills these after generation) ---`);
  for (const [wo, expRow] of expMap) {
    const genRow = genMap.get(wo);
    if (!genRow) continue;
    for (const field of OPERATOR_FIELDS) {
      totalOperatorChecks++;
      const genVal = String(genRow[field] ?? '').trim();
      const expVal = String(expRow[field] ?? '').trim();
      if (genVal !== expVal) {
        operatorMismatches++;
        log(`  [${genRow.classification}] ${wo} | ${LABELS[field]}: GEN="${genVal}" vs EXP="${expVal}"`);
      }
    }
  }

  // Sort order
  log(`\n--- SORT ORDER COMPARISON ---`);
  const expTicketOrder = expectedRows.map(r => r.ticketNo);
  const genTicketOrder = generatedAll.map(r => r.ticketNo).filter(wo => expMap.has(wo));
  let orderMismatches = 0;
  for (let i = 0; i < Math.min(expTicketOrder.length, genTicketOrder.length); i++) {
    if (expTicketOrder[i] !== genTicketOrder[i]) {
      log(`  Row ${i + 1}: Expected="${expTicketOrder[i]}" vs Generated="${genTicketOrder[i]}"`);
      orderMismatches++;
    }
  }
  if (orderMismatches === 0) log(`  Sort order: PERFECT MATCH ✓`);

  // ── SCOREBOARD ──
  log(`\n╔══════════════════════════════════════════════╗`);
  log(`║           FINAL VERIFICATION SCOREBOARD       ║`);
  log(`╠══════════════════════════════════════════════╣`);
  log(`║ Auto-generated field checks: ${String(totalAutoChecks).padStart(4)}            ║`);
  log(`║ Auto-generated mismatches:   ${String(autoMismatches).padStart(4)} (BUGS)       ║`);
  log(`║ Auto-generated accuracy:     ${((totalAutoChecks - autoMismatches) / totalAutoChecks * 100).toFixed(1)}%          ║`);
  log(`║                                              ║`);
  log(`║ Operator field checks:       ${String(totalOperatorChecks).padStart(4)}            ║`);
  log(`║ Operator field diffs:        ${String(operatorMismatches).padStart(4)} (expected)  ║`);
  log(`║                                              ║`);
  log(`║ Missing tickets:             ${String(missingFromGen.length).padStart(4)}            ║`);
  log(`║ Extra tickets:               ${String(extraInGen.length).padStart(4)}            ║`);
  log(`║ Sort order mismatches:       ${String(orderMismatches).padStart(4)}            ║`);
  log(`╚══════════════════════════════════════════════╝`);

  fs.writeFileSync('d:/projects/Analysis Dasboard/verify_output.txt', out.join('\n'));

} catch(err) {
  fs.writeFileSync('d:/projects/Analysis Dasboard/verify_output.txt', 'CRASHED:\n' + err.stack);
}
