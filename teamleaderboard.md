# FocusForge Team Leaderboard

FocusForge publishes team leaderboard data to a GitHub Gist when you click **Publish my stat** in the dashboard.

The published Gist contains:

- `focusforge.json` for machine-readable leaderboard sync.
- `teamleaderboard.md` for a human-readable table.

## Setup

1. Connect GitHub from the Issue Log view with a token that has `repo` and `gist` scopes.
2. Open **Session Tracker > Awards > Team Leaderboard**.
3. Click **Publish my stat**.

If `devToolkit.sessionTracker.leaderboard.gistId` is empty, FocusForge creates a private Gist and saves the new Gist id in your global VS Code settings. Future clicks update the same Gist.

## Sharing With Teammates

Share your Gist id with teammates. They can add it to:

```json
"devToolkit.sessionTracker.leaderboard": {
  "teamGistIds": ["your-gist-id"]
}
```

Each teammate publishes their own stat, and every configured Gist is merged into the leaderboard.

