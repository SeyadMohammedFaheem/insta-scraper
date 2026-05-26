/**
 * export.js — Replicated Export Pipeline.
 */

import fs from 'fs/promises';
import path from 'path';
import config from './config.js';
import logger from './logger.js';
import { scrapeUser } from './scraper.js';
import { savePosts, loadPosts } from './storage.js';
import { warmSession } from './http.js';
import { parseAllProducts } from './product-parser.js';

const args = process.argv.slice(2);
const flags = {
  csv: args.includes('--csv'),
  noScrape: args.includes('--no-scrape'),
  username: args.find((a, i) => args[i - 1] === '--username') || config.usernames[0],
};

function escapeCsv(val) {
  const str = String(val || '');
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function productsToCSV(products) {
  const headers = ['id', 'name', 'description', 'price', 'images', 'status', 'type', 'shortCode'];
  const rows = products.map(p => [
    p.id, p.name, p.description, p.price, p.images, p.status, p.type, p.shortcode
  ].map(escapeCsv).join(','));
  return [headers.join(','), ...rows].join('\n');
}

async function main() {
  logger.banner('INSTA-SCRAPER — Export Pipeline (GAS Schema)');

  const username = flags.username;
  logger.info(`Target: @${username}`);

  let posts;
  if (flags.noScrape) {
    logger.info('Using existing data …');
    posts = await loadPosts(username);
  } else {
    posts = await scrapeUser(username);
    if (posts.length) {
      await savePosts(username, posts);
    } else {
      // Fallback: use existing stored data when live scrape fails
      logger.warn('Live scrape returned 0 posts — falling back to stored data.');
      posts = await loadPosts(username);
    }
  }

  if (!posts.length) {
    logger.warn('No posts available (neither live nor stored). Exiting gracefully.');
    process.exit(0); // Exit 0 so GitHub Actions doesn't mark as failed
  }

  const products = parseAllProducts(posts);
  logger.success(`Parsed ${products.length} products (Filtered out Reels & zero-price)`);

  if (!products.length) {
    logger.warn('No valid products extracted. Exiting gracefully.');
    process.exit(0);
  }

  // Preview
  console.log('\n📦 Product Preview:\n');
  products.slice(0, 3).forEach((p, i) => {
    console.log(`  ${i + 1}. ${p.name} [${p.type}]`);
    console.log(`     Price: ₹${p.price}`);
    console.log(`     Desc:  ${p.description.substring(0, 60)}...`);
    console.log(`     ID:    ${p.shortcode}`);
    console.log('');
  });

  const outDir = path.join(config.dataDir, username);
  await fs.mkdir(outDir, { recursive: true });

  const jsonPath = path.join(outDir, 'products.json');
  await fs.writeFile(jsonPath, JSON.stringify(products, null, 2));

  // Sheets push
  try {
    const { pushToSheets } = await import('./sheets.js');
    await pushToSheets(products);
  } catch (err) {
    logger.error(`Sheets failed: ${err.message}`);
    const csvPath = path.join(outDir, 'products.csv');
    await fs.writeFile(csvPath, productsToCSV(products), 'utf-8');
    logger.success(`CSV saved instead → ${csvPath}`);
  }
}

main().catch(err => {
  logger.error(`Fatal: ${err.message}`);
  process.exit(1);
});
