import * as vscode from "vscode";
import { registerSessionTimer } from "./sessionTimer";
import { registerSessionTracker } from "./sessionTracker";
import { registerDeepWorkMode } from "./features/deepWorkMode";

export function activate(context: vscode.ExtensionContext) {
  registerSessionTimer(context);
  registerSessionTracker(context);
  registerDeepWorkMode(context);
}

export function deactivate() {}
