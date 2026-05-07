import { execFileSync } from "node:child_process";
import { basename } from "node:path";
import * as vscode from "vscode";

export interface ProjectInfo {
  projectId: string;
  displayName: string;
  rootPath?: string;
  remoteUrl?: string;
  provider?: "github" | "git" | "workspace";
}

export interface ProjectSummary extends ProjectInfo {
  totalMinutes: number;
  sessions: number;
  lastActive: string;
  last30Minutes: number;
  weekMinutes: number;
}

export function detectCurrentProject(): ProjectInfo | undefined {
  const root = getActiveWorkspaceRoot();
  if (!root) {
    return undefined;
  }

  const gitRoot = git(["rev-parse", "--show-toplevel"], root) || root;
  const remoteUrl =
    git(["remote", "get-url", "upstream"], gitRoot) ||
    git(["remote", "get-url", "origin"], gitRoot) ||
    firstRemote(gitRoot);

  if (remoteUrl) {
    const githubSlug = parseGitHubSlug(remoteUrl);
    if (githubSlug) {
      return {
        projectId: `git:github.com/${githubSlug}`,
        displayName: githubSlug.split("/").pop() || basename(gitRoot),
        rootPath: gitRoot,
        remoteUrl,
        provider: "github",
      };
    }
    return {
      projectId: `git:${normalizeRemote(remoteUrl)}`,
      displayName: basename(gitRoot),
      rootPath: gitRoot,
      remoteUrl,
      provider: "git",
    };
  }

  return {
    projectId: `workspace:${gitRoot}`,
    displayName: basename(gitRoot),
    rootPath: gitRoot,
    provider: "workspace",
  };
}

export function summarizeProjects(
  sessions: Array<{ date: string; activeTime?: number; project?: ProjectInfo }>
): ProjectSummary[] {
  const now = Date.now();
  const last30 = now - 30 * 86400000;
  const weekStart = new Date();
  weekStart.setDate(weekStart.getDate() - weekStart.getDay());
  weekStart.setHours(0, 0, 0, 0);
  const byProject = new Map<string, ProjectSummary>();

  for (const session of sessions) {
    const project = session.project;
    if (!project?.projectId) {
      continue;
    }
    const activeSeconds = session.activeTime ?? 0;
    const minutes = Math.round(activeSeconds / 60);
    const time = new Date(session.date).getTime();
    const existing =
      byProject.get(project.projectId) ??
      {
        ...project,
        totalMinutes: 0,
        sessions: 0,
        lastActive: session.date,
        last30Minutes: 0,
        weekMinutes: 0,
      };

    existing.totalMinutes += minutes;
    existing.sessions += 1;
    if (new Date(existing.lastActive).getTime() < time) {
      existing.lastActive = session.date;
    }
    if (time >= last30) {
      existing.last30Minutes += minutes;
    }
    if (time >= weekStart.getTime()) {
      existing.weekMinutes += minutes;
    }
    byProject.set(project.projectId, existing);
  }

  return [...byProject.values()].sort((a, b) => b.totalMinutes - a.totalMinutes);
}

function getActiveWorkspaceRoot(): string | undefined {
  const active = vscode.window.activeTextEditor?.document.uri;
  if (active?.scheme === "file") {
    const folder = vscode.workspace.getWorkspaceFolder(active);
    if (folder) {
      return folder.uri.fsPath;
    }
  }
  return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
}

function git(args: string[], cwd: string): string | undefined {
  try {
    return execFileSync("git", args, {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return undefined;
  }
}

function firstRemote(cwd: string): string | undefined {
  const output = git(["remote", "-v"], cwd);
  return output
    ?.split(/\r?\n/)
    .map((line) => line.trim().split(/\s+/)[1])
    .find(Boolean);
}

function normalizeRemote(remoteUrl: string): string {
  return remoteUrl.replace(/\.git$/, "").replace(/^git@/, "ssh://git@");
}

function parseGitHubSlug(url: string): string | undefined {
  const match =
    url.match(/github\.com[:/]([^/\s]+\/[^/\s]+?)(?:\.git)?(?:[/#?].*)?$/) ??
    url.match(/github\.com\/([^/\s]+\/[^/\s]+?)(?:\.git)?(?:[/#?].*)?$/);
  return match?.[1]?.replace(/\.git$/, "");
}
