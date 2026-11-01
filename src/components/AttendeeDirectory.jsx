import React, { useState } from 'react';
import {
  Search,
  CheckCircle2,
  Utensils,
  Download,
  ShieldCheck,
  RotateCcw,
  School,
  Trophy,
  Users,
} from 'lucide-react';
import { sound } from '../utils/audioSynth';

export default function AttendeeDirectory({
  attendees = [],
  onQuickScan,
  onUndoScan,
  onViewPass,
  onExportCsv,
  isExporting,
}) {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');

  const filtered = attendees.filter((a) => {
    // Search filter
    if (search.trim()) {
      const s = search.toLowerCase().trim();
      const match =
        (a.full_name && a.full_name.toLowerCase().includes(s)) ||
        (a.ticket_id && a.ticket_id.toLowerCase().includes(s)) ||
        (a.college && a.college.toLowerCase().includes(s)) ||
        (a.student_id && a.student_id.toLowerCase().includes(s)) ||
        (a.email && a.email.toLowerCase().includes(s)) ||
        (a.event_name && a.event_name.toLowerCase().includes(s)) ||
        (a.team_name && a.team_name.toLowerCase().includes(s));
      if (!match) return false;
    }

    // Status filter
    if (statusFilter === 'CHECKED_IN') return a.checked_in;
    if (statusFilter === 'PENDING') return !a.checked_in;
    if (statusFilter === 'FOOD_CLAIMED') return a.food_claimed;
    if (statusFilter === 'FOOD_PENDING') return !a.food_claimed;

    return true;
  });

  const formatShortTime = (iso) => {
    if (!iso) return '';
    try {
      return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch (_) {
      return '';
    }
  };

  return (
    <div className="directory-card glass">
      {/* Search & Actions Bar */}
      <div className="directory-top-bar">
        <div className="search-input-wrap">
          <Search size={18} className="search-input-icon" />
          <input
            type="text"
            className="manual-input"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search attendee, ticket ID, college, USN..."
            aria-label="Search Attendees"
          />
        </div>

        <button
          type="button"
          className="btn-primary export-csv-btn"
          onClick={onExportCsv}
          disabled={isExporting}
          title="Export complete attendee spreadsheet as CSV"
        >
          <Download size={15} />
          <span>{isExporting ? 'Exporting...' : 'Export CSV'}</span>
        </button>
      </div>

      {/* Filter Chips Bar */}
      <div className="filter-chips-bar">
        {[
          { id: 'ALL', label: `All (${attendees.length})` },
          {
            id: 'CHECKED_IN',
            label: `Checked In (${attendees.filter((a) => a.checked_in).length})`,
          },
          {
            id: 'PENDING',
            label: `Pending (${attendees.filter((a) => !a.checked_in).length})`,
          },
          {
            id: 'FOOD_CLAIMED',
            label: `Fed (${attendees.filter((a) => a.food_claimed).length})`,
          },
          {
            id: 'FOOD_PENDING',
            label: `Food Pending (${attendees.filter((a) => !a.food_claimed).length})`,
          },
        ].map((f) => (
          <button
            key={f.id}
            type="button"
            className={`filter-chip ${statusFilter === f.id ? 'active' : ''}`}
            onClick={() => {
              sound.playClick();
              setStatusFilter(f.id);
            }}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* 1. Mobile Cards Layout (visible on screens <= 768px) */}
      <div className="attendee-mobile-list">
        {filtered.length === 0 ? (
          <div className="empty-directory-msg">
            No attendees found matching filter.
          </div>
        ) : (
          filtered.map((a) => (
            <div key={a.id || a.ticket_id} className="attendee-mobile-card">
              {/* Card Header: Pass ID + Badges */}
              <div className="mobile-card-header">
                <span className="mobile-card-id">{a.ticket_id}</span>
                <div className="mobile-card-badges">
                  {a.checked_in ? (
                    <span className="badge badge-green">
                      <CheckCircle2 size={11} />
                      <span>In ({formatShortTime(a.checked_in_at)})</span>
                    </span>
                  ) : (
                    <span className="badge badge-gray">Pending</span>
                  )}
                  {a.food_claimed ? (
                    <span className="badge badge-blue">
                      <Utensils size={11} />
                      <span>Fed</span>
                    </span>
                  ) : (
                    <span className="badge badge-gray">No Meal</span>
                  )}
                </div>
              </div>

              {/* Card Body: Name, College, Event */}
              <div className="mobile-card-body">
                <h4 className="mobile-card-name">{a.full_name}</h4>
                <div className="mobile-card-college">
                  <School size={12} className="inline mr-1 text-cyan" />
                  <span>{a.college}</span>
                </div>
                <div className="mobile-card-event">
                  <Trophy size={12} className="inline mr-1 text-amber" />
                  <span>{a.event_name}</span>
                  {a.team_name && (
                    <span className="mobile-team-badge"> · Team: {a.team_name}</span>
                  )}
                </div>
              </div>

              {/* Card Actions Footer */}
              <div className="mobile-card-actions">
                {!a.checked_in ? (
                  <button
                    type="button"
                    className="btn-mobile-action btn-mobile-checkin"
                    onClick={() => onQuickScan(a.ticket_id, 'MAIN_ENTRANCE')}
                  >
                    Check In
                  </button>
                ) : (
                  <button
                    type="button"
                    className="btn-mobile-action btn-mobile-undo"
                    onClick={() => onUndoScan(a.ticket_id, 'MAIN_ENTRANCE')}
                  >
                    Undo In
                  </button>
                )}

                {!a.food_claimed ? (
                  <button
                    type="button"
                    className="btn-mobile-action btn-mobile-food"
                    onClick={() => onQuickScan(a.ticket_id, 'FOOD_COLLECTION')}
                  >
                    Claim Meal
                  </button>
                ) : (
                  <button
                    type="button"
                    className="btn-mobile-action btn-mobile-undo"
                    onClick={() => onUndoScan(a.ticket_id, 'FOOD_COLLECTION')}
                  >
                    Undo Meal
                  </button>
                )}

                <button
                  type="button"
                  className="btn-mobile-action btn-mobile-pass"
                  onClick={() => onViewPass(a)}
                >
                  Pass
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* 2. Desktop Table Layout (visible on screens > 768px) */}
      <div className="table-responsive attendee-desktop-table">
        <table className="data-table">
          <thead>
            <tr>
              <th>Pass ID</th>
              <th>Attendee & College</th>
              <th>Student ID</th>
              <th>Registered Event</th>
              <th>Entrance Status</th>
              <th>Food / Meal Status</th>
              <th style={{ textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={7} style={{ textAlign: 'center', padding: '36px', color: 'rgba(228, 244, 255, 0.5)' }}>
                  No attendees found matching current filter criteria.
                </td>
              </tr>
            ) : (
              filtered.map((a) => (
                <tr key={a.id || a.ticket_id}>
                  {/* Pass ID */}
                  <td style={{ fontFamily: 'var(--font-mono)', color: 'var(--cyan)', fontWeight: 600 }}>
                    {a.ticket_id}
                  </td>

                  {/* Name & College */}
                  <td>
                    <div style={{ fontWeight: 700, color: '#fff' }}>{a.full_name}</div>
                    <div style={{ fontSize: '0.75rem', color: 'rgba(228, 244, 255, 0.6)' }}>
                      {a.college}
                    </div>
                  </td>

                  {/* Student ID */}
                  <td style={{ fontSize: '0.8rem', color: 'rgba(228, 244, 255, 0.75)' }}>
                    {a.student_id || 'N/A'}
                  </td>

                  {/* Event */}
                  <td>
                    <div style={{ fontSize: '0.82rem', color: '#fff' }}>{a.event_name}</div>
                    {a.team_name && (
                      <div style={{ fontSize: '0.72rem', color: 'var(--cyan)' }}>
                        Team: {a.team_name}
                      </div>
                    )}
                  </td>

                  {/* Entrance Check-in Badge */}
                  <td>
                    {a.checked_in ? (
                      <span className="badge badge-green" title={a.checked_in_by || 'Checked in'}>
                        <CheckCircle2 size={12} />
                        <span>In ({formatShortTime(a.checked_in_at)})</span>
                      </span>
                    ) : (
                      <span className="badge badge-gray">Pending</span>
                    )}
                  </td>

                  {/* Food Claim Badge */}
                  <td>
                    {a.food_claimed ? (
                      <span className="badge badge-blue" title={a.food_claimed_by || 'Meal collected'}>
                        <Utensils size={12} />
                        <span>Fed ({formatShortTime(a.food_claimed_at)})</span>
                      </span>
                    ) : (
                      <span className="badge badge-gray">Not Claimed</span>
                    )}
                  </td>

                  {/* Quick Action Controls */}
                  <td style={{ textAlign: 'right' }}>
                    <div style={{ display: 'inline-flex', gap: '6px' }}>
                      {!a.checked_in ? (
                        <button
                          type="button"
                          className="btn-secondary"
                          style={{ padding: '4px 8px', fontSize: '0.7rem' }}
                          onClick={() => onQuickScan(a.ticket_id, 'MAIN_ENTRANCE')}
                          title="Quick Gate Check-in"
                        >
                          Check In
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="btn-secondary"
                          style={{ padding: '4px 8px', fontSize: '0.7rem', color: 'var(--amber)' }}
                          onClick={() => onUndoScan(a.ticket_id, 'MAIN_ENTRANCE')}
                          title="Undo Gate Check-in"
                        >
                          Undo In
                        </button>
                      )}

                      {!a.food_claimed ? (
                        <button
                          type="button"
                          className="btn-secondary"
                          style={{ padding: '4px 8px', fontSize: '0.7rem' }}
                          onClick={() => onQuickScan(a.ticket_id, 'FOOD_COLLECTION')}
                          title="Quick Food Claim"
                        >
                          Claim Meal
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="btn-secondary"
                          style={{ padding: '4px 8px', fontSize: '0.7rem', color: 'var(--amber)' }}
                          onClick={() => onUndoScan(a.ticket_id, 'FOOD_COLLECTION')}
                          title="Undo Food Claim"
                        >
                          Undo Meal
                        </button>
                      )}

                      <button
                        type="button"
                        className="btn-secondary"
                        style={{ padding: '4px 8px', fontSize: '0.7rem' }}
                        onClick={() => onViewPass(a)}
                        title="View printable digital pass & QR"
                      >
                        Pass
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
