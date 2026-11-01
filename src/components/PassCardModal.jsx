import React, { useEffect, useState, useRef } from 'react';
import QRCode from 'qrcode';
import {
  Printer,
  X,
  ShieldCheck,
  Calendar,
  MapPin,
  Trophy,
  Users,
  CheckCircle2,
} from 'lucide-react';
import { sound } from '../utils/audioSynth';

export default function PassCardModal({ attendee, onClose }) {
  const [qrDataUrl, setQrDataUrl] = useState('');
  const printRef = useRef(null);

  useEffect(() => {
    if (!attendee) return;

    // Generate high-resolution scannable QR code
    const payload = JSON.stringify({
      id: attendee.ticket_id,
      name: attendee.full_name,
      college: attendee.college,
      event: attendee.event_name,
      status: 'CONFIRMED',
    });

    QRCode.toDataURL(payload, {
      width: 240,
      margin: 1,
      color: {
        dark: '#02050f',
        light: '#ffffff',
      },
    })
      .then((url) => setQrDataUrl(url))
      .catch((err) => console.error('QR generation error:', err));
  }, [attendee]);

  if (!attendee) return null;

  const handlePrint = () => {
    sound.playClick();
    window.print();
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="glass"
        style={{
          width: 'min(500px, 100%)',
          borderRadius: '24px',
          overflow: 'hidden',
          background: '#040b1e',
          border: '1px solid var(--cyan)',
          boxShadow: '0 20px 60px rgba(0, 5, 30, 0.9)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Pass Top Banner */}
        <div
          style={{
            padding: '20px 24px',
            background: 'linear-gradient(135deg, rgba(47, 123, 255, 0.4), rgba(63, 216, 255, 0.15))',
            borderBottom: '1px solid var(--line)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <div>
            <div
              style={{
                fontSize: '0.68rem',
                letterSpacing: '0.22em',
                textTransform: 'uppercase',
                color: 'var(--cyan)',
                fontWeight: 700,
              }}
            >
              Official Festival Pass · ZYNTRA ’26
            </div>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#fff', letterSpacing: '0.04em' }}>
              SAPTHAGIRI NPS UNIVERSITY
            </h2>
          </div>

          <button
            className="icon-btn"
            onClick={onClose}
            style={{ width: '32px', height: '32px' }}
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        {/* Pass Body Content */}
        <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '18px' }} ref={printRef}>
          {/* QR Code Container */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '16px',
              borderRadius: '16px',
              background: '#fff',
              width: '180px',
              margin: '0 auto',
              boxShadow: '0 8px 30px rgba(63, 216, 255, 0.25)',
            }}
          >
            {qrDataUrl ? (
              <img
                src={qrDataUrl}
                alt="Entry QR"
                style={{ width: '100%', height: 'auto', display: 'block' }}
              />
            ) : (
              <div style={{ width: 140, height: 140, background: '#eee' }} />
            )}
            <div
              style={{
                fontSize: '0.68rem',
                fontWeight: 700,
                color: '#02050f',
                letterSpacing: '0.12em',
                textTransform: 'uppercase',
                marginTop: '4px',
              }}
            >
              Scan for Gate / Meal
            </div>
          </div>

          {/* Attendee Details */}
          <div style={{ textAlign: 'center' }}>
            <h3 style={{ fontSize: '1.35rem', fontWeight: 800, color: '#fff' }}>
              {attendee.full_name}
            </h3>
            <div style={{ fontSize: '0.85rem', color: 'rgba(228, 244, 255, 0.7)', marginTop: '2px' }}>
              {attendee.college}
            </div>
          </div>

          {/* Grid of Meta Info */}
          <div className="details-grid">
            <div className="detail-pill">
              <span className="detail-label">Pass ID</span>
              <span className="detail-value mono">{attendee.ticket_id}</span>
            </div>

            <div className="detail-pill">
              <span className="detail-label">Student ID</span>
              <span className="detail-value">{attendee.student_id || 'N/A'}</span>
            </div>

            <div className="detail-pill" style={{ gridColumn: 'span 2' }}>
              <span className="detail-label">Event</span>
              <span className="detail-value" style={{ color: 'var(--cyan)' }}>
                {attendee.event_name}
              </span>
            </div>

            <div className="detail-pill">
              <span className="detail-label">Gate Entrance</span>
              <span className="detail-value" style={{ color: attendee.checked_in ? '#34d399' : '#fcd34d' }}>
                {attendee.checked_in ? 'Checked In' : 'Pending'}
              </span>
            </div>

            <div className="detail-pill">
              <span className="detail-label">Meal Claim</span>
              <span className="detail-value" style={{ color: attendee.food_claimed ? 'var(--cyan)' : '#fcd34d' }}>
                {attendee.food_claimed ? 'Claimed' : 'Not Claimed'}
              </span>
            </div>
          </div>

          {/* Venue & Security Stamp */}
          <div
            style={{
              padding: '12px 14px',
              borderRadius: '12px',
              background: 'rgba(63, 216, 255, 0.06)',
              border: '1px solid var(--line)',
              fontSize: '0.75rem',
              color: 'rgba(228, 244, 255, 0.7)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <MapPin size={13} className="text-cyan" />
              <span>Campus Main Gate & Labs</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#6ee7b7' }}>
              <ShieldCheck size={13} />
              <span>Verified Registry</span>
            </div>
          </div>
        </div>

        {/* Modal Actions */}
        <div className="modal-footer">
          <button className="btn-secondary" onClick={handlePrint} style={{ flex: 1 }}>
            <Printer size={16} />
            <span>Print Pass / PDF</span>
          </button>
          <button className="btn-primary" onClick={onClose} style={{ flex: 1 }}>
            <span>Done</span>
          </button>
        </div>
      </div>
    </div>
  );
}

