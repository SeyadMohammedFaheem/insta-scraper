// Quick test of FIXED price parsing on real captions from posts.json
import fs from 'fs/promises';
import { parseAllProducts, parseProduct } from '../src/product-parser.js';

const posts = JSON.parse(await fs.readFile('./data/ufbrand_salwar/posts.json', 'utf-8'));

let zeroCount = 0;
let totalCount = 0;
let validCount = 0;

for (const post of posts) {
  if (!post.caption || post.caption.trim().length < 5) continue;
  if (post.type === 'Video' || post.productType === 'clips') continue;
  if (!post.shortcode || post.shortcode.length < 2) continue;
  totalCount++;
  const product = parseProduct(post);
  if (product.price === '0') {
    zeroCount++;
    console.log('\n--- ZERO PRICE ---');
    console.log('Caption (first 200 chars):', post.caption.substring(0, 200));
    console.log('Shortcode:', post.shortcode);
  } else {
    validCount++;
  }
}

console.log(`\n\nSUMMARY:`);
console.log(`  Total posts (after filter): ${totalCount}`);
console.log(`  Valid products (price > 0): ${validCount}`);
console.log(`  Zero-priced (filtered out): ${zeroCount}`);

// Also test the full pipeline
const allProducts = parseAllProducts(posts);
console.log(`\n  parseAllProducts() returned: ${allProducts.length} products`);
