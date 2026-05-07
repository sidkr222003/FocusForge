import * as vscode from "vscode";

import type { SessionNote } from "./features/sessionNotes";
import {
  addLanguageSeconds,
  getDominantLanguage,
  getLanguageShortLabel,
} from "./features/languageBreakdown";
import { calculateFocusScore } from "./features/focusScore";
import { getDeepWorkState, onDeepWorkCompleted } from "./features/deepWorkMode";

export interface SessionRecord {
  id: string;
  date: string;
  activeTime: number;
  engagedTime?: number;
  totalTime: number;
  maxStreak: number;
  language?: string;
  startHour?: number;
  breaks?: number;
  idleCount?: number;
  languageBreakdown?: Record<string, number>;
  flowTime?: number;
  focusScore?: number;
  deepWorkSeconds?: number;
  deepWorkCompleted?: number;
  note?: SessionNote;
}

export interface LiveSessionState {
  session: SessionRecord;
  isIdle: boolean;
  isTracking: boolean;
  efficiency: number;
  streakSeconds: number;
  flowActive: boolean;
  focusScore: number;
  flowTime: number;
  deepWorkSeconds: number;
}

type SessionStateListener = (state: LiveSessionState) => void;

const sessionStateListeners = new Set<SessionStateListener>();
let latestLiveState: LiveSessionState | undefined;
let sessionControls:
  | {
      startTracking: () => void;
      stopTracking: () => void;
      toggleTracking: () => boolean;
      isTracking: () => boolean;
    }
  | undefined;

function publishSessionState(state: LiveSessionState) {
  latestLiveState = state;
  for (const listener of sessionStateListeners) {
    listener(state);
  }
}

export function onSessionStateChange(
  listener: SessionStateListener
): vscode.Disposable {
  sessionStateListeners.add(listener);
  if (latestLiveState) {
    listener(latestLiveState);
  }
  return new vscode.Disposable(() => {
    sessionStateListeners.delete(listener);
  });
}

export function getCurrentSessionRecord(): SessionRecord | undefined {
  return latestLiveState?.session;
}

export function isSessionTrackingActive(): boolean {
  return latestLiveState?.isTracking ?? true;
}

export function getLiveEfficiency(): number {
  return latestLiveState?.efficiency ?? 100;
}

export function getLiveIsIdle(): boolean {
  return latestLiveState?.isIdle ?? false;
}

export function getLiveStreakSeconds(): number {
  return latestLiveState?.streakSeconds ?? 0;
}

export function getLiveFlowActive(): boolean {
  return latestLiveState?.flowActive ?? false;
}

export function startSessionTracking() {
  sessionControls?.startTracking();
}

export function stopSessionTracking() {
  sessionControls?.stopTracking();
}

export function toggleSessionTracking(): boolean {
  return sessionControls?.toggleTracking() ?? true;
}

export function registerSessionTimer(context: vscode.ExtensionContext) {
  // ── In-memory metrics ─────────────────────────────────────────────
  let activeTime = 0;
  let engagedTime = 0;
  let totalTime = 0;
  let streakSeconds = 0;
  let maxStreakSeconds = 0;
  let breaksCount = 0;
  let idleCount = 0;
  let dominantLanguage = "";
  let flowTimeSeconds = 0;
  let deepWorkSeconds = 0;
  let deepWorkCompleted = 0;
  const languageBreakdown: Record<string, number> = {};

  // ── State ─────────────────────────────────────────────────────────
  let lastActivity = Date.now();
  let isIdle = false;
  let needsBreak = false;
  let isTracking = true;
  let autoPausedByFocusLoss = false;
  let tickCount = 0;
  let flowStateNotified = false;

  const sessionStartTime = new Date();
  const sessionId = `session_${Date.now()}`;
  const startHour = sessionStartTime.getHours();

  // ── Status bar ────────────────────────────────────────────────────
  const statusBarItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Left,
    100
  );
  statusBarItem.command = "devToolkit.showSessionMetrics";

  const formatTime = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    if (h > 0) return `${h}h ${m}m`;
    if (m > 0) return `${m}m ${s}s`;
    return `${s}s`;
  };

  const getEfficiencyBar = (efficiency: number) => {
    const filled = Math.max(0, Math.min(10, Math.round((efficiency / 100) * 10)));
    return "█".repeat(filled) + "░".repeat(10 - filled);
  };

  const saveCurrentSession = () => {
    const history = context.globalState.get<SessionRecord[]>(
      "devToolkit.sessionHistory",
      []
    );
    const idx = history.findIndex((s) => s.id === sessionId);

    const existingNote = idx >= 0 ? history[idx]?.note : undefined;

    const resolvedLanguage = getDominantLanguage(languageBreakdown);
    if (resolvedLanguage) {
      dominantLanguage = resolvedLanguage;
    }

    const config = vscode.workspace.getConfiguration("devToolkit.sessionTracker");
    const breakInterval = config.get<number>("breakReminderInterval", 45);
    const focusScore = calculateFocusScore({
      activeTime,
      totalTime,
      flowTime: flowTimeSeconds,
      breaks: breaksCount,
      idleCount,
      breakIntervalMinutes: breakInterval,
    });

    const record: SessionRecord = {
      id: sessionId,
      date: sessionStartTime.toISOString(),
      activeTime,
      engagedTime,
      totalTime,
      maxStreak: maxStreakSeconds,
      language: dominantLanguage,
      languageBreakdown: { ...languageBreakdown },
      startHour,
      breaks: breaksCount,
      idleCount,
      flowTime: flowTimeSeconds,
      focusScore,
      deepWorkSeconds,
      deepWorkCompleted,
      note: existingNote,
    };

    const MAX_HISTORY = 100;
    if (idx >= 0) {
      history[idx] = record;
    } else {
      history.push(record);
    }
    if (history.length > MAX_HISTORY) {
      history.splice(0, history.length - MAX_HISTORY);
    }

    context.globalState.update("devToolkit.sessionHistory", history);
  };

  const buildLiveState = (): LiveSessionState => {
    const efficiency =
      totalTime > 0 ? Math.round((engagedTime / totalTime) * 100) : 100;
    const config = vscode.workspace.getConfiguration("devToolkit.sessionTracker");
    const flowThresholdSec =
      config.get<number>("flowStateThresholdMinutes", 25) * 60;
    const breakInterval = config.get<number>("breakReminderInterval", 45);
    const focusScore = calculateFocusScore({
      activeTime,
      totalTime,
      flowTime: flowTimeSeconds,
      breaks: breaksCount,
      idleCount,
      breakIntervalMinutes: breakInterval,
    });
    return {
      session: {
        id: sessionId,
        date: sessionStartTime.toISOString(),
        activeTime,
        engagedTime,
        totalTime,
        maxStreak: maxStreakSeconds,
        language: dominantLanguage,
        languageBreakdown: { ...languageBreakdown },
        startHour,
        breaks: breaksCount,
        idleCount,
        flowTime: flowTimeSeconds,
        focusScore,
        deepWorkSeconds,
        deepWorkCompleted,
      },
      isIdle,
      isTracking,
      efficiency,
      streakSeconds,
      flowActive: streakSeconds >= flowThresholdSec,
      focusScore,
      flowTime: flowTimeSeconds,
      deepWorkSeconds,
    };
  };

  const pushLiveUpdate = () => publishSessionState(buildLiveState());

  const updateStatusBar = (statusBarFormat?: string) => {
    const config = vscode.workspace.getConfiguration("devToolkit.sessionTracker");
    const dailyGoalSec = config.get<number>("dailyGoalMinutes", 120) * 60;
    const flowThresholdSec =
      config.get<number>("flowStateThresholdMinutes", 25) * 60;
    const resolvedFormat =
      statusBarFormat ??
      config.get<string>("statusBarFormat", "timeAndStreak");
    const notifBreakReminders =
      (config.get<Record<string, boolean>>("notifications", {})
        ?.breakReminders) !== false;
    const focusScoreConfig = config.get<Record<string, boolean>>(
      "focusScore",
      {}
    );
    const focusScoreEnabled = focusScoreConfig?.enabled !== false;
    const focusScoreInTooltip = focusScoreConfig?.showInStatusBar !== false;
    const history = context.globalState.get<SessionRecord[]>(
      "devToolkit.sessionHistory",
      []
    );
    const liveRecord = buildLiveState().session;
    const mergedHistory = mergeHistoryWithLive(history, liveRecord);

    if (!isTracking) {
      statusBarItem.text = `$(debug-pause) ${formatTime(activeTime)}`;
      statusBarItem.backgroundColor = new vscode.ThemeColor(
        "statusBarItem.errorBackground"
      );
      statusBarItem.tooltip = "Session paused. Click to view.";
      return;
    }

    const isFlowState = streakSeconds >= flowThresholdSec;
    const isGoalReached = activeTime >= dailyGoalSec;
    let icon = "$(pulse)";
    if (isIdle) icon = "$(clock)";
    else if (needsBreak) icon = "$(coffee)";
    else if (isFlowState) icon = "$(zap)";

    if (resolvedFormat === "iconOnly") {
      statusBarItem.text = icon;
    } else {
      let suffix = "";
      if (resolvedFormat === "timeAndStreak") {
        const streak = currentDayStreak_internal();
        if (streak > 1) suffix = `  $(flame) ${streak}d`;
      } else if (resolvedFormat === "timeAndLanguage") {
        const langId = vscode.window.activeTextEditor?.document.languageId ?? "";
        if (langId) {
          const langSeconds = todayLanguageSeconds(mergedHistory, langId);
          const langLabel = getLanguageShortLabel(langId);
          suffix = `  ${langLabel} · ${formatTime(langSeconds)}`;
        }
      }
      statusBarItem.text = `${icon} ${formatTime(activeTime)}${suffix}`;
    }

    if (isIdle) {
      statusBarItem.backgroundColor = new vscode.ThemeColor(
        "statusBarItem.warningBackground"
      );
    } else if (needsBreak && notifBreakReminders) {
      statusBarItem.backgroundColor = new vscode.ThemeColor(
        "statusBarItem.errorBackground"
      );
    } else if (isGoalReached) {
      statusBarItem.backgroundColor = new vscode.ThemeColor(
        "statusBarItem.prominentBackground"
      );
    } else if (isFlowState) {
      statusBarItem.backgroundColor = new vscode.ThemeColor(
        "statusBarItem.remoteBackground"
      );
    } else {
      statusBarItem.backgroundColor = undefined;
    }

    const efficiency =
      totalTime > 0 ? Math.round((engagedTime / totalTime) * 100) : 100;
    const breakInterval = config.get<number>("breakReminderInterval", 45);
    const todayFocus = focusScoreEnabled
      ? calculateFocusScore({
          activeTime: sumToday(mergedHistory, "activeTime"),
          totalTime: sumToday(mergedHistory, "totalTime"),
          flowTime: sumToday(mergedHistory, "flowTime"),
          breaks: sumToday(mergedHistory, "breaks"),
          idleCount: sumToday(mergedHistory, "idleCount"),
          breakIntervalMinutes: breakInterval,
        })
      : 0;
    const goalPct = Math.min(
      100,
      Math.max(
        activeTime > 0 ? 1 : 0,
        Math.round((activeTime / Math.max(dailyGoalSec, 1)) * 100)
      )
    );
    const md = new vscode.MarkdownString(undefined, true);
    md.appendMarkdown(`### $(pulse) Focus Dashboard\n\n`);
    md.appendMarkdown(`---\n\n`);
    md.appendMarkdown(
      `$(clock) **Session Start:** ${sessionStartTime.toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      })}\n\n`
    );
    md.appendMarkdown(
      `$(flame) **Current Streak:** ${formatTime(streakSeconds)}\n\n`
    );
    md.appendMarkdown(
      `$(trophy) **Best Streak:** ${formatTime(maxStreakSeconds)}\n\n`
    );
    md.appendMarkdown(
      `$(zap) **Flow State:** ${
        isFlowState
          ? "Active ⚡"
          : `${formatTime(streakSeconds)} / ${formatTime(flowThresholdSec)}`
      }\n\n`
    );
    md.appendMarkdown(`---\n\n`);
    md.appendMarkdown(
      `**Efficiency:** \`${getEfficiencyBar(efficiency)}\` ${efficiency}%\n\n`
    );
    if (focusScoreEnabled && focusScoreInTooltip) {
      md.appendMarkdown(`$(eye) **Focus Score (today):** ${todayFocus}\n\n`);
    }
    md.appendMarkdown(
      `$(graph) **Active:** ${formatTime(activeTime)} / **Total:** ${formatTime(
        totalTime
      )}\n\n`
    );
    const goalTargetText = formatTime(dailyGoalSec);
    const goalProgressText = formatTime(activeTime);
    const goalStatus = isGoalReached
      ? `$(check) Reached! ${goalProgressText} / ${goalTargetText}`
      : `${goalPct}% (${goalProgressText} / ${goalTargetText})`;
    md.appendMarkdown(`$(target) **Daily Goal:** ${goalStatus}\n\n`);
    md.appendMarkdown(`---\n\n`);
    md.appendMarkdown(`$(info) Click for full session report`);
    md.isTrusted = true;
    statusBarItem.tooltip = md;
  };

  const recordActivity = () => {
    if (!isTracking) return;
    lastActivity = Date.now();
    isIdle = false;
  };

  context.subscriptions.push(
    vscode.workspace.onDidChangeTextDocument(recordActivity)
  );
  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor(recordActivity)
  );
  context.subscriptions.push(
    vscode.window.onDidChangeTextEditorSelection(recordActivity)
  );
  context.subscriptions.push(
    vscode.workspace.onDidSaveTextDocument(recordActivity)
  );
  context.subscriptions.push(
    vscode.window.onDidChangeWindowState((windowState) => {
      if (!windowState.focused && isTracking) {
        autoPausedByFocusLoss = true;
        isTracking = false;
        isIdle = true;
        updateStatusBar();
        pushLiveUpdate();
      } else if (windowState.focused && autoPausedByFocusLoss) {
        autoPausedByFocusLoss = false;
        isTracking = true;
        lastActivity = Date.now();
        isIdle = false;
        updateStatusBar();
        pushLiveUpdate();
      }
    })
  );

  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (
        event.affectsConfiguration("devToolkit.sessionTracker.dailyGoalMinutes") ||
        event.affectsConfiguration("devToolkit.sessionTracker.engagedThresholdSeconds") ||
        event.affectsConfiguration("devToolkit.sessionTracker.idleThresholdMinutes") ||
        event.affectsConfiguration("devToolkit.sessionTracker.idleDetection") ||
        event.affectsConfiguration("devToolkit.sessionTracker.flowStateThresholdMinutes") ||
        event.affectsConfiguration("devToolkit.sessionTracker.breakReminderInterval") ||
        event.affectsConfiguration("devToolkit.sessionTracker.focusScore") ||
        event.affectsConfiguration("devToolkit.sessionTracker.statusBarFormat")
      ) {
        updateStatusBar();
        pushLiveUpdate();
      }
    })
  );

  const showMetricsCommand = vscode.commands.registerCommand(
    "devToolkit.showSessionMetrics",
    () => {
      const efficiency =
        totalTime > 0 ? Math.round((engagedTime / totalTime) * 100) : 100;
      const config = vscode.workspace.getConfiguration("devToolkit.sessionTracker");
      const breakInterval = config.get<number>("breakReminderInterval", 45);
      const focusScore = calculateFocusScore({
        activeTime,
        totalTime,
        flowTime: flowTimeSeconds,
        breaks: breaksCount,
        idleCount,
        breakIntervalMinutes: breakInterval,
      });
      const message = [
        `🎯 Session Focus Report`,
        `Started: ${sessionStartTime.toLocaleTimeString()}`,
        `Total Coding Time: ${formatTime(activeTime)}`,
        `Current Streak: ${formatTime(streakSeconds)}`,
        `Best Streak: ${formatTime(maxStreakSeconds)}`,
        `Efficiency: ${efficiency}%`,
        `Focus Score: ${focusScore}`,
        `Breaks taken: ${breaksCount}`,
        `Keep up the great work! ☘️`,
      ].join("\n\n");
      vscode.window.showInformationMessage(message, { modal: true });
    }
  );
  context.subscriptions.push(showMetricsCommand);

  const setTrackingState = (nextState: boolean) => {
    isTracking = nextState;
    if (nextState) {
      autoPausedByFocusLoss = false;
      lastActivity = Date.now();
      isIdle = false;
    } else {
      isIdle = true;
      needsBreak = false;
    }
    updateStatusBar();
    pushLiveUpdate();
  };

  const toggleTrackingCommand = vscode.commands.registerCommand(
    "devToolkit.toggleSessionTracking",
    () => {
      setTrackingState(!isTracking);
      const message = isTracking
        ? "Session tracker resumed."
        : "Session tracker paused.";
      vscode.window.setStatusBarMessage(message, 1500);
      return isTracking;
    }
  );
  context.subscriptions.push(toggleTrackingCommand);

  sessionControls = {
    startTracking: () => setTrackingState(true),
    stopTracking: () => setTrackingState(false),
    toggleTracking: () => {
      setTrackingState(!isTracking);
      return isTracking;
    },
    isTracking: () => isTracking,
  };

  function currentDayStreak_internal(): number {
    const history = context.globalState.get<Array<{ date: string }>>(
      "devToolkit.sessionHistory",
      []
    );
    const uniqueDays = [
      ...new Set(history.map((s) => new Date(s.date).toDateString())),
    ]
      .map((d) => new Date(d).getTime())
      .sort((a, b) => b - a);
    if (!uniqueDays.length) return 0;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    let count = 0;
    let checkMs = today.getTime();
    for (const dayMs of uniqueDays) {
      const ds = new Date(dayMs);
      ds.setHours(0, 0, 0, 0);
      const diffDays = (checkMs - ds.getTime()) / 86400000;
      if (diffDays < 1.5) {
        count++;
        checkMs = ds.getTime() - 1;
      } else break;
    }
    return count;
  }

  updateStatusBar();
  pushLiveUpdate();
  statusBarItem.show();

  context.subscriptions.push(
    onDeepWorkCompleted(() => {
      deepWorkCompleted += 1;
      pushLiveUpdate();
    })
  );

  const interval = setInterval(() => {
    tickCount++;

    if (!isTracking) {
      if (autoPausedByFocusLoss) {
        totalTime++;
        if (!isIdle) {
          idleCount++;
        }
        isIdle = true;
        streakSeconds = 0;
        flowStateNotified = false;
        needsBreak = false;
      }
      updateStatusBar();
      pushLiveUpdate();
      if (tickCount % 15 === 0) saveCurrentSession();
      return;
    }

    const config = vscode.workspace.getConfiguration("devToolkit.sessionTracker");
    const idleDetectionEnabled = config.get<boolean>("idleDetection", true);
    const idleThresholdMin = config.get<number>("idleThresholdMinutes", 2);
    const idleThreshold = idleThresholdMin * 60 * 1000;
    const engagedThresholdSec = config.get<number>(
      "engagedThresholdSeconds",
      30
    );
    const engagedThreshold = Math.min(
      idleThreshold,
      Math.max(5, engagedThresholdSec) * 1000
    );
    const breakInterval = config.get<number>("breakReminderInterval", 45);
    const flowThresholdSeconds =
      config.get<number>("flowStateThresholdMinutes", 25) * 60;
    const dailyGoalSec = config.get<number>("dailyGoalMinutes", 120) * 60;
    const statusBarFormat = config.get<string>("statusBarFormat", "timeAndStreak");
    const notifGoalReached =
      (config.get<Record<string, boolean>>("notifications", {})
        ?.goalReminders) !== false;
    const notifBreakReminders =
      (config.get<Record<string, boolean>>("notifications", {})
        ?.breakReminders) !== false;

    const currentTime = Date.now();
    totalTime++;

    const timeSinceActivity = currentTime - lastActivity;
    const wasActive =
      !idleDetectionEnabled || timeSinceActivity < idleThreshold;
    const isEngaged =
      !idleDetectionEnabled || timeSinceActivity < engagedThreshold;

    if (wasActive) {
      activeTime++;
      if (isEngaged) {
        engagedTime++;
      }
      const activeLanguageId = vscode.window.activeTextEditor?.document.languageId;
      addLanguageSeconds(languageBreakdown, activeLanguageId, 1);
      const resolvedLanguage = getDominantLanguage(languageBreakdown);
      if (resolvedLanguage) {
        dominantLanguage = resolvedLanguage;
      }
      if (activeTime === dailyGoalSec && notifGoalReached) {
        const goalMin = Math.round(dailyGoalSec / 60);
        vscode.window.showInformationMessage(
          `$(target) Daily goal reached! You've coded ${goalMin} minutes today.`,
          "Nice!"
        );
      }
      streakSeconds++;
      isIdle = false;
      if (streakSeconds >= flowThresholdSeconds) {
        flowTimeSeconds++;
      }
      if (streakSeconds > maxStreakSeconds) {
        maxStreakSeconds = streakSeconds;
      }
      if (streakSeconds === flowThresholdSeconds && !flowStateNotified) {
        flowStateNotified = true;
        const flowMin = Math.round(flowThresholdSeconds / 60);
        vscode.window.showInformationMessage(
          `⚡ Flow state activated! ${flowMin} minutes of pure focus.`
        );
      }
      if (
        notifBreakReminders &&
        streakSeconds > 0 &&
        streakSeconds % (breakInterval * 60) === 0
      ) {
        needsBreak = true;
        breaksCount++;
        vscode.window
          .showInformationMessage(
            `🕒 ${breakInterval} min focused! Time for a quick break.`,
            "Take a break",
            "Remind me later"
          )
          .then((sel) => {
            if (sel === "Take a break") {
              streakSeconds = 0;
              flowStateNotified = false;
              needsBreak = false;
            }
          });
      }
    } else {
      if (!isIdle) idleCount++;
      isIdle = true;
      streakSeconds = 0;
      flowStateNotified = false;
      needsBreak = false;
    }

    const deepWorkActive = getDeepWorkState().active;
    if (deepWorkActive && isTracking) {
      deepWorkSeconds++;
    }

    updateStatusBar(statusBarFormat);
    pushLiveUpdate();

    if (tickCount % 15 === 0) saveCurrentSession();
  }, 1000);

  context.subscriptions.push(statusBarItem);
  context.subscriptions.push({
    dispose: () => {
      clearInterval(interval);
      saveCurrentSession();
      sessionControls = undefined;
    },
  });
}

function mergeHistoryWithLive(
  history: SessionRecord[],
  liveRecord: SessionRecord
): SessionRecord[] {
  const merged = [...history];
  const idx = merged.findIndex((s) => s.id === liveRecord.id);
  if (idx >= 0) {
    merged[idx] = { ...merged[idx], ...liveRecord };
  } else {
    merged.push(liveRecord);
  }
  return merged;
}

function todayLanguageSeconds(
  history: SessionRecord[],
  languageId: string
): number {
  const today = new Date().toDateString();
  return history
    .filter((s) => new Date(s.date).toDateString() === today)
    .reduce((acc, session) => {
      const breakdown = session.languageBreakdown;
      if (breakdown && breakdown[languageId]) {
        return acc + breakdown[languageId];
      }
      if (session.language === languageId) {
        return acc + session.activeTime;
      }
      return acc;
    }, 0);
}

function sumToday(
  history: SessionRecord[],
  key: "activeTime" | "totalTime" | "flowTime" | "breaks" | "idleCount"
): number {
  const today = new Date().toDateString();
  return history
    .filter((s) => new Date(s.date).toDateString() === today)
    .reduce((acc, session) => acc + (session[key] ?? 0), 0);
}
