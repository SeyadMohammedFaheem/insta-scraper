/**
 * api.js — Pure JSON REST API for consuming scraped Instagram data.
 * No dashboard, no HTML — just clean JSON endpoints.
 *
 * Endpoints:
 *   GET  /api/posts/:username          → all stored posts for a user
 *   GET  /api/posts/:username?limit=5  → limit results
 *   GET  /api/posts/:username?type=video → filter by type (image|video|carousel)
 *   GET  /api/latest/:username         → latest post only
 *   GET  /api/summary                  → last scrape cycle summary
 *   GET  /api/history/:username        → scrape history log
 *   GET  /api/users                    → list of configured usernames
 *   POST /api/scrape                   → trigger an immediate scrape
 *   POST /api/scrape/:username         → scrape a specific user on-demand
 *   GET  /api/health                   → health check
 *   GET  /api/media/:username          → flat list of all media URLs
 */

import http from 'http';
import config from './config.js';
import logger from './logger.js';
import { loadPosts, loadHistory, getSummary, savePosts, saveAll } from './storage.js';
import { scrapeUser, scrapeAll } from './scraper.js';

// ─── Helpers ───────────────────────────────────────────────────────

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function json(res, data, status = 200) {
  cors(res);
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data, null, 2));
}

function error(res, message, status = 400) {
  json(res, { error: message }, status);
}

function parseQuery(url) {
  const params = {};
  url.searchParams.forEach((v, k) => { params[k] = v; });
  return params;
}

// ─── Route handler ─────────────────────────────────────────────────

async function handler(req, res) {
  const url = new URL(req.url, `http://localhost:${config.dashboardPort}`);
  const path = url.pathname;
  const query = parseQuery(url);

  // CORS preflight
  if (req.method === 'OPTIONS') {
    cors(res);
    res.writeHead(204);
    return res.end();
  }

  try {
    // ── GET /api/health ──────────────────────────────────────
    if (path === '/api/health') {
      return json(res, {
        status: 'ok',
        uptime: process.uptime(),
        timestamp: new Date().toISOString(),
        configuredUsers: config.usernames,
        cronSchedule: config.cronSchedule,
      });
    }

    // ── GET /api/users ───────────────────────────────────────
    if (path === '/api/users') {
      const users = [];
      for (const username of config.usernames) {
        const posts = await loadPosts(username);
        users.push({
          username,
          postCount: posts.length,
          latestPostDate: posts[0]?.timestamp || null,
        });
      }
      return json(res, { users });
    }

    // ── GET /api/summary ─────────────────────────────────────
    if (path === '/api/summary') {
      const summary = await getSummary();
      return json(res, summary || { message: 'No scrape data yet. Run a scrape first.' });
    }

    // ── GET /api/posts/:username ─────────────────────────────
    if (path.match(/^\/api\/posts\/[^/]+$/)) {
      const username = path.split('/').pop().toLowerCase();
      let posts = await loadPosts(username);

      if (!posts.length) {
        return json(res, { username, posts: [], message: 'No data found. Scrape this user first.' });
      }

      // Filter by type
      if (query.type) {
        posts = posts.filter(p => p.type === query.type);
      }

      // Limit
      if (query.limit) {
        posts = posts.slice(0, parseInt(query.limit, 10));
      }

      // Offset (pagination)
      if (query.offset) {
        posts = posts.slice(parseInt(query.offset, 10));
      }

      return json(res, { username, count: posts.length, posts });
    }

    // ── GET /api/latest/:username ────────────────────────────
    if (path.match(/^\/api\/latest\/[^/]+$/)) {
      const username = path.split('/').pop().toLowerCase();
      const posts = await loadPosts(username);
      const latest = posts[0] || null;
      return json(res, { username, post: latest });
    }

    // ── GET /api/media/:username ─────────────────────────────
    if (path.match(/^\/api\/media\/[^/]+$/)) {
      const username = path.split('/').pop().toLowerCase();
      const posts = await loadPosts(username);
      const media = posts.map(p => ({
        shortcode: p.shortcode,
        type: p.type,
        images: p.imageUrls || [],
        videos: p.videoUrls || [],
        thumbnail: p.thumbnailUrl || '',
        permalink: p.permalink,
      }));
      return json(res, { username, count: media.length, media });
    }

    // ── GET /api/history/:username ───────────────────────────
    if (path.match(/^\/api\/history\/[^/]+$/)) {
      const username = path.split('/').pop().toLowerCase();
      const history = await loadHistory(username);
      return json(res, { username, history });
    }

    // ── POST /api/scrape ─────────────────────────────────────
    if (path === '/api/scrape' && req.method === 'POST') {
      // Non-blocking: start scrape in background
      json(res, { message: 'Scrape started for all configured users', users: config.usernames });
      scrapeAll().then(results => saveAll(results)).catch(err => {
        logger.error(`API-triggered scrape failed: ${err.message}`);
      });
      return;
    }

    // ── POST /api/scrape/:username ───────────────────────────
    if (path.match(/^\/api\/scrape\/[^/]+$/) && req.method === 'POST') {
      const username = path.split('/').pop().toLowerCase();
      json(res, { message: `Scrape started for @${username}` });
      scrapeUser(username).then(posts => savePosts(username, posts)).catch(err => {
        logger.error(`API-triggered scrape for @${username} failed: ${err.message}`);
      });
      return;
    }

    // ── Fallback ─────────────────────────────────────────────
    return json(res, {
      error: 'Not found',
      availableEndpoints: {
        'GET  /api/health': 'Health check + config info',
        'GET  /api/users': 'List configured users with stats',
        'GET  /api/posts/:username': 'All posts (query: ?limit=N&type=image|video|carousel&offset=N)',
        'GET  /api/latest/:username': 'Latest post only',
        'GET  /api/media/:username': 'Flat list of all media URLs',
        'GET  /api/history/:username': 'Scrape history log',
        'GET  /api/summary': 'Last scrape cycle summary',
        'POST /api/scrape': 'Trigger scrape for all users',
        'POST /api/scrape/:username': 'Trigger scrape for one user',
      },
    }, 404);
  } catch (err) {
    logger.error(`API error: ${err.message}`);
    return error(res, 'Internal server error', 500);
  }
}

// ─── Start server ──────────────────────────────────────────────────

export function startAPI() {
  const server = http.createServer(handler);
  server.listen(config.dashboardPort, () => {
    logger.banner(`API server running → http://localhost:${config.dashboardPort}`);
    logger.info('Endpoints:');
    logger.info('  GET  /api/health');
    logger.info('  GET  /api/users');
    logger.info('  GET  /api/posts/:username');
    logger.info('  GET  /api/latest/:username');
    logger.info('  GET  /api/media/:username');
    logger.info('  GET  /api/summary');
    logger.info('  POST /api/scrape');
    logger.info('  POST /api/scrape/:username');
  });
  return server;
}

// Run directly if executed as main module
const isMain = process.argv[1]?.replace(/\\/g, '/').endsWith('api.js');
if (isMain) {
  startAPI();
}
