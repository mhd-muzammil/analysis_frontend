const XLSX = require('xlsx');
const fs = require('fs');

const flexPath = "d:/projects/Analysis Dasboard/renderways Reports/Renderways_Technologies Technologies Private Limited.xlsx";

let out = [];
function log(msg) { out.push(msg); }

try {
  let flexWb = XLSX.readFile(flexPath);
  let flexData = XLSX.utils.sheet_to_json(flexWb.Sheets["Data"], { defval: "" });

  // For WO-033948791 (Flex WIP=1, Expected=1)
  // vs WO-033950956 (Flex WIP=1, Expected=0)
  const check = ['WO-033948791', 'WO-033950640', 'WO-033950956', 'WO-033951432', 'WO-033955685'];
  
  for (const wo of check) {
    const row = flexData.find(r => String(r['Ticket No']).trim() === wo);
    if (row) {
      log(`${wo}:`);
      log(`  WIP Aging: ${row['WIP Aging']}`);
      log(`  New Call Created: "${row['New Call Created']}"`);
      log(`  StartDate: "${row['StartDate']}"`);
      log(`  Current Job Status Timestamp: "${row['Current Job Status Timestamp']}"`);
      log(`  Status: "${row['Status']}"`);
    }
  }

  fs.writeFileSync('d:/projects/Analysis Dasboard/newcall_inspect.txt', out.join('\n'));
} catch(err) {
  fs.writeFileSync('d:/projects/Analysis Dasboard/newcall_inspect.txt', 'CRASHED:\n' + err.stack);
}
