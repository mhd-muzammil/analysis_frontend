const XLSX = require('xlsx');
const fs = require('fs');

const flexPath = "d:/projects/Analysis Dasboard/renderways Reports/Renderways_Technologies Technologies Private Limited.xlsx";
const expectedPath = "d:/projects/Analysis Dasboard/renderways Reports/Chennai 31th March 2026 Call Plan.xlsx";
const yestPath = "d:/projects/Analysis Dasboard/renderways Reports/Chennai 30th March 2026 Call Plan.xlsx";

let out = [];
function log(msg) { out.push(msg); }

try {
  let flexWb = XLSX.readFile(flexPath);
  let flexData = XLSX.utils.sheet_to_json(flexWb.Sheets["Data"], { defval: "" });
  let expWb = XLSX.readFile(expectedPath);
  let expSheet = expWb.SheetNames.find(s => s.toLowerCase().includes("open call")) || expWb.SheetNames[0];
  let expData = XLSX.utils.sheet_to_json(expWb.Sheets[expSheet], { defval: "" });
  let yestWb = XLSX.readFile(yestPath);
  let yestSheet = yestWb.SheetNames.find(s => s.toLowerCase().includes("open call")) || yestWb.SheetNames[0];
  let yestData = XLSX.utils.sheet_to_json(yestWb.Sheets[yestSheet], { defval: "" });

  const yestMap = new Map(yestData.map(r => [String(r['Ticket No']).trim(), r]).filter(p => p[0].startsWith('WO-')));

  log("=== NEW ROW WIP AGING: Flex vs Expected ===");
  for (const expRow of expData) {
    const wo = String(expRow['Ticket No'] ?? '').trim();
    if (!wo.startsWith('WO-')) continue;
    if (yestMap.has(wo)) continue; // skip pending, only look at NEW

    const flexRow = flexData.find(r => String(r['Ticket No']).trim() === wo);
    if (!flexRow) continue;
    const flexAging = parseInt(String(flexRow['WIP Aging'] ?? '0'));
    const expAging = parseInt(String(expRow['WIP Aging'] ?? '0'));
    const diff = flexAging - expAging;
    log(`${wo}: Flex WIP=${flexAging}, Expected=${expAging}, Diff=${diff}`);
  }

  log("\n=== PENDING ROW SORT ORDER CHECK ===");
  log("Expected Order (pending only):  WO | WIP Aging");
  for (const expRow of expData) {
    const wo = String(expRow['Ticket No'] ?? '').trim();
    if (!wo.startsWith('WO-')) continue;
    if (yestMap.has(wo)) {
      const aging = parseInt(String(expRow['WIP Aging'] ?? '0'));
      log(`  ${wo}: ${aging}`);
    }
  }

  log("\n=== NEW ROW SORT ORDER CHECK ===");
  log("Expected Order (new only):  WO | WIP Aging");
  for (const expRow of expData) {
    const wo = String(expRow['Ticket No'] ?? '').trim();
    if (!wo.startsWith('WO-')) continue;
    if (!yestMap.has(wo)) {
      const aging = parseInt(String(expRow['WIP Aging'] ?? '0'));
      log(`  ${wo}: ${aging}`);
    }
  }

  log("\n=== PENDING CURRENT STATUS-TAT CHANGES ===");
  for (const expRow of expData) {
    const wo = String(expRow['Ticket No'] ?? '').trim();
    if (!wo.startsWith('WO-')) continue;
    const yRow = yestMap.get(wo);
    if (!yRow) continue;
    const yTAT = String(yRow['Current Status-TAT'] ?? '').trim();
    const eTAT = String(expRow['Current Status-TAT'] ?? '').trim();
    if (yTAT !== eTAT) {
      log(`  ${wo}: Yesterday TAT="${yTAT}" → Expected TAT="${eTAT}"`);
    }
  }

  fs.writeFileSync('d:/projects/Analysis Dasboard/deep_inspect.txt', out.join('\n'));
} catch(err) {
  fs.writeFileSync('d:/projects/Analysis Dasboard/deep_inspect.txt', 'CRASHED:\n' + err.stack);
}
