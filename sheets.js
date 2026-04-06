const XLSX = require('xlsx');
const wb = XLSX.readFile("d:/projects/Analysis Dasboard/renderways Reports/Renderways_Technologies Technologies Private Limited.xlsx");
console.log("SHEETS:", wb.SheetNames);
for (let s of wb.SheetNames) {
    const data = XLSX.utils.sheet_to_json(wb.Sheets[s], { defval: "" });
    console.log(`Sheet "${s}" has ${data.length} rows.`);
}
