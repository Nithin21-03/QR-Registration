import pg from 'pg';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const { Pool } = pg;

// Local fallback data directory for high resilience / offline mode
const isServerless = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);
const dataDir = isServerless ? path.join('/tmp', 'zyntra_data') : path.join(__dirname, 'data');
const cacheFile = path.join(dataDir, 'scanner_cache.json');

try {
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
} catch (err) {
  console.warn('Data directory notice:', err.message);
}

// In-memory / file cache for offline resilience
let localCache = {
  registrations: [],
  scans: [],
  lastSynced: null,
};

function loadLocalCache() {
  try {
    if (fs.existsSync(cacheFile)) {
      const raw = fs.readFileSync(cacheFile, 'utf8');
      localCache = JSON.parse(raw);
    }
  } catch (e) {
    console.warn('Local cache read note:', e.message);
  }
}

function saveLocalCache() {
  try {
    fs.writeFileSync(cacheFile, JSON.stringify(localCache, null, 2), 'utf8');
  } catch (e) {
    console.warn('Local cache write note:', e.message);
  }
}

loadLocalCache();

// PostgreSQL Connection Pool for Supabase (using Supavisor IPv4 Pooler for Vercel/Serverless support)
const defaultDbUrl = 'postgresql://postgres.yjmkprrvjhvpsrnnlugn:Nithin%4021_2@aws-1-eu-west-3.pooler.supabase.com:5432/postgres';

function normalizeDatabaseUrl(raw) {
  let url = (raw || defaultDbUrl).trim();
  // Direct Supabase host (db.yjmkprrvjhvpsrnnlugn.supabase.co) is IPv6-only (AAAA record only).
  // AWS Lambda / Vercel serverless functions fail with ENOTFOUND on IPv6-only hosts.
  // Auto-rewrite to the verified Supavisor IPv4 Pooler endpoint:
  if (url.includes('db.yjmkprrvjhvpsrnnlugn.supabase.co')) {
    url = url
      .replace('db.yjmkprrvjhvpsrnnlugn.supabase.co:5432', 'aws-1-eu-west-3.pooler.supabase.com:5432')
      .replace('db.yjmkprrvjhvpsrnnlugn.supabase.co', 'aws-1-eu-west-3.pooler.supabase.com:5432');
    if (!url.includes('postgres.yjmkprrvjhvpsrnnlugn:')) {
      url = url.replace('postgres:', 'postgres.yjmkprrvjhvpsrnnlugn:');
    }
  }
  return url;
}

const databaseUrl = normalizeDatabaseUrl(process.env.DATABASE_URL);
const useSsl = process.env.DATABASE_SSL !== 'false';

let pool = globalThis._zyntraPgPool || null;
let isConnected = false;
let dbError = null;

if (!pool && databaseUrl) {
  try {
    pool = new Pool({
      connectionString: databaseUrl,
      ssl: useSsl ? { rejectUnauthorized: false } : false,
      connectionTimeoutMillis: 15000,
      idleTimeoutMillis: 30000,
      max: 4,
      keepAlive: true,
    });

    pool.on('error', (err) => {
      console.warn('PostgreSQL idle client note:', err.message);
    });
    globalThis._zyntraPgPool = pool;
  } catch (err) {
    dbError = err.message;
    console.error('Failed to configure PostgreSQL pool:', err);
  }
}

/**
 * Initialize Database Tables and Schema Extension
 */
export async function initDatabase() {
  if (!pool) return false;
  if (isConnected) return true;

  try {
    const client = await pool.connect();
    try {
      await client.query('SELECT 1');
      isConnected = true;
      dbError = null;
      console.log('✓ Successfully connected to Supabase PostgreSQL cluster.');

      // Sync local cache with current database state
      await refreshLocalCache(client);
      return true;
    } finally {
      client.release();
    }
  } catch (err) {
    isConnected = false;
    dbError = err.message;
    console.warn('Database initialization note:', err.message);
    return false;
  }
}

async function refreshLocalCache(client) {
  try {
    const { rows } = await client.query('SELECT * FROM registrations ORDER BY id DESC');
    localCache.registrations = rows;
      isConnected = true;
    localCache.lastSynced = new Date().toISOString();
    saveLocalCache();
  } catch (err) {
    console.warn('Cache refresh note:', err.message);
  }
}

/**
 * Extract ticket ID from various input shapes (raw ID, JSON QR, URL)
 */
export function sanitizeTicketInput(input) {
  if (!input) return '';
  let str = String(input).trim();

  // 1. Check if input is a JSON string from ticket payload
  if ((str.startsWith('{') && str.endsWith('}')) || (str.startsWith('[') && str.endsWith(']'))) {
    try {
      const parsed = JSON.parse(str);
      const target = Array.isArray(parsed) ? parsed[0] : parsed;
      if (target?.ticket_id) return String(target.ticket_id).toUpperCase().trim();
      if (target?.id) return String(target.id).toUpperCase().trim();
      if (target?.ticketId) return String(target.ticketId).toUpperCase().trim();
      if (target?.passId) return String(target.passId).toUpperCase().trim();
    } catch (_) {}
  }

  // 2. Check for URL query params: id, ticket, pass, ticket_id
  if (str.includes('?') || str.includes('&')) {
    const match = str.match(/[?&](?:ticket|id|pass|ticket_id)=([^&#]+)/i);
    if (match && match[1]) {
      const extracted = decodeURIComponent(match[1]).trim();
      if (extracted) return sanitizeTicketInput(extracted);
    }
  }

  // 3. Check for URL path patterns: /pass/ZY-..., /ticket/ZY-..., /verify/ZY-...
  const pathMatch = str.match(/\/(?:pass|ticket|verify|attendee)\/(ZY-[A-Z0-9_-]+)/i);
  if (pathMatch && pathMatch[1]) {
    const extracted = decodeURIComponent(pathMatch[1]).trim();
    if (extracted) return sanitizeTicketInput(extracted);
  }

  // 4. Extract standard Zyntra Pass pattern anywhere in text: ZY-XXXX-XXXX
  const zyRegex = /\b(ZY-[A-Z0-9]{3,8}-[A-Z0-9]{3,8})\b/i;
  const zyMatch = str.match(zyRegex);
  if (zyMatch && zyMatch[1]) {
    return zyMatch[1].toUpperCase().trim();
  }

  // 5. Strip common text prefixes (e.g. "PASS: ", "TICKET ID: ", "OFFICIAL QR GATE PASS")
  str = str.replace(/^(?:OFFICIAL\s+QR\s+GATE\s+PASS\s+|PASS\s*(?:ID)?\s*[:\-]\s*|TICKET\s*(?:ID)?\s*[:\-]\s*)/i, '').trim();

  return str;
}

/**
 * Verify pass details by Ticket ID, Email, or Student ID
 */
export async function verifyPass(rawInput) {
  const queryParam = sanitizeTicketInput(rawInput);
  if (!queryParam) return null;

  // Try live database first
  if (pool) {
    try {
      const res = await pool.query(
        `SELECT * FROM registrations 
         WHERE LOWER(ticket_id) = LOWER($1) 
            OR LOWER(email) = LOWER($1) 
            OR LOWER(student_id) = LOWER($1)
         LIMIT 1`,
        [queryParam]
      );
      if (res.rows.length > 0) {
        return res.rows[0];
      }
    } catch (err) {
      console.warn('Database verify query note, falling back to local cache:', err.message);
    }
  }

  // Fallback to local cache
  const qLower = queryParam.toLowerCase();
  const cached = localCache.registrations.find(
    (r) =>
      (r.ticket_id && r.ticket_id.toLowerCase() === qLower) ||
      (r.email && r.email.toLowerCase() === qLower) ||
      (r.student_id && r.student_id.toLowerCase() === qLower) ||
      (r.full_name && r.full_name.toLowerCase() === qLower)
  );

  return cached || null;
}

/**
 * Process a QR code scan at a check-in gate or food counter
 */
export async function processScan({ ticketInput, scanType = 'MAIN_ENTRANCE', station = 'Gate 1', volunteer = 'Volunteer', forceOverride = false }) {
  const ticketId = sanitizeTicketInput(ticketInput);
  const now = new Date();

  // 1. Locate attendee record
  const attendee = await verifyPass(ticketId);

  if (!attendee) {
    // Record invalid attempt in scan logs
    await logScanAttempt({
      ticketId: ticketId || 'UNKNOWN',
      scanType,
      station,
      volunteer,
      result: 'INVALID',
      details: { input: ticketInput, reason: 'Ticket ID not registered in system' },
    });

    return {
      success: false,
      result: 'INVALID',
      message: `Pass "${ticketId}" not found in ZYNTRA registry. Direct attendee to Helpdesk.`,
      ticketId,
      timestamp: now.toISOString(),
    };
  }

  const cleanTicketId = attendee.ticket_id;

  // -------------------------------------------------------------
  // FLOW A: MAIN ENTRANCE CHECK-IN
  // -------------------------------------------------------------
  if (scanType === 'MAIN_ENTRANCE') {
    // Check for duplicate scan
    if (attendee.checked_in && !forceOverride) {
      await logScanAttempt({
        ticketId: cleanTicketId,
        scanType,
        station,
        volunteer,
        result: 'DUPLICATE',
        details: {
          firstScanAt: attendee.checked_in_at,
          firstScanBy: attendee.checked_in_by,
        },
      });

      return {
        success: false,
        result: 'DUPLICATE',
        message: 'PASS ALREADY SCANNED AT ENTRANCE',
        attendee,
        firstScanAt: attendee.checked_in_at,
        firstScanBy: attendee.checked_in_by || 'Gate Staff',
        station,
        timestamp: now.toISOString(),
      };
    }

    // Mark as Checked In
    attendee.checked_in = true;
    attendee.checked_in_at = now.toISOString();
    attendee.checked_in_by = `${station} (${volunteer})`;

    if (pool) {
      try {
        await pool.query(
          `UPDATE registrations 
           SET checked_in = TRUE, 
               checked_in_at = NOW(), 
               checked_in_by = $1,
               check_in_status = 'CHECKED_IN',
               check_in_time = NOW()
           WHERE id = $2`,
          [attendee.checked_in_by, attendee.id]
        );
      } catch (err) {
        console.warn('DB update check-in note:', err.message);
      }
    }

    saveLocalCache();

    await logScanAttempt({
      ticketId: cleanTicketId,
      scanType,
      station,
      volunteer,
      result: 'VALID',
      details: { eventName: attendee.event_name, college: attendee.college },
    });

    return {
      success: true,
      result: 'VALID',
      message: 'ACCESS GRANTED · WELCOME TO ZYNTRA \'26',
      attendee,
      timestamp: now.toISOString(),
      station,
    };
  }

  // -------------------------------------------------------------
  // FLOW B: FOOD / MEAL COLLECTION
  // -------------------------------------------------------------
  if (scanType === 'FOOD_COLLECTION') {
    // Check for duplicate food claim
    if (attendee.food_claimed && !forceOverride) {
      await logScanAttempt({
        ticketId: cleanTicketId,
        scanType,
        station,
        volunteer,
        result: 'DUPLICATE_FOOD',
        details: {
          claimedAt: attendee.food_claimed_at,
          claimedBy: attendee.food_claimed_by,
        },
      });

      return {
        success: false,
        result: 'DUPLICATE_FOOD',
        message: 'MEAL PASS ALREADY REDEEMED',
        attendee,
        claimedAt: attendee.food_claimed_at,
        claimedBy: attendee.food_claimed_by || 'Food Staff',
        station,
        timestamp: now.toISOString(),
      };
    }

    // Mark food as claimed
    attendee.food_claimed = true;
    attendee.food_claimed_at = now.toISOString();
    attendee.food_claimed_by = `${station} (${volunteer})`;

    if (pool) {
      try {
        await pool.query(
          `UPDATE registrations 
           SET food_claimed = TRUE, 
               food_claimed_at = NOW(), 
               food_claimed_by = $1 
           WHERE id = $2`,
          [attendee.food_claimed_by, attendee.id]
        );
      } catch (err) {
        console.warn('DB update food claim note:', err.message);
      }
    }

    saveLocalCache();

    await logScanAttempt({
      ticketId: cleanTicketId,
      scanType,
      station,
      volunteer,
      result: 'FOOD_CLAIMED',
      details: { eventName: attendee.event_name },
    });

    return {
      success: true,
      result: 'FOOD_CLAIMED',
      message: 'FOOD TOKEN VERIFIED · MEAL DISPENSED',
      attendee,
      timestamp: now.toISOString(),
      station,
    };
  }

  return { success: false, result: 'UNKNOWN', message: 'Unknown scan type' };
}

/**
 * Log scan activity for auditing and reporting
 */
async function logScanAttempt({ ticketId, scanType, station, volunteer, result, details }) {
  const scanRecord = {
    ticket_id: ticketId,
    scan_type: scanType,
    scanned_at: new Date().toISOString(),
    scanner_station: station,
    volunteer_name: volunteer,
    result,
    details: details || {},
  };

  localCache.scans.unshift(scanRecord);
  if (localCache.scans.length > 500) localCache.scans.pop();
  saveLocalCache();

  if (pool) {
    try {
      await pool.query(
        `INSERT INTO attendance_scans (ticket_id, scan_type, scanner_station, volunteer_name, result, details)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [ticketId, scanType, station, volunteer, result, JSON.stringify(details || {})]
      );
    } catch (err) {
      console.warn('DB scan log note:', err.message);
    }
  }
}

/**
 * Undo or reset a check-in / food scan (for supervisor override)
 */
export async function undoScan({ ticketId, scanType }) {
  const cleanId = sanitizeTicketInput(ticketId);
  const attendee = await verifyPass(cleanId);
  if (!attendee) return { success: false, message: 'Attendee not found' };

  if (scanType === 'MAIN_ENTRANCE') {
    attendee.checked_in = false;
    attendee.checked_in_at = null;
    attendee.checked_in_by = null;

    if (pool) {
      try {
        await pool.query(
          `UPDATE registrations 
           SET checked_in = FALSE, checked_in_at = NULL, checked_in_by = NULL, check_in_status = 'PENDING', check_in_time = NULL
           WHERE id = $1`,
          [attendee.id]
        );
      } catch (err) {
        console.warn('DB undo check-in note:', err.message);
      }
    }
  } else if (scanType === 'FOOD_COLLECTION') {
    attendee.food_claimed = false;
    attendee.food_claimed_at = null;
    attendee.food_claimed_by = null;

    if (pool) {
      try {
        await pool.query(
          `UPDATE registrations 
           SET food_claimed = FALSE, food_claimed_at = NULL, food_claimed_by = NULL 
           WHERE id = $1`,
          [attendee.id]
        );
      } catch (err) {
        console.warn('DB undo food claim note:', err.message);
      }
    }
  }

  saveLocalCache();
  return { success: true, attendee, message: `Scan status reverted for ${attendee.full_name}` };
}

/**
 * Aggregate comprehensive statistics for Admin dashboard
 */
export async function getStats() {
  let list = localCache.registrations;

  if (pool) {
    try {
      const { rows } = await pool.query('SELECT * FROM registrations ORDER BY id DESC');
      list = rows;
      localCache.registrations = rows;
      isConnected = true;
      dbError = null;
    } catch (err) {
      isConnected = false;
      dbError = err.message;
      console.warn('DB getStats note, using local cache:', err.message);
    }
  }

  const totalRegistered = list.length;
  const totalCheckedIn = list.filter((r) => r.checked_in).length;
  const totalFoodClaimed = list.filter((r) => r.food_claimed).length;

  const attendanceRate = totalRegistered > 0 ? Math.round((totalCheckedIn / totalRegistered) * 100) : 0;
  const foodRate = totalRegistered > 0 ? Math.round((totalFoodClaimed / totalRegistered) * 100) : 0;

  // Event Breakdown
  const eventMap = {};
  list.forEach((r) => {
    const ev = r.event_name || 'General Pass';
    if (!eventMap[ev]) {
      eventMap[ev] = { eventName: ev, total: 0, checkedIn: 0, foodClaimed: 0 };
    }
    eventMap[ev].total += 1;
    if (r.checked_in) eventMap[ev].checkedIn += 1;
    if (r.food_claimed) eventMap[ev].foodClaimed += 1;
  });

  // College Breakdown
  const collegeMap = {};
  list.forEach((r) => {
    const col = r.college || 'Other';
    if (!collegeMap[col]) collegeMap[col] = { college: col, count: 0, checkedIn: 0 };
    collegeMap[col].count += 1;
    if (r.checked_in) collegeMap[col].checkedIn += 1;
  });

  // Hourly Check-in Velocity
  const hourlyMap = {};
  list.forEach((r) => {
    if (r.checked_in_at) {
      const d = new Date(r.checked_in_at);
      const hourStr = `${d.getHours().toString().padStart(2, '0')}:00`;
      hourlyMap[hourStr] = (hourlyMap[hourStr] || 0) + 1;
    }
  });

  return {
    overview: {
      totalRegistered,
      totalCheckedIn,
      totalPending: Math.max(0, totalRegistered - totalCheckedIn),
      attendanceRate,
      totalFoodClaimed,
      remainingFood: Math.max(0, totalRegistered - totalFoodClaimed),
      foodRate,
    },
    eventBreakdown: Object.values(eventMap),
    collegeBreakdown: Object.values(collegeMap).sort((a, b) => b.count - a.count).slice(0, 10),
    hourlyVelocity: Object.entries(hourlyMap).map(([hour, count]) => ({ hour, count })),
    recentScans: localCache.scans.slice(0, 30),
    database: {
      connected: isConnected,
      url: databaseUrl ? databaseUrl.split('@')[1] : 'Local In-Memory Cache',
      lastSynced: localCache.lastSynced,
      error: dbError,
    },
  };
}

/**
 * Filter & search attendees
 */
export async function getAttendees({ search = '', status = 'ALL', eventId = 'ALL', limit = 100 }) {
  let list = localCache.registrations;

  if (pool) {
    try {
      const { rows } = await pool.query('SELECT * FROM registrations ORDER BY id DESC');
      list = rows;
      localCache.registrations = rows;
    } catch (_) {}
  }

  let filtered = list;

  if (search.trim()) {
    const s = search.toLowerCase().trim();
    filtered = filtered.filter(
      (r) =>
        (r.full_name && r.full_name.toLowerCase().includes(s)) ||
        (r.ticket_id && r.ticket_id.toLowerCase().includes(s)) ||
        (r.college && r.college.toLowerCase().includes(s)) ||
        (r.student_id && r.student_id.toLowerCase().includes(s)) ||
        (r.email && r.email.toLowerCase().includes(s)) ||
        (r.phone && r.phone.includes(s)) ||
        (r.team_name && r.team_name.toLowerCase().includes(s))
    );
  }

  if (status === 'CHECKED_IN') {
    filtered = filtered.filter((r) => r.checked_in);
  } else if (status === 'PENDING') {
    filtered = filtered.filter((r) => !r.checked_in);
  } else if (status === 'FOOD_CLAIMED') {
    filtered = filtered.filter((r) => r.food_claimed);
  } else if (status === 'FOOD_PENDING') {
    filtered = filtered.filter((r) => !r.food_claimed);
  }

  if (eventId && eventId !== 'ALL') {
    filtered = filtered.filter((r) => r.event_id === eventId || r.event_name === eventId);
  }

  return filtered.slice(0, limit);
}

/**
 * Generate CSV export text
 */
export async function generateAttendanceCsv() {
  const attendees = await getAttendees({ limit: 5000 });
  const headers = [
    'Ticket ID',
    'Full Name',
    'College',
    'Student ID',
    'Email',
    'Phone',
    'Event Name',
    'Team Name',
    'Checked In Status',
    'Gate Check-in Time',
    'Gate / Volunteer',
    'Food Claimed Status',
    'Food Claim Time',
    'Food Station / Volunteer',
    'Registered At',
  ];

  const rows = attendees.map((a) => [
    `"${a.ticket_id || ''}"`,
    `"${(a.full_name || '').replace(/"/g, '""')}"`,
    `"${(a.college || '').replace(/"/g, '""')}"`,
    `"${a.student_id || ''}"`,
    `"${a.email || ''}"`,
    `"${a.phone || ''}"`,
    `"${(a.event_name || '').replace(/"/g, '""')}"`,
    `"${(a.team_name || '').replace(/"/g, '""')}"`,
    a.checked_in ? 'CHECKED IN' : 'PENDING',
    a.checked_in_at ? `"${a.checked_in_at}"` : '""',
    `"${a.checked_in_by || ''}"`,
    a.food_claimed ? 'CLAIMED' : 'PENDING',
    a.food_claimed_at ? `"${a.food_claimed_at}"` : '""',
    `"${a.food_claimed_by || ''}"`,
    `"${a.created_at || ''}"`,
  ]);

  return [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
}

/**
 * Seed database with realistic demo Zyntra attendees if empty
 */
export async function insertAttendee(attendee) {
  if (!attendee || !attendee.ticket_id || !attendee.full_name) {
    throw new Error('ticket_id and full_name are required');
  }

  const ticketId = sanitizeTicketInput(attendee.ticket_id).toUpperCase();
  const fullName = String(attendee.full_name).trim();
  const college = String(attendee.college || '').trim();
  const email = String(attendee.email || '').trim();
  const phone = String(attendee.phone || '').trim();
  const studentId = String(attendee.student_id || attendee.studentId || attendee.usn || '').trim();
  const eventId = String(attendee.event_id || attendee.eventId || 'general').trim();
  const eventName = String(attendee.event_name || attendee.eventName || 'Zyntra Fest').trim();
  const teamName = String(attendee.team_name || attendee.teamName || '').trim();
  const teamMembers = JSON.stringify(Array.isArray(attendee.team_members) ? attendee.team_members : []);
  const status = String(attendee.status || 'CONFIRMED').trim();

  if (pool) {
    await pool.query(
      `INSERT INTO registrations (ticket_id, full_name, college, email, phone, student_id, event_id, event_name, team_name, team_members, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       ON CONFLICT (ticket_id) DO UPDATE SET
         full_name = EXCLUDED.full_name,
         college = EXCLUDED.college,
         email = EXCLUDED.email,
         phone = EXCLUDED.phone,
         student_id = EXCLUDED.student_id,
         event_id = EXCLUDED.event_id,
         event_name = EXCLUDED.event_name,
         team_name = EXCLUDED.team_name,
         team_members = EXCLUDED.team_members,
         status = EXCLUDED.status`,
      [ticketId, fullName, college, email, phone, studentId, eventId, eventName, teamName, teamMembers, status]
    );

    // Refresh local cache with latest DB records
    const { rows } = await pool.query('SELECT * FROM registrations ORDER BY id DESC');
    localCache.registrations = rows || [];
    saveLocalCache();
  } else {
    const existing = localCache.registrations.find((r) => r.ticket_id === ticketId);
    if (existing) {
      Object.assign(existing, { full_name: fullName, college, email, phone, student_id: studentId, event_name: eventName, team_name: teamName });
    } else {
      localCache.registrations.unshift({
        id: localCache.registrations.length + 1,
        ticket_id: ticketId,
        full_name: fullName,
        college,
        email,
        phone,
        student_id: studentId,
        event_id: eventId,
        event_name: eventName,
        team_name: teamName,
        team_members: JSON.parse(teamMembers),
        status,
        checked_in: false,
        food_claimed: false,
        created_at: new Date().toISOString(),
      });
    }
    saveLocalCache();
  }

  return { success: true, ticket_id: ticketId };
}

export async function importAttendeesBatch(list) {
  if (!Array.isArray(list) || list.length === 0) {
    return { success: true, count: 0 };
  }

  let count = 0;
  for (const item of list) {
    if (item.ticket_id && item.full_name) {
      await insertAttendee(item);
      count++;
    }
  }

  return { success: true, count, total: localCache.registrations.length };
}

/**
 * Seed Sample Zyntra Registrations (Empty by default to ensure 100% database driven)
 */
export async function seedSampleData() {
  return { success: true, count: 0, total: localCache.registrations.length };
}

