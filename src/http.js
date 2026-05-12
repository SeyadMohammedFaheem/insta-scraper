/**
 * HTTP client — uses Node built-in fetch with browser-like headers.
 * Includes retry logic, rate-limit back-off, and User-Agent rotation.
 */

import config from './config.js';
import logger from './logger.js';

// ─── User-Agent pool ───────────────────────────────────────────────
const DEFAULT_USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:128.0) Gecko/20100101 Firefox/128.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 14.5; rv:128.0) Gecko/20100101 Firefox/128.0',
];

const userAgents = config.customUserAgents || DEFAULT_USER_AGENTS;
let uaIndex = 0;

function rotateUA() {
  const ua = userAgents[uaIndex % userAgents.length];
  uaIndex++;
  return ua;
}

// ─── Shared cookies jar (simple) ───────────────────────────────────
let sessionCookies = '';

function extractCookies(response) {
  const raw = response.headers.getSetCookie?.() || [];
  if (raw.length) {
    sessionCookies = raw.map(c => c.split(';')[0]).join('; ');
  }
}

// ─── Core request function ─────────────────────────────────────────
/**
 * Make an HTTP request with browser-like headers.
 * @param {string} url
 * @param {object} [opts]
 * @param {number} [opts.maxRetries=2]
 * @param {boolean} [opts.json=false] — auto-parse JSON
 * @returns {Promise<{status:number, body:string|object, headers:Headers}>}
 */
export async function request(url, opts = {}) {
  const { maxRetries = 2, json = false, extraHeaders = {} } = opts;

  const headers = {
    'User-Agent': rotateUA(),
    'Accept': json
      ? 'application/json, text/plain, */*'
      : 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
    'Accept-Encoding': 'gzip, deflate, br',
    'Cache-Control': 'no-cache',
    'Sec-Fetch-Dest': json ? 'empty' : 'document',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Site': 'none',
    'Sec-Fetch-User': '?1',
    'Upgrade-Insecure-Requests': '1',
    ...(sessionCookies ? { Cookie: sessionCookies } : {}),
    ...extraHeaders,
  };

  let lastError;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      if (attempt > 0) {
        const backoff = Math.min(2000 * Math.pow(2, attempt), 30000);
        logger.warn(`Retry ${attempt}/${maxRetries} after ${backoff}ms …`);
        await sleep(backoff);
      }

      const response = await fetch(url, {
        headers,
        redirect: 'follow',
        signal: AbortSignal.timeout(20000),
      });

      extractCookies(response);

      // Rate limited
      if (response.status === 429) {
        const wait = parseInt(response.headers.get('retry-after') || '60', 10) * 1000;
        logger.warn(`Rate-limited (429). Backing off ${wait / 1000}s …`);
        await sleep(wait);
        continue;
      }

      const body = json ? await response.json() : await response.text();
      return { status: response.status, body, headers: response.headers };
    } catch (err) {
      lastError = err;
      logger.debug(`Request error (attempt ${attempt}): ${err.message}`);
    }
  }

  throw new Error(`Failed after ${maxRetries + 1} attempts: ${lastError?.message}`);
}

// ─── Helpers ───────────────────────────────────────────────────────
export function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

/**
 * Warm up the session by visiting instagram.com first (get cookies/csrftoken).
 */
export async function warmSession() {
  logger.info('Warming session with instagram.com …');
  try {
    await request('https://www.instagram.com/', { maxRetries: 1 });
    logger.success('Session warmed — cookies acquired');
  } catch {
    logger.warn('Session warm-up failed — continuing anyway');
  }
}
