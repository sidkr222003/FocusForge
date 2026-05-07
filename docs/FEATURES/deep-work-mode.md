# Deep Work Mode

## Overview
Starts a timed, distraction-minimized session by entering Zen Mode, hiding panels, and muting notifications (optional). The run is tracked as a deep work session in session history.

## Behavior
- Activates Zen Mode.
- Hides the Activity Bar and optional Status Bar.
- Closes the panel and sidebar.
- Toggles Do Not Disturb while active.
- Ends automatically when the timer completes or on command.

## Data Model
- `SessionRecord.deepWorkSeconds`: seconds spent in deep work while tracking.
- `SessionRecord.deepWorkCompleted`: number of completed deep work timers in the session.

## Commands
- `Session Tracker: Start Deep Work Mode`
- `Session Tracker: End Deep Work Mode`

## Settings
```
"devToolkit.sessionTracker.deepWork": {
  "defaultDurationMinutes": 50,
  "hideActivityBar": true,
  "hideStatusBar": false,
  "muteNotifications": true
}
```
