import React, { useState } from 'react';
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
      <div className="stats-header-bar">
        <div>
          <h2 className="stats-main-heading">
            LIVE FESTIVAL ATTENDANCE & MEAL METRICS
          </h2>
          <p className="stats-sub-heading">
            Real-time synchronization with ZYNTRA '26 Supabase registry
          </p>
        </div>

        <div className="stats-actions-row">
          <button
            type="button"
            className="btn-secondary"
            onClick={handleManualRefresh}
            disabled={isRefreshing}
            title="Refresh statistics from cloud"
          >
            <RefreshCw size={15} className={isRefreshing ? 'animate-spin' : ''} />
            <span>{isRefreshing ? 'Refreshing...' : 'Refresh'}</span>
          </button>

          <button
            type="button"
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
            <span>Gate Turnout</span>
            <CheckCircle2 size={18} style={{ color: '#34d399' }} />
          </div>
          <div className="metric-number" style={{ color: '#34d399' }}>
            {overview.totalCheckedIn}
            <span style={{ fontSize: '1.1rem', color: 'rgba(228, 244, 255, 0.6)', marginLeft: 8 }}>
              ({overview.attendanceRate}%)
            </span>
          </div>
          <div className="metric-sub">
            {overview.totalPending} participants pending gate arrival
          </div>
          <div className="progress-bar-wrap">
            <div className="progress-bar-fill emerald" style={{ width: `${overview.attendanceRate}%` }} />
          </div>
        </div>

        {/* Card 3: Food Claimed */}
        <div className="metric-card glass">
          <div className="metric-top">
            <span>Food Dispensed</span>
            <Utensils size={18} className="text-cyan" />
          </div>
          <div className="metric-number" style={{ color: 'var(--cyan)' }}>
            {overview.totalFoodClaimed}
            <span style={{ fontSize: '1.1rem', color: 'rgba(228, 244, 255, 0.6)', marginLeft: 8 }}>
              ({overview.foodRate}%)
            </span>
          </div>
          <div className="metric-sub">
            {overview.remainingFood} eligible meals remaining
          </div>
          <div className="progress-bar-wrap">
            <div className="progress-bar-fill cyan" style={{ width: `${overview.foodRate}%` }} />
          </div>
        </div>

        {/* Card 4: Database Connection Status */}
        <div className="metric-card glass">
          <div className="metric-top">
            <span>Database Mode</span>
            <TrendingUp size={18} className="text-amber" />
          </div>
          <div className="metric-number" style={{ fontSize: '1.5rem', color: stats?.database?.connected ? '#6ee7b7' : '#fbbf24' }}>
            {stats?.database?.connected ? 'Supabase Live' : 'Local Fallback'}
          </div>
          <div className="metric-sub">
            {stats?.database?.connected
              ? 'PostgreSQL cloud synchronization active'
              : 'Indexed local storage engine active'}
          </div>
        </div>
      </div>

      {/* Two Column Layout: Event Attendance & Top Colleges */}
      <div className="stats-two-col-grid">
        {/* Left: Event Breakdown */}
        <div className="glass stats-breakdown-card">
          <h3 className="stats-section-title">
            <Trophy size={16} />
            <span>Attendance By Competition</span>
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
                    <div className="breakdown-item-header">
                      <span className="breakdown-item-name">{ev.eventName}</span>
                      <span className="breakdown-item-count">
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
        <div className="glass stats-breakdown-card">
          <h3 className="stats-section-title">
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
                <div key={col.college} className="college-rank-row">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflow: 'hidden' }}>
                    <span style={{ color: 'var(--cyan)', fontWeight: 'bold' }}>#{idx + 1}</span>
                    <span className="college-name-text">{col.college}</span>
                  </div>
                  <span className="college-count-badge">
                    {col.count} {col.count === 1 ? 'attendee' : 'attendees'}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Hourly Scan Velocity */}
      {hourlyVelocity.length > 0 && (
        <div className="glass stats-breakdown-card">
          <h3 className="stats-section-title">
            <Clock size={16} />
            <span>Scanning Velocity (Scans Per Hour)</span>
          </h3>
          <div className="hourly-velocity-bar">
            {hourlyVelocity.map((h) => (
              <div key={h.hour} className="velocity-col">
                <div className="velocity-val">{h.count}</div>
                <div
                  className="velocity-pillar"
                  style={{ height: `${Math.min(100, Math.max(12, h.count * 8))}px` }}
                />
                <div className="velocity-label">{h.hour}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
