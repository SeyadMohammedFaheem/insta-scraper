/**
 * sheets.js — Google Sheets integration using the replicated schema.
 */

import { google } from 'googleapis';
import fs from 'fs/promises';
import path from 'path';
import config from './config.js';
import logger from './logger.js';

const CREDENTIALS_PATH = path.join(config.root, 'credentials.json');
const SCOPES = ['https://www.googleapis.com/auth/spreadsheets'];

// Replicated Headers from GAS
const HEADERS = [
  'id', 'name', 'description', 'price', 'images', 'status', 'type', 'shortCode', 'added_at'
];

async function authenticate() {
  try {
    let credentials;
    
    // Support for GitHub Actions / Environment Variable
    if (process.env.GOOGLE_CREDENTIALS) {
      credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS);
    } else {
      // Local fallback
      const keyFile = await fs.readFile(CREDENTIALS_PATH, 'utf-8');
      credentials = JSON.parse(keyFile);
    }

    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: SCOPES,
    });

    return auth;
  } catch (err) {
    if (err.code === 'ENOENT') {
      logger.error('credentials.json not found and GOOGLE_CREDENTIALS not set!');
    }
    throw err;
  }
}

async function getSheetsClient() {
  const auth = await authenticate();
  return google.sheets({ version: 'v4', auth });
}

function productToRow(product) {
  return [
    product.id || '',
    product.name || 'Women Clothing',
    product.description || '',
    product.price || '0',
    product.images || '',
    product.status || 'ACTIVE',
    product.type || 'KURTI',
    product.shortcode || '',
    product.added_at || new Date().toISOString().split('T')[0], // YYYY-MM-DD
  ];
}

export async function pushToSheets(products, sheetName = 'Sheet1') {
  const sheetId = process.env.GOOGLE_SHEET_ID;
  if (!sheetId) throw new Error('GOOGLE_SHEET_ID not set in .env');

  const sheets = await getSheetsClient();

  // Create tab if it doesn't exist
  try {
    const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId: sheetId });
    const tabs = spreadsheet.data.sheets.map(s => s.properties.title);
    if (!tabs.includes(sheetName)) {
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId: sheetId,
        requestBody: { requests: [{ addSheet: { properties: { title: sheetName } } }] },
      });
    }
  } catch (err) { logger.warn(`Tab check failed: ${err.message}`); }

  // 1. Fetch current sheet data
  let existingRows = [];
  try {
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: sheetId,
      range: `${sheetName}!A:I`,
    });
    existingRows = response.data.values || [];
  } catch (err) {
    logger.info('Sheet is empty or inaccessible, starting fresh.');
  }

  // 2. Filter out products older than 7 days
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const cutoffDate = sevenDaysAgo.toISOString().split('T')[0];

  const validRows = existingRows.filter((row, index) => {
    if (index === 0) return false; // Skip existing header
    const addedAt = row[8]; // Column I
    return addedAt && addedAt >= cutoffDate;
  });

  const existingIds = new Set(validRows.map(r => r[0]));

  // 3. Merge with new products (only add if ID is new)
  const newRowsToAdd = products
    .filter(p => !existingIds.has(p.id))
    .map(productToRow);

  const finalRows = [HEADERS, ...validRows, ...newRowsToAdd];

  // 4. Clear and Update
  try {
    await sheets.spreadsheets.values.clear({
      spreadsheetId: sheetId,
      range: `${sheetName}!A:I`,
    });
  } catch { /* ignore */ }

  await sheets.spreadsheets.values.update({
    spreadsheetId: sheetId,
    range: `${sheetName}!A1`,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: finalRows },
  });

  const sheetUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/edit`;
  logger.success(`✅ ${products.length} products pushed to Google Sheets (Schema matched to GAS)`);
  logger.info(`📊 View: ${sheetUrl}`);

  return sheetUrl;
}
