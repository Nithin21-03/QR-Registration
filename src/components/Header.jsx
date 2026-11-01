import React, { useState } from 'react';
import {
  ShieldCheck,
  Volume2,
  VolumeX,
  Vibrate,
  Sparkles,
  MapPin,
  User,
} from 'lucide-react';
import { sound } from '../utils/audioSynth';

export default function Header({
  station,
  setStation,
  volunteer,
  setVolunteer,
  health,
  onSeedData,
  isSeeding,
}) {
  const [muted, setMuted] = useState(false);
  const [haptics, setHaptics] = useState(true);

  const toggleMute = () => {
    const next = !muted;
    setMuted(next);
    sound.setMuted(next);
    if (!next) sound.playClick();
  };

  const toggleHaptics = () => {
    const next = !haptics;
    setHaptics(next);
    sound.setHaptics(next);
    sound.playClick();
  };

  const isConnected = health?.database?.connected;

  return (
    <header className="top-header glass">
      {/* Top Row: Brand & Quick Action Controls */}
      <div className="header-primary-row">
        {/* Brand Section */}
        <div className="brand-section">
          <div className="brand-logo-crest">
            <ShieldCheck size={22} />
          </div>
          <div className="brand-text">
            <h1>
              ZYNTRA <span>’26</span>
            </h1>
            <div className="brand-sub">PASS SCANNER</div>
          </div>
        </div>

        {/* Quick System Controls (Audio, Haptic, Cloud status) */}
        <div className="header-quick-actions">
          {/* Supabase Status Indicator */}
          <div
            className={`status-indicator ${isConnected ? 'connected' : 'local'}`}
            title={isConnected ? 'Connected to Supabase PostgreSQL' : 'Operating in Local Storage Cache'}
          >
            <div className="status-dot" />
            <span className="status-label-desktop">
              {isConnected ? 'Supabase Live' : 'Local Cache'}
            </span>
          </div>

          {/* Audio Toggle */}
          <button
            type="button"
            className={`icon-btn ${!muted ? 'active' : ''}`}
            onClick={toggleMute}
            title={muted ? 'Unmute Audio Chimes' : 'Mute Audio Chimes'}
            aria-label="Toggle Sound"
          >
            {muted ? <VolumeX size={16} /> : <Volume2 size={16} />}
          </button>

          {/* Haptics Toggle */}
          <button
            type="button"
            className={`icon-btn ${haptics ? 'active' : ''}`}
            onClick={toggleHaptics}
            title={haptics ? 'Disable Vibration Haptics' : 'Enable Vibration Haptics'}
            aria-label="Toggle Vibration"
          >
            <Vibrate size={16} />
          </button>
        </div>
      </div>

      {/* Secondary Row / Station & Volunteer Operator Controls */}
      <div className="header-station-row">
        {/* Physical Station / Gate Selector */}
        <div className="station-select-wrapper">
          <MapPin size={14} className="station-icon" />
          <select
            className="station-select"
            value={station}
            onChange={(e) => {
              sound.playClick();
              setStation(e.target.value);
            }}
            title="Current Scanning Station"
            aria-label="Scanner Station"
          >
            <option value="Gate 1 (Main Entrance)">Gate 1 (Main Entrance)</option>
            <option value="Gate 2 (Auditorium)">Gate 2 (Auditorium)</option>
            <option value="Gate 3 (Cyber Labs)">Gate 3 (Cyber Labs)</option>
            <option value="Food Counter A (Main Quad)">Food Counter A (Main Quad)</option>
            <option value="Food Counter B (Dining Hall)">Food Counter B (Dining Hall)</option>
          </select>
        </div>

        {/* Volunteer Name */}
        <div className="volunteer-input-wrapper">
          <User size={14} className="volunteer-icon" />
          <input
            type="text"
            className="volunteer-input"
            value={volunteer}
            onChange={(e) => setVolunteer(e.target.value)}
            placeholder="Operator Name"
            title="Logged Volunteer Name"
            aria-label="Volunteer Name"
          />
        </div>

        {/* Seed Sample Passes (visible only when 0 attendees loaded) */}
        {health?.totalAttendees === 0 && (
          <button
            type="button"
            className="btn-secondary seed-btn"
            onClick={onSeedData}
            disabled={isSeeding}
            title="Load sample Zyntra passes for testing"
          >
            <Sparkles size={13} className="text-cyan" />
            <span>{isSeeding ? 'Seeding...' : 'Load Demo Passes'}</span>
          </button>
        )}
      </div>
    </header>
  );
}
