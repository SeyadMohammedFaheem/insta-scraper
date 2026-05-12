/**
 * parser.js — Extracts structured post data from Instagram HTML responses.
 *
 * Strategy chain (most → least reliable):
 *   1. Embedded JSON from <script> tags (window._sharedData / __additionalDataLoaded)
 *   2. JSON-LD (application/ld+json)
 *   3. OG meta tags + HTML scraping
 *   4. Embed endpoint HTML parsing
 */

import * as cheerio from 'cheerio';
import logger from './logger.js';

// ─── Strategy 1: Embedded window._sharedData / __additionalDataLoaded ──────

const SHARED_DATA_RE = /window\._sharedData\s*=\s*({.+?});<\/script>/s;
const ADDITIONAL_DATA_RE = /window\.__additionalDataLoaded\s*\(\s*['"][^'"]+['"]\s*,\s*({.+?})\s*\)\s*;/s;
const REQUIRE_RE = /requireLazy\(\s*\["ScheduledServerJS"\]\s*,\s*function\s*\(\s*\w+\s*\)\s*{\s*\w+\.handle\(({.+?})\s*\)/s;

/**
 * Try to extract profile/post JSON from a full HTML page.
 * @param {string} html
 * @returns {object|null}
 */
export function extractEmbeddedJSON(html) {
  // Try _sharedData first
  let match = html.match(SHARED_DATA_RE);
  if (match) {
    try {
      const data = JSON.parse(match[1]);
      logger.debug('Extracted window._sharedData');
      return data;
    } catch { /* skip */ }
  }

  // Try __additionalDataLoaded
  match = html.match(ADDITIONAL_DATA_RE);
  if (match) {
    try {
      const data = JSON.parse(match[1]);
      logger.debug('Extracted __additionalDataLoaded');
      return data;
    } catch { /* skip */ }
  }

  // Try requireLazy / ScheduledServerJS payloads
  const scriptBlocks = html.match(/<script[^>]*>[\s\S]*?<\/script>/gi) || [];
  for (const block of scriptBlocks) {
    // Look for large JSON objects that contain edge_owner_to_timeline_media
    if (block.includes('edge_owner_to_timeline_media') || block.includes('edge_sidecar_to_children')) {
      const jsonCandidate = block.match(/({[\s\S]*"edge_owner_to_timeline_media"[\s\S]*})/);
      if (jsonCandidate) {
        try {
          const data = JSON.parse(jsonCandidate[1]);
          logger.debug('Extracted timeline data from script block');
          return data;
        } catch { /* skip */ }
      }
    }
  }

  return null;
}

// ─── Strategy 2: JSON-LD ───────────────────────────────────────────

/**
 * Extract structured data from JSON-LD script tags.
 */
export function extractJsonLD(html) {
  const $ = cheerio.load(html);
  const results = [];

  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const data = JSON.parse($(el).html());
      results.push(data);
    } catch { /* skip */ }
  });

  return results.length ? results : null;
}

// ─── Strategy 3: OG Meta tags ──────────────────────────────────────

/**
 * Extract basic post info from Open Graph meta tags.
 */
export function extractOGMeta(html) {
  const $ = cheerio.load(html);
  const meta = {};

  $('meta[property^="og:"]').each((_, el) => {
    const prop = $(el).attr('property')?.replace('og:', '');
    const content = $(el).attr('content');
    if (prop && content) meta[prop] = content;
  });

  // Also grab twitter:* tags
  $('meta[name^="twitter:"]').each((_, el) => {
    const name = $(el).attr('name')?.replace('twitter:', '');
    const content = $(el).attr('content');
    if (name && content) meta[`twitter_${name}`] = content;
  });

  // Grab title & description
  meta.title = $('title').text() || '';
  const descTag = $('meta[name="description"]').attr('content');
  if (descTag) meta.description = descTag;

  return Object.keys(meta).length ? meta : null;
}

// ─── Strategy 4: Embed page HTML ───────────────────────────────────

/**
 * Parse an embed page (/p/{code}/embed/) for post data.
 */
export function parseEmbedPage(html) {
  const $ = cheerio.load(html);
  const post = {
    caption: '',
    imageUrls: [],
    videoUrls: [],
    username: '',
    isVideo: false,
  };

  // Extract embedded media JSON
  const embedJsonRe = /window\.__additionalDataLoaded\s*\(\s*['"][^'"]+['"]\s*,\s*({[\s\S]+?})\s*\)\s*;/;
  const match = html.match(embedJsonRe);
  if (match) {
    try {
      const data = JSON.parse(match[1]);
      if (data?.shortcode_media) {
        return normalizePostNode(data.shortcode_media);
      }
    } catch { /* fallback to DOM parsing */ }
  }

  // Fallback: parse from embed DOM
  // Username
  const profileLink = $('a.EmbedUserInfo');
  post.username = profileLink.text()?.trim().replace(/^@/, '') || '';
  if (!post.username) {
    const headerLink = $('header a[href*="/"]');
    const href = headerLink.attr('href') || '';
    post.username = href.replace(/\//g, '').trim();
  }

  // Caption
  const captionEl = $('div.Caption, .EmbedCaption');
  post.caption = captionEl.text()?.trim() || '';

  // Images
  $('img.EmbeddedMediaImage, img[src*="instagram"]').each((_, el) => {
    const src = $(el).attr('src');
    if (src && src.includes('instagram') && !src.includes('profile_pic')) {
      post.imageUrls.push(src);
    }
  });

  // Video
  $('video source, video[src]').each((_, el) => {
    const src = $(el).attr('src');
    if (src) {
      post.videoUrls.push(src);
      post.isVideo = true;
    }
  });

  return post;
}

// ─── Normalize an Instagram edge node into a clean post object ─────

/**
 * Convert Instagram's internal node format into a clean, flat post object.
 * @param {object} node — a shortcode_media or edge node
 * @returns {object}
 */
export function normalizePostNode(node) {
  if (!node) return null;

  const post = {
    postId: node.id || '',
    shortcode: node.shortcode || '',
    username: node.owner?.username || '',
    timestamp: node.taken_at_timestamp
      ? new Date(node.taken_at_timestamp * 1000).toISOString()
      : '',
    caption: '',
    type: 'image', // image | video | carousel
    imageUrls: [],
    videoUrls: [],
    thumbnailUrl: node.thumbnail_src || node.display_url || '',
    likes: node.edge_media_preview_like?.count ?? node.like_count ?? 0,
    comments: node.edge_media_to_comment?.count ?? node.comment_count ?? 0,
    dimensions: node.dimensions || null,
    isVideo: !!node.is_video,
    videoViewCount: node.video_view_count || 0,
    permalink: node.shortcode
      ? `https://www.instagram.com/p/${node.shortcode}/`
      : '',
  };

  // Caption
  const captionEdges = node.edge_media_to_caption?.edges;
  if (captionEdges?.length) {
    post.caption = captionEdges[0].node?.text || '';
  } else if (typeof node.caption === 'string') {
    post.caption = node.caption;
  } else if (node.caption?.text) {
    post.caption = node.caption.text;
  }

  // Determine type + collect media URLs
  if (node.edge_sidecar_to_children?.edges?.length) {
    // Carousel / album
    post.type = 'carousel';
    for (const child of node.edge_sidecar_to_children.edges) {
      const cn = child.node;
      if (cn.is_video && cn.video_url) {
        post.videoUrls.push(cn.video_url);
      }
      if (cn.display_url) {
        post.imageUrls.push(cn.display_url);
      }
    }
  } else if (node.is_video) {
    post.type = 'video';
    if (node.video_url) post.videoUrls.push(node.video_url);
    if (node.display_url) post.imageUrls.push(node.display_url);
  } else {
    post.type = 'image';
    if (node.display_url) post.imageUrls.push(node.display_url);
  }

  // Multiple image resources (thumbnails at various sizes)
  if (node.thumbnail_resources?.length) {
    post.thumbnailResources = node.thumbnail_resources.map(r => ({
      width: r.config_width,
      height: r.config_height,
      url: r.src,
    }));
  }

  return post;
}

// ─── Parse a full profile page for posts ───────────────────────────

/**
 * Extract posts from a profile page HTML.
 * @param {string} html
 * @param {string} username
 * @returns {object[]}
 */
export function parseProfilePage(html, username) {
  const posts = [];

  // Strategy 1: embedded JSON
  const embedded = extractEmbeddedJSON(html);
  if (embedded) {
    const userData =
      embedded?.entry_data?.ProfilePage?.[0]?.graphql?.user ||
      embedded?.graphql?.user ||
      embedded?.data?.user ||
      embedded?.user;

    if (userData) {
      const edges = userData.edge_owner_to_timeline_media?.edges || [];
      for (const edge of edges) {
        const post = normalizePostNode(edge.node);
        if (post) {
          post.username = post.username || username;
          posts.push(post);
        }
      }
      if (posts.length) {
        logger.debug(`Parsed ${posts.length} posts from embedded JSON for @${username}`);
        return posts;
      }
    }
  }

  // Strategy 2: JSON-LD
  const ldData = extractJsonLD(html);
  if (ldData) {
    for (const ld of ldData) {
      if (ld['@type'] === 'ImageObject' || ld['@type'] === 'VideoObject') {
        posts.push({
          postId: '',
          shortcode: '',
          username,
          caption: ld.caption || ld.description || '',
          type: ld['@type'] === 'VideoObject' ? 'video' : 'image',
          imageUrls: ld.contentUrl ? [ld.contentUrl] : [],
          videoUrls: ld['@type'] === 'VideoObject' && ld.contentUrl ? [ld.contentUrl] : [],
          thumbnailUrl: ld.thumbnailUrl || '',
          timestamp: ld.uploadDate || '',
          permalink: ld.mainEntityOfPage || '',
          likes: 0,
          comments: 0,
          isVideo: ld['@type'] === 'VideoObject',
        });
      }
    }
    if (posts.length) {
      logger.debug(`Parsed ${posts.length} posts from JSON-LD for @${username}`);
      return posts;
    }
  }

  return posts;
}

// ─── Parse GraphQL JSON response ───────────────────────────────────

/**
 * Parse the JSON response from Instagram's GraphQL endpoint.
 * @param {object} data — raw JSON response
 * @param {string} username
 * @returns {object[]}
 */
export function parseGraphQLResponse(data, username) {
  const posts = [];
  let edges = [];

  // Navigate various response structures
  if (data?.data?.user?.edge_owner_to_timeline_media?.edges) {
    edges = data.data.user.edge_owner_to_timeline_media.edges;
  } else if (data?.graphql?.user?.edge_owner_to_timeline_media?.edges) {
    edges = data.graphql.user.edge_owner_to_timeline_media.edges;
  } else if (data?.user?.edge_owner_to_timeline_media?.edges) {
    edges = data.user.edge_owner_to_timeline_media.edges;
  }

  for (const edge of edges) {
    const post = normalizePostNode(edge.node);
    if (post) {
      post.username = post.username || username;
      posts.push(post);
    }
  }

  return posts;
}

// ─── Parse Web Profile Info API ────────────────────────────────────

/**
 * Parse the web_profile_info API response.
 */
export function parseWebProfileInfo(data, username) {
  const posts = [];
  const user = data?.data?.user || data?.user;
  if (!user) return posts;

  const edges = user.edge_owner_to_timeline_media?.edges || [];
  for (const edge of edges) {
    const post = normalizePostNode(edge.node);
    if (post) {
      post.username = post.username || username;
      posts.push(post);
    }
  }

  return posts;
}
