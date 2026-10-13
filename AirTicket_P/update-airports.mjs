import { writeFile } from 'node:fs/promises';

const source = 'https://www.airportal.go.kr/airport/airport.do';
const endpoint = 'https://www.airportal.go.kr/airport/searchAirport.do';
const records = [];
let total = 0;
let pageNumber = 1;
do {
    const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Referer: source },
        body: JSON.stringify({ pageNumber, pageSize: 10000, order: 'asc', orderNm: 'name' }),
        signal: AbortSignal.timeout(60000)
    });
    if (!response.ok) throw new Error(`Airport download failed: HTTP ${response.status}`);
    const data = await response.json();
    if (!Array.isArray(data.content) || !data.content.length || !Number.isInteger(data.total)) {
        throw new Error('Invalid or incomplete airport response');
    }
    total = data.total;
    records.push(...data.content);
    pageNumber += 1;
} while (records.length < total);

if (records.length !== total) throw new Error('Airport record count does not match source total');
const uniqueAirports = new Map();
const text = value => String(value ?? '').trim();
for (const record of records) {
    const code = text(record.iataCode).toUpperCase();
    if (!/^[A-Z]{3}$/.test(code) || uniqueAirports.has(code)) continue;
    uniqueAirports.set(code, {
        code,
        name: text(record.name),
        koName: text(record.name2),
        city: text(record.city),
        koCity: text(record.koCity),
        country: text(record.en1Country),
        koCountry: text(record.koCountry)
    });
}
for (const code of ['CJJ', 'DMK']) {
    if (!uniqueAirports.has(code)) throw new Error(`Required airport missing: ${code}`);
}
const dataset = {
    source,
    retrievedAt: new Date().toISOString(),
    sourceTotal: total,
    airports: [...uniqueAirports.values()]
};
const serialized = JSON.stringify(dataset, null, 2).replace(/</g, '\\u003c');
await writeFile(new URL('./airports-data.js', import.meta.url), `globalThis.airportData = ${serialized};\n`, 'utf8');
console.log(`Saved ${dataset.airports.length} unique IATA airports from ${total} source records.`);