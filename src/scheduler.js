/**
 * scheduler.js — Cron-based auto-scraping every N hours.
 */

import cron from 'node-cron';
import config from './config.js';
import logger from './logger.js';
import { scrapeAll } from './scraper.js';
import { saveAll } from './storage.js';
import { pushToSheets } from './sheets.js';
import { parseAllProducts } from './product-parser.js';

let task = null;

/**
 * Start the cron scheduler.
 */
export function startScheduler() {
  if (!cron.validate(config.cronSchedule)) {
    logger.error(`Invalid cron expression: ${config.cronSchedule}`);
    return;
  }

  logger.info(`Scheduler started — cron: ${config.cronSchedule}`);
  logger.info(`Next scrape will run on schedule. Configured users: ${config.usernames.join(', ')}`);

  task = cron.schedule(config.cronSchedule, async () => {
    logger.info('Scheduled scrape triggered');
    try {
      const results = await scrapeAll();
      const allParsedProducts = [];
      for (const [user, posts] of results.entries()) {
        const parsed = parseAllProducts(posts);
        allParsedProducts.push(...parsed);
      }
      
      await saveAll(results);
      
      if (allParsedProducts.length > 0) {
        await pushToSheets(allParsedProducts);
        logger.success('Scheduled scrape & Sheets push complete');
      } else {
        logger.info('Scheduled scrape complete — no new products to push');
      }
    } catch (err) {
      logger.error(`Scheduled scrape failed: ${err.message}`);
    }
  });

  return task;
}

/**
 * Stop the scheduler.
 */
export function stopScheduler() {
  if (task) {
    task.stop();
    logger.info('Scheduler stopped');
  }
}
