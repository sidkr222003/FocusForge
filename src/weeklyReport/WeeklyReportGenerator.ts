import * as vscode from 'vscode';
import { IssueAchievements } from '../issueLog/IssueAchievements';
import { IssueStore } from '../issueLog/IssueStore';
import { SessionEntry, WeeklyReport } from '../issueLog/types';
import { MarkdownRenderer } from './MarkdownRenderer';
import { HtmlRenderer } from './HtmlRenderer';

const SESSION_KEY = 'devToolkit.sessions';

class SessionStore {
  constructor(private readonly ctx: vscode.ExtensionContext) {}

  getRange(from: number, to: number): SessionEntry[] {
    const all = this.ctx.globalState.get<SessionEntry[]>(SESSION_KEY) ?? [];
    return all.filter((s) => s.startedAt >= from && s.startedAt <= to);
  }

  getById(id: string): SessionEntry | undefined {
    const all = this.ctx.globalState.get<SessionEntry[]>(SESSION_KEY) ?? [];
    return all.find((s) => s.id === id);
  }
}

export class WeeklyReportGenerator {
  private readonly sessionStore: SessionStore;

  constructor(private readonly ctx: vscode.ExtensionContext, private readonly store: IssueStore) {
    this.sessionStore = new SessionStore(ctx);
  }

  async generateCurrentWeek(): Promise<vscode.Uri> {
    const { start, end } = this.currentWeek();
    return this.writeReport(await this.buildReport(start, end), start);
  }

  async generateLastWeek(): Promise<vscode.Uri> {
    const current = this.currentWeek();
    const end = new Date(current.start.getTime() - 1);
    const start = new Date(end);
    start.setDate(end.getDate() - 6);
    start.setHours(0, 0, 0, 0);
    return this.writeReport(await this.buildReport(start, end), start);
  }

  private async writeReport(report: WeeklyReport, anchor: Date): Promise<vscode.Uri> {
    const workspace = vscode.workspace.workspaceFolders?.[0];
    if (!workspace) {
      throw new Error('Open a workspace folder before generating a report.');
    }

    const dir = vscode.Uri.joinPath(workspace.uri, '.vscode', 'session-reports');
    await vscode.workspace.fs.createDirectory(dir);
    const key = anchor.toISOString().slice(0, 10);
    const md = vscode.Uri.joinPath(dir, `week-${key}.md`);
    const html = vscode.Uri.joinPath(dir, `week-${key}.html`);
    await vscode.workspace.fs.writeFile(md, Buffer.from(MarkdownRenderer.render(report), 'utf8'));
    await vscode.workspace.fs.writeFile(html, Buffer.from(HtmlRenderer.render(report), 'utf8'));
    return md;
  }

  private currentWeek(): { start: Date; end: Date } {
    const now = new Date();
    const day = now.getDay();
    const mondayOffset = day === 0 ? -6 : 1 - day;
    const start = new Date(now);
    start.setDate(now.getDate() + mondayOffset);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    end.setHours(23, 59, 59, 999);
    return { start, end };
  }

  private avgFocusScore(sessions: SessionEntry[]): number {
    const withScore = sessions.filter((s) => typeof s.focusScore === 'number');
    if (!withScore.length) {
      return 0;
    }
    return withScore.reduce((sum, s) => sum + (s.focusScore ?? 0), 0) / withScore.length;
  }

  private topLanguages(sessions: SessionEntry[]): Array<{ language: string; minutes: number }> {
    const map = new Map<string, number>();
    for (const s of sessions) {
      if (!s.language) {
        continue;
      }
      map.set(s.language, (map.get(s.language) ?? 0) + s.totalMinutes);
    }
    return [...map.entries()]
      .map(([language, minutes]) => ({ language, minutes }))
      .sort((a, b) => b.minutes - a.minutes)
      .slice(0, 5);
  }

  private goalPerformance(sessions: SessionEntry[]): WeeklyReport['goalPerformance'] {
    const byDay = new Map<string, number>();
    for (const s of sessions) {
      const day = new Date(s.startedAt).toISOString().slice(0, 10);
      byDay.set(day, (byDay.get(day) ?? 0) + s.totalMinutes);
    }
    const daysHit = [...byDay.values()].filter((m) => m >= 60).length;
    const daysMissed = 7 - daysHit;
    const bestDay = [...byDay.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'n/a';
    return { daysHit, daysMissed, bestDay, currentStreak: 0 };
  }

  private async buildReport(start: Date, end: Date): Promise<WeeklyReport> {
    const startMs = start.getTime();
    const endMs = end.getTime();
    const completionLogs = this.store.getByRange(startMs, endMs);
    const sessions = this.sessionStore.getRange(startMs, endMs);

    const issueMap = new Map<string, WeeklyReport['issuesWorkedOn'][number]>();
    for (const log of completionLogs) {
      const key = `${log.repoSlug}#${log.issueNumber}`;
      const existing = issueMap.get(key);
      const linked = log.sessionId ? this.sessionStore.getById(log.sessionId) : undefined;
      issueMap.set(key, {
        issue: {
          number: log.issueNumber,
          title: log.issueTitle,
          htmlUrl: `https://github.com/${log.repoSlug}/issues/${log.issueNumber}`,
          labels: []
        },
        repoSlug: log.repoSlug,
        sessionsCount: existing ? existing.sessionsCount + 1 : 1,
        totalMinutes: (existing?.totalMinutes ?? 0) + (linked?.totalMinutes ?? 0),
        finalStatus: log.outcomeStatus,
        outcomeNote: log.outcomeNote,
        completedAt: new Date(log.completedAt).toLocaleString(),
        filesTouched: log.filesTouched,
        changeSummary: log.changeSummary
      });
    }

    return {
      weekStart: start.toISOString().slice(0, 10),
      weekEnd: end.toISOString().slice(0, 10),
      totalMinutes: sessions.reduce((sum, s) => sum + s.totalMinutes, 0),
      totalSessions: sessions.length,
      avgFocusScore: this.avgFocusScore(sessions),
      topLanguages: this.topLanguages(sessions),
      issuesWorkedOn: [...issueMap.values()],
      achievementsUnlocked: IssueAchievements.unlock(completionLogs),
      goalPerformance: this.goalPerformance(sessions)
    };
  }
}