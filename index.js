require('dotenv').config();

const { addonBuilder, getRouter } = require('stremio-addon-sdk');
const landingTemplate = require('stremio-addon-sdk/src/landingTemplate');
const express = require('express');
const { searchSubtitles, downloadSubtitleById } = require('./pipocas');
const manifest = require('./manifest.json');

const builder = new addonBuilder(manifest);

// Subtitle handler — chamado quando o Stremio pede legendas para um filme/série
// config = { username, password } quando o utilizador configurou o addon no Stremio
builder.defineSubtitlesHandler(async ({ type, id, config }) => {
  console.log(`[Pipocas.tv] Subtitles requested → type=${type} id=${id}`);

  const [imdbId, season, episode] = id.split(':');
  const credentials = config && (config.username || config.password) ? config : null;
  const baseUrl = process.env.BASE_URL ? process.env.BASE_URL.replace(/\/$/, '') : '';

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

// CORS — obrigatório para o Stremio conseguir aceder ao addon
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
