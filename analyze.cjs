const XLSX = require('xlsx');
const fs = require('fs');

const flexPath = "d:/projects/Analysis Dasboard/renderways Reports/Renderways_Technologies Technologies Private Limited.xlsx";
const yestPath = "d:/projects/Analysis Dasboard/renderways Reports/Chennai 30th March 2026 Call Plan.xlsx";
const expectedPath = "d:/projects/Analysis Dasboard/renderways Reports/Chennai 31th March 2026 Call Plan.xlsx";

let output = [];
function log(msg) {
    output.push(msg);
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

  log("======= DATA SIZES =======");
  log("Flex Data Rows: " + flexData.length);
  log("Yesterday's Call Plan Rows: " + yestData.length);
  log("Expected Today's Call Plan Rows: " + expData.length);

  const flexWOs = new Set(flexData.map(r => String(r['Ticket No'] || r['Ticket Number']).trim()).filter(Boolean));
  const flexRecords = new Map();
  for (const r of flexData) {
    const wo = String(r['Ticket No'] || r['Ticket Number']).trim();
    if (wo) flexRecords.set(wo, r);
  }

  const yestWOs = new Map(yestData.map(r => [String(r['Ticket No']).trim(), r]).filter(pair => pair[0].startsWith('WO-')));
  const expectedWOs = new Map(expData.map(r => [String(r['Ticket No']).trim(), r]).filter(pair => pair[0].startsWith('WO-')));

  log("\n======= UNIQUE TICKETS =======");
  log("Unique Flex WOs: " + flexWOs.size);
  log("Unique Yest WOs: " + yestWOs.size);
  log("Unique Expected WOs: " + expectedWOs.size);

  let errorsOrGaps = [];

  log("\n======= 1. DROPPED TICKETS RETAINED IN EXPECTED? =======");
  const expectedNotInFlex = [...expectedWOs.keys()].filter(wo => !flexWOs.has(wo));
  if (expectedNotInFlex.length > 0) {
      errorsOrGaps.push(`${expectedNotInFlex.length} tickets in Expected output DO NOT exist in today's Flex WIP report.`);
      expectedNotInFlex.slice(0, 10).forEach(wo => {
          let yRow = yestWOs.get(wo);
          let eRow = expectedWOs.get(wo);
          log(`  Missing from flex: ${wo} | Yest Morning: ${yRow ? yRow['Morning Status'] : 'N/A'} | Exp M.Status: ${eRow['Morning Status']}`);
      });
  }

  log("\n======= 2. MISSING TICKETS FROM FLEX TO EXPECTED =======");
  const flexChennai = flexData.filter(r => String(r['ASP City']).trim().toLowerCase() === 'chennai');
  const flexChennaiWOs = new Set(flexChennai.map(r => String(r['Ticket No'] || r['Ticket Number']).trim()));
  const flexChennaiNotExpected = [...flexChennaiWOs].filter(wo => !expectedWOs.has(wo) && wo.startsWith("WO-"));

  if (flexChennaiNotExpected.length > 0) {
      errorsOrGaps.push(`${flexChennaiNotExpected.length} Chennai tickets in the Flex report are MISSING from Expected.`);
      flexChennaiNotExpected.slice(0, 10).forEach(wo => log(`  Expected should have contained: ${wo}`));
  }

  log("\n======= 3. WIP AGING LOGIC BEHAVIOR =======");
  let agingDifferencesYest = 0;
  for (const [wo, expRow] of expectedWOs) {
      const yestRow = yestWOs.get(wo);
      const expAging = parseInt(expRow['WIP Aging']) || 0;
      
      if (yestRow) {
          let yestAging = parseInt(yestRow['WIP Aging']) || 0;
          if (expAging !== yestAging + 1) {
              log(`Aging mismatch pending! WO: ${wo}, Yest: ${yestAging}, Expected (31st): ${expAging}`);
              agingDifferencesYest++;
          }
      } 
  }
  if (agingDifferencesYest > 0) {
      errorsOrGaps.push(`${agingDifferencesYest} pending tickets did not follow the 'yesterday + 1' aging rule.`);
  }

  log("\n======= 4. NEW ROWS RULES EXPECTATION (Blank at generation) =======");
  let newRowStatusNotBlank = 0;
  for (const [wo, expRow] of expectedWOs) {
      if (!yestWOs.has(wo)) {
          if (expRow['Morning Status'] && String(expRow['Morning Status']).trim() !== "") {
              newRowStatusNotBlank++;
          }
      }
  }
  if (newRowStatusNotBlank > 0) {
      errorsOrGaps.push(`${newRowStatusNotBlank} new tickets somehow have the 'Morning Status' field filled out natively in the expected file (implying the operator fills them BEFORE finalizing the output).`);
  }

  log("\n======= SUMMARY OF PROBLEM STATEMENTS =======");
  errorsOrGaps.forEach((err, i) => log(`${i+1}. ${err}`));

  fs.writeFileSync('d:/projects/Analysis Dasboard/report_analysis.txt', output.join('\n'));

} catch(err) {
  fs.writeFileSync('d:/projects/Analysis Dasboard/report_analysis.txt', "CRASHED:\n" + err);
}
