import React, { useEffect } from 'react';
import {
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Utensils,
  Clock,
  MapPin,
  User,
  School,
  Trophy,
  RotateCcw,
  Check,
  X,
  ShieldCheck,
  Users,
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { sound } from '../utils/audioSynth';

export default function ScanResultModal({
  scanResult,
  onClose,
  onUndo,
  onViewPass,
  isUndoing,
}) {
  if (!scanResult) return null;

  const { result, message, attendee, firstScanAt, firstScanBy, claimedAt, claimedBy, station, timestamp } = scanResult;

  const isValid = result === 'VALID';
  const isDuplicate = result === 'DUPLICATE';
  const isFoodClaimed = result === 'FOOD_CLAIMED';
  const isDuplicateFood = result === 'DUPLICATE_FOOD';
  const isInvalid = result === 'INVALID';

  // Trigger celebration on valid entry
  useEffect(() => {
    if (isValid || isFoodClaimed) {
      try {
        confetti({
          particleCount: 60,
          spread: 60,
          origin: { y: 0.65 },
          colors: ['#3fd8ff', '#2f7bff', '#10b981', '#ffffff'],
        });
      } catch (_) {}
    }
  }, [isValid, isFoodClaimed]);

  const formatTime = (isoString) => {
    if (!isoString) return 'Earlier Today';
    try {
      const d = new Date(isoString);
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    } catch (_) {
      return isoString;
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="result-card glass" onClick={(e) => e.stopPropagation()}>
        {/* Banner Section */}
        <div
          className={`result-banner ${
            isValid
              ? 'valid'
              : isDuplicate
              ? 'duplicate'
              : isFoodClaimed
              ? 'food'
              : isDuplicateFood
              ? 'duplicate'
              : 'invalid'
          }`}
        >
          <div className="result-icon-wrap">
            {isValid && <CheckCircle2 size={36} />}
            {isDuplicate && <AlertTriangle size={36} />}
            {isFoodClaimed && <Utensils size={36} />}
            {isDuplicateFood && <AlertTriangle size={36} />}
            {isInvalid && <XCircle size={36} />}
          </div>

          <div className="result-title">
            {isValid && 'ACCESS GRANTED'}
            {isDuplicate && 'ALREADY CHECKED IN'}
            {isFoodClaimed && 'MEAL DISPENSED'}
            {isDuplicateFood && 'MEAL ALREADY CLAIMED'}
            {isInvalid && 'INVALID PASS'}
          </div>

          <div
            style={{
              fontSize: '0.85rem',
              color: 'rgba(228, 244, 255, 0.85)',
              fontWeight: 500,
            }}
          >
            {message}
          </div>
        </div>

        {/* Body Section with Attendee Details */}
        <div className="result-body">
          {attendee ? (
            <>
              {/* Attendee Name & College Header */}
              <div className="attendee-name-badge">
                <h3>{attendee.full_name}</h3>
                <div className="attendee-college">
                  <School size={14} style={{ display: 'inline', marginRight: 6 }} />
                  <span>{attendee.college || 'College / University'}</span>
                </div>
              </div>

              {/* Duplicate Gate Scan Alert Callout */}
              {isDuplicate && (
                <div className="duplicate-callout">
                  <Clock size={20} style={{ flexShrink: 0 }} />
                  <div>
                    <strong>Prior Check-In Recorded:</strong>
                    <div>
                      Scanned at <u>{formatTime(firstScanAt)}</u> by {firstScanBy || 'Gate Staff'}.
                    </div>
                  </div>
                </div>
              )}

              {/* Duplicate Food Claim Alert Callout */}
              {isDuplicateFood && (
                <div className="duplicate-callout" style={{ borderColor: 'var(--rose)', color: '#fca5a5' }}>
                  <Utensils size={20} style={{ flexShrink: 0 }} />
                  <div>
                    <strong>Meal Already Redeemed:</strong>
                    <div>
                      Dispensed at <u>{formatTime(claimedAt)}</u> at {claimedBy || 'Food Counter'}.
                    </div>
                  </div>
                </div>
              )}

              {/* 2x2 Details Grid */}
              <div className="details-grid">
                <div className="detail-pill">
                  <span className="detail-label">Pass ID / Ticket</span>
                  <span className="detail-value mono">{attendee.ticket_id}</span>
                </div>

                <div className="detail-pill">
                  <span className="detail-label">Student ID / USN</span>
                  <span className="detail-value">{attendee.student_id || 'N/A'}</span>
                </div>

                <div className="detail-pill" style={{ gridColumn: 'span 2' }}>
                  <span className="detail-label">Registered Event</span>
                  <span className="detail-value" style={{ color: 'var(--cyan)' }}>
                    <Trophy size={14} style={{ display: 'inline', marginRight: 6 }} />
                    {attendee.event_name || 'General Admission'}
                  </span>
                </div>

                {attendee.team_name && (
                  <div className="detail-pill" style={{ gridColumn: 'span 2' }}>
                    <span className="detail-label">Team Name</span>
                    <span className="detail-value">
                      <Users size={14} style={{ display: 'inline', marginRight: 6 }} />
                      {attendee.team_name}
                      {attendee.team_members && attendee.team_members.length > 0 && (
                        <span style={{ fontSize: '0.75rem', color: 'rgba(228, 244, 255, 0.6)', marginLeft: 8 }}>
                          (+ {attendee.team_members.length} members)
                        </span>
                      )}
                    </span>
                  </div>
                )}
              </div>
            </>
          ) : (
            <div style={{ textAlign: 'center', padding: '16px', color: 'rgba(228, 244, 255, 0.7)' }}>
              No attendee profile found matching this code. Please verify the ticket ID or ask the attendee to present their payment confirmation email.
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="modal-footer">
          {/* Undo Scan Button for Supervisors / Volunteers */}
          {attendee && (isValid || isFoodClaimed) && (
            <button
              className="btn-secondary"
              onClick={() => onUndo(attendee.ticket_id)}
              disabled={isUndoing}
              title="Undo check-in if scanned by accident"
            >
              <RotateCcw size={15} />
              <span>{isUndoing ? 'Undoing...' : 'Undo'}</span>
            </button>
          )}

          {/* View Pass Card */}
          {attendee && (
            <button
              className="btn-secondary"
              onClick={() => onViewPass(attendee)}
              title="View full printable digital pass"
            >
              <ShieldCheck size={15} />
              <span>Pass Card</span>
            </button>
          )}

          {/* Done / Next Scan */}
          <button className="btn-primary btn-full" onClick={onClose} autoFocus>
            <Check size={16} />
            <span>Ready for Next Scan</span>
          </button>
        </div>
      </div>
    </div>
  );
}

