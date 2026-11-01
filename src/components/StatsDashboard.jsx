import React, { useEffect, useState } from 'react';
import {
  Users,
  CheckCircle2,
  Utensils,
  TrendingUp,
  Download,
  RefreshCw,
  Trophy,
  School,
  Clock,
  ShieldAlert,
  ArrowUpRight,
} from 'lucide-react';
import { sound } from '../utils/audioSynth';

export default function StatsDashboard({ stats, onRefresh, onExportCsv, isExporting }) {
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleManualRefresh = async () => {
    sound.playClick();
    setIsRefreshing(true);
    await onRefresh();
    setIsRefreshing(false);
  };

  const overview = stats?.overview || {
    totalRegistered: 0,
    totalCheckedIn: 0,
    totalPending: 0,
    attendanceRate: 0,
    totalFoodClaimed: 0,
    remainingFood: 0,
    foodRate: 0,
  };

  const eventBreakdown = stats?.eventBreakdown || [];
  const collegeBreakdown = stats?.collegeBreakdown || [];
  const hourlyVelocity = stats?.hourlyVelocity || [];
  const recentScans = stats?.recentScans || [];

  return (
    <div className="stats-container">
      {/* Top Header with Action Buttons */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '12px',
        }}
      >
        <div>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#fff', letterSpacing: '0.04em' }}>
            LIVE FESTIVAL ATTENDANCE & MEAL METRICS
          </h2>
          <p style={{ fontSize: '0.8rem', color: 'rgba(228, 244, 255, 0.6)' }}>
            Real-time synchronization with ZYNTRA '26 Supabase registry
          </p>
        </div>

        <div style={{ display: 'flex', gap: '10px' }}>
          <button
            className="btn-secondary"
            onClick={handleManualRefresh}
            disabled={isRefreshing}
            title="Refresh statistics from cloud"
          >
            <RefreshCw size={15} className={isRefreshing ? 'animate-spin' : ''} />
            <span>{isRefreshing ? 'Refreshing...' : 'Refresh'}</span>
          </button>

          <button
            className="btn-primary"
            onClick={onExportCsv}
            disabled={isExporting}
            title="Download CSV spreadsheet of all attendees"
          >
            <Download size={15} />
            <span>{isExporting ? 'Exporting...' : 'Export Attendance CSV'}</span>
          </button>
        </div>
      </div>

      {/* 4 Big Metrics Cards */}
      <div className="metrics-cards-grid">
        {/* Card 1: Total Registered */}
        <div className="metric-card glass">
          <div className="metric-top">
            <span>Total Registered</span>
            <Users size={18} className="text-cyan" />
          </div>
          <div className="metric-number">{overview.totalRegistered}</div>
          <div className="metric-sub">Confirmed fest participants across all events</div>
        </div>

        {/* Card 2: Gate Check-in Rate */}
        <div className="metric-card glass">
          <div className="metric-top">
            <span>Gate Checked In</span>
            <CheckCircle2 size={18} className="text-emerald" />
          </div>
          <div className="metric-number" style={{ color: '#34d399' }}>
            {overview.totalCheckedIn}
          </div>
          <div className="metric-sub">
            <strong>{overview.attendanceRate}%</strong> of total · {overview.totalPending} pending arrival
          </div>
          <div className="progress-bar-wrap">
            <div
              className="progress-bar-fill emerald"
              style={{ width: `${Math.min(100, overview.attendanceRate)}%` }}
            />
          </div>
        </div>

        {/* Card 3: Food Packs Dispensed */}
        <div className="metric-card glass">
          <div className="metric-top">
            <span>Food / Meals Claimed</span>
            <Utensils size={18} className="text-amber" />
          </div>
          <div className="metric-number" style={{ color: '#fbbf24' }}>
            {overview.totalFoodClaimed}
          </div>
          <div className="metric-sub">
            <strong>{overview.foodRate}%</strong> claimed · {overview.remainingFood} meals remaining
          </div>
          <div className="progress-bar-wrap">
            <div
              className="progress-bar-fill amber"
              style={{ width: `${Math.min(100, overview.foodRate)}%` }}
            />
          </div>
        </div>

        {/* Card 4: Peak Turnout Velocity */}
        <div className="metric-card glass">
          <div className="metric-top">
            <span>Database Status</span>
            <TrendingUp size={18} className="text-blue" />
          </div>
          <div className="metric-number" style={{ fontSize: '1.45rem', paddingTop: '6px' }}>
            {stats?.database?.connected ? 'ONLINE' : 'CACHED'}
          </div>
          <div className="metric-sub">
            Host: <code style={{ color: 'var(--cyan)' }}>{stats?.database?.url || 'Supabase'}</code>
          </div>
        </div>
      </div>

      {/* Two Column Layout: Event Attendance & Top Colleges */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '22px' }}>
        {/* Left: Event Breakdown */}
        <div className="glass" style={{ padding: '24px' }}>
          <h3
            style={{
              fontSize: '0.92rem',
              fontWeight: 700,
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
              color: 'var(--cyan)',
              marginBottom: '16px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            }}
          >
            <Trophy size={16} />
            <span>Attendance By Competition / Event</span>
          </h3>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {eventBreakdown.length === 0 ? (
              <div style={{ color: 'rgba(228, 244, 255, 0.5)', fontSize: '0.85rem' }}>
                No registrations loaded yet.
              </div>
            ) : (
              eventBreakdown.map((ev) => {
                const pct = ev.total > 0 ? Math.round((ev.checkedIn / ev.total) * 100) : 0;
                return (
                  <div key={ev.eventName}>
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        fontSize: '0.84rem',
                        marginBottom: '4px',
                      }}
                    >
                      <span style={{ fontWeight: 600, color: '#fff' }}>{ev.eventName}</span>
                      <span style={{ color: 'rgba(228, 244, 255, 0.7)', fontFamily: 'var(--font-mono)' }}>
                        {ev.checkedIn} / {ev.total} ({pct}%)
                      </span>
                    </div>
                    <div className="progress-bar-wrap">
                      <div className="progress-bar-fill cyan" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right: Top Colleges Breakdown */}
        <div className="glass" style={{ padding: '24px' }}>
          <h3
            style={{
              fontSize: '0.92rem',
              fontWeight: 700,
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
              color: 'var(--cyan)',
              marginBottom: '16px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            }}
          >
            <School size={16} />
            <span>Top Colleges & Institutions</span>
          </h3>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {collegeBreakdown.length === 0 ? (
              <div style={{ color: 'rgba(228, 244, 255, 0.5)', fontSize: '0.85rem' }}>
                No college data available yet.
              </div>
            ) : (
              collegeBreakdown.map((col, idx) => (
                <div
                  key={col.college}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '8px 12px',
                    borderRadius: '10px',
                    background: 'rgba(6, 18, 46, 0.45)',
                    border: '1px solid var(--line)',
                    fontSize: '0.82rem',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ color: 'var(--cyan)', fontWeight: 'bold' }}>#{idx + 1}</span>
                    <span style={{ color: '#fff' }}>{col.college}</span>
                  </div>
                  <span
                    style={{
                      fontFamily: 'var(--font-mono)',
                      color: 'rgba(228, 244, 255, 0.7)',
                    }}
                  >
                    {col.count} attendees
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Recent Scans Live Audit Feed */}
      <div className="glass" style={{ padding: '24px' }}>
        <h3
          style={{
            fontSize: '0.92rem',
            fontWeight: 700,
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
            color: 'var(--cyan)',
            marginBottom: '16px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <Clock size={16} />
          <span>Real-Time Check-In Audit Log</span>
        </h3>

        {recentScans.length === 0 ? (
          <div style={{ color: 'rgba(228, 244, 255, 0.5)', fontSize: '0.85rem', padding: '12px 0' }}>
            No scans logged yet. Start scanning passes at the entrance or food counters to view live stream.
          </div>
        ) : (
          <div className="table-responsive">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Pass ID</th>
                  <th>Scan Type</th>
                  <th>Station</th>
                  <th>Volunteer</th>
                  <th>Result</th>
                  <th>Timestamp</th>
                </tr>
              </thead>
              <tbody>
                {recentScans.slice(0, 15).map((scan, i) => (
                  <tr key={i}>
                    <td style={{ fontFamily: 'var(--font-mono)', color: 'var(--cyan)' }}>
                      {scan.ticket_id}
                    </td>
                    <td>
                      {scan.scan_type === 'MAIN_ENTRANCE' ? 'Gate Entrance' : 'Food Counter'}
                    </td>
                    <td>{scan.scanner_station || 'Gate 1'}</td>
                    <td>{scan.volunteer_name || 'Volunteer'}</td>
                    <td>
                      <span
                        className={`badge ${
                          scan.result === 'VALID'
                            ? 'badge-green'
                            : scan.result === 'DUPLICATE'
                            ? 'badge-yellow'
                            : scan.result === 'FOOD_CLAIMED'
                            ? 'badge-blue'
                            : 'badge-gray'
                        }`}
                      >
                        {scan.result}
                      </span>
                    </td>
                    <td style={{ fontSize: '0.78rem', color: 'rgba(228, 244, 255, 0.55)' }}>
                      {new Date(scan.scanned_at).toLocaleTimeString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

