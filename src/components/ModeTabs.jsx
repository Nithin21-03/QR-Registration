import React from 'react';
import { QrCode, Utensils, BarChart3, Users } from 'lucide-react';
import { sound } from '../utils/audioSynth';

export default function ModeTabs({ activeMode, onSelectMode, stats }) {
  const tabs = [
    {
      id: 'MAIN_ENTRANCE',
      title: 'Entrance Gate',
      desc: 'Pass verify & entry',
      shortTitle: 'Entrance',
      icon: QrCode,
      badge: stats?.overview?.totalCheckedIn !== undefined
        ? `${stats.overview.totalCheckedIn} In`
        : null,
      foodMode: false,
    },
    {
      id: 'FOOD_COLLECTION',
      title: 'Food Station',
      desc: 'Meal token & duplicate check',
      shortTitle: 'Food Station',
      icon: Utensils,
      badge: stats?.overview?.totalFoodClaimed !== undefined
        ? `${stats.overview.totalFoodClaimed} Fed`
        : null,
      foodMode: true,
    },
    {
      id: 'ANALYTICS',
      title: 'Live Analytics',
      desc: 'Stats, velocity & charts',
      shortTitle: 'Analytics',
      icon: BarChart3,
      badge: stats?.overview?.attendanceRate !== undefined
        ? `${stats.overview.attendanceRate}%`
        : null,
      foodMode: false,
    },
    {
      id: 'ATTENDEES',
      title: 'Attendees',
      desc: 'Directory, search & CSV',
      shortTitle: 'Registry',
      icon: Users,
      badge: stats?.overview?.totalRegistered !== undefined
        ? `${stats.overview.totalRegistered}`
        : null,
      foodMode: false,
    },
  ];

  return (
    <nav className="mode-tabs-grid" aria-label="Scanner modes">
      {tabs.map((tab) => {
        const Icon = tab.icon;
        const isActive = activeMode === tab.id;

        return (
          <button
            key={tab.id}
            type="button"
            className={`tab-btn ${isActive ? 'active' : ''} ${
              tab.foodMode && isActive ? 'food-mode' : ''
            }`}
            onClick={() => {
              sound.playClick();
              onSelectMode(tab.id);
            }}
          >
            <div className="tab-icon">
              <Icon size={18} />
            </div>
            <div className="tab-text">
              <div className="tab-title-row">
                <span className="tab-title-desktop">{tab.title}</span>
                <span className="tab-title-mobile">{tab.shortTitle}</span>
                {tab.badge && (
                  <span className="tab-count-badge">
                    {tab.badge}
                  </span>
                )}
              </div>
              <span className="tab-desc">{tab.desc}</span>
            </div>
          </button>
        );
      })}
    </nav>
  );
}
