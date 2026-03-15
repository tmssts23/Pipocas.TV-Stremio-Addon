const os = require('os');
const express = require('express');
const { getRouter } = require('stremio-addon-sdk');
const landingTemplate = require('stremio-addon-sdk/src/landingTemplate');
const { addonInterface, downloadSubtitleById } = require('./index');

const ADDON_PORT = process.env.PORT || 7000;

function getLocalIP() {
  const ifaces = os.networkInterfaces();
  for (const name of Object.keys(ifaces)) {
    for (const iface of ifaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) return iface.address;
    }
  }
  return '127.0.0.1';
}

// Um único servidor (addon + proxy na mesma porta) a escutar em 0.0.0.0 para funcionar na mesma máquina e noutra máquina / LAN
// BASE_URL: se não definido, usamos o IP da LAN para os URLs das legendas (não é mostrado em log por privacidade)
const BASE_URL = process.env.BASE_URL || ('http://' + getLocalIP() + ':' + ADDON_PORT);
process.env.BASE_URL = BASE_URL.replace(/\/$/, '');

function proxyHandler(req, res) {
  const pathname = (req.path || req.url.split('?')[0] || '/').trim();
  const match = pathname.match(/^\/pipocas\/(\d+)(\.srt)?\/?$/i);
  if (!match) {
    res.statusCode = 404;
    return res.end('Not found');
  }
  const id = parseInt(match[1], 10);
  let credentials = null;
  const options = {};
  const q = (req.url || '').indexOf('?');
  if (q !== -1) {
    const params = new URLSearchParams(req.url.slice(q));
    const c = params.get('c');
    if (c) {
      try {
        credentials = JSON.parse(Buffer.from(String(c), 'base64url').toString('utf8'));
      } catch (_) {
        try {
          credentials = JSON.parse(decodeURIComponent(String(c)));
        } catch (_) {}
      }
    }
    if (params.get('season') != null) options.season = params.get('season');
    if (params.get('episode') != null) options.episode = params.get('episode');
    if (params.get('fileIndex') != null) options.fileIndex = params.get('fileIndex');
  }
  console.log('[Pipocas.tv] Proxy download id=' + id + ' — credenciais no pedido: ' + (credentials ? 'sim' : 'não'));
  downloadSubtitleById(id, res, credentials, options);
}

const app = express();
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  next();
});
// Cache curto no manifest para o Stremio poder atualizar o addon quando há nova versão
app.use((req, res, next) => {
  const origEnd = res.end;
  res.end = function (chunk, ...args) {
    const ct = res.getHeader('Content-Type');
    if (ct && String(ct).includes('application/json') && chunk) {
      const body = typeof chunk === 'string' ? chunk : (chunk && chunk.toString ? chunk.toString() : '');
      if (body.length < 3000 && body.includes('"id"') && body.includes('"version"')) {
        res.setHeader('Cache-Control', 'max-age=300, stale-while-revalidate=60, public');
      }
    }
    return origEnd.apply(this, [chunk, ...args]);
  };
  next();
});
const hasConfig = !!(addonInterface.manifest.config || []).length;
const landingHTML = landingTemplate(addonInterface.manifest);
// Rotas de páginas primeiro, para não serem capturadas pelo router do addon
app.get('/', (_, res) => {
  if (hasConfig) res.redirect(302, '/configure');
  else res.setHeader('content-type', 'text/html').end(landingHTML);
});
app.get('/configure', (_, res) => {
  res.setHeader('content-type', 'text/html').end(landingHTML);
});
app.get(/^\/pipocas\/(\d+)(\.srt)?\/?$/i, (req, res) => proxyHandler(req, res));
app.use(getRouter(addonInterface));

app.listen(ADDON_PORT, '0.0.0.0', () => {
  console.log('');
  console.log('=== Addon Pipocas.TV Legendas ===');
  console.log('  Mesma máquina:  http://localhost:' + ADDON_PORT + '/manifest.json');
  console.log('  Outra máquina:  http://<IP-desta-máquina>:' + ADDON_PORT + '/manifest.json');
  console.log('  No Stremio (TV/telemóvel): adiciona o URL da outra máquina.');
  console.log('  Configura utilizador e palavra-passe Pipocas na primeira vez.');
  console.log('  Se outra máquina não ligar: permite a porta ' + ADDON_PORT + ' no Firewall do Windows.');
  console.log('');
});
