/**
 * pipocas.js — Scraper para Pipocas.tv
 */

const axios = require('axios');
const cheerio = require('cheerio');
const https = require('https');
const AdmZip = require('adm-zip');
const unrar = require('node-unrar-js');

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

// Indica se o texto tem padrão de "dois episódios" (ex: E05E06, E05.E06, E01E02)
function releaseHasTwoEpisodes(text) {
  if (!text || typeof text !== 'string') return false;
  return /[Ee]\d{1,2}[\s.\-]*[Ee]\d{1,2}|[Ee]\d{1,2}\s*[-–]\s*[Ee]?\d{1,2}/.test(text);
}

// Só mostrar legendas "dois episódios" quando o ficheiro de vídeo também indica dois episódios
function videoMatchesTwoEpisodeRelease(videoFileName, releaseName) {
  if (!videoFileName || typeof videoFileName !== 'string') return false;
  const m = (releaseName || '').match(/[Ee](\d{1,2})[\s.\-]*[Ee](\d{1,2})/);
  if (!m) return false;
  const [_, a, b] = m;
  const norm = (x, y) => `e${x.padStart(2, '0')}e${y.padStart(2, '0')}`.toLowerCase();
  const pattern = norm(a, b);
  const alt = `e${a}e${b}`.toLowerCase();
  const v = videoFileName.toLowerCase();
  return v.includes(pattern) || v.includes(alt) || v.includes(`e${a}e${b}`);
}

// Verifica se o nome do ficheiro (.srt) corresponde ao episódio pedido (ex: S01E05, 1x05)
function filenameMatchesEpisode(filename, season, episode) {
  if (!filename || season == null || episode == null) return false;
  const s = String(season);
  const e = String(episode);
  const s2 = s.padStart(2, '0');
  const e2 = e.padStart(2, '0');
  const n = filename.replace(/\s/g, '');
  const re = new RegExp(
    `[Ss]\\s*${s}\\s*[Ee]\\s*${e}\\b|` +
    `[Ss]\\s*${s2}\\s*[Ee]\\s*${e2}\\b|` +
    `[Ss]\\s*${s2}\\s*[Ee]\\s*${e}\\b|` +
    `[Ss]\\s*${s2}\\s*[Ee]\\s*${e2}(?=[Ee]\\d|\\D|$)|` + // S01E05 em S01E05E06
    `\\b${s}\\s*[xX]\\s*${e}\\b|` +
    `\\b${s}\\s*[xX]\\s*${e2}\\b|` +
    `[Ee]p?\\.?\\s*${e}\\b|` +
    `episodio\\s*${e}|` +
    `episode\\s*${e}`,
    'i'
  );
  return re.test(n) || re.test(filename);
}

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

async function searchSubtitles({ type, imdbId, season, episode, credentials, baseUrlForProxy, configForUrl, videoFileName }) {
  const session = getSession(credentials);
  if (!session.loggedIn) await login(credentials);

  const imdbNumeric = imdbId.replace(/^tt/i, '');
  const url = `${BASE_URL}/legendas?t=imdb&s=${imdbNumeric}&l=todas`;

  const rawItems = await scrapePage(url, season, episode, credentials, videoFileName);
  const resolved = [];
  for (const item of rawItems) {
    const list = await resolveEntryToSubtitles(item.subId, credentials, season, episode, item.name, item.langLabel, videoFileName);
    resolved.push(...list);
  }
  const subtitles = resolved.map(({ subId, fileIndex, name, lang, langLabel }) => {
    let subtitleUrl;
    if (baseUrlForProxy && baseUrlForProxy.replace) {
      const base = baseUrlForProxy.replace(/\/$/, '');
      const params = new URLSearchParams();
      if (season != null) params.set('season', String(season));
      if (episode != null) params.set('episode', String(episode));
      if (fileIndex != null) params.set('fileIndex', String(fileIndex));
      const query = params.toString() ? `?${params}` : '';
      if (configForUrl) {
        const configEnc = Buffer.from(JSON.stringify(configForUrl), 'utf8').toString('base64url');
        subtitleUrl = `${base}/pipocas/${configEnc}/${subId}.srt${query}`;
      } else {
        subtitleUrl = `${base}/pipocas/${subId}.srt${query}`;
      }
    } else {
      subtitleUrl = `${BASE_URL}/legendas/download/${subId}`;
    }
    return {
      id: `pipocas-${subId}-${fileIndex != null ? fileIndex : 0}`,
      url: subtitleUrl,
      lang: lang,
      name,
    };
  });
  console.log(`[Pipocas.tv] Total: ${subtitles.length} legendas para ${imdbId} (PT+BR)`);
  return subtitles;
}

async function scrapePage(url, season, episode, credentials, videoFileName) {
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
      return scrapePage(url, season, episode, credentials, videoFileName);
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
      const textToMatch = (release + ' ' + blockText).trim();

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
        // Legendas "dois episódios" (ex: E05E06) só quando o vídeo também indica dois episódios
        if (releaseHasTwoEpisodes(textToMatch) && !videoMatchesTwoEpisodeRelease(videoFileName, release)) {
          return;
        }
        // Episódio específico (ex: S01E05, 1x5)
        const reEpisode = new RegExp(
          `[Ss]\\s*${sNum}\\s*[Ee]\\s*${eNum}\\b|` +
          `[Ss]\\s*${s2}\\s*[Ee]\\s*${e2}\\b|` +
          `[Ss]\\s*${s2}\\s*[Ee]\\s*${eNum}\\b|` +
          `\\b${sNum}\\s*[xX]\\s*${eNum}\\b|` +
          `\\b${sNum}\\s*[xX]\\s*${e2}\\b|` +
          `\\b${sNum}\\s*[.Ee]\\s*${eNum}\\b`,
          'i'
        );
        // Pack da temporada completa (ex: S01, S01.HDTV — sem Exx no nome)
        const reSeasonPack = new RegExp(
          `\\b[Ss]\\s*0?${sNum}\\b(?!\\s*[Ee]\\d)`,
          'i'
        );
        const matchesEpisode = reEpisode.test(textToMatch);
        const matchesSeasonPack = reSeasonPack.test(textToMatch);
        if (!matchesEpisode && !matchesSeasonPack) return;

        const isPack = matchesSeasonPack || releaseHasTwoEpisodes(textToMatch);
        console.log(`  → [${langLabel}] ${release} (id=${subId})${isPack ? ' [pack]' : ''}`);
        subtitles.push({
          subId,
          lang: 'por',
          langLabel,
          name: `🍿 [${langLabel}] ${release.substring(0, 60)}`,
          isPack,
        });
        return;
      }

      console.log(`  → [${langLabel}] ${release} (id=${subId})`);
      subtitles.push({
        subId,
        lang: 'por',
        langLabel,
        name: `🍿 [${langLabel}] ${release.substring(0, 60)}`,
        isPack: false,
      });
    });

  } catch (err) {
    console.error(`[Pipocas.tv] Erro:`, err.message);
  }

  return subtitles;
}

function pickSrtFromPack(srtEntries, season, episode, isZip) {
  if (!srtEntries || srtEntries.length === 0) return null;
  if (srtEntries.length === 1) return isZip ? srtEntries[0] : srtEntries[0].name;
  const getName = (e) => (isZip ? (e.entryName || '').replace(/^.*[/\\]/, '') : (e.name || '').replace(/^.*[/\\]/, ''));
  const match = srtEntries.find((e) => filenameMatchesEpisode(getName(e), season, episode));
  if (match) return isZip ? match : match.name;
  return isZip ? srtEntries[0] : srtEntries[0].name;
}

// De um buffer (ZIP/RAR ou ficheiro único) obtém a lista de .srt que interessam para o episódio.
// Retorna { type: 'single' | 'zip' | 'rar', entries: [{ fileIndex, fileName, entry? }] }.
// entry só existe para ZIP (para depois getData()). Para RAR só temos fileName.
async function getMatchingSrtList(body, season, episode) {
  const getName = (e, isZip) => (isZip ? (e.entryName || '') : (e.name || '')).replace(/^.*[/\\]/, '');
  const filter = (list, isZip) => {
    let srtList = list.filter((e) => (isZip ? !e.isDirectory : !e.flags.directory) && (isZip ? (e.entryName || '') : (e.name || '')).toLowerCase().endsWith('.srt'));
    if (season != null && episode != null) {
      srtList = srtList.filter((e) => filenameMatchesEpisode(getName(e, isZip), season, episode));
    }
    return srtList.sort((a, b) => getName(a, isZip).localeCompare(getName(b, isZip)));
  };

  if (body.length >= 2 && body[0] === 0x50 && body[1] === 0x4B) {
    const zip = new AdmZip(body);
    const srtEntries = filter(zip.getEntries(), true);
    return {
      type: 'zip',
      entries: srtEntries.map((entry, i) => ({ fileIndex: i, fileName: getName(entry, true), entry })),
    };
  }
  if (body.length >= 7 && body[0] === 0x52 && body[1] === 0x61 && body[2] === 0x72 && body[3] === 0x21 && body[4] === 0x1A && body[5] === 0x07) {
    const extractor = await unrar.createExtractorFromData({ data: body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength) });
    const list = extractor.getFileList();
    const srtHeaders = filter([...list.fileHeaders], false);
    return {
      type: 'rar',
      entries: srtHeaders.map((h, i) => ({ fileIndex: i, fileName: getName(h, false), entryName: h.name })),
    };
  }
  return { type: 'single', entries: [{ fileIndex: 0, fileName: null }] };
}

// Descarrega um item (subId) e devolve a lista de legendas a mostrar: cada .srt que interessa (nunca "o pack").
// Ficheiros .srt cujo nome indica dois episódios (ex: E05E06) só entram se o vídeo também for dois episódios.
async function resolveEntryToSubtitles(subId, credentials, season, episode, displayName, langLabel, videoFileName) {
  const session = getSession(credentials);
  if (!session.loggedIn) await login(credentials);
  const url = `${BASE_URL}/legendas/download/${subId}`;
  try {
    const response = await client.get(url, {
      responseType: 'arraybuffer',
      headers: { ...HEADERS, 'Cookie': getCookieHeader(session) },
    });
    const body = Buffer.from(response.data);
    const { type, entries } = await getMatchingSrtList(body, season, episode);

    if (entries.length === 0) {
      return [];
    }
    if (type === 'single') {
      return [{ subId, fileIndex: null, fileName: null, name: displayName, lang: 'por', langLabel }];
    }
    let list = entries.map(({ fileIndex, fileName }) => ({
      subId,
      fileIndex,
      fileName: fileName || '',
      name: `🍿 [${langLabel}] ${(fileName || displayName).substring(0, 50)}`,
      lang: 'por',
      langLabel,
    }));
    if (season != null && episode != null && videoFileName != null) {
      list = list.filter((entry) => {
        const fn = entry.fileName || '';
        if (!releaseHasTwoEpisodes(fn)) return true;
        const ok = videoMatchesTwoEpisodeRelease(videoFileName, fn);
        if (!ok) console.log(`[Pipocas.tv] Excluída legenda dois episódios (vídeo não é E05E06): ${fn}`);
        return ok;
      });
    } else if (season != null && episode != null) {
      list = list.filter((entry) => {
        const fn = entry.fileName || '';
        if (!releaseHasTwoEpisodes(fn)) return true;
        console.log(`[Pipocas.tv] Excluída legenda dois episódios (vídeo é só um ep.): ${fn}`);
        return false;
      });
    }
    if (entries.length > 0 && list.length === 0) {
      console.log(`[Pipocas.tv] Pack ${subId}: 0 .srt para S${season}E${episode} (após filtros)`);
    }
    return list;
  } catch (err) {
    console.error(`[Pipocas.tv] Erro ao analisar ${subId}:`, err.message);
    return [];
  }
}

async function downloadSubtitleById(id, res, credentials, options = {}) {
  const { season, episode, fileIndex } = options;
  const session = getSession(credentials);
  if (!session.loggedIn) await login(credentials);
  const url = `${BASE_URL}/legendas/download/${id}`;
  try {
    const response = await client.get(url, {
      responseType: 'arraybuffer',
      headers: { ...HEADERS, 'Cookie': getCookieHeader(session) },
    });
    const body = Buffer.from(response.data);
    const idx = fileIndex != null ? Number(fileIndex) : 0;
    const { type, entries } = await getMatchingSrtList(body, season, episode);

    if (entries.length === 0) {
      res.statusCode = 404;
      res.end('Nenhum .srt encontrado para este episódio');
      return;
    }
    const chosen = entries[idx] != null ? entries[idx] : entries[0];

    let out = body;
    if (type === 'zip' && chosen.entry) {
      out = chosen.entry.getData();
    } else if (type === 'rar' && (chosen.entryName || chosen.fileName)) {
      const extractor = await unrar.createExtractorFromData({ data: body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength) });
      const nameToExtract = chosen.entryName || chosen.fileName;
      const extracted = extractor.extract({ files: [nameToExtract] });
      const files = [...extracted.files];
      const first = files.find((f) => f.extraction);
      if (first && first.extraction) out = Buffer.from(first.extraction);
      else {
        res.statusCode = 502;
        res.end('Erro ao extrair do RAR');
        return;
      }
    }

    res.setHeader('Content-Type', 'application/x-subrip; charset=utf-8');
    res.end(out);
  } catch (err) {
    console.error(`[Pipocas.tv] Erro ao descarregar legenda ${id}:`, err.message);
    res.statusCode = 502;
    res.end('Erro ao obter legenda');
  }
}

login().catch(() => {});

module.exports = { searchSubtitles, login, downloadSubtitleById };
