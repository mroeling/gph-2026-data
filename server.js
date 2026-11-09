// Lokale webserver: serveert de kaart + tabel en een kleine API op de SQLite-database.
// Start met: node server.js   en open daarna http://localhost:3000
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

const PORT = Number(process.env.PORT) || 3000;
const db = new DatabaseSync(path.join(__dirname, 'data', 'flevoland.db'));
const GERUIMD_WAARDEN = ['ja', 'onbereikbaar', 'te laat'];

const alleWaarnemingen = db.prepare(`
  SELECT id, bron, datum, locatie, validatie, status, type, lat, lon, nauwkeurigheid, geruimd, geruimd_gewijzigd
  FROM waarnemingen ORDER BY datum DESC
`);
const zetGeruimd = db.prepare(`
  UPDATE waarnemingen SET geruimd = ?, geruimd_gewijzigd = ? WHERE bron = ? AND id = ?
`);

function stuurJson(res, code, data) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(data));
}

function leesBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > 10_000) reject(new Error('Body te groot'));
    });
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

const statischeBestanden = {
  '/': { file: 'index.html', type: 'text/html; charset=utf-8' },
};

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  try {
    // API: alle waarnemingen
    if (req.method === 'GET' && url.pathname === '/api/waarnemingen') {
      return stuurJson(res, 200, alleWaarnemingen.all());
    }

    // API: geruimd-status van één waarneming wijzigen
    const match = url.pathname.match(/^\/api\/waarnemingen\/([^/]+)\/([^/]+)$/);
    if (req.method === 'PATCH' && match) {
      const bron = decodeURIComponent(match[1]);
      const id = match[2];
      const body = JSON.parse((await leesBody(req)) || '{}');
      if (!GERUIMD_WAARDEN.includes(body.geruimd)) {
        return stuurJson(res, 400, { fout: `geruimd moet een van ${GERUIMD_WAARDEN.join(', ')} zijn` });
      }
      const nu = new Date().toISOString();
      const resultaat = zetGeruimd.run(body.geruimd, nu, bron, id);
      if (resultaat.changes === 0) return stuurJson(res, 404, { fout: 'waarneming niet gevonden' });
      return stuurJson(res, 200, { bron, id, geruimd: body.geruimd, geruimd_gewijzigd: nu });
    }

    // Statische bestanden (alleen de whitelist hierboven)
    if (req.method === 'GET' && statischeBestanden[url.pathname]) {
      const { file, type } = statischeBestanden[url.pathname];
      res.writeHead(200, { 'Content-Type': type });
      return res.end(fs.readFileSync(path.join(__dirname, 'public', file)));
    }

    stuurJson(res, 404, { fout: 'niet gevonden' });
  } catch (err) {
    console.error(err);
    stuurJson(res, 400, { fout: err.message });
  }
});

// Alleen op deze computer bereikbaar
server.listen(PORT, '127.0.0.1', () => {
  console.log(`Kaart draait op http://localhost:${PORT}`);
});
