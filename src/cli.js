/**
 * cli.js — One-shot CLI scraper.
 * Usage:
 *   node src/cli.js                     # scrape all configured users
 *   node src/cli.js username1 username2  # scrape specific users
 *   node src/cli.js --post CODE         # scrape a single post by shortcode
 */

import config from './config.js';
import logger from './logger.js';
import { scrapeUser, scrapeAll, fetchPostDetail } from './scraper.js';
import { savePosts, saveAll } from './storage.js';
import { warmSession } from './http.js';

const args = process.argv.slice(2);

async function main() {
  logger.banner('INSTA-SCRAPER — CLI Mode');

  // Single post mode
  if (args[0] === '--post' && args[1]) {
    await warmSession();
    logger.info(`Fetching post: ${args[1]}`);
    const post = await fetchPostDetail(args[1]);
    if (post) {
      console.log('\n' + JSON.stringify(post, null, 2));
    } else {
      logger.error('Could not fetch post');
    }
    return;
  }

  // Specific usernames from CLI args, or fall back to .env config
  const usernames = args.length
    ? args.map(u => u.trim().toLowerCase().replace(/^@/, ''))
    : config.usernames;

  if (!usernames.length) {
    logger.error('No usernames specified. Pass them as args or set USERNAMES in .env');
    process.exit(1);
  }

  // Override config temporarily
  config.usernames = usernames;

  const results = await scrapeAll();
  const summary = await saveAll(results);

  logger.banner('Results');
  for (const [user, stats] of Object.entries(summary.users)) {
    logger.info(`@${user}: ${stats.new} new / ${stats.total} total`);
  }
}

main().catch(err => {
  logger.error(`Fatal: ${err.message}`);
  process.exit(1);
});
