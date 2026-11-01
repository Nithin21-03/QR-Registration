import React, { useEffect } from 'react';
import {
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Utensils,
  Clock,
  School,
  Trophy,
  RotateCcw,
  Check,
  ShieldCheck,
  Users,
} from 'lucide-react';
import confetti from 'canvas-confetti';

export default function ScanResultModal({
  scanResult,
  onClose,
  onUndo,
  onViewPass,
  isUndoing,
}) {
  if (!scanResult) return null;

  const { result, message, attendee, firstScanAt, firstScanBy, claimedAt, claimedBy } = scanResult;

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
          particleCount: 50,
          spread: 55,
          origin: { y: 0.6 },
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
    <div className="modal-overlay" onClick={onClose} role="dialog" aria-modal="true">
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
            {isValid && <CheckCircle2 size={34} />}
            {isDuplicate && <AlertTriangle size={34} />}
            {isFoodClaimed && <Utensils size={34} />}
            {isDuplicateFood && <AlertTriangle size={34} />}
            {isInvalid && <XCircle size={34} />}
          </div>

          <div className="result-title">
            {isValid && 'ACCESS GRANTED'}
            {isDuplicate && 'ALREADY CHECKED IN'}
            {isFoodClaimed && 'MEAL DISPENSED'}
            {isDuplicateFood && 'MEAL ALREADY CLAIMED'}
            {isInvalid && 'INVALID PASS'}
          </div>

          <div className="result-message">
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
                  <School size={14} style={{ display: 'inline', marginRight: 6, flexShrink: 0 }} />
                  <span>{attendee.college || 'College / University'}</span>
                </div>
              </div>

              {/* Duplicate Gate Scan Alert Callout */}
              {isDuplicate && (
                <div className="duplicate-callout">
                  <Clock size={20} style={{ flexShrink: 0 }} />
                  <div>
                    <strong>Prior Gate Entry:</strong>
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
                    <strong>Meal Already Claimed:</strong>
                    <div>
                      Dispensed at <u>{formatTime(claimedAt)}</u> at {claimedBy || 'Food Counter'}.
                    </div>
                  </div>
                </div>
              )}

              {/* Details Grid */}
              <div className="details-grid">
                <div className="detail-pill">
                  <span className="detail-label">Pass ID</span>
                  <span className="detail-value mono">{attendee.ticket_id}</span>
                </div>

                <div className="detail-pill">
                  <span className="detail-label">Student ID</span>
                  <span className="detail-value">{attendee.student_id || 'N/A'}</span>
                </div>

                <div className="detail-pill detail-pill-full">
                  <span className="detail-label">Registered Event</span>
                  <span className="detail-value" style={{ color: 'var(--cyan)' }}>
                    <Trophy size={14} style={{ display: 'inline', marginRight: 6 }} />
                    {attendee.event_name || 'General Admission'}
                  </span>
                </div>

                {attendee.team_name && (
                  <div className="detail-pill detail-pill-full">
                    <span className="detail-label">Team</span>
                    <span className="detail-value">
                      <Users size={14} style={{ display: 'inline', marginRight: 6 }} />
                      {attendee.team_name}
                      {attendee.team_members && attendee.team_members.length > 0 && (
                        <span style={{ fontSize: '0.74rem', color: 'rgba(228, 244, 255, 0.6)', marginLeft: 6 }}>
                          (+{attendee.team_members.length} members)
                        </span>
                      )}
                    </span>
                  </div>
                )}
              </div>
            </>
          ) : (
            <div style={{ textAlign: 'center', padding: '16px', color: 'rgba(228, 244, 255, 0.7)' }}>
              No attendee profile found matching this code. Please verify the ticket ID or have the attendee show their registration confirmation email.
            </div>
          )}
        </div>

        {/* Footer Actions - Sticky at bottom for thumb ergonomics */}
        <div className="modal-footer">
          <div className="modal-footer-secondary">
            {attendee && (isValid || isFoodClaimed) && (
              <button
                type="button"
                className="btn-secondary"
                onClick={() => onUndo(attendee.ticket_id)}
                disabled={isUndoing}
                title="Undo check-in if scanned by accident"
              >
                <RotateCcw size={15} />
                <span>{isUndoing ? 'Undoing...' : 'Undo'}</span>
              </button>
            )}

            {attendee && (
              <button
                type="button"
                className="btn-secondary"
                onClick={() => onViewPass(attendee)}
                title="View full printable digital pass"
              >
                <ShieldCheck size={15} />
                <span>Pass</span>
              </button>
            )}
          </div>

          {/* Primary Thumb CTA */}
          <button
            type="button"
            className="btn-primary btn-full ready-scan-btn"
            onClick={onClose}
            autoFocus
          >
            <Check size={18} />
            <span>Ready for Next Scan</span>
          </button>
        </div>
      </div>
    </div>
  );
}
