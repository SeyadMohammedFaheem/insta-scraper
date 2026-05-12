/**
 * storage.js — Persists scraped data as JSON files.
 * Structure: data/{username}/posts.json, data/{username}/history.json
 */

import fs from 'fs/promises';
import path from 'path';
import config from './config.js';
import logger from './logger.js';

/**
 * Ensure directory exists.
 */
async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

/**
 * Read a JSON file, return null if not found.
 */
async function readJSON(filePath) {
  try {
    const raw = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * Write a JSON file.
 */
async function writeJSON(filePath, data) {
  await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8');
}

/**
 * Save scraped posts for a user. Merges with existing data (deduplication by shortcode/postId).
 * @param {string} username
 * @param {object[]} newPosts
 * @returns {Promise<{total:number, new:number}>}
 */
export async function savePosts(username, newPosts) {
  const userDir = path.join(config.dataDir, username);
  await ensureDir(userDir);

  const postsFile = path.join(userDir, 'posts.json');
  const historyFile = path.join(userDir, 'history.json');

  // Load existing
  const existing = (await readJSON(postsFile)) || [];
  const existingKeys = new Set(existing.map(p => p.shortcode || p.postId || p.permalink));

  // Merge (deduplicate)
  let newCount = 0;
  for (const post of newPosts) {
    const key = post.shortcode || post.postId || post.permalink;
    if (key && !existingKeys.has(key)) {
      existing.push(post);
      existingKeys.add(key);
      newCount++;
    }
  }

  // Sort by timestamp descending
  existing.sort((a, b) => {
    const ta = a.timestamp ? new Date(a.timestamp).getTime() : 0;
    const tb = b.timestamp ? new Date(b.timestamp).getTime() : 0;
    return tb - ta;
  });

  await writeJSON(postsFile, existing);

  // Update history log
  const history = (await readJSON(historyFile)) || [];
  history.push({
    timestamp: new Date().toISOString(),
    fetched: newPosts.length,
    newPosts: newCount,
    totalStored: existing.length,
  });
  // Keep last 100 history entries
  if (history.length > 100) history.splice(0, history.length - 100);
  await writeJSON(historyFile, history);

  logger.success(`@${username}: ${newCount} new posts saved (${existing.length} total)`);
  return { total: existing.length, new: newCount };
}

/**
 * Save results from a full scrape cycle.
 */
export async function saveAll(results) {
  const summary = { timestamp: new Date().toISOString(), users: {} };

  for (const [username, posts] of results) {
    const stats = await savePosts(username, posts);
    summary.users[username] = stats;
  }

  // Write cycle summary
  await ensureDir(config.dataDir);
  const summaryFile = path.join(config.dataDir, 'last_cycle.json');
  await writeJSON(summaryFile, summary);

  return summary;
}

/**
 * Load stored posts for a username.
 */
export async function loadPosts(username) {
  const postsFile = path.join(config.dataDir, username, 'posts.json');
  return (await readJSON(postsFile)) || [];
}

/**
 * Load scrape history for a username.
 */
export async function loadHistory(username) {
  const historyFile = path.join(config.dataDir, username, 'history.json');
  return (await readJSON(historyFile)) || [];
}

/**
 * Get a summary of all stored data.
 */
export async function getSummary() {
  const summaryFile = path.join(config.dataDir, 'last_cycle.json');
  return await readJSON(summaryFile);
}
