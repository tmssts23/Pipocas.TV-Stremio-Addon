require('dotenv').config();

const { addonBuilder, getRouter } = require('stremio-addon-sdk');
const express = require('express');
const { searchSubtitles, downloadSubtitleById } = require('./pipocas');
const manifest = require('./manifest.json');

const builder = new addonBuilder(manifest);

// Subtitle handler — chamado quando o Stremio pede legendas para um filme/série
builder.defineSubtitlesHandler(async ({ type, id }) => {
  console.log(`[Pipocas.tv] Subtitles requested → type=${type} id=${id}`);

  // O Stremio passa "tt1234567" para filmes, "tt1234567:1:2" para séries
  const [imdbId, season, episode] = id.split(':');

  try {
    const subtitles = await searchSubtitles({ type, imdbId, season, episode });
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

// Montar o router do addon SDK
const addonInterface = builder.getInterface();
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
