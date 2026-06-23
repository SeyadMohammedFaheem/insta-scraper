/**
 * dashboard.js — Lightweight HTTP dashboard to view scraped data.
 * No framework — pure Node http module.
 */

import http from 'http';
import config from './config.js';
import logger from './logger.js';
import { loadPosts, loadHistory, getSummary } from './storage.js';

function json(res, data, status = 200) {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
  res.end(JSON.stringify(data, null, 2));
}

function html(res, body) {
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(body);
}

function dashboardHTML(summary, allPosts) {
  const userCards = Object.entries(allPosts).map(([user, posts]) => {
    const postItems = posts.slice(0, 20).map(p => {
      const imgSrc = p.shortcode ? `https://www.instagram.com/p/${p.shortcode}/media/?size=l` : p.thumbnailUrl;
      return `
      <div class="post-card">
        ${imgSrc ? `<img src="${imgSrc}" alt="" loading="lazy" />` : '<div class="no-img">No Image</div>'}
        <div class="post-info">
          <span class="type-badge ${p.type}">${p.type}</span>
          <p class="caption">${escapeHtml((p.caption || '').slice(0, 120))}${(p.caption?.length || 0) > 120 ? '…' : ''}</p>
          <div class="meta">
            <span>❤ ${p.likes || 0}</span>
            <span>💬 ${p.comments || 0}</span>
            ${p.isVideo ? `<span>👁 ${p.videoViewCount || 0}</span>` : ''}
          </div>
          <a href="${p.permalink}" target="_blank" rel="noopener">View on IG →</a>
        </div>
      </div>
    `).join('');

    return `
      <section class="user-section">
        <h2>@${user} <span class="count">(${posts.length} posts)</span></h2>
        <div class="posts-grid">${postItems}</div>
      </section>
    `;
  }).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Insta-Scraper Dashboard</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0a0a0a; color: #e0e0e0; min-height: 100vh; }
    header { background: linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%); padding: 2rem; text-align: center; border-bottom: 1px solid #ffffff10; }
    header h1 { font-size: 1.8rem; background: linear-gradient(90deg, #e94560, #c23616); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
    header p { color: #888; margin-top: 0.5rem; font-size: 0.9rem; }
    .container { max-width: 1200px; margin: 0 auto; padding: 2rem; }
    .user-section { margin-bottom: 3rem; }
    .user-section h2 { font-size: 1.4rem; margin-bottom: 1rem; color: #fff; }
    .user-section .count { color: #666; font-weight: 400; font-size: 0.9rem; }
    .posts-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 1.2rem; }
    .post-card { background: #141414; border: 1px solid #222; border-radius: 12px; overflow: hidden; transition: transform 0.2s, border-color 0.2s; }
    .post-card:hover { transform: translateY(-4px); border-color: #e94560; }
    .post-card img { width: 100%; height: 200px; object-fit: cover; }
    .no-img { height: 200px; display: flex; align-items: center; justify-content: center; background: #1a1a1a; color: #444; }
    .post-info { padding: 1rem; }
    .type-badge { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 0.7rem; text-transform: uppercase; font-weight: 600; margin-bottom: 0.5rem; }
    .type-badge.image { background: #0f3460; color: #64b5f6; }
    .type-badge.video { background: #4a1942; color: #ce93d8; }
    .type-badge.carousel { background: #1b4332; color: #81c784; }
    .caption { font-size: 0.85rem; color: #aaa; line-height: 1.4; margin-bottom: 0.5rem; word-break: break-word; }
    .meta { display: flex; gap: 1rem; font-size: 0.8rem; color: #666; margin-bottom: 0.5rem; }
    .post-info a { color: #e94560; text-decoration: none; font-size: 0.8rem; }
    .post-info a:hover { text-decoration: underline; }
    .api-info { background: #141414; border: 1px solid #222; border-radius: 12px; padding: 1.5rem; margin-bottom: 2rem; }
    .api-info h3 { color: #e94560; margin-bottom: 0.5rem; }
    .api-info code { background: #1a1a1a; padding: 2px 6px; border-radius: 4px; font-size: 0.85rem; color: #81c784; }
  </style>
</head>
<body>
  <header>
    <h1>📸 Insta-Scraper Dashboard</h1>
    <p>Last cycle: ${summary?.timestamp || 'Never'}</p>
  </header>
  <div class="container">
    <div class="api-info">
      <h3>API Endpoints</h3>
      <p><code>GET /api/posts/:username</code> — JSON posts for a user</p>
      <p><code>GET /api/summary</code> — Last scrape cycle summary</p>
      <p><code>GET /api/history/:username</code> — Scrape history</p>
    </div>
    ${userCards || '<p style="color:#666">No data yet. Run a scrape first.</p>'}
  </div>
</body>
</html>`;
}

function escapeHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

async function handler(req, res) {
  const url = new URL(req.url, `http://localhost:${config.dashboardPort}`);

  if (url.pathname.startsWith('/api/posts/')) {
    const user = url.pathname.split('/').pop();
    const posts = await loadPosts(user);
    return json(res, posts);
  }
  if (url.pathname.startsWith('/api/history/')) {
    const user = url.pathname.split('/').pop();
    const history = await loadHistory(user);
    return json(res, history);
  }
  if (url.pathname === '/api/summary') {
    const summary = await getSummary();
    return json(res, summary || { message: 'No scrape data yet' });
  }
  if (url.pathname === '/') {
    const summary = await getSummary();
    const allPosts = {};
    for (const user of config.usernames) {
      allPosts[user] = await loadPosts(user);
    }
    return html(res, dashboardHTML(summary, allPosts));
  }
  res.writeHead(404);
  res.end('Not found');
}

const server = http.createServer(handler);
server.listen(config.dashboardPort, () => {
  logger.banner(`Dashboard running → http://localhost:${config.dashboardPort}`);
});
