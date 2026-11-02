import crypto from 'crypto';
import dotenv from 'dotenv';
dotenv.config();

// Secret passcode for festival volunteers / staff
const ADMIN_PASSCODE = process.env.ADMIN_PASSCODE || 'zyntra2026';
const JWT_SECRET = process.env.JWT_SECRET || 'zyntra_2026_fest_secure_scanner_signature_key_' + (ADMIN_PASSCODE.slice(0, 8));

// In-memory sliding window rate-limiting maps
const ipRateLimits = new Map();
const failedAuthAttempts = new Map();

// Periodic cleanup of rate-limiting maps every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, record] of ipRateLimits.entries()) {
    if (now - record.windowStart > 60000) ipRateLimits.delete(key);
  }
  for (const [key, record] of failedAuthAttempts.entries()) {
    if (now - record.firstFailed > 900000) failedAuthAttempts.delete(key);
  }
}, 300000);

/**
 * Generate a cryptographically signed authentication token
 */
export function generateSecurityToken(passcode) {
  const payload = {
    role: 'VOLUNTEER_SCANNER',
    issuedAt: Date.now(),
    expiresAt: Date.now() + 86400000 * 3, // 3 days validity
  };
  const data = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = crypto
    .createHmac('sha256', JWT_SECRET)
    .update(`${data}:${passcode}`)
    .digest('base64url');
  return `${data}.${signature}`;
}

/**
 * Verify security token validity
 */
export function verifySecurityToken(token) {
  if (!token || typeof token !== 'string') return false;
  const parts = token.split('.');
  if (parts.length !== 2) return false;

  const [data, signature] = parts;
  try {
    const expectedSig = crypto
      .createHmac('sha256', JWT_SECRET)
      .update(`${data}:${ADMIN_PASSCODE}`)
      .digest('base64url');

    if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSig))) {
      return false;
    }

    const payload = JSON.parse(Buffer.from(data, 'base64url').toString('utf8'));
    if (Date.now() > payload.expiresAt) return false;
    return true;
  } catch (_) {
    return false;
  }
}

/**
 * Rate Limiting Middleware
 * Protects against brute-force attacks, ticket ID enumeration, and DDoS
 */
export function rateLimiter({ maxRequests = 60, windowMs = 60000, message = 'Too many scan requests. Rate limit active.' }) {
  return (req, res, next) => {
    const ip = req.ip || req.connection.remoteAddress || '127.0.0.1';
    const now = Date.now();

    let record = ipRateLimits.get(ip);
    if (!record || now - record.windowStart > windowMs) {
      record = { windowStart: now, count: 0 };
      ipRateLimits.set(ip, record);
    }

    record.count += 1;

    if (record.count > maxRequests) {
      res.setHeader('Retry-After', Math.ceil((windowMs - (now - record.windowStart)) / 1000));
      return res.status(429).json({
        success: false,
        error: 'RATE_LIMIT_EXCEEDED',
        message,
      });
    }

    next();
  };
}

/**
 * Security Passcode & Token Authentication Middleware
 * Blocks unauthorized campus visitors from tampering with the scanner or making fraudulent scans
 */
export function requireVolunteerAuth(req, res, next) {
  // Allow health checks publicly so frontend status pills reflect status
  if (req.path === '/api/health' || req.path === '/api/auth/verify-passcode') {
    return next();
  }

  const clientPasscode = req.headers['x-scanner-passcode'];
  const authHeader = req.headers['authorization'];
  const bearerToken = authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

  const isPasscodeValid = clientPasscode && clientPasscode.trim() === ADMIN_PASSCODE;
  const isTokenValid = bearerToken && verifySecurityToken(bearerToken);

  if (isPasscodeValid || isTokenValid) {
    return next();
  }

  return res.status(403).json({
    success: false,
    error: 'SECURITY_ACCESS_REQUIRED',
    message: 'Authorized volunteer access passcode required to operate festival scanner.',
  });
}

/**
 * Strict Input Sanitization & Anti-SQL Injection Defense
 * Validates ticket IDs, stations, and volunteers before reaching any database query
 */
export function sanitizeScanRequest(req, res, next) {
  if (req.method === 'POST') {
    const { ticketInput, station, volunteer, forceOverride } = req.body;

    if (ticketInput !== undefined) {
      const str = String(ticketInput).trim();
      if (str.length < 2 || str.length > 300) {
        return res.status(400).json({
          success: false,
          error: 'INVALID_PAYLOAD',
          message: 'Scanned ticket payload exceeds security boundaries.',
        });
      }

      // Detect and block common SQL injection tokens
      const dangerousPatterns = [
        /--/,
        /;\s*DROP/i,
        /;\s*DELETE/i,
        /;\s*UPDATE/i,
        /UNION\s+SELECT/i,
        /'\s*OR\s*'\d+'='\d+/i,
        /<script/i,
        /javascript:/i,
      ];

      for (const pattern of dangerousPatterns) {
        if (pattern.test(str)) {
          console.warn(`[SECURITY ALERT] Suspicious injection blocked from IP ${req.ip}:`, str.slice(0, 50));
          return res.status(400).json({
            success: false,
            error: 'TAMPER_DETECTED',
            message: 'Malicious payload pattern intercepted by security shield.',
          });
        }
      }
    }

    // Clean station and volunteer name
    if (station) {
      req.body.station = String(station).replace(/[^a-zA-Z0-9\s()·\-–]/g, '').slice(0, 60);
    }
    if (volunteer) {
      req.body.volunteer = String(volunteer).replace(/[^a-zA-Z0-9\s()·\-–]/g, '').slice(0, 60);
    }
  }

  next();
}

/**
 * Verification route for client passcode
 */
export function handleVerifyPasscode(req, res) {
  const ip = req.ip || req.connection.remoteAddress || '127.0.0.1';
  const now = Date.now();
  const { passcode } = req.body;

  // Check brute force attempts from this IP
  let failRecord = failedAuthAttempts.get(ip);
  if (failRecord && failRecord.count >= 6 && now - failRecord.firstFailed < 900000) {
    const waitMins = Math.ceil((900000 - (now - failRecord.firstFailed)) / 60000);
    return res.status(429).json({
      success: false,
      error: 'SECURITY_LOCKOUT',
      message: `Too many failed attempts. Terminal locked for ${waitMins} minute(s).`,
    });
  }

  if (!passcode || String(passcode).trim() !== ADMIN_PASSCODE) {
    if (!failRecord) {
      failRecord = { firstFailed: now, count: 0 };
      failedAuthAttempts.set(ip, failRecord);
    }
    failRecord.count += 1;

    return res.status(401).json({
      success: false,
      error: 'INVALID_PASSCODE',
      message: 'Incorrect volunteer passcode.',
      attemptsRemaining: Math.max(0, 6 - failRecord.count),
    });
  }

  // Clear failed attempts on success
  failedAuthAttempts.delete(ip);

  const token = generateSecurityToken(ADMIN_PASSCODE);
  return res.json({
    success: true,
    authenticated: true,
    token,
    role: 'VOLUNTEER_SCANNER',
    stationPresets: [
      'Gate 1 (Main Entrance)',
      'Gate 2 (Auditorium)',
      'Gate 3 (Cyber Labs)',
      'Food Counter A (Main Quad)',
      'Food Counter B (Dining Hall)',
    ],
  });
}

/**
 * Configure comprehensive HTTP security headers
 */
export function applySecurityHeaders(app) {
  // Trust first proxy hop (Vite dev server / Nginx / Cloudflare / reverse proxy)
  app.set('trust proxy', 1);

  // Security Headers Middleware
  app.use((req, res, next) => {
    // Prevent clickjacking
    res.setHeader('X-Frame-Options', 'DENY');
    // Prevent MIME-sniffing
    res.setHeader('X-Content-Type-Options', 'nosniff');
    // Enable browser XSS filtering
    res.setHeader('X-XSS-Protection', '1; mode=block');
    // Referrer control
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    // Camera allowed for QR scanning, all other sensors locked
    res.setHeader('Permissions-Policy', 'camera=(self), microphone=(), geolocation=()');
    // Content Security Policy
    res.setHeader(
      'Content-Security-Policy',
      "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: blob: https:; connect-src 'self' https: ws: wss:;"
    );
    // Don't advertise server technology
    res.removeHeader('X-Powered-By');
    next();
  });
}
