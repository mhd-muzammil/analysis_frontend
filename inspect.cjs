const XLSX = require('xlsx');
const fs = require('fs');

const flexPath = "d:/projects/Analysis Dasboard/renderways Reports/Renderways_Technologies Technologies Private Limited.xlsx";
const csvPath = "d:/projects/Analysis Dasboard/renderways Reports/Flex_WIP_ASP_Report.csv";

let out = [];
function log(msg) { out.push(msg); }

try {
  // XLSX Flex
  let flexWb = XLSX.readFile(flexPath);
  let flexData = XLSX.utils.sheet_to_json(flexWb.Sheets["Data"], { defval: "" });
  
  // Get a sample Chennai NEW row (e.g., WO-033948791)
  const sampleWOs = ['WO-033948791', 'WO-033950640', 'WO-033955685'];
  
  log("======= FLEX XLSX COLUMNS (all 80+) =======");
  if (flexData.length > 0) {
    Object.keys(flexData[0]).forEach(k => log(`  "${k}"`));
  }

  log("\n======= SAMPLE NEW ROWS FROM FLEX XLSX =======");
  for (const target of sampleWOs) {
    const row = flexData.find(r => String(r['Ticket No']).trim() === target);
    if (row) {
      log(`\n--- ${target} ---`);
      log(`  WIP Aging: "${row['WIP Aging']}"`);
      log(`  Status: "${row['Status']}"`);
      log(`  Customer City: "${row['Customer City']}"`);
      log(`  Customer Address: "${row['Customer Address '] || row['Customer Address']}"`);
      log(`  Customer Name: "${row['Customer Name']}"`);
      log(`  Customer Email Id: "${row['Customer Email Id']}"`);
      log(`  ASP City: "${row['ASP City']}"`);
      log(`  Product Name: "${row['Product Name']}"`);
      log(`  Case Id: "${row['Case Id']}"`);
      log(`  WO OTC Code: "${row['WO OTC Code']}"`);
      log(`  Business Segment: "${row['Business Segment']}"`);
      
      // Search for ANY column containing phone
      for (const k of Object.keys(row)) {
        const kl = k.toLowerCase();
        if (kl.includes('phone') || kl.includes('contact') || kl.includes('mobile') || kl.includes('tel')) {
          log(`  [PHONE?] "${k}": "${row[k]}"`);
        }
      }
      
      // Search for ANY column containing time/date/create
      for (const k of Object.keys(row)) {
        const kl = k.toLowerCase();
        if (kl.includes('create') || kl.includes('start') || kl.includes('timestamp')) {
          log(`  [TIME?] "${k}": "${row[k]}"`);
        }
      }
    } else {
      log(`  ${target}: NOT FOUND in Flex XLSX`);
    }
  }

  // Also check if csv has the customer phone columns
  log("\n======= NOW CHECK THE CSV VERSION =======");
  const Papa = require('papaparse');
  const csvContent = fs.readFileSync(csvPath, 'latin1');
  const csvParsed = Papa.parse(csvContent, { header: true, skipEmptyLines: true });
  const csvData = csvParsed.data;
  
  log(`CSV rows: ${csvData.length}`);
  if (csvData.length > 0) {
    log("CSV columns:");
    Object.keys(csvData[0]).forEach(k => log(`  "${k}"`));
  }

  log("\n======= CSV SAMPLE ROWS (same WOs) =======");
  for (const target of sampleWOs) {
    const row = csvData.find(r => String(r['Ticket No']).trim() === target);
    if (row) {
      log(`\n--- ${target} (CSV) ---`);
      log(`  Customer Phone No: "${row['Customer Phone No']}"`);
      log(`  Create Time: "${row['Create Time']}"`);
      log(`  Customer City: "${row['Customer City']}"`);
      log(`  Customer Address: "${row['Customer Address']}"`);
      log(`  Status: "${row['Status']}"`);
      log(`  Product Name: "${row['Product Name']}"`);
      log(`  ASP City: "${row['ASP City']}"`);
    } else {
      log(`  ${target}: NOT FOUND in CSV`);
    }
  }

  // Compare expected output entries
  let expWb = XLSX.readFile("d:/projects/Analysis Dasboard/renderways Reports/Chennai 31th March 2026 Call Plan.xlsx");
  let expSheet = expWb.SheetNames.find(s => s.toLowerCase().includes("open call")) || expWb.SheetNames[0];
  let expData = XLSX.utils.sheet_to_json(expWb.Sheets[expSheet], { defval: "" });

  log("\n======= EXPECTED NEW ROWS =======");
  for (const target of sampleWOs) {
    const row = expData.find(r => String(r['Ticket No']).trim() === target);
    if (row) {
      log(`\n--- ${target} (EXPECTED) ---`);
      log(`  WIP Aging: "${row['WIP Aging']}"`);
      log(`  Location: "${row['Location']}"`);
      log(`  Current Status-TAT: "${row['Current Status-TAT']}"`);
      log(`  Contact no.: "${row['Contact no.']}"`);
      log(`  Morning Status: "${row['Morning Status']}"`);
      log(`  Engg.: "${row['Engg.']}"`);
    }
  }

  fs.writeFileSync('d:/projects/Analysis Dasboard/column_inspect.txt', out.join('\n'));
} catch(err) {
  fs.writeFileSync('d:/projects/Analysis Dasboard/column_inspect.txt', 'CRASHED:\n' + err.stack);
}
