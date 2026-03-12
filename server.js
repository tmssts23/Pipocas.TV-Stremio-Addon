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
// BASE_URL: se não definido, usamos o IP da LAN para os URLs das legendas
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
  downloadSubtitleById(id, res);
}

const app = express();
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  next();
});
app.get(/^\/pipocas\/(\d+)(\.srt)?\/?$/i, (req, res) => proxyHandler(req, res));
app.use(getRouter(addonInterface));
const hasConfig = !!(addonInterface.manifest.config || []).length;
const landingHTML = landingTemplate(addonInterface.manifest);
app.get('/', (_, res) => {
  if (hasConfig) res.redirect('/configure');
  else res.setHeader('content-type', 'text/html').end(landingHTML);
});
if (hasConfig) {
  app.get('/configure', (_, res) => res.setHeader('content-type', 'text/html').end(landingHTML));
}

app.listen(ADDON_PORT, '0.0.0.0', () => {
  const localIP = getLocalIP();
  console.log('');
  console.log('=== Addon Pipocas.TV Legendas ===');
  console.log('  Mesma máquina:  http://localhost:' + ADDON_PORT + '/manifest.json');
  console.log('  Outra máquina:  http://' + localIP + ':' + ADDON_PORT + '/manifest.json');
  console.log('  No Stremio (TV/telemóvel): adiciona o URL da outra máquina.');
  console.log('  Configura utilizador e palavra-passe Pipocas na primeira vez.');
  console.log('  Se outra máquina não ligar: permite a porta ' + ADDON_PORT + ' no Firewall do Windows.');
  console.log('');
});
