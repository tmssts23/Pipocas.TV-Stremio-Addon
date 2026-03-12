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
builder.defineSubtitlesHandler(async ({ type, id, config }) => {
  console.log(`[Pipocas.tv] Subtitles requested → type=${type} id=${id}`);

  const [imdbId, season, episode] = id.split(':');
  const credentials = config && (config.username || config.password) ? config : null;
  const baseUrl = getBaseUrl();

  try {
    const subtitles = await searchSubtitles({
      type,
      imdbId,
      season,
      episode,
      credentials,
      baseUrlForProxy: baseUrl || null,
      configForUrl: credentials || null,
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

// Guardar Host do pedido para construir URLs de legendas (proxy) quando BASE_URL não está definido
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

// Proxy de download de legendas. Suporta:
// - /pipocas/229095.srt (sem credenciais; usa query ?c= se existir)
// - /pipocas/BASE64CONFIG/229095.srt (credenciais no path; Stremio costuma não enviar query)
app.get('/pipocas/:configOrId/:id?', (req, res) => {
  let idStr, credentials = null;
  if (req.params.id != null) {
    const configStr = req.params.configOrId;
    idStr = (req.params.id || '').replace(/\.srt$/i, '');
    try {
      credentials = JSON.parse(Buffer.from(configStr, 'base64url').toString('utf8'));
    } catch (_) {}
  } else {
    idStr = (req.params.configOrId || '').replace(/\.srt$/i, '');
    const c = req.query.c;
    if (c) {
      try {
        credentials = JSON.parse(decodeURIComponent(c));
      } catch (_) {}
    }
  }
  const id = parseInt(idStr, 10);
  if (!id || id <= 0) {
    res.status(404).end('Not found');
    return;
  }
  res.setHeader('Access-Control-Allow-Origin', '*');
  downloadSubtitleById(id, res, credentials);
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
