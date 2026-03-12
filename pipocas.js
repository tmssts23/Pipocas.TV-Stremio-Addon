/**
 * pipocas.js — Scraper para Pipocas.tv
 */

const axios = require('axios');
const cheerio = require('cheerio');
const https = require('https');

const BASE_URL = 'https://pipocas.tv';

// Sessões por credenciais (username ou 'env' para variáveis de ambiente)
const sessions = {};

function getSessionKey(credentials) {
  if (credentials && credentials.username) return credentials.username;
  return '_env';
}

function getSession(credentials) {
  const key = getSessionKey(credentials);
  if (!sessions[key]) {
    sessions[key] = { cookieJar: {}, csrfToken: '', loggedIn: false };
  }
  return sessions[key];
}

function saveCookies(headers, session) {
  if (!headers['set-cookie']) return;
  const jar = session.cookieJar;
  headers['set-cookie'].forEach(cookie => {
    const [pair] = cookie.split(';');
    const [name, ...valueParts] = pair.split('=');
    jar[name.trim()] = valueParts.join('=').trim();
  });
}

function getCookieHeader(session) {
  return Object.entries(session.cookieJar).map(([k, v]) => `${k}=${v}`).join('; ');
}

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'pt-PT,pt;q=0.9,en;q=0.8',
  'Referer': 'https://pipocas.tv/',
};

const client = axios.create({
  baseURL: BASE_URL,
  headers: HEADERS,
  timeout: 20000,
  maxRedirects: 0,        // NÃO seguir redirects automaticamente — controlamos manualmente
  validateStatus: (s) => s < 500,  // aceitar 3xx sem lançar erro
  httpsAgent: new https.Agent({ rejectUnauthorized: false }),
});

async function login(credentials) {
  const creds = credentials || {};
  const username = creds.username || process.env.PIPOCAS_USER;
  const password = creds.password || process.env.PIPOCAS_PASS;
  const session = getSession(credentials);

  if (!username || !password) {
    if (!credentials) {
      console.warn('[Pipocas.tv] ⚠️  Sem credenciais! Configura no Stremio ou define PIPOCAS_USER e PIPOCAS_PASS no .env');
    }
    return false;
  }

  try {
    console.log('[Pipocas.tv] A fazer login...');

    const homeRes = await client.get('/', { headers: HEADERS });
    saveCookies(homeRes.headers, session);
    const $home = cheerio.load(homeRes.data);
    session.csrfToken = $home('meta[name="csrf-token"]').attr('content') || '';

    const loginPageRes = await client.get('/login', {
      headers: { ...HEADERS, 'Cookie': getCookieHeader(session) },
    });
    saveCookies(loginPageRes.headers, session);
    const $login = cheerio.load(loginPageRes.data);
    const loginCsrf = $login('meta[name="csrf-token"]').attr('content')
                   || $login('input[name="_token"]').attr('value')
                   || session.csrfToken;

    if (loginCsrf) {
      session.csrfToken = loginCsrf;
    } else if (session.cookieJar['XSRF-TOKEN']) {
      session.csrfToken = session.cookieJar['XSRF-TOKEN'];
    }

    if (!session.csrfToken) {
      console.warn('[Pipocas.tv] ⚠️  CSRF não encontrado (meta, _token ou cookie XSRF-TOKEN).');
      return false;
    }

    const postRes = await client.post(
      '/login',
      new URLSearchParams({
        _token: session.csrfToken,
        login: username,
        senha: password,
      }).toString(),
      {
        headers: {
          ...HEADERS,
          'Content-Type': 'application/x-www-form-urlencoded',
          'Cookie': getCookieHeader(session),
          'X-CSRF-TOKEN': session.csrfToken,
          'Origin': BASE_URL,
          'Referer': `${BASE_URL}/login`,
        },
      }
    );

    saveCookies(postRes.headers, session);

    if (postRes.status === 302 || postRes.status === 301) {
      const redirectUrl = postRes.headers['location'] || '/';
      const redirectRes = await client.get(redirectUrl, {
        headers: { ...HEADERS, 'Cookie': getCookieHeader(session) },
      });
      saveCookies(redirectRes.headers, session);
    }

    const checkRes = await client.get('/legendas', {
      headers: { ...HEADERS, 'Cookie': getCookieHeader(session) },
    });
    saveCookies(checkRes.headers, session);

    const isLoggedIn = checkRes.status === 200 &&
                       !checkRes.headers['location']?.includes('/login') &&
                       checkRes.data.includes('logout');

    if (isLoggedIn) {
      session.loggedIn = true;
      console.log('[Pipocas.tv] ✅ Login bem-sucedido!');
      return true;
    } else {
      console.error('[Pipocas.tv] ❌ Login falhou. Verifica utilizador/palavra-passe.');
      return false;
    }
  } catch (err) {
    console.error('[Pipocas.tv] ❌ Erro no login:', err.message);
    return false;
  }
}

function filterByIdioma(items, idioma) {
  if (idioma === 'Português BR') return items.filter((item) => item.langLabel === 'BR');
  return items.filter((item) => item.langLabel === 'PT');
}

async function searchSubtitles({ type, imdbId, season, episode, credentials, baseUrlForProxy, configForUrl, idioma }) {
  const session = getSession(credentials);
  if (!session.loggedIn) await login(credentials);

  const imdbNumeric = imdbId.replace(/^tt/i, '');
  const url = `${BASE_URL}/legendas?t=imdb&s=${imdbNumeric}&l=todas`;

  const items = await scrapePage(url, season, episode, credentials);
  const filtered = filterByIdioma(items, idioma || 'Português PT');
  const subtitles = filtered.map(({ subId, name, lang, langLabel }) => {
    let subtitleUrl;
    if (baseUrlForProxy && baseUrlForProxy.replace) {
      const base = baseUrlForProxy.replace(/\/$/, '');
      subtitleUrl = configForUrl
        ? `${base}/pipocas/${subId}.srt?c=${encodeURIComponent(JSON.stringify(configForUrl))}`
        : `${base}/pipocas/${subId}.srt`;
    } else {
      subtitleUrl = `${BASE_URL}/legendas/download/${subId}`;
    }
    return {
      id: `pipocas-${subId}`,
      url: subtitleUrl,
      lang: lang,
      name,
    };
  });
  console.log(`[Pipocas.tv] Total: ${subtitles.length} legendas para ${imdbId} (idioma: ${idioma || 'Português PT'})`);
  return subtitles;
}

async function scrapePage(url, season, episode, credentials) {
  const subtitles = [];
  const session = getSession(credentials);

  try {
    console.log(`[Pipocas.tv] A pesquisar: ${url}`);

    const response = await client.get(url, {
      headers: { ...HEADERS, 'Cookie': getCookieHeader(session) },
    });

    saveCookies(response.headers, session);

    if (response.headers['location']?.includes('/login') || response.data.includes('<title>Login')) {
      session.loggedIn = false;
      const ok = await login(credentials);
      if (!ok) return subtitles;
      return scrapePage(url, season, episode, credentials);
    }

    const occurrences = (response.data.match(/\/legendas\/download\//g) || []).length;
    console.log(`[Pipocas.tv] Links de download encontrados no HTML: ${occurrences}`);

    const $ = cheerio.load(response.data);

    $('a[href*="/legendas/download/"]').each((i, el) => {
      const $link = $(el);
      const href = $link.attr('href');
      const subId = href.match(/\/legendas\/download\/(\d+)/)?.[1];
      if (!subId) return;

      const $block = $link.closest('.col-md-12').parent();

      const release = $block.find('h3.title .font-normal').first().text().trim()
                   || $block.find('.font-normal').first().text().trim()
                   || `Legenda #${subId}`;

      let langLabel = 'PT';
      $block.find('img[src*="flag-"]').each((_, flag) => {
        const src = $(flag).attr('src') || '';
        if (src.includes('flag-brazil')) langLabel = 'BR';
        else if (src.includes('flag-portugal')) langLabel = 'PT';
      });

      if (season && episode) {
        const s = String(season).padStart(2, '0');
        const e = String(episode).padStart(2, '0');
        const pattern = new RegExp(`[Ss]${s}[Ee]${e}|${Number(season)}x${e}`, 'i');
        if (!pattern.test(release)) return;
      }

      console.log(`  → [${langLabel}] ${release} (id=${subId})`);

      subtitles.push({
        subId,
        lang: 'por',
        langLabel,
        name: `🍿 [${langLabel}] ${release.substring(0, 60)}`,
      });
    });

  } catch (err) {
    console.error(`[Pipocas.tv] Erro:`, err.message);
  }

  return subtitles;
}

async function downloadSubtitleById(id, res, credentials) {
  const session = getSession(credentials);
  if (!session.loggedIn) await login(credentials);
  const url = `${BASE_URL}/legendas/download/${id}`;
  try {
    const response = await client.get(url, {
      responseType: 'stream',
      headers: { ...HEADERS, 'Cookie': getCookieHeader(session) },
    });
    res.setHeader('Content-Type', 'application/x-subrip; charset=utf-8');
    response.data.pipe(res);
  } catch (err) {
    console.error(`[Pipocas.tv] Erro ao descarregar legenda ${id}:`, err.message);
    res.statusCode = 502;
    res.end('Erro ao obter legenda');
  }
}

login().catch(() => {});

module.exports = { searchSubtitles, login, downloadSubtitleById };
