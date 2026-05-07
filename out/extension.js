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
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = __importStar(require("vscode"));
const GitHubClient_1 = require("./issueLog/GitHubClient");
const IssueStore_1 = require("./issueLog/IssueStore");
const IssueViewController_1 = require("./issueLog/IssueViewController");
const WeeklyReportGenerator_1 = require("./weeklyReport/WeeklyReportGenerator");
const trigger_1 = require("./weeklyReport/trigger");
const sessionTimer_1 = require("./sessionTimer");
const sessionTracker_1 = require("./sessionTracker");
const deepWorkMode_1 = require("./features/deepWorkMode");
function activate(context) {
    const store = new IssueStore_1.IssueStore(context);
    const client = new GitHubClient_1.GitHubClient(() => store.getToken());
    const controller = new IssueViewController_1.IssueViewController(context, store, client);
    const reports = new WeeklyReportGenerator_1.WeeklyReportGenerator(context, store);
    // Existing registrations
    (0, sessionTimer_1.registerSessionTimer)(context);
    (0, sessionTracker_1.registerSessionTracker)(context);
    (0, deepWorkMode_1.registerDeepWorkMode)(context);
    context.subscriptions.push(vscode.window.registerWebviewViewProvider(IssueViewController_1.IssueViewController.viewId, controller));
    context.subscriptions.push(vscode.commands.registerCommand("devToolkit.issues.refresh", () => controller.refresh()), vscode.commands.registerCommand("devToolkit.issues.connectGitHub", () => controller.connectGitHub()), vscode.commands.registerCommand("devToolkit.issues.disconnectGitHub", async () => {
        await store.clearToken();
        vscode.window.showInformationMessage("GitHub token removed from VS Code SecretStorage.");
        await controller.refresh();
    }), vscode.commands.registerCommand("devToolkit.issues.newIssue", async () => {
        const repo = (await GitHubClient_1.GitHubClient.detectRepo()) ?? store.getLastRepo();
        if (!repo) {
            vscode.window.showErrorMessage("No repository detected.");
            return;
        }
        await vscode.env.openExternal(vscode.Uri.parse(`https://github.com/${repo}/issues/new`));
    }), vscode.commands.registerCommand("devToolkit.issues.generateReport", async () => {
        const file = await reports.generateCurrentWeek();
        vscode.window.showInformationMessage("Weekly report generated.", "Open Report").then((choice) => {
            if (choice === "Open Report") {
                vscode.commands.executeCommand("vscode.open", file);
            }
        });
    }), vscode.commands.registerCommand("devToolkit.issues.generateReportLast", async () => {
        const file = await reports.generateLastWeek();
        vscode.commands.executeCommand("vscode.open", file);
    }), vscode.commands.registerCommand("devToolkit.issues.exportLog", async () => {
        const logs = store.getAll();
        const uri = await vscode.window.showSaveDialog({
            filters: { JSON: ["json"] },
            saveLabel: "Export Issue Completion Logs",
        });
        if (!uri) {
            return;
        }
        await vscode.workspace.fs.writeFile(uri, Buffer.from(JSON.stringify(logs, null, 2), "utf8"));
        vscode.window.showInformationMessage(`Exported ${logs.length} completion logs.`);
    }));
    (0, trigger_1.registerWeeklyTrigger)(context, reports);
}
function deactivate() { }
//# sourceMappingURL=extension.js.map