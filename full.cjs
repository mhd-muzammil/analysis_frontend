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

  // Check ALL new rows — all fields, let's find the differentiating column
  log("WO | FlexWIP | ExpWIP | NewCallCreated | Status | Segment");
  for (const expRow of expData) {
    const wo = String(expRow['Ticket No'] ?? '').trim();
    if (!wo.startsWith('WO-')) continue;
    if (yestMap.has(wo)) continue; // skip pending

    const flexRow = flexData.find(r => String(r['Ticket No']).trim() === wo);
    if (!flexRow) continue;
    const flexWip = parseInt(String(flexRow['WIP Aging'] ?? 0));
    const expWip = parseInt(String(expRow['WIP Aging'] ?? 0));
    const newCall = String(flexRow['New Call Created'] ?? '');
    const status = String(flexRow['Status'] ?? '');
    const seg = String(expRow['Segment'] ?? '');
    log(`${wo} | Flex:${flexWip} | Exp:${expWip} | NewCall:${newCall} | Status:${status} | Seg:${seg}`);
  }

  fs.writeFileSync('d:/projects/Analysis Dasboard/new_full.txt', out.join('\n'));
} catch(err) {
  fs.writeFileSync('d:/projects/Analysis Dasboard/new_full.txt', 'CRASHED:\n' + err.stack);
}
