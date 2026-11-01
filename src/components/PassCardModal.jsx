import React, { useEffect, useState, useRef } from 'react';
import QRCode from 'qrcode';
import {
  Printer,
  X,
  ShieldCheck,
  MapPin,
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
    <div className="modal-overlay" onClick={onClose} role="dialog" aria-modal="true">
      <div
        className="pass-modal-card glass"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Pass Top Banner */}
        <div className="pass-banner">
          <div>
            <div className="pass-tagline">
              Official Festival Pass · ZYNTRA ’26
            </div>
            <h2 className="pass-institution">
              SAPTHAGIRI NPS UNIVERSITY
            </h2>
          </div>

          <button
            type="button"
            className="icon-btn pass-close-btn"
            onClick={onClose}
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        {/* Pass Body Content */}
        <div className="pass-scroll-body" ref={printRef}>
          {/* QR Code Container */}
          <div className="pass-qr-box">
            {qrDataUrl ? (
              <img
                src={qrDataUrl}
                alt="Entry QR"
                className="pass-qr-img"
              />
            ) : (
              <div style={{ width: 140, height: 140, background: '#eee' }} />
            )}
            <div className="pass-qr-caption">
              Scan for Gate / Meal
            </div>
          </div>

          {/* Attendee Details */}
          <div style={{ textAlign: 'center' }}>
            <h3 className="pass-attendee-name">
              {attendee.full_name}
            </h3>
            <div className="pass-attendee-college">
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

            <div className="detail-pill detail-pill-full">
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
          <div className="pass-stamp-box">
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <MapPin size={13} className="text-cyan" />
              <span>Campus Gates & Labs</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#6ee7b7' }}>
              <ShieldCheck size={13} />
              <span>Verified Fest Entry</span>
            </div>
          </div>
        </div>

        {/* Modal Actions */}
        <div className="modal-footer">
          <button type="button" className="btn-secondary" onClick={handlePrint} style={{ flex: 1 }}>
            <Printer size={16} />
            <span>Print Pass</span>
          </button>
          <button type="button" className="btn-primary" onClick={onClose} style={{ flex: 1 }}>
            <span>Done</span>
          </button>
        </div>
      </div>
    </div>
  );
}
