# Phase 2 and Phase 3 Features

## Repository Detection

FocusForge detects the current working repository from the active editor, workspace folders, nested Git folders, and the VS Code Git extension API. Local repositories are shown before repositories fetched from a GitHub token, so cloned workspaces remain usable even when the GitHub account list is large or belongs to another user.

## Pomodoro Mode

Pomodoro cycles run with the session tracker and persist completed work cycles on the session record. Defaults are 25 minutes work, 5 minutes short break, and 15 minutes long break. The fourth completed work cycle triggers a long break.

## Project Analytics

Every saved session includes a project identifier. GitHub remotes are stored as `git:github.com/user/repo`; other Git remotes and plain workspace folders are supported as fallbacks. The History tab summarizes all-time and weekly time by project.

## Git Commit Correlation

During each save, FocusForge runs `git log` in the detected project root for the current session time window. Commit hashes, messages, and timestamps are attached to the session and included in exports and reports.

## Planner

The Goals tab lets users create planned sessions with a date, start time, duration, and label. A plan is fulfilled when a tracked session overlaps the scheduled time. Plans can be exported to `.ics`.

## Leaderboard

The Awards tab can read opt-in GitHub Gists that contain a `focusforge.json` stat file. Publishing requires a configured Gist ID and token; reading teammate Gists does not send data to an extension server.

## Ambient Audio

The sidebar footer includes a local Web Audio player with six focus sound profiles. It does not request external audio files.

## AI Insights

AI insights are disabled by default. When enabled, FocusForge uses the existing GitHub token to call GitHub Models, sends only aggregate session statistics, and stores the last four insight results locally.

## Reports

Weekly reports are generated as Markdown and HTML in `.vscode/session-reports/`. Reports include session totals, average Focus Score, projects, languages, Pomodoros, commits, issue work, and goal performance.
