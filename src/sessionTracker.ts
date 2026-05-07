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

export function registerSessionTracker(context: vscode.ExtensionContext) {
  let provider: SessionTrackerViewProvider;
  const refreshAll = () => provider?.refresh();
  provider = new SessionTrackerViewProvider(context, refreshAll);

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      "devToolkit.sessionTracker",
      provider,
      { webviewOptions: { retainContextWhenHidden: true } }
    )
  );

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
}

class SessionTrackerViewProvider implements vscode.WebviewViewProvider {
  private view?: vscode.WebviewView;
  private readonly context: vscode.ExtensionContext;
  private liveStateSubscription?: vscode.Disposable;
  private readonly refreshAll: () => void;

  constructor(
    context: vscode.ExtensionContext,
    refreshAll: () => void
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
        case "openJournal":
          this.navigateToTab("journal");
          break;
        case "showInfo":
          if (msg.message) {
            vscode.window.showInformationMessage(String(msg.message));
          }
          break;
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
      .replace(/\$\{scriptUri\}/g, String(scriptUri));
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
}
