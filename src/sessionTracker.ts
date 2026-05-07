import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";

import {
  SessionRecord,
  getCurrentSessionRecord,
  isSessionTrackingActive,
  onSessionStateChange,
  startSessionTracking,
  stopSessionTracking,
  toggleSessionTracking,
  getLiveEfficiency,
  getLiveIsIdle,
  getLiveStreakSeconds,
  getLiveFlowActive,
} from "./sessionTimer";
import {
  applySessionNote,
  buildSessionNote,
  getPendingNoteId,
  resolveNoteTarget,
  setPendingNoteId,
  type SessionNotePayload,
} from "./features/sessionNotes";
import { getDeepWorkState } from "./features/deepWorkMode";
import { generateAiInsight, getAiInsightHistory, saveAiInsight } from "./features/aiInsights";
import { loadLeaderboardRows, publishLeaderboardStat, type LeaderboardRow } from "./features/leaderboard";
import { createPlan, exportPlansAsIcs, getPlannedSessions, savePlannedSessions } from "./features/planner";
import { summarizeProjects } from "./features/projectAnalytics";

export function registerSessionTracker(
  context: vscode.ExtensionContext,
  getGithubToken?: () => Promise<string | undefined>
) {
  let provider: SessionTrackerViewProvider;
  const refreshAll = () => provider?.refresh();
  provider = new SessionTrackerViewProvider(context, refreshAll, getGithubToken);
  const remindedPlans = new Set<string>();

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      "devToolkit.sessionTracker",
      provider,
      { webviewOptions: { retainContextWhenHidden: true } }
    )
  );

  const plannerReminder = setInterval(() => {
    const config = vscode.workspace.getConfiguration("devToolkit.sessionTracker");
    const planner = config.get<{ enabled?: boolean; reminderMinutesBefore?: number }>("planner", {});
    if (planner.enabled === false) {
      return;
    }
    const leadMs = Math.max(0, planner.reminderMinutesBefore ?? 5) * 60000;
    const now = Date.now();
    for (const plan of getPlannedSessions(context.globalState)) {
      if (plan.fulfilledSessionId || remindedPlans.has(plan.id)) {
        continue;
      }
      const start = new Date(`${plan.date}T${plan.startTime}:00`).getTime();
      if (start >= now && start - now <= leadMs + 30000) {
        remindedPlans.add(plan.id);
        vscode.window.showInformationMessage(
          `Planned session "${plan.label || "Coding session"}" starts in ${Math.max(1, Math.round((start - now) / 60000))} min.`,
          "Open Tracker"
        ).then((choice) => {
          if (choice === "Open Tracker") {
            focusAndNavigate("goals");
          }
        });
      }
    }
  }, 30000);
  context.subscriptions.push({ dispose: () => clearInterval(plannerReminder) });

  const focusAndNavigate = (tab: string) => {
    vscode.commands.executeCommand("devToolkit.sessionTracker.focus");
    setTimeout(() => provider.navigateToTab(tab), 150);
  };

  const openNoteForSession = async (sessionId?: string) => {
    const history = context.globalState.get<SessionRecord[]>(
      "devToolkit.sessionHistory",
      []
    );
    const targetId = resolveNoteTarget(history, sessionId);
    if (!targetId) {
      vscode.window.showInformationMessage("No sessions available to add notes yet.");
      return;
    }

    const opened = provider.openNoteComposer(targetId);
    if (!opened) {
      await setPendingNoteId(context.globalState, targetId);
      const action = await vscode.window.showInformationMessage(
        "Open Session Tracker to add your note.",
        "Open"
      );
      if (action === "Open") {
        focusAndNavigate("journal");
      }
    }
  };

  context.subscriptions.push(
    vscode.commands.registerCommand("devToolkit.startSession", () => {
      startSessionTracking();
      vscode.window.setStatusBarMessage("$(play) Session started.", 2000);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("devToolkit.endSession", () => {
      stopSessionTracking();
      vscode.window.setStatusBarMessage("$(debug-stop) Session ended.", 2000);
      const current = getCurrentSessionRecord();
      if (current?.id) {
        openNoteForSession(current.id);
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("devToolkit.openSessionDashboard", () => {
      focusAndNavigate("today");
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("devToolkit.viewAchievements", () => {
      focusAndNavigate("achievements");
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("devToolkit.viewHistory", () => {
      focusAndNavigate("history");
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("devToolkit.openJournal", () => {
      focusAndNavigate("journal");
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("devToolkit.addSessionNote", () => {
      const current = getCurrentSessionRecord();
      openNoteForSession(current?.id);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      "devToolkit.exportSessionData",
      async () => {
        const choice = await vscode.window.showQuickPick(
          [
            { label: "$(json) Export as JSON", value: "json" },
            { label: "$(table) Export as CSV", value: "csv" },
          ],
          { placeHolder: "Choose export format" }
        );
        if (!choice) return;
        const history = context.globalState.get<SessionRecord[]>(
          "devToolkit.sessionHistory",
          []
        );
        provider.triggerExport(
          (choice as { label: string; value: string }).value as "json" | "csv",
          history
        );
      }
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("devToolkit.resetToday", async () => {
      const confirm = await vscode.window.showWarningMessage(
        "Clear all session data recorded today?",
        { modal: true },
        "Clear Today"
      );
      if (confirm !== "Clear Today") return;
      const today = new Date().toDateString();
      const history = context.globalState.get<SessionRecord[]>(
        "devToolkit.sessionHistory",
        []
      );
      const filtered = history.filter(
        (s) => new Date(s.date).toDateString() !== today
      );
      await context.globalState.update("devToolkit.sessionHistory", filtered);
      refreshAll();
      vscode.window.setStatusBarMessage(
        "$(discard) Today's data cleared.",
        2000
      );
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("devToolkit.setDailyGoal", async () => {
      const input = await vscode.window.showInputBox({
        prompt: "Enter your daily coding goal (minutes)",
        placeHolder: "e.g. 120",
        validateInput: (v) => {
          const n = parseInt(v, 10);
          if (isNaN(n) || n < 15 || n > 720)
            return "Enter a value between 15 and 720.";
          return undefined;
        },
      });
      if (input === undefined) return;
      const minutes = parseInt(input, 10);
      await vscode.workspace
        .getConfiguration("devToolkit.sessionTracker")
        .update(
          "dailyGoalMinutes",
          minutes,
          vscode.ConfigurationTarget.Global
        );
      focusAndNavigate("goals");
      vscode.window.setStatusBarMessage(
        `$(target) Daily goal set to ${minutes} minutes.`,
        2500
      );
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("devToolkit.planner.exportIcs", async () => {
      const file = await exportPlansAsIcs(getPlannedSessions(context.globalState));
      if (file) {
        vscode.window.showInformationMessage("Planned sessions exported.", "Open").then((choice) => {
          if (choice === "Open") {
            vscode.commands.executeCommand("vscode.open", file);
          }
        });
      }
    })
  );
}

class SessionTrackerViewProvider implements vscode.WebviewViewProvider {
  private view?: vscode.WebviewView;
  private readonly context: vscode.ExtensionContext;
  private liveStateSubscription?: vscode.Disposable;
  private readonly refreshAll: () => void;

  constructor(
    context: vscode.ExtensionContext,
    refreshAll: () => void,
    private readonly getGithubToken?: () => Promise<string | undefined>
  ) {
    this.context = context;
    this.refreshAll = refreshAll;
  }

  public async resolveWebviewView(webviewView: vscode.WebviewView) {
    this.view = webviewView;
    this.view.webview.options = {
      enableScripts: true,
      localResourceRoots: [this.context.extensionUri],
    };
    this.view.webview.html = this.getHtml();

    this.view.webview.onDidReceiveMessage(async (msg) => {
      try {
        switch (msg.type) {
          case "requestData":
            this.sendHistory();
            break;
          case "toggleTracking":
            toggleSessionTracking();
            this.sendHistory();
            break;
          case "startTracking":
            startSessionTracking();
            this.sendHistory();
            break;
          case "stopTracking":
            stopSessionTracking();
            this.sendHistory();
            break;
          case "clearHistory":
            await this.clearHistory();
            break;
          case "exportData":
            await this.handleExport(msg.format, msg.history);
            break;
          case "saveGoal":
            await vscode.workspace
              .getConfiguration("devToolkit.sessionTracker")
              .update(
                "dailyGoalMinutes",
                msg.minutes,
                vscode.ConfigurationTarget.Global
              );
            this.sendHistory();
            break;
          case "saveNote":
            await this.saveNote(msg.payload as SessionNotePayload);
            break;
          case "addPlan":
            await this.addPlan(msg.plan as {
              date: string;
              startTime: string;
              durationMinutes: number;
              label?: string;
            });
            break;
          case "deletePlan":
            await this.deletePlan(String(msg.id ?? ""));
            break;
          case "exportPlans":
            await this.exportPlans();
            break;
          case "refreshLeaderboard":
            await this.refreshLeaderboard();
            break;
          case "publishLeaderboard":
            await this.publishLeaderboard();
            break;
          case "generateAiInsight":
            await this.generateAiInsight();
            break;
          case "openJournal":
            this.navigateToTab("journal");
            break;
          case "showInfo":
            if (msg.message) {
              vscode.window.showInformationMessage(String(msg.message));
            }
            break;
        }
      } catch (error) {
        vscode.window.showErrorMessage(error instanceof Error ? error.message : String(error));
      }
    });

    this.liveStateSubscription?.dispose();
    this.liveStateSubscription = onSessionStateChange(() =>
      this.sendHistory()
    );
    this.view.onDidDispose(() => this.liveStateSubscription?.dispose());
    this.sendHistory();
    const pendingId = getPendingNoteId(this.context.globalState);
    if (pendingId) {
      const opened = this.openNoteComposer(pendingId);
      if (opened) {
        await setPendingNoteId(this.context.globalState, undefined);
      }
    }
  }

  private sendHistory() {
    const config = vscode.workspace.getConfiguration(
      "devToolkit.sessionTracker"
    );
    const dailyGoalMinutes = config.get<number>("dailyGoalMinutes", 120);
    const breakReminderInterval = config.get<number>(
      "breakReminderInterval",
      45
    );
    const flowStateThresholdMinutes = config.get<number>(
      "flowStateThresholdMinutes",
      25
    );
    const focusScoreConfig = config.get<Record<string, boolean>>(
      "focusScore",
      {}
    );
    const focusScoreEnabled = focusScoreConfig?.enabled !== false;
    const focusScoreInStatus = focusScoreConfig?.showInStatusBar !== false;

    const persistedHistory = this.context.globalState.get<SessionRecord[]>(
      "devToolkit.sessionHistory",
      []
    );
    const history = [...persistedHistory];
    const liveRecord = getCurrentSessionRecord();

    if (liveRecord) {
      const existingIndex = history.findIndex((e) => e.id === liveRecord.id);
      if (existingIndex >= 0) {
        history[existingIndex] = liveRecord;
      } else {
        history.push(liveRecord);
      }
    }

    this.view?.webview.postMessage({
      type: "history",
      history,
      projects: summarizeProjects(history),
      plannedSessions: getPlannedSessions(this.context.globalState),
      aiInsights: getAiInsightHistory(this.context.globalState),
      isTracking: isSessionTrackingActive(),
      efficiency: getLiveEfficiency(),
      liveSession: liveRecord ?? null,
      isIdle: getLiveIsIdle(),
      streakSeconds: getLiveStreakSeconds(),
      flowActive: getLiveFlowActive(),
      dailyGoalMinutes,
      breakReminderInterval,
      flowStateThresholdMinutes,
      focusScoreEnabled,
      focusScoreInStatus,
      deepWorkActive: getDeepWorkState().active,
    });
  }

  private async clearHistory() {
    const confirm = await vscode.window.showWarningMessage(
      "Are you sure you want to clear your coding session history?",
      { modal: true },
      "Clear"
    );
    if (confirm === "Clear") {
      await this.context.globalState.update(
        "devToolkit.sessionHistory",
        []
      );
      this.sendHistory();
    }
  }

  private async handleExport(
    format: "json" | "csv",
    history: SessionRecord[]
  ) {
    const uri = await vscode.window.showSaveDialog({
      defaultUri: vscode.Uri.file(`session-history.${format}`),
      filters:
        format === "json" ? { JSON: ["json"] } : { CSV: ["csv"] },
    });
    if (!uri) return;

    let content: string;
    if (format === "json") {
      content = JSON.stringify(history, null, 2);
    } else {
      const escapeCsv = (value: unknown) => {
        if (value === null || value === undefined) return "";
        const str = String(value);
        if (/[",\n]/.test(str)) {
          return `"${str.replace(/"/g, '""')}"`;
        }
        return str;
      };
      const header =
        "id,date,activeTime,engagedTime,totalTime,maxStreak,language,startHour,breaks,idleCount,flowTime,focusScore,deepWorkSeconds,deepWorkCompleted,languageBreakdown,noteSummary,noteMood,noteBlockers\n";
      const rows = history
        .map((s) =>
          [
            escapeCsv(s.id),
            escapeCsv(s.date),
            escapeCsv(s.activeTime),
            escapeCsv(s.engagedTime ?? ""),
            escapeCsv(s.totalTime),
            escapeCsv(s.maxStreak),
            escapeCsv(s.language ?? ""),
            escapeCsv(s.startHour ?? ""),
            escapeCsv(s.breaks ?? 0),
            escapeCsv(s.idleCount ?? 0),
            escapeCsv(s.flowTime ?? 0),
            escapeCsv(s.focusScore ?? 0),
            escapeCsv(s.deepWorkSeconds ?? 0),
            escapeCsv(s.deepWorkCompleted ?? 0),
            escapeCsv(s.languageBreakdown ? JSON.stringify(s.languageBreakdown) : ""),
            escapeCsv(s.note?.summary ?? ""),
            escapeCsv(s.note?.mood ?? ""),
            escapeCsv(s.note?.blockers ?? ""),
          ].join(",")
        )
        .join("\n");
      content = header + rows;
    }

    await vscode.workspace.fs.writeFile(uri, Buffer.from(content, "utf8"));
    vscode.window.showInformationMessage(
      `$(export) Session history exported as ${format.toUpperCase()}.`
    );
  }

  private getHtml(): string {
    const webview = this.view?.webview;
    const cspSource = webview?.cspSource ?? "";
    const codiconsUri = webview
      ? webview.asWebviewUri(
          vscode.Uri.joinPath(
            this.context.extensionUri,
            "node_modules",
            "@vscode",
            "codicons",
            "dist",
            "codicon.css"
          )
        )
      : "";
    const styleUri = webview
      ? webview.asWebviewUri(
          vscode.Uri.joinPath(
            this.context.extensionUri,
            "src",
            "ui",
            "dashboard.css"
          )
        )
      : "";
    const scriptUri = webview
      ? webview.asWebviewUri(
          vscode.Uri.joinPath(
            this.context.extensionUri,
            "src",
            "ui",
            "dashboard.js"
          )
        )
      : "";
    const soundUri = (fileName: string) =>
      webview
        ? webview.asWebviewUri(
            vscode.Uri.joinPath(this.context.extensionUri, "media", "sounds", fileName)
          )
        : "";
    const soundRainUri = soundUri("rain.mp3");
    const soundOceanUri = soundUri("ocean.mp3");
    const soundFireplaceUri = soundUri("fireplace.mp3");
    const soundCafeUri = soundUri("cafe.mp3");
    const soundForestUri = soundUri("forest.mp3");
    const soundLofiUri = soundUri("lofi.mp3");

    const htmlPath = path.join(
      this.context.extensionUri.fsPath,
      "src",
      "ui",
      "dashboard.html"
    );
    let html = "";
    try {
      html = fs.readFileSync(htmlPath, "utf8");
    } catch {
      return "<body><h1>Unable to load Dashboard UI</h1></body>";
    }

    return html
      .replace(/\$\{webview\.cspSource\}/g, cspSource)
      .replace(/\$\{codiconsUri\}/g, String(codiconsUri))
      .replace(/\$\{styleUri\}/g, String(styleUri))
      .replace(/\$\{scriptUri\}/g, String(scriptUri))
      .replace(/\$\{soundRainUri\}/g, String(soundRainUri))
      .replace(/\$\{soundOceanUri\}/g, String(soundOceanUri))
      .replace(/\$\{soundFireplaceUri\}/g, String(soundFireplaceUri))
      .replace(/\$\{soundCafeUri\}/g, String(soundCafeUri))
      .replace(/\$\{soundForestUri\}/g, String(soundForestUri))
      .replace(/\$\{soundLofiUri\}/g, String(soundLofiUri));
  }

  public navigateToTab(tab: string) {
    this.view?.webview.postMessage({ type: "navigateTab", tab });
  }

  public async triggerExport(
    format: "json" | "csv",
    history: SessionRecord[]
  ) {
    await this.handleExport(format, history);
  }

  public refresh() {
    this.sendHistory();
  }

  public openNoteComposer(sessionId: string): boolean {
    if (!this.view) return false;
    this.view.show?.(true);
    this.view.webview.postMessage({ type: "openNoteComposer", sessionId });
    return true;
  }

  private async saveNote(payload: SessionNotePayload) {
    const history = this.context.globalState.get<SessionRecord[]>(
      "devToolkit.sessionHistory",
      []
    );
    const note = buildSessionNote(payload);
    if (!note) {
      vscode.window.showInformationMessage("Add a short note before saving.");
      return;
    }
    const updated = applySessionNote(history, payload.sessionId, note);
    await this.context.globalState.update("devToolkit.sessionHistory", updated);
    this.refreshAll();
  }

  private async addPlan(plan: {
    date: string;
    startTime: string;
    durationMinutes: number;
    label?: string;
  }) {
    if (!plan?.date || !plan?.startTime || !Number.isFinite(plan.durationMinutes)) {
      vscode.window.showInformationMessage("Add a date, start time, and duration for the planned session.");
      return;
    }
    const plans = getPlannedSessions(this.context.globalState);
    plans.push(createPlan(plan));
    await savePlannedSessions(this.context.globalState, plans);
    this.sendHistory();
  }

  private async deletePlan(id: string) {
    const plans = getPlannedSessions(this.context.globalState).filter((plan) => plan.id !== id);
    await savePlannedSessions(this.context.globalState, plans);
    this.sendHistory();
  }

  private async exportPlans() {
    const file = await exportPlansAsIcs(getPlannedSessions(this.context.globalState));
    if (file) {
      vscode.window.showInformationMessage("Planned sessions exported.", "Open").then((choice) => {
        if (choice === "Open") {
          vscode.commands.executeCommand("vscode.open", file);
        }
      });
    }
  }

  private buildLocalLeaderboardRow(): LeaderboardRow {
    const history = this.context.globalState.get<SessionRecord[]>(
      "devToolkit.sessionHistory",
      []
    );
    const today = new Date().toDateString();
    const todaySessions = history.filter((session) => new Date(session.date).toDateString() === today);
    const todayMinutes = Math.round(
      todaySessions.reduce((sum, session) => sum + session.activeTime, 0) / 60
    );
    const focusScores = todaySessions
      .map((session) => session.focusScore)
      .filter((score): score is number => typeof score === "number");
    const config = vscode.workspace.getConfiguration("devToolkit.sessionTracker");
    const leaderboardConfig = config.get<{ name?: string; avatar?: string }>("leaderboard", {});
    return {
      rank: 1,
      name: leaderboardConfig.name || vscode.env.machineId.slice(0, 8),
      avatar: leaderboardConfig.avatar || "◆",
      todayMinutes,
      streak: this.currentDayStreak(history),
      focusScore: focusScores.length
        ? Math.round(focusScores.reduce((sum, score) => sum + score, 0) / focusScores.length)
        : 0,
    };
  }

  private async refreshLeaderboard() {
    const rows = await loadLeaderboardRows(this.buildLocalLeaderboardRow());
    await this.view?.webview.postMessage({ type: "leaderboard", rows, updatedAt: new Date().toISOString() });
  }

  private async publishLeaderboard() {
    const result = await publishLeaderboardStat(
      this.buildLocalLeaderboardRow(),
      await this.getGithubToken?.()
    );
    const message = result.url
      ? vscode.window.showInformationMessage("Leaderboard stat published to GitHub Gist.", "Open Gist")
      : vscode.window.showInformationMessage("Leaderboard stat published to GitHub Gist.");
    message.then((choice) => {
      if (choice === "Open Gist" && result.url) {
        vscode.env.openExternal(vscode.Uri.parse(result.url));
      }
    });
    await this.refreshLeaderboard();
  }

  private async generateAiInsight() {
    const history = this.context.globalState.get<SessionRecord[]>(
      "devToolkit.sessionHistory",
      []
    );
    const summary = {
      dailyMinutes: this.lastNDays(history, 7).map((date) => ({
        date,
        minutes: Math.round(
          history
            .filter((session) => new Date(session.date).toISOString().slice(0, 10) === date)
            .reduce((sum, session) => sum + session.activeTime, 0) / 60
        ),
      })),
      projects: summarizeProjects(history).slice(0, 5).map((project) => ({
        name: project.displayName,
        minutes: project.totalMinutes,
      })),
    };
    const insight = await generateAiInsight(summary, await this.getGithubToken?.());
    await saveAiInsight(this.context.globalState, insight);
    this.sendHistory();
  }

  private currentDayStreak(history: SessionRecord[]): number {
    const days = [...new Set(history.map((session) => new Date(session.date).toDateString()))]
      .map((day) => new Date(day).getTime())
      .sort((a, b) => b - a);
    let cursor = new Date();
    cursor.setHours(0, 0, 0, 0);
    let streak = 0;
    for (const day of days) {
      const current = new Date(day);
      current.setHours(0, 0, 0, 0);
      if ((cursor.getTime() - current.getTime()) / 86400000 < 1.5) {
        streak++;
        cursor = new Date(current.getTime() - 1);
      } else {
        break;
      }
    }
    return streak;
  }

  private lastNDays(_history: SessionRecord[], count: number): string[] {
    return Array.from({ length: count }, (_, index) => {
      const date = new Date();
      date.setDate(date.getDate() - (count - index - 1));
      return date.toISOString().slice(0, 10);
    });
  }
}
