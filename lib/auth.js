const crypto = require('crypto');

const COOKIE = 'sf_auth';
const MAX_AGE_DAYS = 30;

function secret() {
  // Falls back to the passcode so a missing SESSION_SECRET degrades to
  // "sessions die when the passcode changes" rather than to no signing at all.
  return process.env.SESSION_SECRET || process.env.SPANISH_PASSCODE || '';
}

function sign(expiry) {
  return crypto.createHmac('sha256', secret()).update(String(expiry)).digest('hex');
}

function issueToken() {
  const expiry = Date.now() + MAX_AGE_DAYS * 24 * 60 * 60 * 1000;
  return `${expiry}.${sign(expiry)}`;
}

function validToken(token) {
  if (!token || !secret()) return false;
  const [expiry, mac] = String(token).split('.');
  if (!expiry || !mac) return false;
  if (!/^\d+$/.test(expiry) || Number(expiry) < Date.now()) return false;

  const expected = sign(expiry);
  // Both are hex of the same length, so timingSafeEqual won't throw.
  if (mac.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(mac, 'utf8'), Buffer.from(expected, 'utf8'));
}

function readCookie(req, name) {
  const header = req.headers.cookie;
  if (!header) return null;
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() === name) return decodeURIComponent(part.slice(eq + 1).trim());
  }
  return null;
}

function setAuthCookie(res) {
  res.setHeader('Set-Cookie', [
    `${COOKIE}=${issueToken()}`,
    'Path=/',
    'HttpOnly',
    'Secure',
    'SameSite=Lax',
    `Max-Age=${MAX_AGE_DAYS * 24 * 60 * 60}`,
  ].join('; '));
}

function isAuthed(req) {
  return validToken(readCookie(req, COOKIE));
}

// Constant-time passcode comparison, so a wrong guess leaks nothing by timing.
function passcodeMatches(given) {
  const real = process.env.SPANISH_PASSCODE || '';
  if (!real || typeof given !== 'string') return false;
  const a = crypto.createHash('sha256').update(given).digest();
  const b = crypto.createHash('sha256').update(real).digest();
  return crypto.timingSafeEqual(a, b);
}

// Only ever guards /api routes, and `fetch` sends Accept: */* — so answer with
// a 401 the client can act on, never a redirect it would silently follow.
function requireAuth(req, res, next) {
  if (isAuthed(req)) return next();
  res.status(401).json({ error: 'not signed in' });
}

module.exports = { requireAuth, isAuthed, setAuthCookie, passcodeMatches, COOKIE };
