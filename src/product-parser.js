/**
 * product-parser.js — Replicated logic from Sheets App Script.
 * Matches: _RATE_, _TOP_, _BOTTOM_, _DUPATTA_, Proper Case, etc.
 */

function toProperCase(str) {
  if (!str) return '';
  return str
    .toLowerCase()
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/**
 * Replicated parseCaption logic from App Script.
 */
function parseCaption(caption) {
  const clean = caption
    .replace(/\*/g, '')
    .replace(/[✅❤️💸💰🎀😎✨🔥💫⭐]/g, '')
    .trim();

  const lines = clean
    .split('\n')
    .map(l => l.trim())
    .filter(l => l.length > 2);

  // 1. Price extraction
  const priceMatch =
    caption.match(/\_RATE\_?\*?\s*(\d{3,4})/i) ||
    caption.match(/RATE\*?\s*(\d{3,4})/i) ||
    caption.match(/[Pp]rice[-:\s]*(\d{3,4})/i) ||
    caption.match(/₹\s*(\d{3,4})/i) ||
    caption.match(/[Rr]s\.?\s*(\d{3,4})/i) ||           
    caption.match(/(\d{3,4})\s*\/\-/i) ||               
    caption.match(/@\s*(\d{3,4})/i) ||                  
    caption.match(/(\d{3,4})\s*[-\/]\s*(?:free|shipping|\*)/i) ||
    caption.match(/[-]\s*(\d{3,4})\s*[-\/]/i) ||
    caption.match(/(?:only|just)\s*(\d{3,4})/i);

  const price = priceMatch ? priceMatch[1] : '0';

  // 2. Product Name from TOP line or keywords
  const topMatch = caption.match(/\_TOP\_?\*?\s*([^\n\*]+)/i);
  const clothingKeywords = /suit|saree|kurti|dress|dupatta|lehenga|salwar|palazzo|cotton|silk|khadi|doria|chiffon|georgette|linen|printed|embroid/i;
  const nameLine = topMatch
    ? topMatch[1].trim()
    : lines.find(l => clothingKeywords.test(l)) || '';

  const rawName = nameLine.replace(/[^a-zA-Z\s]/g, '').trim();
  const name = toProperCase(rawName) || 'Ethnic Wear';

  // 3. Build description from TOP + BOTTOM + DUPATTA
  const topDesc = caption.match(/\_TOP\_?\*?\s*([^\n\*]+)/i)?.[1]?.trim() || '';
  const bottomDesc = caption.match(/\_BOTTOM\_?\*?\s*([^\n\*]+)/i)?.[1]?.trim() || '';
  const dupattaDesc = caption.match(/\_DUPP?ATTA\_?\*?\s*([^\n\*]+)/i)?.[1]?.trim() || '';

  const descParts = [
    topDesc && `Top: ${topDesc}`,
    bottomDesc && `Bottom: ${bottomDesc}`,
    dupattaDesc && `Dupatta: ${dupattaDesc}`
  ].filter(Boolean);

  let description = descParts.length > 0
    ? toProperCase(descParts.join(' | ').replace(/[^a-zA-Z0-9\s|:]/g, ''))
    : toProperCase(rawName);
    
  if (!description) {
    description = caption.substring(0, 100).replace(/[^a-zA-Z0-9\s]/g, '').trim();
  }

  // 4. Auto detect type
  const isFabric =
    /\d+(\.\d+)?\s*(mtr|meter|metre|yard|running)/i.test(caption) ||
    /unstitched|cut\s*piece|running\s*material/i.test(caption);

  const type = isFabric ? 'FABRIC' : 'KURTI';

  return { name, price, description, type };
}

/**
 * Parse a scraped Instagram post into a structured product object.
 */
export function parseProduct(post) {
  const caption = post.caption || '';
  const { name, price, description, type } = parseCaption(caption);

  return {
    id: post.postId || post.id || '',
    name,
    description,
    price,
    images: (post.imageUrls || [post.thumbnailUrl]).filter(Boolean).join(','),
    status: 'ACTIVE',
    type,
    shortcode: post.shortcode || ''
  };
}

/**
 * Parse all posts into products.
 */
export function parseAllProducts(posts) {
  return posts
    .filter(post => {
      // 1. Skip Reels
      if (post.type === 'Video' || post.productType === 'clips') return false;
      // 2. Skip posts with no caption/description
      if (!post.caption || post.caption.trim().length < 5) return false;
      return true;
    })
    .map(parseProduct);
}
