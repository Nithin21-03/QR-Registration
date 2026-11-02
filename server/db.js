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
const dataDir = path.join(__dirname, 'data');
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

// PostgreSQL Connection Pool for Supabase
const defaultDbUrl = 'postgresql://postgres:Nithin%4021_2@db.yjmkprrvjhvpsrnnlugn.supabase.co:5432/postgres';
const databaseUrl = process.env.DATABASE_URL || defaultDbUrl;
const useSsl = process.env.DATABASE_SSL !== 'false';

let pool = null;
let isConnected = false;
let dbError = null;

if (databaseUrl) {
  try {
    pool = new Pool({
      connectionString: databaseUrl,
      ssl: useSsl ? { rejectUnauthorized: false } : false,
      connectionTimeoutMillis: 15000,
      idleTimeoutMillis: 30000,
      max: 10,
    });

    pool.on('error', (err) => {
      console.warn('Unexpected idle PostgreSQL client error:', err.message);
    });
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

  try {
    const client = await pool.connect();
    try {
      // 1. Ensure registrations table exists
      await client.query(`
        CREATE TABLE IF NOT EXISTS registrations (
          id SERIAL PRIMARY KEY,
          ticket_id VARCHAR(50) UNIQUE NOT NULL,
          full_name VARCHAR(150) NOT NULL,
          college VARCHAR(250) NOT NULL,
          email VARCHAR(150) NOT NULL,
          phone VARCHAR(20) NOT NULL,
          student_id VARCHAR(50) NOT NULL,
          department VARCHAR(100),
          semester VARCHAR(50),
          event_id VARCHAR(100) NOT NULL,
          event_name VARCHAR(200) NOT NULL,
          team_name VARCHAR(150),
          team_members JSONB DEFAULT '[]'::jsonb,
          members_detail JSONB DEFAULT '[]'::jsonb,
          amount_paid VARCHAR(50) DEFAULT '₹ 500',
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          status VARCHAR(50) DEFAULT 'CONFIRMED'
        );
      `);

      // 2. Extend with attendance check-in and food claim fields
      await client.query(`
        ALTER TABLE registrations ADD COLUMN IF NOT EXISTS checked_in BOOLEAN DEFAULT FALSE;
        ALTER TABLE registrations ADD COLUMN IF NOT EXISTS checked_in_at TIMESTAMP WITH TIME ZONE;
        ALTER TABLE registrations ADD COLUMN IF NOT EXISTS checked_in_by VARCHAR(100);
        ALTER TABLE registrations ADD COLUMN IF NOT EXISTS food_claimed BOOLEAN DEFAULT FALSE;
        ALTER TABLE registrations ADD COLUMN IF NOT EXISTS food_claimed_at TIMESTAMP WITH TIME ZONE;
        ALTER TABLE registrations ADD COLUMN IF NOT EXISTS food_claimed_by VARCHAR(100);
      `);

      // 3. Create full audit scans table
      await client.query(`
        CREATE TABLE IF NOT EXISTS attendance_scans (
          id SERIAL PRIMARY KEY,
          ticket_id VARCHAR(50) NOT NULL,
          scan_type VARCHAR(50) NOT NULL,
          scanned_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          scanner_station VARCHAR(100) DEFAULT 'Gate 1',
          volunteer_name VARCHAR(100) DEFAULT 'Volunteer',
          result VARCHAR(50) NOT NULL,
          details JSONB DEFAULT '{}'::jsonb
        );
        CREATE INDEX IF NOT EXISTS idx_scans_ticket ON attendance_scans(ticket_id);
        CREATE INDEX IF NOT EXISTS idx_scans_type ON attendance_scans(scan_type);
        CREATE INDEX IF NOT EXISTS idx_scans_time ON attendance_scans(scanned_at DESC);
      `);

      isConnected = true;
      console.log('✓ Successfully connected to Supabase PostgreSQL & verified tables.');

      // Sync local cache with current database state
      await refreshLocalCache(client);
      return true;
    } finally {
      client.release();
    }
  } catch (err) {
    dbError = err.message;
    console.warn('Database initialization note (using local cache):', err.message);
    return false;
  }
}

/**
 * Sync local cache with remote DB for fast lookups & offline durability
 */
async function refreshLocalCache(client) {
  try {
    const { rows } = await client.query('SELECT * FROM registrations ORDER BY id DESC');
    localCache.registrations = rows;
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
  if (pool && isConnected) {
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

    if (pool && isConnected) {
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

    if (pool && isConnected) {
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

  if (pool && isConnected) {
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

    if (pool && isConnected) {
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

    if (pool && isConnected) {
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

  if (pool && isConnected) {
    try {
      const { rows } = await pool.query('SELECT * FROM registrations ORDER BY id DESC');
      list = rows;
      localCache.registrations = rows;
    } catch (err) {
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

  if (pool && isConnected) {
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
export async function seedSampleData() {
  const sampleAttendees = [
    {
      ticket_id: 'ZY-4821-B7E2',
      full_name: 'Adarsh Rao',
      college: 'Sapthagiri NPS University (SNPSU)',
      email: 'adarsh.rao@snpsu.edu.in',
      phone: '+91 9916011220',
      student_id: '1SG22CS088',
      event_id: 'paper',
      event_name: 'Project / Paper Presentation',
      team_name: 'NeuralInnovators',
      team_members: ['Kavya S', 'Rahul M'],
      status: 'CONFIRMED',
    },
    {
      ticket_id: 'ZY-7734-C9A1',
      full_name: 'Sneha Venkatesh',
      college: 'Ramaiah Institute of Technology',
      email: 'sneha.v@msrit.edu',
      phone: '+91 9845123456',
      student_id: '1MS22AI045',
      event_id: 'prompt',
      event_name: 'Prompt Detection + Pixel Art',
      team_name: 'PixelPrompt AI',
      team_members: ['Ananya P'],
      status: 'CONFIRMED',
    },
    {
      ticket_id: 'ZY-1092-D4F3',
      full_name: 'Karthik Subramanian',
      college: 'BMS College of Engineering',
      email: 'karthik.s@bmsce.ac.in',
      phone: '+91 9731234567',
      student_id: '1BM22IS019',
      event_id: 'crime',
      event_name: 'Crime Scene: Forensic AI',
      team_name: 'SherlockBytes',
      team_members: ['Gaurav K', 'Varun N', 'Rhea D'],
      status: 'CONFIRMED',
    },
    {
      ticket_id: 'ZY-8820-F1E8',
      full_name: 'Pooja Hegde',
      college: 'PES University, Ring Road',
      email: 'pooja.hegde@pes.edu',
      phone: '+91 9611223344',
      student_id: 'PES1UG22CS301',
      event_id: 'debug',
      event_name: 'System Design & High Scale',
      team_name: 'ByteArchitects',
      team_members: ['Siddharth M'],
      status: 'CONFIRMED',
    },
    {
      ticket_id: 'ZY-3351-A2B9',
      full_name: 'Mohammed Farhan',
      college: 'Dayananda Sagar College of Engineering',
      email: 'farhan.dsce@gmail.com',
      phone: '+91 9148332211',
      student_id: '1DS22EC072',
      event_id: 'escape',
      event_name: 'Escape Room Cyber Challenge',
      team_name: 'CipherLock',
      team_members: ['Zaid K', 'Arbaaz A'],
      status: 'CONFIRMED',
    },
    {
      ticket_id: 'ZY-9182-E5D7',
      full_name: 'Divya Nambiar',
      college: 'RV College of Engineering',
      email: 'divya.rvce@gmail.com',
      phone: '+91 9886554433',
      student_id: '1RV22CS064',
      event_id: 'wiki',
      event_name: 'WikiRace Speed Challenge',
      team_name: 'WikiWarp',
      team_members: [],
      status: 'CONFIRMED',
    },
    {
      ticket_id: 'ZY-6549-G8H3',
      full_name: 'Vikramaditya Sharma',
      college: 'Sapthagiri NPS University (SNPSU)',
      email: 'vikram.snpsu@gmail.com',
      phone: '+91 9448119988',
      student_id: '1SG22IS112',
      event_id: 'pitch',
      event_name: 'Startup Pitch Summit',
      team_name: 'GreenGrid Mobility',
      team_members: ['Rohit V', 'Tanvi S'],
      status: 'CONFIRMED',
    },
    {
      ticket_id: 'ZY-2468-K7M2',
      full_name: 'Ananya Deshmukh',
      college: 'International Institute of Information Technology (IIIT-B)',
      email: 'ananya.d@iiitb.ac.in',
      phone: '+91 9341778899',
      student_id: 'MT2022045',
      event_id: 'treasure',
      event_name: 'Campus Treasure Hunt',
      team_name: 'QuantumSeekers',
      team_members: ['Abhishek G', 'Neha R', 'Pranav K'],
      status: 'CONFIRMED',
    },
    {
      ticket_id: 'ZY-5591-L3P8',
      full_name: 'Nikhil Gowda',
      college: 'Bangalore Institute of Technology',
      email: 'nikhil.bit@yahoo.com',
      phone: '+91 9900445566',
      student_id: '1BI22CS099',
      event_id: 'ui',
      event_name: 'UI / UX Design Competition',
      team_name: 'FigmaMasters',
      team_members: [],
      status: 'CONFIRMED',
    },
    {
      ticket_id: 'RIT26-NEUR-BA9F9D',
      full_name: 'Rohan Mathur',
      college: 'Ramaiah Institute of Technology',
      email: 'rohan.mathur@msrit.edu',
      phone: '+91 9880112233',
      student_id: '1MS22CS110',
      event_id: 'neural-hack',
      event_name: 'NeuralHack: 36H National Hackathon',
      team_name: 'CortexCore',
      team_members: ['Akash D', 'Tarun K', 'Deepa S'],
      status: 'CONFIRMED',
    },
  ];

  let seededCount = 0;

  for (const item of sampleAttendees) {
    if (pool && isConnected) {
      try {
        await pool.query(
          `INSERT INTO registrations (ticket_id, full_name, college, email, phone, student_id, event_id, event_name, team_name, team_members, status)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
           ON CONFLICT (ticket_id) DO NOTHING`,
          [
            item.ticket_id,
            item.full_name,
            item.college,
            item.email,
            item.phone,
            item.student_id,
            item.event_id,
            item.event_name,
            item.team_name,
            JSON.stringify(item.team_members || []),
            item.status,
          ]
        );
        seededCount++;
      } catch (err) {
        console.warn('DB seed single item note:', err.message);
      }
    }

    // Also update localCache
    if (!localCache.registrations.find((r) => r.ticket_id === item.ticket_id)) {
      localCache.registrations.push({
        id: localCache.registrations.length + 1,
        ...item,
        checked_in: false,
        food_claimed: false,
        created_at: new Date().toISOString(),
      });
    }
  }

  saveLocalCache();
  return { success: true, count: seededCount, total: localCache.registrations.length };
}

