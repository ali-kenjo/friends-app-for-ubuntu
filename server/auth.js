// Local API Session Authentication (server/auth.js)
// Generates and enforces a 32-byte secret per installation stored in <dataDir>/session-token (mode 0600).
// Protects local endpoints from unauthorized access by other processes or malicious web pages.

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const config = require("./config");
const logger = require("./logger");

let cachedToken = null;

function getTokenFile() {
  return path.join(config.dataDir, "session-token");
}

// Loads or generates the 32-byte session token
function getToken() {
  if (cachedToken) return cachedToken;

  const file = getTokenFile();
  try {
    if (fs.existsSync(file)) {
      const read = fs.readFileSync(file, "utf8").trim();
      if (/^[a-f0-9]{64}$/i.test(read)) {
        // Ensure proper permissions 0600
        try {
          fs.chmodSync(file, 0o600);
        } catch {}
        cachedToken = read;
        return cachedToken;
      }
    }
  } catch (err) {
    logger.warn("Could not read existing session token file:", err.message);
  }

  // Generate a cryptographically random 32-byte (64 hex characters) token
  const token = crypto.randomBytes(32).toString("hex");
  try {
    fs.mkdirSync(config.dataDir, { recursive: true, mode: 0o700 });
    fs.writeFileSync(file, token, { mode: 0o600 });
    fs.chmodSync(file, 0o600);
  } catch (err) {
    logger.error("Failed to write session token file:", err.message);
  }

  cachedToken = token;
  return cachedToken;
}

// Parses standard HTTP Cookie header
function parseCookies(header) {
  const cookies = {};
  if (!header || typeof header !== "string") return cookies;
  for (const item of header.split(";")) {
    const parts = item.split("=");
    const key = parts[0]?.trim();
    if (!key) continue;
    const val = parts.slice(1).join("=").trim();
    try {
      cookies[key] = decodeURIComponent(val);
    } catch {
      cookies[key] = val;
    }
  }
  return cookies;
}

// Formats HttpOnly SameSite=Strict Set-Cookie header
function createSessionCookie(token) {
  return `friends_session=${token}; Path=/; HttpOnly; SameSite=Strict`;
}

// Timing-safe comparison of tokens
function validateToken(candidate) {
  if (!candidate || typeof candidate !== "string") return false;
  const current = getToken();
  const bufA = Buffer.from(candidate);
  const bufB = Buffer.from(current);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

// Validates incoming HTTP request or WebSocket upgrade request
function validateSession(req) {
  // 1. Check Cookie header: friends_session
  const cookies = parseCookies(req.headers?.cookie);
  if (cookies.friends_session && validateToken(cookies.friends_session)) {
    return true;
  }

  // 2. Check Authorization: Bearer <token>
  const authHeader = req.headers?.authorization;
  if (authHeader && typeof authHeader === "string") {
    const match = authHeader.match(/^Bearer\s+([a-f0-9]{64})$/i);
    if (match && validateToken(match[1])) {
      return true;
    }
  }

  // (Not in the address: a token in a URL ends up in logs, history and the next page's Referer. The page gets its
  // cookie by sending the token from the address's #fragment, which never leaves the browser, to /api/session.)
  return false;
}

module.exports = {
  getToken,
  parseCookies,
  createSessionCookie,
  validateToken,
  validateSession,
  setTokenForTesting: (t) => {
    cachedToken = t;
  },
};
