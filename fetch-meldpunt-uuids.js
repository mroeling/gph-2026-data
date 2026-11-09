// Haalt per meldpunt-uuid uit het sheet de coördinaten en status op (alleen die velden; persoonsgegevens worden niet opgeslagen).
// Gebruik: node fetch-meldpunt-uuids.js <uuids.txt>
const fs = require('node:fs');
const path = require('node:path');
const [lijst] = process.argv.slice(2);
const uuids = fs.readFileSync(lijst, 'utf8').split(/\r?\n/).filter(Boolean);
const uit = path.join(__dirname, 'data', 'meldpunt_uuids.json');
const resultaat = fs.existsSync(uit) ? JSON.parse(fs.readFileSync(uit, 'utf8')) : {};
(async () => {
  for (const id of uuids) {
    if (resultaat[id]) continue;
    try {
      const r = await fetch(`https://www.meldpuntaziatischehoornaar.nl/api/reports/${id}`);
      if (!r.ok) { resultaat[id] = { fout: r.status }; continue; }
      const j = await r.json();
      resultaat[id] = { lat: j.latitude, lon: j.longitude, spottedAt: j.spottedAt, status: j.status, gemeente: j.municipality, adres: j.addressFormatted };
    } catch (e) { resultaat[id] = { fout: e.message }; }
    await new Promise((res) => setTimeout(res, 700));
  }
  fs.writeFileSync(uit, JSON.stringify(resultaat, null, 1));
  const n = Object.values(resultaat);
  console.log(`Opgehaald: ${n.length}. Met coördinaat: ${n.filter((x) => x.lat).length}. Fouten: ${n.filter((x) => x.fout).length}.`);
})();
