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
  usernames: ['ufbrand_salwar'],

  /** Cron expression for auto-scrape (default: every 6 hrs) */
  cronSchedule: '0 13,19 * * *',

  /** Maximum posts to fetch per user per cycle */
  maxPostsPerUser: 20,

  /** Delay between HTTP requests (ms) to stay under rate limits */
  requestDelayMs: 5000,

  /** Directory to persist scraped data */
  dataDir: path.resolve(ROOT, './data'),

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
