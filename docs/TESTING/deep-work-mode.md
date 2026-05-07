# Deep Work Mode Testing

## Manual Test Cases
1. Run `Session Tracker: Start Deep Work Mode`.
2. Confirm Zen Mode activates and the Activity Bar hides.
3. Wait for the timer to complete or end manually.
4. Verify panels and notifications return to previous state.
5. Open History and confirm deep work seconds incremented in the latest session.

## Expected Results
- The status bar shows a deep work countdown when active.
- Deep work sessions increment `deepWorkCompleted` in the session record.
- UI state restores after ending the mode.
