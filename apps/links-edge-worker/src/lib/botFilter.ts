/**
 * apps/links-edge-worker/src/lib/botFilter.ts
 * Bot Crawler Classifier & Social Preview Excluder
 */

const KNOWN_BOT_PATTERNS = [
  /facebookexternalhit/i,
  /twitterbot/i,
  /discordbot/i,
  /telegrambot/i,
  /slackbot/i,
  /whatsapp/i,
  /linkedinbot/i,
  /googlebot/i,
  /bingbot/i,
  /applebot/i,
  /yandexbot/i,
  /baiduspider/i,
  /pinterest/i,
  /redditbot/i,
  /embedly/i,
  /quora link preview/i,
  /vkshare/i,
  /w3c_validator/i,
];

const HEADLESS_PATTERNS = [
  /headlesschrome/i,
  /phantomjs/i,
  /puppeteer/i,
  /playwright/i,
  /selenium/i,
  /webdriver/i,
];

/**
 * Classifies whether an incoming request originates from a bot, crawler, or preview generator
 */
export function isBotRequest(request: Request): boolean {
  const userAgent = request.headers.get("user-agent") || "";
  if (!userAgent.trim()) {
    // Missing User-Agent is a strong bot signal
    return true;
  }

  // Check known bot User-Agent patterns
  for (const pattern of KNOWN_BOT_PATTERNS) {
    if (pattern.test(userAgent)) {
      return true;
    }
  }

  // Check headless browser signatures
  for (const pattern of HEADLESS_PATTERNS) {
    if (pattern.test(userAgent)) {
      return true;
    }
  }

  // Check Cloudflare botManagement score if present
  const cf = (request as any).cf;
  if (cf?.botManagement?.score !== undefined && cf.botManagement.score < 20) {
    return true;
  }

  return false;
}

/**
 * Returns specific bot classification name or null
 */
export function getBotIdentifier(request: Request): string | null {
  const userAgent = request.headers.get("user-agent") || "";
  for (const pattern of KNOWN_BOT_PATTERNS) {
    const match = userAgent.match(pattern);
    if (match) return match[0].toLowerCase();
  }
  for (const pattern of HEADLESS_PATTERNS) {
    const match = userAgent.match(pattern);
    if (match) return `headless_${match[0].toLowerCase()}`;
  }
  return null;
}
