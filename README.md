# 🎯 Coding Session Tracker — VS Code Extension

Track your deep-work sessions with a stunning live sidebar dashboard.

## Features

### 📅 Today Tab
- Live active time, session count, best focus streak, flow time
- Responsive **12-week activity heatmap** with hover tooltips
- Today's breakdown: total, active, idle time, efficiency, breaks
- **Focus Score gauge** (0–100) based on active time, flow, breaks, idle ratio
- **Language breakdown donut** for today's active time
- All-time lifetime stats: total sessions, hours, day streak, avg session length

### 🎯 Goals Tab
- **Animated progress ring** with glow effect and colour transitions
- Milestone markers at 25%, 50%, 75%, 100%
- Quick-select preset goals (1h, 1.5h, 2h, 3h, 4h, 6h)
- Estimated completion time (ETA) based on current session rate
- Goal streak tracker — how many consecutive days you hit your goal
- **7-day week bar chart** showing daily coding vs. goal

### 🏆 Awards Tab
- **4 Progressive Badges** — Code Clock, Fire Keeper, Focus Forge, Iron Coder
  - Each with Bronze → Silver → Gold → Platinum → Diamond tiers
  - Live progress bars showing next milestone
- **100+ Achievements** across 6 categories:
  - 🌟 **Milestones** — First session through 5,000 hours
  - 🔥 **Streaks** — 1 day through 365-day streak
  - ⚡ **Flow State** — First flow through Flow God (100 sessions)
  - 📊 **Productivity** — Efficiency, marathon sessions, ninja coding
  - 🕐 **Time of Day** — Night Owl, Early Bird, Graveyard Shift, etc.
  - 🔄 **Consistency** — Back-to-Back through Legendary
- Custom hand-crafted **SVG icons** for every achievement
- **Search & filter** achievements (All/Unlocked/Locked)
- Overall progress bar with % completion
- **Toast notifications** when achievements unlock (queued, non-overlapping)
- Category accordion — expand/collapse sections

### 📈 History Tab
- **14-session bar chart** — click bars to inspect sessions
- Per-session detail: duration, active time, peak streak, efficiency, breaks, idle events
- **Focus score, flow time, and deep work** stats per session
- **Session log** list with top languages, efficiency %, focus score
- **Language leaderboard** (all-time top languages)
- Live efficiency strip on selected session
- **JSON & CSV export** with full metadata (language, start hour, breaks, idle count)

### 📓 Journal Tab
- Weekly session notes (last 7 days) with mood filter
- Inline notes on session cards and history detail

## Tracking Features
- ⏱️ **Idle detection** — configurable threshold (default: 2 min)
- ⏸️ **Auto-pause on window focus loss** — resumes when you return
- ▶️ **Manual pause/resume** via header button or command palette
- ⚡ **Flow state detection** — 25+ minute continuous streak
- 🧠 **Focus score** — weighted score for active/flow/breaks/idle
- 🌙 **Deep Work Mode** — Zen Mode + distraction suppression with timer
- 🔔 **Break reminders** — configurable interval (default: 45 min)
- 🎯 **Daily goal tracking** with ETA
- 💾 Saves up to 60 sessions with auto-save every 15 seconds

## Commands
| Command | Description |
|---------|-------------|
| `Session Tracker: Start Session` | Resume tracking |
| `Session Tracker: End Session` | Pause tracking |
| `Session Tracker: Open Dashboard` | Focus the Today tab |
| `Session Tracker: View Achievements` | Focus the Awards tab |
| `Session Tracker: View History` | Focus the History tab |
| `Session Tracker: Add Session Note` | Add a note to the latest session |
| `Session Tracker: Open Journal` | Open the Journal tab |
| `Session Tracker: Start Deep Work Mode` | Enter Deep Work Mode |
| `Session Tracker: End Deep Work Mode` | Exit Deep Work Mode |
| `Session Tracker: Export Data` | Export JSON or CSV |
| `Session Tracker: Reset Today` | Clear today's sessions |
| `Session Tracker: Set Daily Goal` | Set goal via input box |
| `Session Tracker: Toggle Tracking` | Toggle pause/resume |

## Settings
```json
{
  "devToolkit.sessionTracker.dailyGoalMinutes": 120,
  "devToolkit.sessionTracker.idleThresholdMinutes": 2,
  "devToolkit.sessionTracker.idleDetection": true,
  "devToolkit.sessionTracker.flowStateThresholdMinutes": 25,
  "devToolkit.sessionTracker.breakReminderInterval": 45,
  "devToolkit.sessionTracker.statusBarFormat": "timeAndStreak",
  "devToolkit.sessionTracker.focusScore": {
    "enabled": true,
    "showInStatusBar": true
  },
  "devToolkit.sessionTracker.deepWork": {
    "defaultDurationMinutes": 50,
    "hideActivityBar": true,
    "hideStatusBar": false,
    "muteNotifications": true
  },
  "devToolkit.sessionTracker.notifications": {
    "breakReminders": true,
    "goalReminders": true,
    "achievementToasts": true
  }
}
```

## Installation (from source)

```bash
cd vscode-session-tracker
npm install
npm run compile
```

Then press `F5` in VS Code to launch the Extension Development Host, or package it:

```bash
npx vsce package
code --install-extension coding-session-tracker-1.0.0.vsix
```

## Requirements
- VS Code 1.85.0+
- Node.js 18+

## Documentation
- Feature docs: [docs/FEATURES](docs/FEATURES)
- Testing guides: [docs/TESTING](docs/TESTING)

## License
Apache 2.0
