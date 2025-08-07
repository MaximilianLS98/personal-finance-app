// Quick test to verify CSV parsing works with Norwegian format
const { parseCSV } = require('./src/lib/csv-parser.ts');

const testCSV = `Bokføringsdato;Beløp;Avsender;Mottaker;Navn;Tittel;Valuta;Betalingstype
2025/07/31;-550,76;6039.14.13331;;;MINAS MARKET;NOK;Visa varekjøp/uttak
2025/07/31;-242,59;6039.14.13331;;;KAROGLAS EMMANOUIL & SIA;NOK;Visa varekjøp/uttak
2025/07/30;-364,61;6039.14.13331;;;BUTLER S HOUSE;NOK;Visa varekjøp/uttak`;

console.log('Testing CSV parsing...');
const result = parseCSV(testCSV);
console.log('Result:', JSON.stringify(result, null, 2));
