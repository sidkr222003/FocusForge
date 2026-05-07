import * as vscode from "vscode";
import { GitHubClient } from "./issueLog/GitHubClient";
import { IssueStore } from "./issueLog/IssueStore";
import { IssueViewController } from "./issueLog/IssueViewController";
import { WeeklyReportGenerator } from "./weeklyReport/WeeklyReportGenerator";
import { registerWeeklyTrigger } from "./weeklyReport/trigger";
import { registerSessionTimer } from "./sessionTimer";
import { registerSessionTracker } from "./sessionTracker";
import { registerDeepWorkMode } from "./features/deepWorkMode";
import { FocusSoundsViewController } from "./focusSounds/FocusSoundsViewController";

export function activate(context: vscode.ExtensionContext): void {
  const store = new IssueStore(context);
  const client = new GitHubClient(() => store.getToken());
  const controller = new IssueViewController(context, store, client);
  const soundsController = new FocusSoundsViewController(context);
  const reports = new WeeklyReportGenerator(context, store);

  // Existing registrations
  registerSessionTimer(context);
  registerSessionTracker(context, () => store.getToken());
  registerDeepWorkMode(context);

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(IssueViewController.viewId, controller),
    vscode.window.registerWebviewViewProvider(FocusSoundsViewController.viewId, soundsController, {
      webviewOptions: { retainContextWhenHidden: true },
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("devToolkit.issues.refresh", () => controller.refresh()),
    vscode.commands.registerCommand("devToolkit.issues.connectGitHub", () =>
      controller.connectGitHub()
    ),
    vscode.commands.registerCommand("devToolkit.issues.disconnectGitHub", async () => {
      await store.clearToken();
      vscode.window.showInformationMessage("GitHub token removed from VS Code SecretStorage.");
      await controller.refresh();
    }),
    vscode.commands.registerCommand("devToolkit.issues.newIssue", async () => {
      const repo = await GitHubClient.detectRepo();
      if (!repo) {
        vscode.window.showErrorMessage("No repository detected.");
        return;
      }
      const token = await store.getToken();
      if (!token) {
        await vscode.env.openExternal(vscode.Uri.parse(`https://github.com/${repo}/issues/new`));
        return;
      }
      const title = await vscode.window.showInputBox({
        prompt: `Create issue in ${repo}`,
        placeHolder: "Issue title"
      });
      if (!title?.trim()) {
        return;
      }
      const body = await vscode.window.showInputBox({
        prompt: "Issue body (optional)",
        placeHolder: "Describe the issue"
      });
      const issue = await client.createIssue(repo, { title: title.trim(), body: body ?? "" });
      await controller.refresh();
      vscode.window.showInformationMessage(`Created issue #${issue.number} in ${repo}.`);
    }),
    vscode.commands.registerCommand("devToolkit.issues.generateReport", async () => {
      const file = await reports.generateCurrentWeek();
      vscode.window.showInformationMessage("Weekly report generated.", "Open Report").then(
        (choice) => {
          if (choice === "Open Report") {
            vscode.commands.executeCommand("vscode.open", file);
          }
        }
      );
    }),
    vscode.commands.registerCommand("devToolkit.issues.generateReportLast", async () => {
      const file = await reports.generateLastWeek();
      vscode.commands.executeCommand("vscode.open", file);
    }),
    vscode.commands.registerCommand("devToolkit.issues.exportLog", async () => {
      const logs = store.getAll();
      const uri = await vscode.window.showSaveDialog({
        filters: { JSON: ["json"] },
        saveLabel: "Export Issue Completion Logs",
      });
      if (!uri) {
        return;
      }
      await vscode.workspace.fs.writeFile(
        uri,
        Buffer.from(JSON.stringify(logs, null, 2), "utf8")
      );
      vscode.window.showInformationMessage(`Exported ${logs.length} completion logs.`);
    })
  );

  registerWeeklyTrigger(context, reports);
}

export function deactivate() {}
