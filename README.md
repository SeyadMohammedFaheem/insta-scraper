# 📸 Insta-Scraper

Lightweight Node.js Instagram public post scraper.

**No login. No API key. No browser. No Puppeteer.**

Uses only HTTP requests + HTML/JSON parsing to extract public post data from Instagram.

---

## Features

- 🔓 **No authentication** — scrapes only public profiles
- 🚀 **4-strategy fallback chain** — Web Profile Info → GraphQL → HTML parsing → Embed pages
- 🔄 **Auto-update** — cron scheduler (default: every 6 hours)
- 📊 **Web dashboard** — dark-mode UI to browse scraped data
- 📦 **JSON API** — `GET /api/posts/:username`
- 🧩 **Carousel support** — extracts all media from multi-image posts
- 🎬 **Video/Reel support** — captures video URLs and view counts
- 🛡️ **Rate-limit aware** — UA rotation, request delays, retry with backoff
- 💾 **Deduplication** — merges new data with existing, no duplicates
- 🪶 **3 dependencies** — cheerio, node-cron, dotenv

---

## Quick Start

```bash
# 1. Install
npm install

# 2. Configure usernames
#    Edit .env → USERNAMES=user1,user2

# 3. One-shot scrape
npm run scrape

# 4. Auto-scraping mode (every 6 hrs)
npm start

# 5. View dashboard
npm run dashboard
# → http://localhost:3000
```

---

## CLI Usage

```bash
# Scrape specific users
node src/cli.js natgeo nasa spacex

# Scrape a single post by shortcode
node src/cli.js --post CxABC123def
```

---

## Configuration (.env)

| Variable | Default | Description |
|----------|---------|-------------|
| `USERNAMES` | — | Comma-separated public usernames |
| `CRON_SCHEDULE` | `0 */6 * * *` | Cron expression for auto-scrape |
| `MAX_POSTS_PER_USER` | `12` | Max posts fetched per user per cycle |
| `REQUEST_DELAY_MS` | `3000` | Delay between requests (ms) |
| `DATA_DIR` | `./data` | Output directory |
| `DASHBOARD_PORT` | `3000` | Dashboard server port |

---

## Output Structure

```
data/
├── natgeo/
│   ├── posts.json       # All scraped posts (deduplicated)
│   └── history.json     # Scrape history log
├── nasa/
│   ├── posts.json
│   └── history.json
└── last_cycle.json      # Summary of last scrape run
```

### Post Schema

```json
{
  "postId": "3412345678901234567",
  "shortcode": "CxABC123",
  "username": "natgeo",
  "timestamp": "2025-12-01T10:30:00.000Z",
  "caption": "Amazing photo of...",
  "type": "image | video | carousel",
  "imageUrls": ["https://..."],
  "videoUrls": ["https://..."],
  "thumbnailUrl": "https://...",
  "likes": 45230,
  "comments": 1203,
  "isVideo": false,
  "videoViewCount": 0,
  "permalink": "https://www.instagram.com/p/CxABC123/"
}
```

---

## API Endpoints (Dashboard)

| Endpoint | Description |
|----------|-------------|
| `GET /` | Web dashboard |
| `GET /api/posts/:username` | JSON array of posts |
| `GET /api/history/:username` | Scrape history |
| `GET /api/summary` | Last cycle summary |

---

## Scraping Strategy

The scraper tries 4 strategies in order, falling through on failure:

1. **Web Profile Info API** — Instagram's internal API (`/api/v1/users/web_profile_info/`)
2. **GraphQL Query** — Profile page HTML parsing + GraphQL endpoint
3. **Direct JSON** — `?__a=1&__d=dis` query parameter
4. **Embed Pages** — Individual post embed endpoints (`/p/{code}/embed/`)

Each strategy is independent. If one fails (rate-limited, blocked, format changed), the next one tries automatically.

---

## ⚠️ Disclaimer

This tool is for educational and personal use. Respect Instagram's Terms of Service. Only scrape public data. Use responsibly.
