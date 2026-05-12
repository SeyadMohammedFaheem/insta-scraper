/**
 * scraper.js — Core scraping engine using Playwright (Browser-based) for maximum reliability.
 */

import { chromium } from 'playwright';
import { request, sleep } from './http.js';
import {
  parseWebProfileInfo, parseGraphQLResponse, parseProfilePage,
  parseEmbedPage, normalizePostNode, extractEmbeddedJSON,
} from './parser.js';
import config from './config.js';
import logger from './logger.js';

const PROFILE_QUERY_HASH = '69cba40317214236af40e7efa697781d';

/**
 * Strategy 0: Browser Interception (Most Reliable)
 */
async function fetchViaBrowser(username) {
  logger.info(`[S0] Browser Interception for @${username}`);
  let browser;
  try {
    browser = await chromium.launch({ 
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'] 
    });
    const context = await browser.newContext({
      viewport: { width: 1280, height: 800 },
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36'
    });
    const page = await context.newPage();

    let posts = null;

    // Listen for the API response
    page.on('response', async (response) => {
      const url = response.url();
      if (url.includes('web_profile_info') && response.status() === 200) {
        try {
          const body = await response.json();
          posts = parseWebProfileInfo(body, username);
        } catch (err) {
          logger.debug(`Browser JSON parse fail: ${err.message}`);
        }
      }
    });

    await page.goto(`https://www.instagram.com/${username}/`, { waitUntil: 'load', timeout: 30000 });
    
    // 1. Scroll down slightly to trigger the post loading
    await page.evaluate(() => window.scrollBy(0, 800));
    await sleep(3000);

    if (posts && posts.length) {
      logger.success(`S0 (Browser): Found ${posts.length} posts`);
      return posts;
    }

    // 2. Fallback: Extract from DOM if interception missed the initial load
    logger.info(`[S0-FB] Browser DOM extraction for @${username}`);
    const html = await page.content();
    const domPosts = parseProfilePage(html, username);
    
    // Filter out posts that don't have a shortcode (these are bio/meta details)
    const realPosts = domPosts.filter(p => p.shortcode && p.shortcode.length > 2);

    if (realPosts.length) {
      logger.success(`S0-FB: Found ${realPosts.length} real posts`);
      return realPosts;
    }

  } catch (err) {
    logger.error(`Browser strategy failed: ${err.message}`);
  } finally {
    if (browser) await browser.close();
  }
  return null;
}

/**
 * Strategy 1: Web Profile Info API
 */
async function fetchViaWebProfileInfo(username) {
  logger.info(`[S1] Web Profile Info API for @${username}`);
  const url = `https://www.instagram.com/api/v1/users/web_profile_info/?username=${username}`;
  try {
    const { status, body } = await request(url, {
      json: true,
      extraHeaders: {
        'X-IG-App-ID': '936619743392459',
        'X-Requested-With': 'XMLHttpRequest',
        Referer: `https://www.instagram.com/${username}/`,
      },
    });
    if (status === 200 && body) {
      const posts = parseWebProfileInfo(body, username);
      if (posts.length) { logger.success(`S1: ${posts.length} posts`); return posts; }
    }
  } catch (err) { logger.debug(`S1 failed: ${err.message}`); }
  return null;
}

/**
 * Strategy 2: GraphQL
 */
async function fetchViaGraphQL(username) {
  logger.info(`[S2] GraphQL for @${username}`);
  try {
    const { body: html } = await request(`https://www.instagram.com/${username}/`);
    const idMatch = html.match(/"profilePage_(\d+)"/) || html.match(/"user_id":"(\d+)"/);
    if (!idMatch) return null;

    const variables = JSON.stringify({ id: idMatch[1], first: config.maxPostsPerUser });
    const gqlUrl = `https://www.instagram.com/graphql/query/?query_hash=${PROFILE_QUERY_HASH}&variables=${encodeURIComponent(variables)}`;
    const { status, body } = await request(gqlUrl, {
      json: true,
      extraHeaders: { 'X-Requested-With': 'XMLHttpRequest', Referer: `https://www.instagram.com/${username}/` },
    });
    if (status === 200 && body) {
      const posts = parseGraphQLResponse(body, username);
      if (posts.length) { logger.success(`S2 GQL: ${posts.length} posts`); return posts; }
    }
  } catch (err) { logger.debug(`S2 failed: ${err.message}`); }
  return null;
}

export async function scrapeUser(username) {
  const strategies = [fetchViaBrowser, fetchViaWebProfileInfo, fetchViaGraphQL];
  for (const strategy of strategies) {
    try {
      const posts = await strategy(username);
      if (posts?.length) return posts.slice(0, config.maxPostsPerUser);
    } catch (err) { logger.debug(`Strategy failed: ${err.message}`); }
    await sleep(config.requestDelayMs);
  }
  return [];
}

export async function scrapeAll() {
  logger.banner('INSTA-SCRAPER — Browser-Based Scrape Start');
  const start = Date.now();
  const results = new Map();

  for (const username of config.usernames) {
    try {
      const posts = await scrapeUser(username);
      results.set(username, posts);
      logger.info(`@${username}: ${posts.length} posts collected`);
      if (config.usernames.indexOf(username) < config.usernames.length - 1) await sleep(config.requestDelayMs * 2);
    } catch (err) {
      logger.error(`Failed @${username}: ${err.message}`);
      results.set(username, []);
    }
  }

  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  const total = [...results.values()].reduce((s, a) => s + a.length, 0);
  logger.banner(`Scrape Complete — ${total} posts in ${elapsed}s`);
  return results;
}
