/**
 * pipocas.js — Scraper para Pipocas.tv
 */

const axios = require('axios');
const cheerio = require('cheerio');
const https = require('https');
const AdmZip = require('adm-zip');

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
        username,
        password,
        remember: '1',
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

async function searchSubtitles({ type, imdbId, season, episode, credentials, baseUrlForProxy, configForUrl }) {
  const session = getSession(credentials);
  if (!session.loggedIn) await login(credentials);

  const imdbNumeric = imdbId.replace(/^tt/i, '');
  const url = `${BASE_URL}/legendas?t=imdb&s=${imdbNumeric}&l=todas`;

  const items = await scrapePage(url, season, episode, credentials);
  const subtitles = items.map(({ subId, name, lang, langLabel }) => {
    let subtitleUrl;
    if (baseUrlForProxy && baseUrlForProxy.replace) {
      const base = baseUrlForProxy.replace(/\/$/, '');
      if (configForUrl) {
        const configEnc = Buffer.from(JSON.stringify(configForUrl), 'utf8').toString('base64url');
        subtitleUrl = `${base}/pipocas/${configEnc}/${subId}.srt`;
      } else {
        subtitleUrl = `${base}/pipocas/${subId}.srt`;
      }
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
  console.log(`[Pipocas.tv] Total: ${subtitles.length} legendas para ${imdbId} (PT+BR)`);
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

    const html = typeof response.data === 'string' ? response.data : (response.data && response.data.toString ? response.data.toString() : '');
    const isLoginPage = response.headers['location']?.includes('/login') || html.includes('<title>Login');
    const occurrences = (html.match(/\/legendas\/download\//g) || []).length;

    if (occurrences > 0) {
      console.log(`[Pipocas.tv] Links de download encontrados no HTML: ${occurrences}`);
    } else if (isLoginPage) {
      session.loggedIn = false;
      const ok = await login(credentials);
      if (!ok) {
        console.warn('[Pipocas.tv] ⚠️  Página exige login e as credenciais falharam. Tenta configurar no Stremio.');
        return subtitles;
      }
      return scrapePage(url, season, episode, credentials);
    } else {
      console.log(`[Pipocas.tv] Nenhum link de download na página (${occurrences}).`);
    }

    const $ = cheerio.load(html);

    $('a[href*="/legendas/download/"]').each((i, el) => {
      const $link = $(el);
      const href = $link.attr('href');
      const subId = href.match(/\/legendas\/download\/(\d+)/)?.[1];
      if (!subId) return;

      const $block = $link.closest('.col-md-12').parent();

      const release = $block.find('h3.title .font-normal').first().text().trim()
                   || $block.find('.font-normal').first().text().trim()
                   || $block.find('h3.title').first().text().trim()
                   || `Legenda #${subId}`;
      const blockText = (season && episode) ? $block.text() : '';

      let langLabel = 'PT';
      $block.find('img[src*="flag-"]').each((_, flag) => {
        const src = $(flag).attr('src') || '';
        if (src.includes('flag-brazil')) langLabel = 'BR';
        else if (src.includes('flag-portugal')) langLabel = 'PT';
      });

      if (season && episode) {
        const sNum = Number(season);
        const eNum = Number(episode);
        const s2 = String(season).padStart(2, '0');
        const e2 = String(episode).padStart(2, '0');
        const re = new RegExp(
          `[Ss]\\s*${sNum}\\s*[Ee]\\s*${eNum}\\b|` +
          `[Ss]\\s*${s2}\\s*[Ee]\\s*${e2}\\b|` +
          `[Ss]\\s*${s2}\\s*[Ee]\\s*${eNum}\\b|` +
          `\\b${sNum}\\s*[xX]\\s*${eNum}\\b|` +
          `\\b${sNum}\\s*[xX]\\s*${e2}\\b|` +
          `\\b${sNum}\\s*[.Ee]\\s*${eNum}\\b`,
          'i'
        );
        const textToMatch = (release + ' ' + blockText).trim();
        if (!re.test(textToMatch)) return;
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
      responseType: 'arraybuffer',
      headers: { ...HEADERS, 'Cookie': getCookieHeader(session) },
    });
    let body = Buffer.from(response.data);
    if (body.length >= 2 && body[0] === 0x50 && body[1] === 0x4B) {
      const zip = new AdmZip(body);
      const entries = zip.getEntries();
      const srtEntry = entries.find((e) => e.entryName.toLowerCase().endsWith('.srt'));
      const entry = srtEntry || entries[0];
      if (entry) body = entry.getData();
    }
    res.setHeader('Content-Type', 'application/x-subrip; charset=utf-8');
    res.end(body);
  } catch (err) {
    console.error(`[Pipocas.tv] Erro ao descarregar legenda ${id}:`, err.message);
    res.statusCode = 502;
    res.end('Erro ao obter legenda');
  }
}

login().catch(() => {});

module.exports = { searchSubtitles, login, downloadSubtitleById };
