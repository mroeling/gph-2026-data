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

// Straat zonder huisnummer. Bij een tweedelig huisnummer (bv. "Archipel 37 25", een wijk met nummer)
// blijft het eerste nummer bij de straat: "Archipel 37". Plaats na de komma en postcode vallen weg.
function straat(locatie) {
  if (!locatie || locatie.includes('°')) return locatie; // coördinaat-tekst: niet exporteren als adres
  const deel = locatie.split(',')[0].trim();
  const tweedelig = deel.match(/^(.*?\s\d+)\s\d+(?:\s|$|[A-Za-z-])/);
  if (tweedelig) return tweedelig[1].trim();
  const huisnr = deel.search(/\s\d/);
  return (huisnr > 0 ? deel.slice(0, huisnr) : deel).trim();
}
// Plaats: het deel na de laatste komma, zonder postcode (bv. "Bergeend 48, 8322 CR Urk" -> "Urk").
function plaats(adres) {
  if (!adres || !adres.includes(',')) return null;
  const laatste = adres.split(',').pop().replace(/\b\d{4}\s*[A-Za-z]{2}\b/, '').trim();
  return laatste || null;
}
// Meldpunt: met adres "straat, plaats" (geen huisnummer); zonder adres blijft de gemeente (= plaats).
// De gemelde locatie-tekst (bv. "Hoog in boom") blijft lokaal.
const adressen = {
  ...JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'meldpunt_adressen.json'), 'utf8')),
  ...JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'meldpunt_adressen_csv.json'), 'utf8')),
};
for (const r of rijen) {
  if (r.bron !== 'meldpunt' || !adressen[r.id]) continue;
  const s = straat(adressen[r.id]);
  const p = plaats(adressen[r.id]);
  r.locatie = p ? `${s}, ${p}` : s;
}

const uit = path.join(__dirname, 'public', 'data.json');
fs.writeFileSync(uit, JSON.stringify({ gegenereerd: new Date().toISOString(), aantal: rijen.length, waarnemingen: rijen }));
console.log(`${rijen.length} waarnemingen geëxporteerd naar ${uit}`);
