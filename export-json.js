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

const uit = path.join(__dirname, 'public', 'data.json');
fs.writeFileSync(uit, JSON.stringify({ gegenereerd: new Date().toISOString(), aantal: rijen.length, waarnemingen: rijen }));
console.log(`${rijen.length} waarnemingen geëxporteerd naar ${uit}`);
