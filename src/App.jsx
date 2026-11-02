import React, { useState, useEffect, useCallback } from 'react';
import Header from './components/Header';
import ModeTabs from './components/ModeTabs';
import QRScannerView from './components/QRScannerView';
import ScanResultModal from './components/ScanResultModal';
import StatsDashboard from './components/StatsDashboard';
import AttendeeDirectory from './components/AttendeeDirectory';
import PassCardModal from './components/PassCardModal';
import SecurityGateModal from './components/SecurityGateModal';
import { sound } from './utils/audioSynth';
import {
  processClientScan,
  undoClientScan,
  getClientStats,
  loadClientAttendees,
  loadClientScans,
  saveClientAttendees,
} from './utils/clientScanner';
import { History, Clock, CheckCircle2, AlertTriangle, Utensils, XCircle } from 'lucide-react';

export default function App() {
  const [activeMode, setActiveMode] = useState('MAIN_ENTRANCE');
  const [station, setStation] = useState(() => {
    return localStorage.getItem('zyntra_station') || 'Gate 1 (Main Entrance)';
  });
  const [volunteer, setVolunteer] = useState(() => {
    return localStorage.getItem('zyntra_volunteer') || 'Volunteer';
  });

  // Security & Authentication Gatekeeper
  const [authToken, setAuthToken] = useState(() => sessionStorage.getItem('zyntra_auth_token'));
  const [authPasscode, setAuthPasscode] = useState(() => sessionStorage.getItem('zyntra_auth_passcode') || 'zyntra2026');
  const [isLocked, setIsLocked] = useState(() => !sessionStorage.getItem('zyntra_auth_token'));

  // Data states - Pure database source of truth
  const [stats, setStats] = useState(() => ({
    overview: {
      totalRegistered: 0,
      totalCheckedIn: 0,
      totalPending: 0,
      attendanceRate: 0,
      totalFoodClaimed: 0,
      remainingFood: 0,
      foodRate: 0,
    },
    eventBreakdown: [],
    collegeBreakdown: [],
    hourlyVelocity: [],
    recentScans: [],
    database: { connected: false, mode: 'Connecting...' },
  }));
  const [attendees, setAttendees] = useState(() => loadClientAttendees());
  const [health, setHealth] = useState({
    status: 'CONNECTING',
    database: { connected: false, mode: 'Supabase Cloud Database' },
    totalAttendees: 0,
  });
  const [isSeeding, setIsSeeding] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isUndoing, setIsUndoing] = useState(false);

  // Modals & Popups
  const [currentScanResult, setCurrentScanResult] = useState(null);
  const [viewingPassAttendee, setViewingPassAttendee] = useState(null);
  const [toastMessage, setToastMessage] = useState(null);

  // Save station and volunteer to localStorage
  useEffect(() => {
    localStorage.setItem('zyntra_station', station);
  }, [station]);

  useEffect(() => {
    localStorage.setItem('zyntra_volunteer', volunteer);
  }, [volunteer]);

  // Auth Header Builder
  const getAuthHeaders = useCallback(() => {
    const headers = { 'Content-Type': 'application/json' };
    const token = authToken || sessionStorage.getItem('zyntra_auth_token');
    const code = authPasscode || sessionStorage.getItem('zyntra_auth_passcode') || 'zyntra2026';
    if (token) headers['Authorization'] = `Bearer ${token}`;
    if (code) headers['X-Scanner-Passcode'] = code;
    return headers;
  }, [authToken, authPasscode]);

  // Fetch initial data & periodic cloud sync (every 3.5s for real-time multi-device sync)
  const fetchInitialData = useCallback(async () => {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 2500);
      const headers = getAuthHeaders();

      const [hRes, sRes, aRes] = await Promise.all([
        fetch('/api/health', { signal: controller.signal }).catch(() => null),
        fetch('/api/stats', { signal: controller.signal }).catch(() => null),
        fetch('/api/attendees?limit=500', { headers, signal: controller.signal }).catch(() => null),
      ]);
      clearTimeout(timeoutId);

      let serverOnline = false;

      if (hRes && hRes.ok) {
        setHealth(await hRes.json());
        serverOnline = true;
      }
      if (sRes && sRes.ok) {
        setStats(await sRes.json());
        serverOnline = true;
      }
      if (aRes && aRes.ok) {
        const data = await aRes.json();
        const serverAttendees = Array.isArray(data.attendees) ? data.attendees : [];
        setAttendees(serverAttendees);
        saveClientAttendees(serverAttendees);
        serverOnline = true;
      }

      // If backend server was unreachable, update state from resilient client fallback storage
      if (!serverOnline) {
        const localStats = getClientStats();
        setStats(localStats);
        setAttendees(loadClientAttendees());
        setHealth({
          status: 'ONLINE',
          database: { connected: false, mode: 'Local Resilient Cache' },
          totalAttendees: localStats.overview.totalRegistered,
        });
      }
    } catch (err) {
      console.warn('Sync note, using local engine:', err.message);
      const localStats = getClientStats();
      setStats(localStats);
      setAttendees(loadClientAttendees());
    }
  }, [getAuthHeaders]);

  // Initial load & real-time background sync interval (3.5s)
  useEffect(() => {
    fetchInitialData();
    const interval = setInterval(fetchInitialData, 3500);
    return () => clearInterval(interval);
  }, [fetchInitialData]);

  const showToast = (msg, type = 'info') => {
    setToastMessage({ msg, type });
    setTimeout(() => {
      setToastMessage(null);
    }, 3500);
  };

  // Helper to trigger audio & set scan result modal
  const applyScanResult = (data) => {
    if (data.result === 'VALID') {
      sound.playSuccess();
    } else if (data.result === 'DUPLICATE') {
      sound.playDuplicate();
    } else if (data.result === 'FOOD_CLAIMED') {
      sound.playFoodSuccess();
    } else if (data.result === 'DUPLICATE_FOOD') {
      sound.playDuplicate();
    } else {
      sound.playError();
    }

    setCurrentScanResult(data);
  };

  // 1. Process QR Scan (Server First with 100% Client Fallback Guarantee)
  const handleScan = async (ticketInput) => {
    let serverHandled = false;

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 2500);

      const res = await fetch('/api/scan', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          ticketInput,
          scanType: activeMode === 'FOOD_COLLECTION' ? 'FOOD_COLLECTION' : 'MAIN_ENTRANCE',
          station,
          volunteer,
        }),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (res && res.ok) {
        const data = await res.json();
        applyScanResult(data);
        serverHandled = true;
        // Immediate cloud refresh for real-time sync across gates
        fetchInitialData();
      }
    } catch (_) {
      // Seamlessly fall through to offline client engine
    }

    // High-resilience client-side scanner fallback (solves mobile preview & network isolation issues)
    if (!serverHandled) {
      const data = processClientScan({
        ticketInput,
        scanType: activeMode === 'FOOD_COLLECTION' ? 'FOOD_COLLECTION' : 'MAIN_ENTRANCE',
        station,
        volunteer,
      });

      applyScanResult(data);

      // Refresh local analytics & attendees
      const updatedStats = getClientStats();
      setStats(updatedStats);
      setAttendees(loadClientAttendees());
    }
  };

  // 2. Undo Scan (Server First + Client Fallback)
  const handleUndo = async (ticketId) => {
    setIsUndoing(true);
    let serverHandled = false;

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 2500);

      const res = await fetch('/api/undo-scan', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          ticketId,
          scanType: activeMode === 'FOOD_COLLECTION' ? 'FOOD_COLLECTION' : 'MAIN_ENTRANCE',
        }),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (res && res.ok) {
        const data = await res.json();
        if (data.success) {
          sound.playClick();
          showToast(data.message, 'success');
          setCurrentScanResult(null);
          fetchInitialData();
          serverHandled = true;
        }
      }
    } catch (_) {
      // Fall through to client engine
    }

    if (!serverHandled) {
      const result = undoClientScan({
        ticketId,
        scanType: activeMode === 'FOOD_COLLECTION' ? 'FOOD_COLLECTION' : 'MAIN_ENTRANCE',
      });
      sound.playClick();
      showToast(result.message, 'success');
      setCurrentScanResult(null);
      setStats(getClientStats());
      setAttendees(loadClientAttendees());
    }

    setIsUndoing(false);
  };

  // 3. Quick Scan from Directory
  const handleQuickScan = async (ticketId, scanType) => {
    sound.playClick();
    let serverHandled = false;

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 2500);

      const res = await fetch('/api/scan', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          ticketInput: ticketId,
          scanType,
          station,
          volunteer,
        }),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (res && res.ok) {
        const data = await res.json();
        applyScanResult(data);
        serverHandled = true;
        fetchInitialData();
      }
    } catch (_) {
      // Fall through to client engine
    }

    if (!serverHandled) {
      const data = processClientScan({
        ticketInput: ticketId,
        scanType,
        station,
        volunteer,
      });
      applyScanResult(data);
      setStats(getClientStats());
      setAttendees(loadClientAttendees());
    }
  };

  // 4. Seed Demo Zyntra Passes
  const handleSeed = async () => {
    setIsSeeding(true);
    sound.playClick();
    let serverHandled = false;

    try {
      const res = await fetch('/api/seed', {
        method: 'POST',
        headers: getAuthHeaders(),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          sound.playSuccess();
          showToast('Demo ZYNTRA \'26 passes loaded into registry!', 'success');
          fetchInitialData();
          serverHandled = true;
        }
      }
    } catch (_) {}

    if (!serverHandled) {
      const resetList = loadClientAttendees();
      saveClientAttendees(resetList);
      sound.playSuccess();
      showToast('Loaded local ZYNTRA \'26 registry passes!', 'success');
      setAttendees(resetList);
      setStats(getClientStats());
    }

    setIsSeeding(false);
  };

  // 5. Export Attendance CSV
  const handleExportCsv = async () => {
    setIsExporting(true);
    sound.playClick();
    try {
      const res = await fetch('/api/export', {
        headers: getAuthHeaders(),
      });
      if (res.ok) {
        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `zyntra2026_attendance_${new Date().toISOString().slice(0, 10)}.csv`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(url);
        showToast('Attendance CSV downloaded successfully!', 'success');
        setIsExporting(false);
        return;
      }
    } catch (_) {}

    // Client-side CSV generation fallback
    try {
      const list = loadClientAttendees();
      const headers = ['Ticket ID', 'Full Name', 'College', 'Event', 'Checked In', 'Check In Time', 'Food Claimed', 'Food Time'];
      const rows = list.map((a) => [
        `"${a.ticket_id}"`,
        `"${a.full_name}"`,
        `"${a.college}"`,
        `"${a.event_name}"`,
        a.checked_in ? 'YES' : 'NO',
        `"${a.checked_in_at || ''}"`,
        a.food_claimed ? 'YES' : 'NO',
        `"${a.food_claimed_at || ''}"`,
      ]);
      const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
      const encodedUri = encodeURI(csvContent);
      const link = document.createElement('a');
      link.setAttribute('href', encodedUri);
      link.setAttribute('download', `zyntra2026_attendance_${new Date().toISOString().slice(0, 10)}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      showToast('Attendance CSV exported from local registry!', 'success');
    } catch (csvErr) {
      showToast('Export failed', 'error');
    } finally {
      setIsExporting(false);
    }
  };

  // 6. Import Attendees from CSV into Supabase Database
  const handleImportCsv = async (file) => {
    try {
      showToast('Reading and importing CSV...', 'info');
      const text = await file.text();
      const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
      if (lines.length < 2) {
        showToast('CSV must have a header row and at least one data row', 'error');
        return;
      }

      // Parse headers
      const rawHeaders = lines[0].split(',').map((h) => h.replace(/^["']|["']$/g, '').trim().toLowerCase());
      
      const findCol = (...names) => rawHeaders.findIndex((h) => names.some((n) => h.includes(n)));
      const ticketIdx = findCol('ticket', 'pass', 'id');
      const nameIdx = findCol('name', 'full name', 'student');
      const collegeIdx = findCol('college', 'institution', 'university');
      const emailIdx = findCol('email');
      const phoneIdx = findCol('phone', 'mobile', 'contact');
      const studentIdIdx = findCol('usn', 'student_id', 'roll');
      const eventIdx = findCol('event', 'competition');

      const parsedAttendees = [];
      for (let i = 1; i < lines.length; i++) {
        const cols = lines[i].split(',').map((c) => c.replace(/^["']|["']$/g, '').trim());
        const ticket_id = ticketIdx !== -1 ? cols[ticketIdx] : '';
        const full_name = nameIdx !== -1 ? cols[nameIdx] : '';
        if (!ticket_id || !full_name) continue;

        parsedAttendees.push({
          ticket_id,
          full_name,
          college: collegeIdx !== -1 ? cols[collegeIdx] : '',
          email: emailIdx !== -1 ? cols[emailIdx] : '',
          phone: phoneIdx !== -1 ? cols[phoneIdx] : '',
          student_id: studentIdIdx !== -1 ? cols[studentIdIdx] : '',
          event_name: eventIdx !== -1 ? cols[eventIdx] : 'General Pass',
          status: 'CONFIRMED',
        });
      }

      if (parsedAttendees.length === 0) {
        showToast('No valid attendees found in CSV. Headers must include Ticket ID and Full Name.', 'error');
        return;
      }

      const res = await fetch('/api/import', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ attendees: parsedAttendees }),
      });

      if (res.ok) {
        const data = await res.json();
        showToast(`Successfully registered ${data.details?.count || parsedAttendees.length} attendees in Supabase!`, 'success');
        fetchInitialData();
      } else {
        showToast('Server error importing attendees', 'error');
      }
    } catch (err) {
      showToast(`Import error: ${err.message}`, 'error');
    }
  };

  const recentScans = stats?.recentScans || [];

  return (
    <div className="app-container">
      {/* Top Header */}
      <Header
        station={station}
        setStation={setStation}
        volunteer={volunteer}
        setVolunteer={setVolunteer}
        health={health}
        onLockTerminal={() => {
          sessionStorage.removeItem('zyntra_auth_token');
          setAuthToken(null);
          setIsLocked(true);
          showToast('Scanner terminal locked.', 'info');
        }}
      />

      {/* Mode Navigation Tabs */}
      <ModeTabs
        activeMode={activeMode}
        onSelectMode={(mode) => setActiveMode(mode)}
        stats={stats}
      />

      {/* Main Viewport Content */}
      <main>
        {/* VIEW 1: ENTRANCE SCANNER OR FOOD SCANNER */}
        {(activeMode === 'MAIN_ENTRANCE' || activeMode === 'FOOD_COLLECTION') && (
          <div className="scanner-grid">
            {/* Left: Camera & QR Viewport */}
            <QRScannerView
              scanMode={activeMode}
              station={station}
              volunteer={volunteer}
              onScanResult={handleScan}
            />

            {/* Right: Live Scan Feed */}
            <div className="side-feed-card glass">
              <div className="feed-header">
                <div className="feed-title">
                  <History size={16} className="text-cyan" />
                  <span>Recent Scans Stream</span>
                </div>
                <span
                  style={{
                    fontSize: '0.72rem',
                    fontFamily: 'var(--font-mono)',
                    color: 'rgba(228, 244, 255, 0.5)',
                  }}
                >
                  {recentScans.length} logged
                </span>
              </div>

              <div className="feed-list">
                {recentScans.length === 0 ? (
                  <div
                    style={{
                      padding: '30px 16px',
                      textAlign: 'center',
                      color: 'rgba(228, 244, 255, 0.45)',
                      fontSize: '0.82rem',
                      lineHeight: '1.5',
                    }}
                  >
                    No scan activity recorded yet. Ready to scan ZYNTRA passes.
                  </div>
                ) : (
                  recentScans.map((scan, i) => (
                    <div
                      key={scan.id || `${scan.ticket_id}-${scan.scanned_at}-${i}`}
                      className={`feed-item ${scan.result}`}
                    >
                      <div className="feed-item-icon">
                        {scan.result === 'VALID' && (
                          <CheckCircle2 size={16} className="text-emerald" />
                        )}
                        {scan.result === 'DUPLICATE' && (
                          <AlertTriangle size={16} className="text-amber" />
                        )}
                        {scan.result === 'FOOD_CLAIMED' && (
                          <Utensils size={16} className="text-cyan" />
                        )}
                        {scan.result === 'DUPLICATE_FOOD' && (
                          <AlertTriangle size={16} className="text-amber" />
                        )}
                        {scan.result === 'INVALID' && (
                          <XCircle size={16} className="text-red" />
                        )}
                      </div>

                      <div className="feed-item-info">
                        <div className="feed-item-ticket">{scan.ticket_id}</div>
                        <div className="feed-item-meta">
                          <span>{scan.scanner_station || 'Gate 1'}</span>
                          <span>•</span>
                          <span>{scan.scan_type === 'FOOD_COLLECTION' ? 'Meal' : 'Gate'}</span>
                        </div>
                      </div>

                      <div className="feed-item-time">
                        <Clock size={11} style={{ marginRight: '3px' }} />
                        {new Date(scan.scanned_at).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                          second: '2-digit',
                        })}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}

        {/* VIEW 2: LIVE ATTENDANCE & MEAL METRICS */}
        {activeMode === 'ANALYTICS' && (
          <StatsDashboard
            stats={stats}
            onRefresh={fetchInitialData}
            onExportCsv={handleExportCsv}
            isExporting={isExporting}
          />
        )}

        {/* VIEW 3: ATTENDEE DIRECTORY & MANAGEMENT */}
        {activeMode === 'ATTENDEES' && (
          <AttendeeDirectory
            attendees={attendees}
            onQuickScan={handleQuickScan}
            onUndoScan={handleUndo}
            onViewPass={(attendee) => setViewingPassAttendee(attendee)}
            onExportCsv={handleExportCsv}
            onImportCsv={handleImportCsv}
            isExporting={isExporting}
          />
        )}
      </main>

      {/* MODAL 1: Scan Result Banner Modal (Valid / Duplicate / Food / Invalid) */}
      <ScanResultModal
        scanResult={currentScanResult}
        onClose={() => setCurrentScanResult(null)}
        onUndo={handleUndo}
        onViewPass={(attendee) => {
          setCurrentScanResult(null);
          setViewingPassAttendee(attendee);
        }}
        isUndoing={isUndoing}
      />

      {/* MODAL 2: Printable Digital Pass Card Modal */}
      <PassCardModal
        attendee={viewingPassAttendee}
        onClose={() => setViewingPassAttendee(null)}
      />

      {/* MODAL 3: Volunteer Gate Security Modal */}
      {isLocked && (
        <SecurityGateModal
          onAuthenticated={(token, code) => {
            setAuthToken(token);
            setAuthPasscode(code);
            setIsLocked(false);
            showToast('Security clearance verified. Scanner terminal active.', 'success');
            fetchInitialData();
          }}
          isLocked={isLocked}
        />
      )}

      {/* Global Toast Notification */}
      {toastMessage && (
        <div
          style={{
            position: 'fixed',
            bottom: '20px',
            left: '16px',
            right: '16px',
            maxWidth: '420px',
            margin: '0 auto',
            zIndex: 1000,
            padding: '12px 18px',
            borderRadius: '14px',
            background:
              toastMessage.type === 'error'
                ? 'rgba(239, 68, 68, 0.95)'
                : 'rgba(6, 18, 46, 0.95)',
            border: '1px solid var(--cyan)',
            color: '#fff',
            boxShadow: '0 10px 30px rgba(0, 5, 25, 0.8)',
            fontSize: '0.84rem',
            fontWeight: 600,
            textAlign: 'center',
            backdropFilter: 'blur(12px)',
            animation: 'fadeIn 0.2s ease',
          }}
        >
          {toastMessage.msg}
        </div>
      )}
    </div>
  );
}
