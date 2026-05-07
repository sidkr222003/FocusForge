"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.WeeklyReportGenerator = void 0;
const vscode = __importStar(require("vscode"));
const IssueAchievements_1 = require("../issueLog/IssueAchievements");
const MarkdownRenderer_1 = require("./MarkdownRenderer");
const HtmlRenderer_1 = require("./HtmlRenderer");
const SESSION_KEY = 'devToolkit.sessions';
class SessionStore {
    constructor(ctx) {
        this.ctx = ctx;
    }
    getRange(from, to) {
        const all = this.ctx.globalState.get(SESSION_KEY) ?? [];
        return all.filter((s) => s.startedAt >= from && s.startedAt <= to);
    }
    getById(id) {
        const all = this.ctx.globalState.get(SESSION_KEY) ?? [];
        return all.find((s) => s.id === id);
    }
}
class WeeklyReportGenerator {
    constructor(ctx, store) {
        this.ctx = ctx;
        this.store = store;
        this.sessionStore = new SessionStore(ctx);
    }
    async generateCurrentWeek() {
        const { start, end } = this.currentWeek();
        return this.writeReport(await this.buildReport(start, end), start);
    }
    async generateLastWeek() {
        const current = this.currentWeek();
        const end = new Date(current.start.getTime() - 1);
        const start = new Date(end);
        start.setDate(end.getDate() - 6);
        start.setHours(0, 0, 0, 0);
        return this.writeReport(await this.buildReport(start, end), start);
    }
    async writeReport(report, anchor) {
        const workspace = vscode.workspace.workspaceFolders?.[0];
        if (!workspace) {
            throw new Error('Open a workspace folder before generating a report.');
        }
        const dir = vscode.Uri.joinPath(workspace.uri, '.vscode', 'session-reports');
        await vscode.workspace.fs.createDirectory(dir);
        const key = anchor.toISOString().slice(0, 10);
        const md = vscode.Uri.joinPath(dir, `week-${key}.md`);
        const html = vscode.Uri.joinPath(dir, `week-${key}.html`);
        await vscode.workspace.fs.writeFile(md, Buffer.from(MarkdownRenderer_1.MarkdownRenderer.render(report), 'utf8'));
        await vscode.workspace.fs.writeFile(html, Buffer.from(HtmlRenderer_1.HtmlRenderer.render(report), 'utf8'));
        return md;
    }
    currentWeek() {
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
    avgFocusScore(sessions) {
        const withScore = sessions.filter((s) => typeof s.focusScore === 'number');
        if (!withScore.length) {
            return 0;
        }
        return withScore.reduce((sum, s) => sum + (s.focusScore ?? 0), 0) / withScore.length;
    }
    topLanguages(sessions) {
        const map = new Map();
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
    goalPerformance(sessions) {
        const byDay = new Map();
        for (const s of sessions) {
            const day = new Date(s.startedAt).toISOString().slice(0, 10);
            byDay.set(day, (byDay.get(day) ?? 0) + s.totalMinutes);
        }
        const daysHit = [...byDay.values()].filter((m) => m >= 60).length;
        const daysMissed = 7 - daysHit;
        const bestDay = [...byDay.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'n/a';
        return { daysHit, daysMissed, bestDay, currentStreak: 0 };
    }
    async buildReport(start, end) {
        const startMs = start.getTime();
        const endMs = end.getTime();
        const completionLogs = this.store.getByRange(startMs, endMs);
        const sessions = this.sessionStore.getRange(startMs, endMs);
        const issueMap = new Map();
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
            achievementsUnlocked: IssueAchievements_1.IssueAchievements.unlock(completionLogs),
            goalPerformance: this.goalPerformance(sessions)
        };
    }
}
exports.WeeklyReportGenerator = WeeklyReportGenerator;
//# sourceMappingURL=WeeklyReportGenerator.js.map