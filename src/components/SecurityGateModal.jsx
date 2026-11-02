import React, { useState } from 'react';
import { ShieldCheck, Lock, Unlock, KeyRound, Eye, EyeOff, AlertTriangle, ShieldAlert } from 'lucide-react';
import { sound } from '../utils/audioSynth';

export default function SecurityGateModal({ onAuthenticated, isLocked, onCancel }) {
  const [passcode, setPasscode] = useState('');
  const [showPasscode, setShowPasscode] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!passcode.trim()) return;

    setLoading(true);
    setErrorMsg('');
    sound.playClick();

    try {
      const res = await fetch('/api/auth/verify-passcode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ passcode: passcode.trim() }),
      });

      const data = await res.json().catch(() => null);

      if (res.ok && data?.authenticated) {
        sound.playSuccess();
        sessionStorage.setItem('zyntra_auth_token', data.token);
        sessionStorage.setItem('zyntra_auth_passcode', passcode.trim());
        onAuthenticated(data.token, passcode.trim());
        return;
      }

      if (data?.error === 'SECURITY_LOCKOUT') {
        sound.playError();
        setErrorMsg(data.message || 'Terminal locked due to security lockout.');
        return;
      }

      // Check for invalid passcode from server
      if (res.status === 401 || (data && !data.success)) {
        sound.playError();
        setErrorMsg(data?.message || 'Invalid passcode. Please enter the authorized volunteer passcode.');
        return;
      }
    } catch (_) {
      // In case server is offline or network is isolated, support local validation fallback
      if (passcode.trim() === 'zyntra2026') {
        sound.playSuccess();
        const fallbackToken = 'offline_' + btoa('zyntra2026_' + Date.now());
        sessionStorage.setItem('zyntra_auth_token', fallbackToken);
        sessionStorage.setItem('zyntra_auth_passcode', passcode.trim());
        onAuthenticated(fallbackToken, passcode.trim());
        return;
      } else {
        sound.playError();
        setErrorMsg('Invalid volunteer passcode.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-backdrop security-modal-backdrop" style={{ zIndex: 9999 }}>
      <div className="security-card glass" style={{ maxWidth: '440px', width: '92%', margin: '0 auto' }}>
        {/* Crest */}
        <div style={{ textAlign: 'center', marginBottom: '20px' }}>
          <div
            style={{
              width: '64px',
              height: '64px',
              borderRadius: '20px',
              background: 'linear-gradient(135deg, rgba(63, 216, 255, 0.2), rgba(47, 123, 255, 0.1))',
              border: '1px solid rgba(63, 216, 255, 0.4)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 14px',
              boxShadow: '0 0 25px rgba(63, 216, 255, 0.25)',
            }}
          >
            <ShieldCheck size={32} style={{ color: '#3fd8ff' }} />
          </div>
          <div style={{ fontSize: '0.72rem', letterSpacing: '0.3em', textTransform: 'uppercase', color: '#8fe6ff' }}>
            SECURITY CLEARANCE
          </div>
          <h2 style={{ fontSize: '1.45rem', fontWeight: 800, letterSpacing: '0.06em', color: '#fff', marginTop: '4px' }}>
            VOLUNTEER GATE PASS
          </h2>
          <p style={{ fontSize: '0.82rem', color: 'rgba(228, 244, 255, 0.7)', marginTop: '6px' }}>
            Restricted access terminal for ZYNTRA &apos;26 entrance &amp; food stations.
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div style={{ position: 'relative' }}>
            <KeyRound
              size={18}
              style={{
                position: 'absolute',
                left: '14px',
                top: '50%',
                transform: 'translateY(-50%)',
                color: 'rgba(63, 216, 255, 0.7)',
              }}
            />
            <input
              type={showPasscode ? 'text' : 'password'}
              value={passcode}
              onChange={(e) => setPasscode(e.target.value)}
              placeholder="Enter Access Passcode"
              autoFocus
              style={{
                width: '100%',
                padding: '13px 44px 13px 42px',
                background: 'rgba(2, 5, 15, 0.75)',
                border: errorMsg ? '1px solid #ff4d6d' : '1px solid rgba(140, 200, 255, 0.25)',
                borderRadius: '12px',
                color: '#fff',
                fontSize: '0.95rem',
                letterSpacing: showPasscode ? 'normal' : '0.15em',
                outline: 'none',
              }}
            />
            <button
              type="button"
              onClick={() => setShowPasscode(!showPasscode)}
              style={{
                position: 'absolute',
                right: '12px',
                top: '50%',
                transform: 'translateY(-50%)',
                background: 'none',
                border: 'none',
                color: 'rgba(228, 244, 255, 0.6)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
              }}
              title={showPasscode ? 'Hide passcode' : 'Show passcode'}
            >
              {showPasscode ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>

          {errorMsg && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '10px 14px',
                borderRadius: '10px',
                background: 'rgba(255, 77, 109, 0.12)',
                border: '1px solid rgba(255, 77, 109, 0.4)',
                color: '#ff6b8b',
                fontSize: '0.8rem',
              }}
            >
              <AlertTriangle size={16} style={{ flexShrink: 0 }} />
              <span>{errorMsg}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={loading || !passcode.trim()}
            className="btn btn-primary"
            style={{
              padding: '13px 20px',
              borderRadius: '12px',
              background: 'linear-gradient(135deg, #2f7bff, #3fd8ff)',
              border: 'none',
              color: '#02050f',
              fontWeight: 700,
              letterSpacing: '0.15em',
              textTransform: 'uppercase',
              fontSize: '0.82rem',
              cursor: loading ? 'wait' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              boxShadow: '0 4px 20px rgba(63, 216, 255, 0.35)',
              marginTop: '4px',
            }}
          >
            {loading ? (
              <span>Authenticating...</span>
            ) : (
              <>
                <Unlock size={16} />
                <span>Unlock Terminal</span>
              </>
            )}
          </button>
        </form>

        {/* Security badges */}
        <div
          style={{
            marginTop: '22px',
            paddingTop: '16px',
            borderTop: '1px solid rgba(140, 200, 255, 0.12)',
            display: 'flex',
            flexDirection: 'column',
            gap: '6px',
            fontSize: '0.72rem',
            color: 'rgba(228, 244, 255, 0.5)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ color: '#5df2b5' }}>●</span> Anti-Tamper &amp; Anti-Proxy Verification Active
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ color: '#5df2b5' }}>●</span> Rate Limiter Active (60 scans/min per terminal)
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ color: '#5df2b5' }}>●</span> Direct Sync with Supabase Cloud DB
          </div>
        </div>
      </div>
    </div>
  );
}

