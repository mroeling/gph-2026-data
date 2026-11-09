// Voegt de 14 handmatige meldingen uit het sheet toe als nieuwe records (bron "handmatig", id "H<regelnummer>").
// Coördinaat: opgegeven door de gebruiker, of uit kolom G, of geocodering (PDOK) van het adres.
const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const db = new DatabaseSync(path.join(__dirname, 'data', 'flevoland.db'));
const geo = async (q) => {
  const j = await (await fetch('https://api.pdok.nl/bzk/locatieserver/search/v3_1/free?rows=1&q=' + encodeURIComponent(q))).json();
  const [lon, lat] = j.response.docs[0].centroide_ll.match(/-?[\d.]+/g).map(Number);
  return { lat, lon, treffer: j.response.docs[0].weergavenaam };
};
const iso = (s) => { const m = /^(\d{1,2})-(\d{1,2})-(\d{4})$/.exec(s || ''); return m ? `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` : 'onbekend'; };
// regel, datum (sheet kolom A), locatie (sheet kolom B), coördinaat-bron
const items = [
  [63, '18-08-2026', 'kuinderweg 19, Emmeloord', { adres: 'kuinderweg 19, Emmeloord' }],
  [66, '02-09-2026', 'Spijkweg 36, Biddinghuizen', { lat: 52.431156, lon: 5.749290 }],
  [71, '22-08-2026', 'Vogelwikke 28, Swifterbant', { adres: 'Vogelwikke 28, Swifterbant' }],
  [81, '13-10-2026', 'kruising van De Wolken en het Noorderlicht, Dronten', { lat: 52.526583, lon: 5.728488 }],
  [96, '29-09-2026', 'Eemhof, Zeewolde', { lat: 52.260390, lon: 5.399480 }],
  [107, '23-09-2026', 'Jimi Hendrixstraat 38, Almere Stad', { lat: 52.367328, lon: 5.175771 }],
  [134, '27-10-2026', 'Enserweg 7 Ens', { adres: 'Enserweg 7, Ens' }],
  [144, '13-10-2026', 'Kofschip, Lelystad', { lat: 52.523972, lon: 5.475111 }],
  [157, '', 'langs de vaart, Emmeloord', { lat: 52.714917, lon: 5.770750 }],
  [158, '27-10-2026', 'Sportlaan, Emmeloord', { lat: 52.719223, lon: 5.761924 }],
  [162, '28-10-2026', 'Kokkelweg 8, Biddinghuizen', { adres: 'Kokkelweg 8, Biddinghuizen' }],
  [171, '02-07-2026', 'Lucernehof 94, Biddinghuizen', { adres: 'Lucernehof 94, Biddinghuizen' }],
  [194, '28-10-2026', 'Stobbenweg 18, 8251 PX Dronten', { lat: 52.506250, lon: 5.836028 }],
  [199, '04-11-2026', 'Gemaalweg, Rutten', { lat: 52.807806, lon: 5.697222 }],
];
(async () => {
  const handmatigTxt = path.join(__dirname, 'data', 'ruimingen_tf_handmatig.txt');
  const regels = [];
  db.exec('BEGIN');
  for (const [r, datum, locatie, co] of items) {
    let lat = co.lat, lon = co.lon, bron = 'opgegeven';
    if (co.adres) { const g = await geo(co.adres); lat = g.lat; lon = g.lon; bron = `adres (PDOK: ${g.treffer})`; }
    db.prepare(`INSERT INTO waarnemingen (bron, id, datum, locatie, validatie, status, type, lat, lon, nauwkeurigheid, geruimd, geimporteerd)
      VALUES ('handmatig', ?, ?, ?, 'handmatig', 'Handmatig toegevoegd', 'Nest', ?, ?, NULL, 'ja', ?)
      ON CONFLICT(bron, id) DO UPDATE SET datum = excluded.datum, locatie = excluded.locatie, lat = excluded.lat, lon = excluded.lon`)
      .run('H' + r, iso(datum), locatie, lat, lon, new Date().toISOString());
    regels.push(`${r};${lat.toFixed(6)};${lon.toFixed(6)}`);
    console.log(`regel ${r}: H${r} ${iso(datum)} ${lat.toFixed(6)} ${lon.toFixed(6)} (${bron})`);
  }
  db.exec('COMMIT');
  // Coördinaten ook in het handmatig-bestand, zodat de matcher ze gebruikt
  const huidig = fs.readFileSync(handmatigTxt, 'utf8');
  fs.writeFileSync(handmatigTxt, huidig.replace(/\s*$/, '') + '\n# Handmatige meldingen (bron handmatig), regelnummer;lat;lon\n' + regels.join('\n') + '\n');
  db.close();
})();
