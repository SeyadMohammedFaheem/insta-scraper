/**
 * Configuration loader — reads .env and provides validated config object.
 */

import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

dotenv.config({ path: path.join(ROOT, '.env') });

const config = {
  /** List of public usernames to scrape */
  usernames: (process.env.USERNAMES || process.env.INSTAGRAM_USERNAME || '')
    .split(',')
    .map(u => u.trim().toLowerCase().replace(/^@/, ''))
    .filter(Boolean),

  /** Cron expression for auto-scrape (default: every 6 hrs) */
  cronSchedule: process.env.CRON_SCHEDULE || '0 */6 * * *',

  /** Maximum posts to fetch per user per cycle */
  maxPostsPerUser: parseInt(process.env.MAX_POSTS_PER_USER, 10) || 50,

  /** Delay between HTTP requests (ms) to stay under rate limits */
  requestDelayMs: parseInt(process.env.REQUEST_DELAY_MS, 10) || 5000,

  /** Directory to persist scraped data */
  dataDir: path.resolve(ROOT, process.env.DATA_DIR || './data'),

  /** Dashboard server port */
  dashboardPort: parseInt(process.env.DASHBOARD_PORT, 10) || 3000,

  /** Custom user-agents (optional) */
  customUserAgents: process.env.CUSTOM_USER_AGENTS
    ? process.env.CUSTOM_USER_AGENTS.split(',').map(s => s.trim())
    : null,

  /** Project root */
  root: ROOT,
};

export default config;
