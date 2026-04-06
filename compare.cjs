const XLSX = require('xlsx');
const fs = require('fs');

const expectedPath = "d:/projects/Analysis Dasboard/renderways Reports/Chennai 31th March 2026 Call Plan.xlsx";
const generatedPath = "d:/projects/Analysis Dasboard/renderways Reports/Chennai_20260331_Call_Plan.xlsx";

try {
  let expWb = XLSX.readFile(expectedPath);
  let expSheet = expWb.SheetNames.find(s => s.toLowerCase().includes("open call")) || expWb.SheetNames[0];
  let expDataRaw = XLSX.utils.sheet_to_json(expWb.Sheets[expSheet], { header: 1, defval: "" });

  let genWb = XLSX.readFile(generatedPath);
  let genSheet = genWb.SheetNames[0];
  let genDataRaw = XLSX.utils.sheet_to_json(genWb.Sheets[genSheet], { header: 1, defval: "" });

  let out = [];
  out.push(`Expected rows (raw including headers and blank): ${expDataRaw.length}`);
  out.push(`Generated rows (raw including headers and blank): ${genDataRaw.length}`);
  out.push(`\nExpected Header: \n${JSON.stringify(expDataRaw[0])}`);
  out.push(`Generated Header: \n${JSON.stringify(genDataRaw[0])}`);

  let mismatches = 0;
  const maxRows = Math.min(expDataRaw.length, genDataRaw.length);

  out.push(`\nRaw Generated Row 2:\n${JSON.stringify(genDataRaw[1])}`);

  for (let r = 0; r < Math.max(expDataRaw.length, genDataRaw.length); r++) {
    let expRow = expDataRaw[r] || [];
    let genRow = genDataRaw[r] || [];
    let rowMismatch = false;

    // Pad arrays to same length if needed for comparison up to 13 columns
    for (let c = 0; c < 13; c++) {
      let eVal = String(expRow[c] ?? '').trim();
      let gVal = String(genRow[c] ?? '').trim();
      
      // Handle the date formatting from Excel directly
      if (typeof expRow[c] === 'number' && c === 0 && r > 0) { // Column A is Month (date)
        // If expected is an Excel serial date, reading as raw header:1 gives the serial number
        // Let's just note this difference without strict formatting parsing for now
      }

      if (eVal !== gVal) {
        if (!rowMismatch) {
          out.push(`\nRow ${r+1} differs!`);
          rowMismatch = true;
          mismatches++;
        }
        out.push(`  Col ${c+1}: Expected='${eVal}' vs Generated='${gVal}'`);
      }
    }
  }

  out.push(`\nTotal rows with at least one cell mismatch: ${mismatches}`);
  
  // also check if date columns are formatted completely differently when parsed with format
  let expParsed = XLSX.utils.sheet_to_json(expWb.Sheets[expSheet], { raw: false, dateNF: "dd-mm-yyyy" });
  let genParsed = XLSX.utils.sheet_to_json(genWb.Sheets[genSheet], { raw: false, dateNF: "dd-mm-yyyy" });
  
  if (expParsed.length > 0 && genParsed.length > 0) {
      out.push(`\nDate formatting check (Row 1 Month): Expected = ${expParsed[0]['Month']}, Generated = ${genParsed[0]['Month']}`);
  }

  fs.writeFileSync('d:/projects/Analysis Dasboard/compare_out.txt', out.join('\n'));

} catch(e) {
  fs.writeFileSync('d:/projects/Analysis Dasboard/compare_out.txt', 'Error: ' + e.message);
}
