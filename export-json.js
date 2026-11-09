// Exporteert de database naar public/data.json, zodat de kaart ook zonder server (bv. GitHub Pages) werkt.
// Gebruik: node export-json.js
// Let op: alleen-lezen. Wijzigingen van "geruimd" in de online versie worden niet opgeslagen.
const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

const db = new DatabaseSync(path.join(__dirname, 'data', 'flevoland.db'));
const rijen = db.prepare(`
  SELECT id, bron, datum, locatie, validatie, status, type, lat, lon, nauwkeurigheid, geruimd, geruimd_gewijzigd
  FROM waarnemingen ORDER BY datum DESC
`).all();
db.close();

// Alleen de straatnaam: het huisnummer valt weg. Een wijknaam vóór het huisnummer (bv. Karveel) blijft staan.
// Plaats na de komma en postcode vallen ook weg. Zonder straat (bv. alleen gemeente) blijft de tekst zoals hij is.
function straat(locatie) {
  if (!locatie || locatie.includes('°')) return locatie; // coördinaat-tekst: niet exporteren als adres
  const deel = locatie.split(',')[0].trim();
  const huisnr = deel.search(/\s\d/);
  return (huisnr > 0 ? deel.slice(0, huisnr) : deel).trim();
}
// Meldpunt: met adres (uuid-meldingen) alleen de straat; anders alleen de gemeente. De gemelde locatie-tekst blijft lokaal.
const adressen = {
  ...JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'meldpunt_adressen.json'), 'utf8')),
  ...JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'meldpunt_adressen_csv.json'), 'utf8')),
};
const locaties = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'meldpunt_locaties.json'), 'utf8'));
for (const r of rijen) {
  if (r.bron !== 'meldpunt') continue;
  if (adressen[r.id]) r.locatie = straat(adressen[r.id]);
  else if (locaties[r.id]) r.locatie = locaties[r.id].gemeente;
}

const uit = path.join(__dirname, 'public', 'data.json');
fs.writeFileSync(uit, JSON.stringify({ gegenereerd: new Date().toISOString(), aantal: rijen.length, waarnemingen: rijen }));
console.log(`${rijen.length} waarnemingen geëxporteerd naar ${uit}`);
