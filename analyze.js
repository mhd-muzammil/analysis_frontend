const XLSX = require('xlsx');
const fs = require('fs');

function loadSheet(file, sheetNamePattern) {
  const wb = XLSX.readFile(file);
  let targetSheet = wb.SheetNames[0];
  if (sheetNamePattern) {
     targetSheet = wb.SheetNames.find(s => s.toLowerCase().includes(sheetNamePattern)) || targetSheet;
  }
  const data = XLSX.utils.sheet_to_json(wb.Sheets[targetSheet], { defval: "" });
  return { sheetName: targetSheet, data };
}

const flexPath = "d:/projects/Analysis Dasboard/renderways Reports/Renderways_Technologies Technologies Private Limited.xlsx";
const yestPath = "d:/projects/Analysis Dasboard/renderways Reports/Chennai 30th March 2026 Call Plan.xlsx";
const expectedPath = "d:/projects/Analysis Dasboard/renderways Reports/Chennai 31th March 2026 Call Plan.xlsx";

const flex = loadSheet(flexPath, "");
const yest = loadSheet(yestPath, "open call");
const expected = loadSheet(expectedPath, "open call");

console.log("======= DATA SIZES =======");
console.log("Flex Data Rows:", flex.data.length);
console.log("Yesterday's Call Plan Rows:", yest.data.length);
console.log("Expected Today's Call Plan Rows:", expected.data.length);

console.log("\n======= EXPECTED COLUMNS =======");
const expectedHeaders = Object.keys(expected.data.find(r => r['Ticket No'] && r['Ticket No'].startsWith('WO-')) || {});
console.log(expectedHeaders);

// Build Maps
const flexWOs = new Set(flex.data.map(r => String(r['Ticket No'] || r['Ticket Number']).trim()).filter(Boolean));
const flexRecords = new Map();
for (const r of flex.data) {
  const wo = String(r['Ticket No']).trim();
  if (wo) flexRecords.set(wo, r); // Get the last occurrence like our engine does
}

const yestWOs = new Map(yest.data.map(r => [String(r['Ticket No']).trim(), r]).filter(pair => pair[0].startsWith('WO-')));
const expectedWOs = new Map(expected.data.map(r => [String(r['Ticket No']).trim(), r]).filter(pair => pair[0].startsWith('WO-')));

console.log("\n======= UNIQUE TICKETS =======");
console.log("Unique Flex WOs:", flexWOs.size);
console.log("Unique Yest WOs:", yestWOs.size);
console.log("Unique Expected WOs:", expectedWOs.size);

console.log("\n======= 1. DROPPED TICKETS RETAINED IN EXPECTED? =======");
// Are there WOs in Expected that are NOT in Flex? (DROPPED but carried forward illegally?)
const expectedNotInFlex = [...expectedWOs.keys()].filter(wo => !flexWOs.has(wo));
console.log(`WOs in Expected but NOT in Flex: ${expectedNotInFlex.length}`);
if (expectedNotInFlex.length > 0) {
    expectedNotInFlex.slice(0, 5).forEach(wo => console.log(`  - ${wo} : ${expectedWOs.get(wo)['Morning Status']} / ${expectedWOs.get(wo)['Current Status-TAT']}`));
}

console.log("\n======= 2. MISSING TICKETS FROM FLEX TO EXPECTED =======");
// Are there WOs in Flex (Chennai) that are NOT in Expected? 
const flexChennai = flex.data.filter(r => String(r['ASP City']).trim().toLowerCase() === 'chennai');
const flexChennaiWOs = new Set(flexChennai.map(r => String(r['Ticket No']).trim()));
const flexChennaiNotExpected = [...flexChennaiWOs].filter(wo => !expectedWOs.has(wo) && wo.startsWith("WO-"));
console.log(`Chennai WOs in Flex but NOT in Expected: ${flexChennaiNotExpected.length}`);
if (flexChennaiNotExpected.length > 0) {
    flexChennaiNotExpected.slice(0, 5).forEach(wo => console.log(`  - ${wo} : ${flexRecords.get(wo)['Status']}`));
}

console.log("\n======= 3. WIP AGING LOGIC BEHAVIOR =======");
let agingDifferencesYest = 0;
let agingDifferencesNew = 0;
for (const [wo, expRow] of expectedWOs) {
    const yestRow = yestWOs.get(wo);
    const expAging = parseInt(expRow['WIP Aging']) || 0;
    
    if (yestRow) {
        // PENDING ROW
        const yestAging = parseInt(yestRow['WIP Aging']) || 0;
        if (expAging !== yestAging + 1) {
            // console.log(`  [PENDING] Aging mismatch for ${wo}: Yest=${yestAging}, Expected=${expAging}`);
            agingDifferencesYest++;
        }
    } else {
        // NEW ROW
        const flexRow = flexRecords.get(wo);
        if (flexRow) {
            const createTimeStr = flexRow["Create Time"] || "";
            let expectedNewAging = 0;
            if (createTimeStr) {
               try {
                  const cleaned = createTimeStr.replace(' UTC', '');
                  const d = new Date(cleaned);
                  const reportD = new Date("2026-03-31T00:00:00");
                  const diff = reportD.getTime() - d.getTime();
                  expectedNewAging = Math.max(0, Math.floor(diff / (1000 * 60 * 60 * 24)));
               } catch(e) {}
            }
            if (expAging !== expectedNewAging) {
                // console.log(`  [NEW] Aging mismatch for ${wo}: Calculated=${expectedNewAging}, Expected=${expAging}`);
                agingDifferencesNew++;
            }
        }
    }
}
console.log(`Pending rows with aging != yesterday+1: ${agingDifferencesYest}`);
console.log(`New rows with aging != calculated diff : ${agingDifferencesNew}`);

console.log("\n======= 4. NEW ROWS - BLANK VALUES EXPECTATION =======");
let newRowStatusNotBlank = 0;
for (const [wo, expRow] of expectedWOs) {
    if (!yestWOs.has(wo)) {
        if (expRow['Morning Status'] && String(expRow['Morning Status']).trim() !== "") {
            console.log(`  - NEW ROW ${wo} has a Morning Status populated natively: "${expRow['Morning Status']}"`);
            newRowStatusNotBlank++;
        }
        if (expRow['Parts'] && String(expRow['Parts']).trim() !== "") {
            console.log(`  - NEW ROW ${wo} has Parts populated natively: "${expRow['Parts']}"`);
        }
    }
}
console.log(`New rows with non-blank Morning Status in output: ${newRowStatusNotBlank} / ${expectedWOs.size - [...expectedWOs.keys()].filter(wo => yestWOs.has(wo)).length}`);

console.log("\n======= 5. SEGMENT MAPPING DIVERGENCE? =======");
for (const [wo, expRow] of expectedWOs) {
    if (!yestWOs.has(wo)) { // Only test new rows where segment is derived
        const flexRow = flexRecords.get(wo);
        if (flexRow) {
            const expSeg = String(expRow['Segment']).trim();
            const otc = String(flexRow['WO OTC Code']).toLowerCase();
            const biz = String(flexRow['Business Segment']).toLowerCase();
            
            let calcSeg = biz;
            if (otc.includes('trade')) calcSeg = 'Trade';
            else if (otc.includes('install') || otc.includes('05f')) calcSeg = 'Install';
            else if (biz === 'computing') calcSeg = 'Pc';
            else if (biz === 'printing') calcSeg = 'print';
            
            if (expSeg.toLowerCase() !== calcSeg.toLowerCase()) {
                console.log(`  - SEGMENT MISMATCH for ${wo}: Expected="${expSeg}" vs Calculated="${calcSeg}" (OTC: ${otc}, BIZ: ${biz})`);
            }
        }
    }
}
