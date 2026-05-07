# Language Breakdown

## Overview
Tracks active coding time by language using the active editor's `document.languageId`. Data is stored per session and aggregated for today and all-time views.

## Data Model
- `SessionRecord.languageBreakdown`: map of language id to active seconds.
- `SessionRecord.language`: dominant language fallback.

## Collection Rules
- Only increments while tracking is active and not idle.
- Uses the active editor language at each tick.
- Idle or paused time is not counted.

## UI Surface
- Today tab: donut chart with top languages for the current day.
- History tab: language leaderboard (all-time).
- Session log: top language short labels on each session row.

## Status Bar
When `statusBarFormat` is `timeAndLanguage`, the status bar shows the current language short label and today's time in that language.

## Settings
No feature-specific settings. Uses existing tracking and idle detection settings.
