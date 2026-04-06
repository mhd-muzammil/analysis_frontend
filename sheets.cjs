const XLSX = require('xlsx');
const fs = require('fs');

let out = [];
try {
  const wb = XLSX.readFile("d:/projects/Analysis Dasboard/renderways Reports/Renderways_Technologies Technologies Private Limited.xlsx");
  out.push("SHEETS: " + wb.SheetNames.join(", "));
  for (let s of wb.SheetNames) {
      const data = XLSX.utils.sheet_to_json(wb.Sheets[s], { defval: "" });
      
      // Print first 2 column names to understand structure
      const headers = data.length > 0 ? Object.keys(data[0]).slice(0, 3) : [];
      out.push(`Sheet "${s}" has ${data.length} rows. Primary columns: ${headers.join(", ")}`);
  }
} catch (err) {
  out.push("ERROR: " + err);
}

fs.writeFileSync("d:/projects/Analysis Dasboard/sheets_out.txt", out.join("\n"));
