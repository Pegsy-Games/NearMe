// Simple in-memory sliding-window rate limiter.
// Resets on cold starts — fine for basic abuse prevention.
const windows = new Map();

const CLEANUP_INTERVAL = 5 * 60 * 1000;
let lastCleanup = Date.now();

function cleanup() {
  const now = Date.now();
  if (now - lastCleanup < CLEANUP_INTERVAL) return;
  lastCleanup = now;
  for (const [key, record] of windows) {
    if (now - record.start > record.windowMs) windows.delete(key);
  }
}

/**
 * Returns true if the request is allowed, false if rate-limited.
 * @param {Request} request
 * @param {object} opts
 * @param {number} opts.limit   - max requests per window (default 60)
 * @param {number} opts.windowMs - window size in ms (default 60 000)
 */
export function rateLimit(request, { limit = 60, windowMs = 60000 } = {}) {
  cleanup();

  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    'unknown';

  const now = Date.now();
  const record = windows.get(ip) || { count: 0, start: now, windowMs };

  if (now - record.start > windowMs) {
    record.count = 1;
    record.start = now;
  } else {
    record.count++;
  }

  record.windowMs = windowMs;
  windows.set(ip, record);
  return record.count <= limit;
}
