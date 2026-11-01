import React, { useState, useEffect } from 'react';
import Header from './components/Header';
import ModeTabs from './components/ModeTabs';
import QRScannerView from './components/QRScannerView';
import ScanResultModal from './components/ScanResultModal';
import StatsDashboard from './components/StatsDashboard';
import AttendeeDirectory from './components/AttendeeDirectory';
import PassCardModal from './components/PassCardModal';
import { sound } from './utils/audioSynth';
import {
  processClientScan,
  undoClientScan,
  getClientStats,
  loadClientAttendees,
  loadClientScans,
  saveClientAttendees,
} from './utils/clientScanner';
import { History } from 'lucide-react';

export default function App() {
  const [activeMode, setActiveMode] = useState('MAIN_ENTRANCE');
  const [station, setStation] = useState(() => {
    return localStorage.getItem('zyntra_station') || 'Gate 1 (Main Entrance)';
  });
  const [volunteer, setVolunteer] = useState(() => {
    return localStorage.getItem('zyntra_volunteer') || 'Volunteer';
  });

  // Data states - Initialize with resilient client fallback cache
  const [stats, setStats] = useState(() => getClientStats());
  const [attendees, setAttendees] = useState(() => loadClientAttendees());
  const [health, setHealth] = useState({
    status: 'READY',
    database: { connected: false, mode: 'Resilient Offline Engine' },
    totalAttendees: loadClientAttendees().length,
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

  // Initial load & periodic background sync (every 15s)
  useEffect(() => {
    fetchInitialData();
    const interval = setInterval(fetchInitialData, 15000);
    return () => clearInterval(interval);
  }, []);

  const fetchInitialData = async () => {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 2500);

      const [hRes, sRes, aRes] = await Promise.all([
        fetch('/api/health', { signal: controller.signal }).catch(() => null),
        fetch('/api/stats', { signal: controller.signal }).catch(() => null),
        fetch('/api/attendees?limit=500', { signal: controller.signal }).catch(() => null),
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
        if (data.attendees && data.attendees.length > 0) {
          setAttendees(data.attendees);
          saveClientAttendees(data.attendees);
        }
        serverOnline = true;
      }

      // If backend server was unreachable (e.g. mobile standalone or preview),
      // update state from client-side fallback storage
      if (!serverOnline) {
        const localStats = getClientStats();
        setStats(localStats);
        setAttendees(loadClientAttendees());
        setHealth({
          status: 'ONLINE',
          database: { connected: false, mode: 'Local Cache Engine' },
          totalAttendees: localStats.overview.totalRegistered,
        });
      }
    } catch (err) {
      console.warn('Sync note, using local engine:', err.message);
      const localStats = getClientStats();
      setStats(localStats);
      setAttendees(loadClientAttendees());
    }
  };

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
      const timeoutId = setTimeout(() => controller.abort(), 2000);

      const res = await fetch('/api/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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
      const timeoutId = setTimeout(() => controller.abort(), 2000);

      const res = await fetch('/api/undo-scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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
      const timeoutId = setTimeout(() => controller.abort(), 2000);

      const res = await fetch('/api/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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
      const res = await fetch('/api/seed', { method: 'POST' });
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
      const res = await fetch('/api/export');
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
        onSeedData={handleSeed}
        isSeeding={isSeeding}
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
              samplePasses={attendees}
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
                      textAlign: 'center',
                      padding: '40px 14px',
                      color: 'rgba(228, 244, 255, 0.45)',
                      fontSize: '0.84rem',
                    }}
                  >
                    No scan activity recorded yet. Scan passes or click a demo pass to test.
                  </div>
                ) : (
                  recentScans.map((scan, idx) => {
                    const isValid = scan.result === 'VALID';
                    const isDup = scan.result === 'DUPLICATE' || scan.result === 'DUPLICATE_FOOD';
                    const isFood = scan.result === 'FOOD_CLAIMED';

                    return (
                      <div key={idx} className="feed-item">
                        <div className="feed-item-left">
                          <div
                            className={`feed-status-dot ${
                              isValid ? 'valid' : isDup ? 'duplicate' : isFood ? 'food' : 'invalid'
                            }`}
                          />
                          <div className="feed-item-info">
                            <span className="feed-item-name">
                              {scan.ticket_id}
                            </span>
                            <span className="feed-item-sub">
                              {scan.scan_type === 'MAIN_ENTRANCE' ? 'Gate Entry' : 'Meal Token'} ·{' '}
                              {scan.scanner_station || 'Gate 1'}
                            </span>
                          </div>
                        </div>

                        <div className="feed-item-time">
                          <span
                            className={`badge ${
                              isValid
                                ? 'badge-green'
                                : isDup
                                ? 'badge-yellow'
                                : isFood
                                ? 'badge-blue'
                                : 'badge-gray'
                            }`}
                            style={{ fontSize: '0.64rem', padding: '2px 8px' }}
                          >
                            {scan.result}
                          </span>
                          <div style={{ marginTop: '2px' }}>
                            {new Date(scan.scanned_at).toLocaleTimeString([], {
                              hour: '2-digit',
                              minute: '2-digit',
                              second: '2-digit',
                            })}
                          </div>
                        </div>
                      </div>
                    );
                  })
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
