import React, { useState, useEffect } from 'react';
import {
  ShieldCheck,
  Volume2,
  VolumeX,
  Vibrate,
  Radio,
  Sparkles,
  Database,
  Building,
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
      {/* Brand Section */}
      <div className="brand-section">
        <div className="brand-logo-crest">
          <ShieldCheck size={24} />
        </div>
        <div className="brand-text">
          <h1>
            ZYNTRA <span>’26</span>
          </h1>
          <div className="brand-sub">PASS & MEAL SCANNER</div>
        </div>
      </div>

      {/* Controls & Badges */}
      <div className="header-controls">
        {/* Supabase Status */}
        <div className={`status-indicator ${isConnected ? 'connected' : 'local'}`}>
          <div className="status-dot" />
          <span>{isConnected ? 'Supabase Cloud' : 'Local Cache Active'}</span>
        </div>

        {/* Station / Gate Selector */}
        <select
          className="station-select"
          value={station}
          onChange={(e) => {
            sound.playClick();
            setStation(e.target.value);
          }}
          title="Select physical scanner location"
        >
          <option value="Gate 1 (Main Entrance)">Gate 1 (Main Entrance)</option>
          <option value="Gate 2 (Auditorium)">Gate 2 (Auditorium)</option>
          <option value="Gate 3 (Cyber Labs)">Gate 3 (Cyber Labs)</option>
          <option value="Food Counter A (Main Quad)">Food Counter A (Main Quad)</option>
          <option value="Food Counter B (Dining Hall)">Food Counter B (Dining Hall)</option>
        </select>

        {/* Volunteer Identity */}
        <input
          type="text"
          className="station-select"
          style={{ width: '130px' }}
          value={volunteer}
          onChange={(e) => setVolunteer(e.target.value)}
          placeholder="Volunteer Name"
          title="Volunteer Operator Name"
        />

        {/* Seed Sample Passes (if needed) */}
        {health?.totalAttendees === 0 && (
          <button
            className="btn-secondary"
            onClick={onSeedData}
            disabled={isSeeding}
            style={{ fontSize: '0.74rem', padding: '6px 12px' }}
            title="Load sample Zyntra passes for testing"
          >
            <Sparkles size={13} className="text-cyan" />
            <span>{isSeeding ? 'Seeding...' : 'Load Demo Passes'}</span>
          </button>
        )}

        {/* Audio Toggle */}
        <button
          className={`icon-btn ${!muted ? 'active' : ''}`}
          onClick={toggleMute}
          title={muted ? 'Unmute Audio Chimes' : 'Mute Audio Chimes'}
        >
          {muted ? <VolumeX size={17} /> : <Volume2 size={17} />}
        </button>

        {/* Haptics Toggle */}
        <button
          className={`icon-btn ${haptics ? 'active' : ''}`}
          onClick={toggleHaptics}
          title={haptics ? 'Disable Vibration Haptics' : 'Enable Vibration Haptics'}
        >
          <Vibrate size={17} />
        </button>
      </div>
    </header>
  );
}

