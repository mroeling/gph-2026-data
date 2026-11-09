// Plak dit in de browser-console (F12 > Console) op de waarneming.nl-overzichtspagina
// van de Aziatische hoornaar met de filters uit de opdracht (Flevoland, 2026, activiteit NEST).
// Het script loopt alle pagina's langs en maakt een tekst met één regel per waarneming.
// Waarneming.nl blokkeert gewone downloads (Anubis), daarom draait dit in de browser zelf.
// Kopieer de uitvoer naar data/waarneming_nl_flevoland.txt en draai daarna: node import.js
(async () => {
  const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();
  const base = location.pathname + location.search.replace(/&page=\d+/, '');
  const ids = new Set();
  const verzamel = (doc) => [...doc.querySelectorAll('a')]
    .map((a) => a.getAttribute('href'))
    .filter((h) => h && /^\/observation\/\d+\/?$/.test(h))
    .forEach((h) => ids.add(h.match(/\d+/)[0]));

  verzamel(document);
  for (let p = 2; p <= 50; p++) {
    const html = await (await fetch(`${base}&page=${p}`, { credentials: 'include' })).text();
    const before = ids.size;
    verzamel(new DOMParser().parseFromString(html, 'text/html'));
    if (ids.size === before) break; // geen nieuwe waarnemingen meer
  }

  // Het waarnemer-veld blijft leeg: namen worden niet opgeslagen
  const regels = ['# id|datum||locatie|validatie|lat|lon|nauwkeurigheid'];
  for (const id of ids) {
    const html = await (await fetch(`/observation/${id}/`, { credentials: 'include' })).text();
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const lines = doc.body.innerText.split('\n').map(clean).filter(Boolean);
    const s = lines.indexOf('Soort');
    const di = lines.findIndex((l, k) => k > s && /^\d{4}-\d{2}-\d{2}/.test(l));
    const txt = lines.join('\n');
    const gps = txt.match(/GPS\s+(-?[\d.]+),\s*(-?[\d.]+)/);
    const acc = txt.match(/Nauwkeurigheid\n([^\n]+)/);
    if (di < 0 || !gps) { regels.push(`# OVERGESLAGEN ${id} (geen GPS-coördinaat of onbekend formaat)`); continue; }
    regels.push([id, lines[di], '', lines[di + 2], lines[di + 3].replace(/^Goedgekeurd \(|\)$/g, ''),
      gps[1], gps[2], acc ? acc[1] : ''].join('|'));
  }
  const tekst = regels.join('\n');
  console.log(tekst);
  try { await navigator.clipboard.writeText(tekst); console.log('Gekopieerd naar het klembord.'); } catch (e) { console.log('Kopiëren mislukt; kopieer de tekst uit de console.'); }
})();
