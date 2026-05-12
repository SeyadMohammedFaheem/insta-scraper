/**
 * index.js — Main entry point.
 * Runs an immediate scrape, starts the API server, then cron scheduler.
 */

import config from './config.js';
import logger from './logger.js';
import { scrapeAll } from './scraper.js';
import { saveAll } from './storage.js';
import { startScheduler } from './scheduler.js';
import { startAPI } from './api.js';

async function main() {
  logger.banner('INSTA-SCRAPER v1.0');
  logger.info(`Configured users: ${config.usernames.join(', ')}`);
  logger.info(`Schedule: ${config.cronSchedule}`);
  logger.info(`Max posts/user: ${config.maxPostsPerUser}`);
  logger.info(`Data directory: ${config.dataDir}`);

  if (!config.usernames.length) {
    logger.error('No usernames configured. Set USERNAMES in .env');
    process.exit(1);
  }

  // Start the API server
  startAPI();

  // Run an immediate scrape
  logger.info('Running initial scrape cycle …');
  try {
    const results = await scrapeAll();
    const summary = await saveAll(results);
    for (const [user, stats] of Object.entries(summary.users)) {
      logger.info(`@${user}: ${stats.new} new / ${stats.total} total`);
    }
  } catch (err) {
    logger.error(`Initial scrape failed: ${err.message}`);
  }

  // Start scheduler for recurring scrapes
  startScheduler();

  logger.info('Scraper + API running. Press Ctrl+C to stop.');
}

main().catch(err => {
  logger.error(`Fatal: ${err.message}`);
  process.exit(1);
});
