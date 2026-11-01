import React, { useState, useEffect } from 'react';
import Header from './components/Header';
import ModeTabs from './components/ModeTabs';
import QRScannerView from './components/QRScannerView';
import ScanResultModal from './components/ScanResultModal';
import StatsDashboard from './components/StatsDashboard';
import AttendeeDirectory from './components/AttendeeDirectory';
import PassCardModal from './components/PassCardModal';
import { sound } from './utils/audioSynth';
import { ShieldCheck, History, Clock, CheckCircle2, AlertTriangle, Utensils, XCircle } from 'lucide-react';

export default function App() {
  const [activeMode, setActiveMode] = useState('MAIN_ENTRANCE');
  const [station, setStation] = useState(() => {
    return localStorage.getItem('zyntra_station') || 'Gate 1 (Main Entrance)';
  });
  const [volunteer, setVolunteer] = useState(() => {
    return localStorage.getItem('zyntra_volunteer') || 'Volunteer';
  });

  // Data states
  const [stats, setStats] = useState(null);
  const [attendees, setAttendees] = useState([]);
  const [health, setHealth] = useState(null);
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
      const [hRes, sRes, aRes] = await Promise.all([
        fetch('/api/health').catch(() => null),
        fetch('/api/stats').catch(() => null),
        fetch('/api/attendees?limit=500').catch(() => null),
      ]);

      if (hRes && hRes.ok) setHealth(await hRes.json());
      if (sRes && sRes.ok) setStats(await sRes.json());
      if (aRes && aRes.ok) {
        const data = await aRes.json();
        setAttendees(data.attendees || []);
      }
    } catch (err) {
      console.warn('Sync note:', err.message);
    }
  };

  const showToast = (msg, type = 'info') => {
    setToastMessage({ msg, type });
    setTimeout(() => {
      setToastMessage(null);
    }, 3500);
  };

  // 1. Process QR Scan
  const handleScan = async (ticketInput) => {
    try {
      const res = await fetch('/api/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ticketInput,
          scanType: activeMode === 'FOOD_COLLECTION' ? 'FOOD_COLLECTION' : 'MAIN_ENTRANCE',
          station,
          volunteer,
        }),
      });

      const data = await res.json();

      // Trigger respective audio synthesizer
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
      fetchInitialData();
    } catch (err) {
      sound.playError();
      showToast('Network error processing scan. Using local cache.', 'error');
    }
  };

  // 2. Undo Scan
  const handleUndo = async (ticketId) => {
    setIsUndoing(true);
    try {
      const res = await fetch('/api/undo-scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ticketId,
          scanType: activeMode === 'FOOD_COLLECTION' ? 'FOOD_COLLECTION' : 'MAIN_ENTRANCE',
        }),
      });
      const data = await res.json();
      if (data.success) {
        sound.playClick();
        showToast(data.message, 'success');
        setCurrentScanResult(null);
        fetchInitialData();
      } else {
        showToast(data.message || 'Could not revert scan', 'error');
      }
    } catch (err) {
      showToast('Error undoing scan', 'error');
    } finally {
      setIsUndoing(false);
    }
  };

  // 3. Quick Scan from Directory
  const handleQuickScan = async (ticketId, scanType) => {
    sound.playClick();
    try {
      const res = await fetch('/api/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ticketInput: ticketId,
          scanType,
          station,
          volunteer,
        }),
      });
      const data = await res.json();

      if (data.result === 'VALID') sound.playSuccess();
      else if (data.result === 'FOOD_CLAIMED') sound.playFoodSuccess();
      else sound.playDuplicate();

      setCurrentScanResult(data);
      fetchInitialData();
    } catch (err) {
      showToast('Scan failed', 'error');
    }
  };

  // 4. Seed Demo Zyntra Passes
  const handleSeed = async () => {
    setIsSeeding(true);
    sound.playClick();
    try {
      const res = await fetch('/api/seed', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        sound.playSuccess();
        showToast('Demo ZYNTRA \'26 passes loaded into registry!', 'success');
        fetchInitialData();
      }
    } catch (err) {
      showToast('Seeding error', 'error');
    } finally {
      setIsSeeding(false);
    }
  };

  // 5. Export CSV
  const handleExportCsv = async () => {
    setIsExporting(true);
    sound.playClick();
    try {
      const res = await fetch('/api/export');
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
    } catch (err) {
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
            bottom: '24px',
            right: '24px',
            zIndex: 1000,
            padding: '12px 20px',
            borderRadius: '14px',
            background:
              toastMessage.type === 'error'
                ? 'rgba(239, 68, 68, 0.95)'
                : 'rgba(6, 18, 46, 0.95)',
            border: '1px solid var(--cyan)',
            color: '#fff',
            boxShadow: '0 10px 30px rgba(0, 5, 25, 0.8)',
            fontSize: '0.88rem',
            fontWeight: 600,
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

