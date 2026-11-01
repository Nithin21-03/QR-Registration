import React from 'react';
import { QrCode, Utensils, BarChart3, Users } from 'lucide-react';
import { sound } from '../utils/audioSynth';

export default function ModeTabs({ activeMode, onSelectMode, stats }) {
  const tabs = [
    {
      id: 'MAIN_ENTRANCE',
      title: 'Entrance Scanner',
      desc: 'Verify pass & check-in',
      icon: QrCode,
      badge: stats?.overview?.totalCheckedIn
        ? `${stats.overview.totalCheckedIn} In`
        : null,
      foodMode: false,
    },
    {
      id: 'FOOD_COLLECTION',
      title: 'Food Collection',
      desc: 'Meal token & duplicate check',
      icon: Utensils,
      badge: stats?.overview?.totalFoodClaimed
        ? `${stats.overview.totalFoodClaimed} Fed`
        : null,
      foodMode: true,
    },
    {
      id: 'ANALYTICS',
      title: 'Live Analytics',
      desc: 'Stats, velocity & charts',
      icon: BarChart3,
      badge: stats?.overview?.attendanceRate !== undefined
        ? `${stats.overview.attendanceRate}%`
        : null,
      foodMode: false,
    },
    {
      id: 'ATTENDEES',
      title: 'Attendee Registry',
      desc: 'Directory, search & CSV',
      icon: Users,
      badge: stats?.overview?.totalRegistered
        ? `${stats.overview.totalRegistered} Reg`
        : null,
      foodMode: false,
    },
  ];

  return (
    <div className="mode-tabs-grid">
      {tabs.map((tab) => {
        const Icon = tab.icon;
        const isActive = activeMode === tab.id;

        return (
          <button
            key={tab.id}
            className={`tab-btn ${isActive ? 'active' : ''} ${
              tab.foodMode && isActive ? 'food-mode' : ''
            }`}
            onClick={() => {
              sound.playClick();
              onSelectMode(tab.id);
            }}
          >
            <div className="tab-icon">
              <Icon size={20} />
            </div>
            <div className="tab-text">
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '8px',
                }}
              >
                <span className="tab-title">{tab.title}</span>
                {tab.badge && (
                  <span
                    style={{
                      fontSize: '0.68rem',
                      fontFamily: 'var(--font-mono)',
                      background: 'rgba(255, 255, 255, 0.12)',
                      padding: '2px 6px',
                      borderRadius: '6px',
                    }}
                  >
                    {tab.badge}
                  </span>
                )}
              </div>
              <span className="tab-desc">{tab.desc}</span>
            </div>
          </button>
        );
      })}
    </div>
  );
}

