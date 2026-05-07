# Changelog

## 1.0.0 - FocusForge Rebrand And Productivity Expansion

### Branding
- Renamed the extension package to `focusforge`.
- Updated the display name to `FocusForge: Coding Session Tracker`.
- Added marketplace categories and keywords for productivity, Pomodoro, GitHub, Git, analytics, planner, reports, and AI insights.
- Added a new marketplace PNG icon at `images/icon.png` and source display asset at `images/focusforge-icon.png`.
- Rebuilt the README as a complete feature and marketplace overview.

### Fixed
- Local working repository detection now uses the active editor, workspace Git roots, nested Git folders, and the VS Code Git API before falling back to token-fetched GitHub repositories.
- The Issue Log Git activation banner is hidden when a local repository is already detected.
- Weekly reports now read the tracker history key (`devToolkit.sessionHistory`) instead of an unused session key.

### Added
- Pomodoro tracking with work, short-break, and long-break cycles.
- Per-session Pomodoro counts and Pomodoro focus seconds.
- Project analytics based on workspace folder, Git root, and remote URL.
- Git commit correlation for commits made during a tracked session.
- Planner panel with planned sessions, fulfillment detection, and `.ics` export.
- Project analytics section in History.
- Team leaderboard via opt-in GitHub Gists.
- Ambient focus audio player using local Web Audio synthesis.
- GitHub Models weekly insights using the existing GitHub token, disabled by default and opt-in.
- Weekly report project, language, Pomodoro, and commit summaries.
- New settings for Pomodoro, project analytics, planner, audio, reports, leaderboard, and AI insights.

### Changed
- Session export includes richer metadata for notes, languages, deep work, focus score, and new Phase 2/3 fields.
- Status bar tooltip now includes project, Pomodoro, and commit context.
- Documentation now covers all implemented tracker, issue, report, planner, social, and AI features.
