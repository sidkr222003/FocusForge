# Session Notes

## Overview
Adds a lightweight note to each session, including a one-line summary, mood, and optional blockers. Notes appear in the History detail view and in the Journal tab.

## Data Model
- `SessionRecord.note`:
  - `summary`: string
  - `mood`: integer 1-5
  - `blockers`: optional string
  - `createdAt`: ISO timestamp

## User Flow
- When a session ends, the note composer opens automatically if a view is visible.
- Commands can open the note composer for the current or last session.

## UI Surface
- History detail: note preview or "Add note" button.
- Journal tab: weekly list of notes with mood filter.

## Commands
- `Session Tracker: Add Session Note`
- `Session Tracker: Open Journal`
