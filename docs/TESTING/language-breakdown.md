# Language Breakdown Testing

## Manual Test Cases
1. Open two files with different languages (e.g., TypeScript and CSS).
2. Start a session and spend at least 1 minute in each file.
3. Open the Today tab and verify the donut chart shows both languages.
4. Verify the History tab leaderboard lists both languages with non-zero time.
5. Switch `statusBarFormat` to `timeAndLanguage` and confirm the label updates when changing editors.

## Expected Results
- Only active time is counted.
- Idle or paused time does not increase language totals.
- Today and all-time totals update within 1-2 seconds.
