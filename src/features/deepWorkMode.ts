import * as vscode from "vscode";

export interface DeepWorkStateSnapshot {
  active: boolean;
  startedAt?: number;
  endsAt?: number;
  durationMinutes?: number;
}

export interface DeepWorkCompletion {
  startedAt: string;
  endedAt: string;
  durationMinutes: number;
}

const deepWorkCompletedEmitter = new vscode.EventEmitter<DeepWorkCompletion>();

let deepWorkState: DeepWorkStateSnapshot = { active: false };
let statusBarItem: vscode.StatusBarItem | undefined;
let countdownInterval: NodeJS.Timeout | undefined;
let completionTimer: NodeJS.Timeout | undefined;
let dndToggled = false;
let activityBarPrev: boolean | undefined;
let statusBarPrev: boolean | undefined;

export function onDeepWorkCompleted(
  listener: (completion: DeepWorkCompletion) => void
): vscode.Disposable {
  return deepWorkCompletedEmitter.event(listener);
}

export function getDeepWorkState(): DeepWorkStateSnapshot {
  return { ...deepWorkState };
}

export function registerDeepWorkMode(context: vscode.ExtensionContext) {
  statusBarItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Left,
    99
  );
  statusBarItem.text = "$(circle-filled) Deep Work";
  statusBarItem.tooltip = "Deep Work Mode is active";
  statusBarItem.command = "devToolkit.endDeepWorkMode";

  context.subscriptions.push(
    vscode.commands.registerCommand("devToolkit.startDeepWorkMode", () =>
      startDeepWorkMode(context)
    )
  );
  context.subscriptions.push(
    vscode.commands.registerCommand("devToolkit.endDeepWorkMode", () =>
      endDeepWorkMode(context, false)
    )
  );

  context.subscriptions.push(statusBarItem);
}

async function startDeepWorkMode(context: vscode.ExtensionContext) {
  if (deepWorkState.active) {
    vscode.window.showInformationMessage("Deep Work Mode is already active.");
    return;
  }

  const config = vscode.workspace.getConfiguration("devToolkit.sessionTracker");
  const deepWorkConfig = config.get<Record<string, any>>("deepWork", {});
  const durationMinutes = Math.max(
    10,
    Number(deepWorkConfig.defaultDurationMinutes ?? 50)
  );

  deepWorkState = {
    active: true,
    startedAt: Date.now(),
    endsAt: Date.now() + durationMinutes * 60 * 1000,
    durationMinutes,
  };

  await applyDeepWorkUiChanges(deepWorkConfig);

  statusBarItem?.show();
  updateDeepWorkStatusBar();

  if (countdownInterval) clearInterval(countdownInterval);
  countdownInterval = setInterval(updateDeepWorkStatusBar, 1000);

  if (completionTimer) clearTimeout(completionTimer);
  completionTimer = setTimeout(() => {
    endDeepWorkMode(context, true);
  }, durationMinutes * 60 * 1000);

  vscode.window.showInformationMessage(
    `Deep Work Mode started for ${durationMinutes} minutes.`
  );
}

async function endDeepWorkMode(
  context: vscode.ExtensionContext,
  completed: boolean
) {
  if (!deepWorkState.active) {
    return;
  }

  if (countdownInterval) clearInterval(countdownInterval);
  if (completionTimer) clearTimeout(completionTimer);
  countdownInterval = undefined;
  completionTimer = undefined;

  await restoreDeepWorkUiChanges();

  statusBarItem?.hide();

  const completion: DeepWorkCompletion = {
    startedAt: new Date(deepWorkState.startedAt ?? Date.now()).toISOString(),
    endedAt: new Date().toISOString(),
    durationMinutes: deepWorkState.durationMinutes ?? 0,
  };

  if (completed) {
    deepWorkCompletedEmitter.fire(completion);
    vscode.window.showInformationMessage(
      "Deep Work session complete. Nice focus run."
    );
  } else {
    vscode.window.showInformationMessage("Deep Work Mode ended.");
  }

  deepWorkState = { active: false };
}

async function applyDeepWorkUiChanges(config: Record<string, any>) {
  const hideActivityBar = config.hideActivityBar !== false;
  const muteNotifications = config.muteNotifications !== false;
  const hideStatusBar = config.hideStatusBar === true;

  const workbenchConfig = vscode.workspace.getConfiguration("workbench");

  if (hideActivityBar) {
    activityBarPrev = workbenchConfig.get<boolean>("activityBar.visible");
    await workbenchConfig.update(
      "activityBar.visible",
      false,
      vscode.ConfigurationTarget.Global
    );
  }

  if (hideStatusBar) {
    statusBarPrev = workbenchConfig.get<boolean>("statusBar.visible");
    await workbenchConfig.update(
      "statusBar.visible",
      false,
      vscode.ConfigurationTarget.Global
    );
  }

  await tryExecuteCommand("workbench.action.enterZenMode", "workbench.action.toggleZenMode");
  await tryExecuteCommand("workbench.action.closeSidebar");
  await tryExecuteCommand("workbench.action.closePanel");

  if (muteNotifications) {
    const toggled = await tryExecuteCommand(
      "notifications.toggleDoNotDisturbMode"
    );
    dndToggled = toggled;
  }
}

async function restoreDeepWorkUiChanges() {
  const workbenchConfig = vscode.workspace.getConfiguration("workbench");

  if (activityBarPrev !== undefined) {
    await workbenchConfig.update(
      "activityBar.visible",
      activityBarPrev,
      vscode.ConfigurationTarget.Global
    );
    activityBarPrev = undefined;
  }

  if (statusBarPrev !== undefined) {
    await workbenchConfig.update(
      "statusBar.visible",
      statusBarPrev,
      vscode.ConfigurationTarget.Global
    );
    statusBarPrev = undefined;
  }

  await tryExecuteCommand("workbench.action.exitZenMode", "workbench.action.toggleZenMode");
  await tryExecuteCommand("workbench.action.openSidebar");
  await tryExecuteCommand("workbench.action.openPanel");

  if (dndToggled) {
    await tryExecuteCommand("notifications.toggleDoNotDisturbMode");
    dndToggled = false;
  }
}

function updateDeepWorkStatusBar() {
  if (!deepWorkState.active || !deepWorkState.endsAt) return;
  const remainingMs = Math.max(0, deepWorkState.endsAt - Date.now());
  const totalSeconds = Math.floor(remainingMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const label = `${minutes}:${String(seconds).padStart(2, "0")}`;
  if (statusBarItem) {
    statusBarItem.text = `$(circle-filled) Deep Work ${label}`;
    statusBarItem.tooltip = `Deep Work Mode ends in ${label}`;
  }
}

async function tryExecuteCommand(
  primary: string,
  fallback?: string
): Promise<boolean> {
  try {
    await vscode.commands.executeCommand(primary);
    return true;
  } catch (error) {
    if (fallback) {
      try {
        await vscode.commands.executeCommand(fallback);
        return true;
      } catch {
        return false;
      }
    }
    return false;
  }
}
