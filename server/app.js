import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  initDatabase,
  verifyPass,
  processScan,
  undoScan,
  getStats,
  getAttendees,
  generateAttendanceCsv,
  seedSampleData,
  insertAttendee,
  importAttendeesBatch,
} from './db.js';
import {
  applySecurityHeaders,
  rateLimiter,
  requireVolunteerAuth,
  sanitizeScanRequest,
  handleVerifyPasscode,
} from './security.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// 1. Cyber Security Headers & Proxy Configuration
applySecurityHeaders(app);

// 2. Body Parsing & CORS
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

// 3. Strict SQL & Script Injection Defense
app.use(sanitizeScanRequest);

// Initialize Database connection on boot & ensure readiness for serverless cold-starts
let dbReady = false;
let dbInitPromise = null;

function ensureDbReady() {
  if (!dbInitPromise) {
    dbInitPromise = initDatabase()
      .then((ready) => {
        dbReady = ready;
        console.log(`[DB] Engine initialized: ${ready ? 'Supabase Cloud PostgreSQL' : 'Resilient In-Memory Storage'}`);
        return ready;
      })
      .catch((err) => {
        console.warn('[DB] Startup notice:', err.message);
        return false;
      });
  }
  return dbInitPromise;
}

// Kick off immediately on module load
ensureDbReady();

// Await DB initialization on every incoming request so serverless cold starts never race
app.use(async (req, res, next) => {
  await ensureDbReady();
  next();
});

// -------------------------------------------------------------
// API ROUTES
// -------------------------------------------------------------

// 0. Volunteer Authentication & Security Token Issuance
app.post(
  '/api/auth/verify-passcode',
  rateLimiter({ maxRequests: 10, windowMs: 60000, message: 'Too many authentication attempts.' }),
  handleVerifyPasscode
);

// 1. Health & Connection Diagnostic (Public for ping & latency status)
app.get('/api/health', async (req, res) => {
  try {
    const stats = await getStats();
    res.json({
      status: 'ONLINE',
      system: 'ZYNTRA 2026 Standalone Pass & Food Scanner Engine',
      database: stats.database,
      totalAttendees: stats.overview.totalRegistered,
      totalCheckedIn: stats.overview.totalCheckedIn,
      totalFoodClaimed: stats.overview.totalFoodClaimed,
      security: {
        antiTamper: 'ACTIVE',
        rateLimiting: 'ACTIVE',
        ssl: true,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    res.status(500).json({ status: 'ERROR', error: err.message });
  }
});

// 2. Real-time Attendance & Food Analytics
app.get('/api/stats', async (req, res) => {
  try {
    const stats = await getStats();
    res.json(stats);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 3. Attendee Directory with Search & Filters (Secured)
app.get('/api/attendees', requireVolunteerAuth, async (req, res) => {
  try {
    const { search = '', status = 'ALL', eventId = 'ALL', limit = 500 } = req.query;
    const list = await getAttendees({
      search,
      status,
      eventId,
      limit: parseInt(limit, 10) || 500,
    });
    res.json({ count: list.length, attendees: list });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 4. Quick Verify Pass without Modifying Status (Secured)
app.get('/api/verify/:ticketId', requireVolunteerAuth, async (req, res) => {
  try {
    const attendee = await verifyPass(req.params.ticketId);
    if (!attendee) {
      return res.status(404).json({
        found: false,
        message: 'Pass not registered or invalid ticket ID',
      });
    }
    res.json({ found: true, attendee });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 5. Execute Scan (Gate Check-In OR Food Collection - Auth & Rate-Protected)
app.post(
  '/api/scan',
  requireVolunteerAuth,
  rateLimiter({ maxRequests: 90, windowMs: 60000, message: 'High scanning velocity limit reached. Please pause 2 seconds.' }),
  async (req, res) => {
    try {
      const {
        ticketInput,
        scanType = 'MAIN_ENTRANCE',
        station = 'Gate 1',
        volunteer = 'Volunteer',
        forceOverride = false,
      } = req.body;

      if (!ticketInput) {
        return res.status(400).json({ success: false, message: 'Ticket ID or QR data payload is required' });
      }

      const result = await processScan({
        ticketInput,
        scanType,
        station,
        volunteer,
        forceOverride: Boolean(forceOverride),
      });

      res.json(result);
    } catch (err) {
      console.error('Scan error:', err);
      res.status(500).json({ success: false, message: err.message });
    }
  }
);

// 6. Undo Scan (Revert check-in or food claim - Secured)
app.post('/api/undo-scan', requireVolunteerAuth, async (req, res) => {
  try {
    const { ticketId, scanType } = req.body;
    if (!ticketId || !scanType) {
      return res.status(400).json({ success: false, message: 'Ticket ID and scanType are required' });
    }

    const result = await undoScan({ ticketId, scanType });
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 7. Add or Update Single Attendee (Secured)
app.post('/api/attendees', requireVolunteerAuth, async (req, res) => {
  try {
    const attendee = req.body;
    if (!attendee?.ticket_id || !attendee?.full_name) {
      return res.status(400).json({ success: false, message: 'ticket_id and full_name are required' });
    }
    const result = await insertAttendee(attendee);
    res.json({ success: true, message: `Attendee ${attendee.full_name} (${attendee.ticket_id}) registered successfully in database.`, details: result });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 8. Batch Import Attendees from CSV/JSON (Secured)
app.post('/api/import', requireVolunteerAuth, async (req, res) => {
  try {
    const { attendees } = req.body;
    if (!Array.isArray(attendees)) {
      return res.status(400).json({ success: false, message: 'attendees array is required' });
    }
    const result = await importAttendeesBatch(attendees);
    res.json({ success: true, message: `Successfully imported ${result.count} attendees into database.`, details: result });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 9. Seed Demo Zyntra Attendees (Empty/Safe)
app.post('/api/seed', requireVolunteerAuth, async (req, res) => {
  try {
    const result = await seedSampleData();
    res.json({
      success: true,
      message: 'Sample Zyntra \'26 passes seeded successfully into registry.',
      details: result,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 8. Export Attendance CSV (Secured)
app.get('/api/export', requireVolunteerAuth, async (req, res) => {
  try {
    const csvData = await generateAttendanceCsv();
    const filename = `zyntra2026_attendance_${new Date().toISOString().slice(0, 10)}.csv`;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csvData);
  } catch (err) {
    res.status(500).send(`Error generating CSV: ${err.message}`);
  }
});

// Serve frontend in production build if dist directory exists
const distDir = path.join(__dirname, '..', 'dist');
if (fs.existsSync(distDir)) {
  app.use(express.static(distDir));
  app.get('*', (req, res) => {
    res.sendFile(path.join(distDir, 'index.html'));
  });
}

export default app;

