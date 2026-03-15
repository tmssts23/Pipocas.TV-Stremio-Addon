require('dotenv').config();

const { addonBuilder, getRouter } = require('stremio-addon-sdk');
const landingTemplate = require('stremio-addon-sdk/src/landingTemplate');
const express = require('express');
const { searchSubtitles, downloadSubtitleById } = require('./pipocas');
const manifest = require('./manifest.json');

const builder = new addonBuilder(manifest);

// Base URL do addon (para links de legendas). Inferido do Host do pedido quando não definido em env.
let inferredBaseUrl = '';

function getBaseUrl() {
  const fromEnv = (process.env.BASE_URL || (process.env.RAILWAY_PUBLIC_DOMAIN && `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`) || inferredBaseUrl || '').replace(/\/$/, '');
  return fromEnv;
}

// Subtitle handler — chamado quando o Stremio pede legendas para um filme/série
// config = { username, password } quando o utilizador configurou o addon no Stremio
builder.defineSubtitlesHandler(async ({ type, id, config, extra }) => {
  // Log sem dados de utilizador (sem IP, sem identificadores de cliente)
  console.log(`[Pipocas.tv] Pedido de legendas → type=${type} id=${id}`);

  const [imdbId, season, episode] = id.split(':');
  const credentials = config && (config.username || config.password) ? config : null;
  const baseUrl = getBaseUrl();
  const videoFileName = (extra && extra.filename) || null;
  if (!credentials) {
    console.log('[Pipocas.tv] Sem credenciais — configura o addon no Stremio com o teu utilizador e palavra-passe do Pipocas.tv.');
  }

  try {
    const subtitles = await searchSubtitles({
      type,
      imdbId,
      season,
      episode,
      credentials,
      baseUrlForProxy: baseUrl || null,
      configForUrl: credentials || null,
      videoFileName,
    });
    console.log(`[Pipocas.tv] Encontradas ${subtitles.length} legendas`);
    return { subtitles };
  } catch (err) {
    console.error('[Pipocas.tv] Erro:', err.message);
    return { subtitles: [] };
  }
});

// Criar servidor Express com CORS correto para o Stremio
const app = express();

// Segurança/privacidade: nunca registar nem reenviar IP do cliente, X-Forwarded-For ou outros
// dados que permitam identificar ou rastrear utilizadores. O Host é usado só para construir
// URLs do proxy de legendas e não é guardado em log.
app.use((req, res, next) => {
  const host = req.get('host');
  if (host) {
    const protocol = req.get('x-forwarded-proto') || req.protocol || 'https';
    inferredBaseUrl = (protocol === 'https' ? 'https' : 'http') + '://' + host;
  }
  next();
});

// CORS — obrigatório para o Stremio conseguir aceder ao addon (inclui o proxy de legendas)
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', '*');
  next();
});

// Cache curto no manifest para o Stremio atualizar o addon quando há nova versão
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

const addonInterface = builder.getInterface();
const hasConfig = !!(addonInterface.manifest.config || []).length;
const landingHTML = landingTemplate(addonInterface.manifest);

// Páginas de configuração (antes do router do addon)
app.get('/', (_, res) => {
  if (hasConfig) res.redirect(302, '/configure');
  else res.setHeader('Content-Type', 'text/html').end(landingHTML);
});
app.get('/configure', (_, res) => {
  res.setHeader('Content-Type', 'text/html').end(landingHTML);
});

// Proxy de download: /pipocas/228879.srt?season=5&episode=1&fileIndex=0&c=BASE64URL (credenciais em ?c= para evitar / no path e bloqueio Chrome)
app.get('/pipocas/:id', (req, res) => {
  const idStr = (req.params.id || '').replace(/\.srt$/i, '');
  let credentials = null;
  const c = req.query.c;
  if (c) {
    try {
      credentials = JSON.parse(Buffer.from(String(c), 'base64url').toString('utf8'));
    } catch (_) {
      try {
        credentials = JSON.parse(decodeURIComponent(String(c)));
      } catch (_) {}
    }
  }
  const id = parseInt(idStr, 10);
  if (!id || id <= 0) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.status(404).end('Not found');
    return;
  }
  const options = {};
  if (req.query.season != null) options.season = req.query.season;
  if (req.query.episode != null) options.episode = req.query.episode;
  if (req.query.fileIndex != null) options.fileIndex = req.query.fileIndex;
  res.setHeader('Access-Control-Allow-Origin', '*');
  downloadSubtitleById(id, res, credentials, options);
});

// Router do addon SDK (manifest, subtitles, etc.)
app.use('/', getRouter(addonInterface));

const PORT = process.env.PORT || 7000;

if (require.main === module) {
  app.listen(PORT, () => {
    console.log('\n🍿 Pipocas.tv Stremio Addon a correr!');
    console.log('─────────────────────────────────────────');
    console.log(`📡 URL do Addon: http://127.0.0.1:${PORT}/manifest.json`);
    console.log('─────────────────────────────────────────');
    console.log('Para instalar no Stremio, vai a:');
    console.log('  Definições → Addons → "Add addon"');
    console.log(`  Cola: http://127.0.0.1:${PORT}/manifest.json`);
    console.log('─────────────────────────────────────────\n');
  });
}

module.exports = { addonInterface, downloadSubtitleById };
