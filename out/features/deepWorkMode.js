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
exports.onDeepWorkCompleted = onDeepWorkCompleted;
exports.getDeepWorkState = getDeepWorkState;
exports.registerDeepWorkMode = registerDeepWorkMode;
const vscode = __importStar(require("vscode"));
const deepWorkCompletedEmitter = new vscode.EventEmitter();
let deepWorkState = { active: false };
let statusBarItem;
let countdownInterval;
let completionTimer;
let dndToggled = false;
let activityBarPrev;
let statusBarPrev;
function onDeepWorkCompleted(listener) {
    return deepWorkCompletedEmitter.event(listener);
}
function getDeepWorkState() {
    return { ...deepWorkState };
}
function registerDeepWorkMode(context) {
    statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 99);
    statusBarItem.text = "$(circle-filled) Deep Work";
    statusBarItem.tooltip = "Deep Work Mode is active";
    statusBarItem.command = "devToolkit.endDeepWorkMode";
    context.subscriptions.push(vscode.commands.registerCommand("devToolkit.startDeepWorkMode", () => startDeepWorkMode(context)));
    context.subscriptions.push(vscode.commands.registerCommand("devToolkit.endDeepWorkMode", () => endDeepWorkMode(context, false)));
    context.subscriptions.push(statusBarItem);
}
async function startDeepWorkMode(context) {
    if (deepWorkState.active) {
        vscode.window.showInformationMessage("Deep Work Mode is already active.");
        return;
    }
    const config = vscode.workspace.getConfiguration("devToolkit.sessionTracker");
    const deepWorkConfig = config.get("deepWork", {});
    const durationMinutes = Math.max(10, Number(deepWorkConfig.defaultDurationMinutes ?? 50));
    deepWorkState = {
        active: true,
        startedAt: Date.now(),
        endsAt: Date.now() + durationMinutes * 60 * 1000,
        durationMinutes,
    };
    await applyDeepWorkUiChanges(deepWorkConfig);
    statusBarItem?.show();
    updateDeepWorkStatusBar();
    if (countdownInterval)
        clearInterval(countdownInterval);
    countdownInterval = setInterval(updateDeepWorkStatusBar, 1000);
    if (completionTimer)
        clearTimeout(completionTimer);
    completionTimer = setTimeout(() => {
        endDeepWorkMode(context, true);
    }, durationMinutes * 60 * 1000);
    vscode.window.showInformationMessage(`Deep Work Mode started for ${durationMinutes} minutes.`);
}
async function endDeepWorkMode(context, completed) {
    if (!deepWorkState.active) {
        return;
    }
    if (countdownInterval)
        clearInterval(countdownInterval);
    if (completionTimer)
        clearTimeout(completionTimer);
    countdownInterval = undefined;
    completionTimer = undefined;
    await restoreDeepWorkUiChanges();
    statusBarItem?.hide();
    const completion = {
        startedAt: new Date(deepWorkState.startedAt ?? Date.now()).toISOString(),
        endedAt: new Date().toISOString(),
        durationMinutes: deepWorkState.durationMinutes ?? 0,
    };
    if (completed) {
        deepWorkCompletedEmitter.fire(completion);
        vscode.window.showInformationMessage("Deep Work session complete. Nice focus run.");
    }
    else {
        vscode.window.showInformationMessage("Deep Work Mode ended.");
    }
    deepWorkState = { active: false };
}
async function applyDeepWorkUiChanges(config) {
    const hideActivityBar = config.hideActivityBar !== false;
    const muteNotifications = config.muteNotifications !== false;
    const hideStatusBar = config.hideStatusBar === true;
    const workbenchConfig = vscode.workspace.getConfiguration("workbench");
    if (hideActivityBar) {
        activityBarPrev = workbenchConfig.get("activityBar.visible");
        await workbenchConfig.update("activityBar.visible", false, vscode.ConfigurationTarget.Global);
    }
    if (hideStatusBar) {
        statusBarPrev = workbenchConfig.get("statusBar.visible");
        await workbenchConfig.update("statusBar.visible", false, vscode.ConfigurationTarget.Global);
    }
    await tryExecuteCommand("workbench.action.enterZenMode", "workbench.action.toggleZenMode");
    await tryExecuteCommand("workbench.action.closeSidebar");
    await tryExecuteCommand("workbench.action.closePanel");
    if (muteNotifications) {
        const toggled = await tryExecuteCommand("notifications.toggleDoNotDisturbMode");
        dndToggled = toggled;
    }
}
async function restoreDeepWorkUiChanges() {
    const workbenchConfig = vscode.workspace.getConfiguration("workbench");
    if (activityBarPrev !== undefined) {
        await workbenchConfig.update("activityBar.visible", activityBarPrev, vscode.ConfigurationTarget.Global);
        activityBarPrev = undefined;
    }
    if (statusBarPrev !== undefined) {
        await workbenchConfig.update("statusBar.visible", statusBarPrev, vscode.ConfigurationTarget.Global);
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
    if (!deepWorkState.active || !deepWorkState.endsAt)
        return;
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
async function tryExecuteCommand(primary, fallback) {
    try {
        await vscode.commands.executeCommand(primary);
        return true;
    }
    catch (error) {
        if (fallback) {
            try {
                await vscode.commands.executeCommand(fallback);
                return true;
            }
            catch {
                return false;
            }
        }
        return false;
    }
}
//# sourceMappingURL=deepWorkMode.js.map