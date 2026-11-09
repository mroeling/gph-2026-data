// Koppelt de regels uit het sheet "Ruimingen TF" aan de database.
// Gebruik: node match-ruimingen.js          (alleen overzicht)
//          node match-ruimingen.js --apply  (zet geruimd in de database)
// Status: kolom A leeg -> "te laat"; kolom B rood -> "onbereikbaar"; anders "ja".
// Koppeling (coördinaat is leidend, daarna id/link, daarna adres):
//   1. coördinaat uit kolom G, dan kolom B, dan link-coördinaat (google)
//   2. meldpunt-link (uuid) -> coördinaat uit de meldpunt-API
//   3. waarneming.nl-id uit de link (DB)
//   4. adres -> geocodering (PDOK), alleen als er geen coördinaat is
// Een coördinaat matcht met de dichtstbijzijnde DB-melding binnen 25 m (geocodering: 60 m).
const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

const APPLY = process.argv.includes('--apply');
const data = (naam) => path.join(__dirname, 'data', naam);
const db = new DatabaseSync(data('flevoland.db'));
const dbRows = db.prepare('SELECT bron, id, datum, locatie, lat, lon FROM waarnemingen').all();
const regelsTekst = (naam) => fs.readFileSync(data(naam), 'utf8').split(/\r?\n/).filter((l) => l && !l.startsWith('#'));

// Basisregels: A-leeg, B-rood, wn-ids en coördinaat uit kolom B
const rijen = new Map();
for (const l of regelsTekst('ruimingen_tf.txt')) {
  const [r, aLeeg, rood, wn, co] = l.split(';');
  const [lat, lon] = (co || '').trim() ? co.trim().split(/\s+/).map(Number) : [null, null];
  rijen.set(Number(r), { r: Number(r), aLeeg: aLeeg === '1', rood: rood === '1', wn: wn ? wn.split(',') : [], uuid: [], B: lat !== null ? { lat, lon } : null, G: null, L: null, adres: null });
}
// Kolom G: coördinaten
for (const l of regelsTekst('ruimingen_tf_g.txt')) {
  const [r, lat, lon] = l.trim().split(/\s+/);
  if (rijen.has(+r)) rijen.get(+r).G = { lat: +lat, lon: +lon };
}
// Links (kolom G/H/B): waarneming.nl-ids, meldpunt-uuids, coördinaten, google-links
for (const l of regelsTekst('ruimingen_tf_links.txt')) {
  const [r, wn, uuid, co] = l.split('|');
  const x = rijen.get(+r); if (!x) continue;
  for (const id of (wn || '').split(',').filter(Boolean)) if (!x.wn.includes(id)) x.wn.push(id);
  x.uuid = (uuid || '').split(',').filter(Boolean);
  if (co && co.trim()) { const [lat, lon] = co.trim().split(/\s+/).map(Number); x.L = { lat, lon }; }
}
// Adressen (alleen als er geen enkel coördinaat is)
for (const l of regelsTekst('ruimingen_tf_adres.txt')) {
  const i = l.indexOf(';'); const r = rijen.get(Number(l.slice(0, i))); if (r) r.adres = l.slice(i + 1);
}
// Handmatig opgegeven coördinaten (door de gebruiker bevestigd); gaan voor op alle andere bronnen
const handmatig = new Map(regelsTekst('ruimingen_tf_handmatig.txt').map((l) => {
  const [r, lat, lon] = l.split(';'); return [Number(r), { lat: Number(lat), lon: Number(lon) }];
}));
// Meldpunt-API: uuid -> coördinaat (opgehaald met fetch-meldpunt-uuids.js)
const api = JSON.parse(fs.readFileSync(data('meldpunt_uuids.json'), 'utf8'));

const afstandM = (a, b) => {
  const dLat = (a.lat - b.lat) * 111320;
  const dLon = (a.lon - b.lon) * 111320 * Math.cos((a.lat * Math.PI) / 180);
  return Math.hypot(dLat, dLon);
};
function dichtstbij(p, max) {
  let best = null, bestD = Infinity;
  for (const d of dbRows) { const dist = afstandM(p, d); if (dist < bestD) { best = d; bestD = dist; } }
  return best && bestD <= max ? { match: best, dist: bestD } : null;
}
async function geocode(adres) {
  const url = 'https://api.pdok.nl/bzk/locatieserver/search/v3_1/free?rows=1&q=' + encodeURIComponent(adres);
  const json = await (await fetch(url)).json();
  const doc = json.response?.docs?.[0];
  if (!doc || !doc.centroide_ll) return null;
  const [lon, lat] = doc.centroide_ll.match(/-?[\d.]+/g).map(Number);
  return { lat, lon, treffer: doc.weergavenaam };
}

(async () => {
  const uitslag = [];
  for (const x of rijen.values()) {
    const status = x.aLeeg ? 'te laat' : x.rood ? 'onbereikbaar' : 'ja';
    // kandidaten in volgorde van voorkeur
    const kandidaten = [];
    if (handmatig.has(x.r)) kandidaten.push(['handmatig coördinaat', handmatig.get(x.r)]);
    if (x.G) kandidaten.push(['kolom G', x.G]);
    if (x.L) kandidaten.push(['link-coördinaat', x.L]);
    if (x.B) kandidaten.push(['kolom B', x.B]);
    for (const u of x.uuid) if (api[u] && api[u].lat) kandidaten.push(['meldpunt-link', { lat: api[u].lat, lon: api[u].lon }]);

    let match = null, via = null, bronCo = null;
    // Handmatige meldingen (bron handmatig, id H<regel>) horen altijd bij hun eigen regel
    const eigen = dbRows.find((d) => d.bron === 'handmatig' && d.id === 'H' + x.r);
    if (eigen) { match = eigen; via = 'handmatig'; }
    for (const [naam, p] of (eigen ? [] : kandidaten)) {
      const hit = dichtstbij(p, 50);
      if (hit) { match = hit.match; via = `${naam}, ${hit.dist.toFixed(0)} m${hit.dist > 25 ? " (controleer)" : ""}`; break; }
    }
    if (!match) {
      for (const id of x.wn) {
        const hit = dbRows.find((d) => d.bron === 'waarneming.nl' && d.id === id);
        if (hit) { match = hit; via = `waarneming.nl-link ${id}`; break; }
      }
    }
    if (!match && kandidaten.length === 0 && x.adres) {
      const g = await geocode(x.adres);
      if (g) {
        const hit = dichtstbij(g, 60);
        if (hit) { match = hit.match; via = `adres ${x.adres} (${hit.dist.toFixed(0)} m, controleer)`; }
        else bronCo = `adres gevonden (${g.treffer}), geen melding binnen 60 m`;
      }
    }
    // Conflict: coördinaat wijst naar andere melding dan de waarneming.nl-link
    let conflict = null;
    if (match && x.wn.length && match.bron === 'meldpunt') { /* coördinaat leidend */ }
    if (match && x.wn.length) {
      const wnHit = dbRows.find((d) => d.bron === 'waarneming.nl' && d.id === x.wn[0]);
      if (wnHit && (wnHit.bron !== match.bron || wnHit.id !== match.id) && afstandM(wnHit, match) > 25) conflict = `link ${x.wn[0]} wijkt af van coördinaat`;
    }
    uitslag.push({ r: x.r, status, match, via, conflict, wn: x.wn, uuid: x.uuid, kandidaten: kandidaten.length, bronCo, adres: x.adres });
  }

  const gematcht = uitslag.filter((u) => u.match);
  const niet = uitslag.filter((u) => !u.match);
  const soort = (v) => v.startsWith("adres") ? "adres" : v.startsWith("waarneming.nl-link") ? "link" : "coördinaat";
  const telling = gematcht.reduce((a, u) => { a[soort(u.via)] = (a[soort(u.via)] || 0) + 1; return a; }, {});
  console.log(`Koppeling per methode: ${JSON.stringify(telling)}`);
  console.log(`Regels: ${uitslag.length}. Gematcht: ${gematcht.length}. Niet gematcht: ${niet.length}.`);
  console.log('\nConflicten (link wijkt af van coördinaat; coördinaat gebruikt):');
  for (const u of gematcht.filter((x) => x.conflict)) console.log(`  regel ${u.r}: ${u.conflict} -> ${u.match.bron} ${u.match.id}`);
  console.log('\nNiet gematcht (regelnummer: reden):');
  for (const u of niet) {
    let reden;
    if (u.bronCo) reden = u.bronCo;
    else if (u.kandidaten > 0) reden = u.uuid.length && !u.wn.length ? 'meldpunt-link/coördinaat niet in database' : 'coördinaat niet in database';
    else if (u.wn.length) reden = `waarneming.nl-id ${u.wn.join(',')} niet in database`;
    else reden = u.adres ? `adres niet te geocoderen (${u.adres})` : 'geen coördinaat of adres';
    console.log(`  regel ${u.r}: ${reden} (status zou zijn: ${u.status})`);
  }
  if (APPLY) {
    const zet = db.prepare('UPDATE waarnemingen SET geruimd = ?, geruimd_gewijzigd = ? WHERE bron = ? AND id = ?');
    const nu = new Date().toISOString();
    db.exec('BEGIN');
    for (const u of gematcht) zet.run(u.status, nu, u.match.bron, u.match.id);
    db.exec('COMMIT');
    console.log(`\n${gematcht.length} waarnemingen bijgewerkt.`);
  }
  fs.writeFileSync(data('gematcht.json'), JSON.stringify(gematcht.map((u) => u.match.bron + ':' + u.match.id)));
  db.close();
})();
