import * as vscode from "vscode";

export interface LeaderboardRow {
  rank: number;
  name: string;
  todayMinutes: number;
  streak: number;
  focusScore: number;
  avatar: string;
  source?: string;
}

export async function loadLeaderboardRows(local: LeaderboardRow): Promise<LeaderboardRow[]> {
  const config = vscode.workspace.getConfiguration("devToolkit.sessionTracker");
  const leaderboardConfig = config.get<{
    gistId?: string;
    teamGistIds?: string[];
    name?: string;
    avatar?: string;
  }>("leaderboard", {});
  const ids = [
    leaderboardConfig?.gistId,
    ...(leaderboardConfig?.teamGistIds ?? []),
  ].filter((id): id is string => Boolean(id?.trim()));

  const rows = [local];
  for (const id of ids) {
    const row = await fetchGistRow(id).catch(() => undefined);
    if (row) {
      rows.push(row);
    }
  }

  return rows
    .sort((a, b) => b.todayMinutes - a.todayMinutes || b.focusScore - a.focusScore)
    .map((row, index) => ({ ...row, rank: index + 1 }));
}

export async function publishLeaderboardStat(local: LeaderboardRow): Promise<void> {
  const config = vscode.workspace.getConfiguration("devToolkit.sessionTracker");
  const leaderboardConfig = config.get<{ gistId?: string; token?: string }>("leaderboard", {});
  if (!leaderboardConfig?.gistId || !leaderboardConfig?.token) {
    throw new Error("Set leaderboard.gistId and leaderboard.token before publishing.");
  }
  const body = {
    description: "FocusForge daily productivity stat",
    files: {
      "focusforge.json": {
        content: JSON.stringify({ ...local, updatedAt: new Date().toISOString() }, null, 2),
      },
    },
  };
  const res = await fetch(`https://api.github.com/gists/${leaderboardConfig.gistId}`, {
    method: "PATCH",
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${leaderboardConfig.token}`,
      "X-GitHub-Api-Version": "2022-11-28",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`GitHub Gist publish failed: ${res.status}`);
  }
}

async function fetchGistRow(id: string): Promise<LeaderboardRow | undefined> {
  const res = await fetch(`https://api.github.com/gists/${id.trim()}`, {
    headers: {
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });
  if (!res.ok) {
    return undefined;
  }
  const gist = (await res.json()) as {
    files?: Record<string, { content?: string }>;
    owner?: { login?: string };
  };
  const content =
    gist.files?.["focusforge.json"]?.content ??
    Object.values(gist.files ?? {})[0]?.content;
  if (!content) {
    return undefined;
  }
  const parsed = JSON.parse(content) as Partial<LeaderboardRow>;
  return {
    rank: 0,
    name: parsed.name || gist.owner?.login || "Teammate",
    todayMinutes: Number(parsed.todayMinutes ?? 0),
    streak: Number(parsed.streak ?? 0),
    focusScore: Number(parsed.focusScore ?? 0),
    avatar: parsed.avatar || "◆",
    source: id,
  };
}
