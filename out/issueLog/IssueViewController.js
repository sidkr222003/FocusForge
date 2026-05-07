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
exports.IssueViewController = void 0;
const vscode = __importStar(require("vscode"));
const node_fs_1 = require("node:fs");
const GitHubClient_1 = require("./GitHubClient");
class IssueViewController {
    constructor(ctx, store, client) {
        this.ctx = ctx;
        this.store = store;
        this.client = client;
        this.issueCache = [];
    }
    async resolveWebviewView(webviewView) {
        this.view = webviewView;
        const webview = webviewView.webview;
        webview.options = {
            enableScripts: true,
            localResourceRoots: [
                vscode.Uri.joinPath(this.ctx.extensionUri, 'src', 'issueLog', 'webview'),
                vscode.Uri.joinPath(this.ctx.extensionUri, 'node_modules', '@vscode', 'codicons', 'dist')
            ]
        };
        webview.html = this.renderHtml(webview);
        webview.onDidReceiveMessage((msg) => this.onMessage(msg), undefined, this.ctx.subscriptions);
    }
    async refresh() {
        await this.loadIssues(1);
    }
    async onMessage(msg) {
        if (!this.view) {
            return;
        }
        try {
            switch (msg.type) {
                case 'ready': {
                    await this.bootstrap();
                    break;
                }
                case 'loadIssues': {
                    await this.loadIssues(Number(msg.page ?? 1), {
                        repo: String(msg.repo ?? this.repo ?? ''),
                        state: msg.state,
                        labels: String(msg.labels ?? '')
                    });
                    break;
                }
                case 'searchIssues': {
                    const query = String(msg.query ?? '').toLowerCase().trim();
                    const issues = !query
                        ? this.issueCache
                        : this.issueCache.filter((i) => `${i.number} ${i.title} ${i.body}`.toLowerCase().includes(query));
                    await this.post({ type: 'filterApplied', issues });
                    break;
                }
                case 'loadIssueDetail': {
                    const issue = await this.client.getIssue(this.requiredRepo(), Number(msg.number));
                    await this.post({ type: 'issueDetail', issue });
                    await this.post({ type: 'completionLog', log: this.store.getByIssue(this.requiredRepo(), issue.number) ?? null });
                    break;
                }
                case 'loadComments': {
                    const comments = await this.client.getComments(this.requiredRepo(), Number(msg.number));
                    await this.post({ type: 'commentsLoaded', comments });
                    break;
                }
                case 'postComment': {
                    const comment = await this.client.addComment(this.requiredRepo(), Number(msg.number), String(msg.body ?? ''));
                    await this.post({ type: 'commentPosted', comment });
                    break;
                }
                case 'updateTitle': {
                    const updated = await this.client.updateIssue(this.requiredRepo(), Number(msg.number), { title: String(msg.title ?? '') });
                    this.client.invalidateCache();
                    await this.post({ type: 'issueUpdated', issue: updated });
                    break;
                }
                case 'updateBody': {
                    const updated = await this.client.updateIssue(this.requiredRepo(), Number(msg.number), { body: String(msg.body ?? '') });
                    this.client.invalidateCache();
                    await this.post({ type: 'issueUpdated', issue: updated });
                    break;
                }
                case 'updateLabels': {
                    const labels = msg.labels ?? [];
                    const updated = await this.client.updateIssue(this.requiredRepo(), Number(msg.number), { labels });
                    this.client.invalidateCache();
                    await this.post({ type: 'issueUpdated', issue: updated });
                    break;
                }
                case 'updateAssignees': {
                    const assignees = msg.assignees ?? [];
                    const updated = await this.client.updateIssue(this.requiredRepo(), Number(msg.number), { assignees });
                    this.client.invalidateCache();
                    await this.post({ type: 'issueUpdated', issue: updated });
                    break;
                }
                case 'closeIssue': {
                    const updated = await this.client.updateIssue(this.requiredRepo(), Number(msg.number), { state: 'closed' });
                    this.client.invalidateCache();
                    await this.post({ type: 'issueUpdated', issue: updated });
                    break;
                }
                case 'reopenIssue': {
                    const updated = await this.client.updateIssue(this.requiredRepo(), Number(msg.number), { state: 'open' });
                    this.client.invalidateCache();
                    await this.post({ type: 'issueUpdated', issue: updated });
                    break;
                }
                case 'saveCompletionLog': {
                    await this.store.save(msg.log);
                    await this.post({ type: 'completionLog', log: msg.log });
                    break;
                }
                case 'requestAuth': {
                    // Webview will render token input UI; controller just opens the token creation page.
                    await this.openTokenCreationPage();
                    break;
                }
                case 'submitToken': {
                    const token = String(msg.token ?? '').trim();
                    if (!token) {
                        throw new Error('Token is required.');
                    }
                    await this.store.setToken(token);
                    await this.refresh();
                    await this.post({ type: 'authUpdated', showAuthBanner: false });
                    break;
                }
                case 'newIssue': {
                    await vscode.env.openExternal(vscode.Uri.parse(`https://github.com/${this.requiredRepo()}/issues/new`));
                    break;
                }
            }
        }
        catch (error) {
            await this.post({ type: 'error', message: error instanceof Error ? error.message : String(error) });
        }
    }
    async connectGitHub() {
        // Command-based flow (separate from webview connect button).
        await this.openTokenCreationPage();
        const token = await vscode.window.showInputBox({
            password: true,
            prompt: 'Paste your GitHub personal access token',
            placeHolder: 'ghp_...'
        });
        if (!token) {
            return;
        }
        await this.store.setToken(token.trim());
        await this.refresh();
        await this.post({ type: 'authUpdated', showAuthBanner: false });
    }
    async openTokenCreationPage() {
        await vscode.env.openExternal(vscode.Uri.parse('https://github.com/settings/tokens/new?scopes=repo&description=VSCode+Session+Tracker'));
    }
    async bootstrap() {
        const detected = (await GitHubClient_1.GitHubClient.detectRepo()) ?? this.store.getLastRepo();
        this.repo = detected;
        if (detected) {
            await this.store.setLastRepo(detected);
        }
        const token = await this.store.getToken();
        await this.post({ type: 'boot', repo: this.repo ?? '', showAuthBanner: !token });
        if (!token || !this.repo) {
            return;
        }
        const labels = await this.client.listLabels(this.repo);
        const assignees = await this.client.listAssignees(this.repo);
        await this.post({ type: 'labelsLoaded', labels });
        await this.post({ type: 'assigneesLoaded', assignees });
        await this.loadIssues(1);
    }
    async loadIssues(page, opts = {}) {
        this.repo = opts.repo || this.repo;
        if (!this.repo) {
            throw new Error('No GitHub repository detected in the active workspace.');
        }
        await this.store.setLastRepo(this.repo);
        const issues = await this.client.listIssues(this.repo, {
            state: opts.state ?? 'open',
            labels: opts.labels ?? '',
            page
        });
        this.issueCache = page === 1 ? issues : [...this.issueCache, ...issues];
        await this.post({
            type: 'issuesLoaded',
            issues,
            repo: this.repo,
            page,
            hasMore: issues.length === 30
        });
    }
    requiredRepo() {
        if (!this.repo) {
            throw new Error('Repository is not configured.');
        }
        return this.repo;
    }
    async post(message) {
        await this.view?.webview.postMessage(message);
    }
    renderHtml(webview) {
        const root = vscode.Uri.joinPath(this.ctx.extensionUri, 'src', 'issueLog', 'webview');
        const htmlPath = vscode.Uri.joinPath(root, 'issuesTab.html');
        const cssUri = webview.asWebviewUri(vscode.Uri.joinPath(root, 'issuesTab.css'));
        const jsUri = webview.asWebviewUri(vscode.Uri.joinPath(root, 'issuesTab.js'));
        const codiconUri = webview.asWebviewUri(vscode.Uri.joinPath(this.ctx.extensionUri, 'node_modules', '@vscode', 'codicons', 'dist', 'codicon.css'));
        const nonce = String(Date.now());
        const html = (0, node_fs_1.readFileSync)(htmlPath.fsPath, 'utf8');
        return html
            .replace(/__NONCE__/g, nonce)
            .replace('__CSS__', cssUri.toString())
            .replace('__JS__', jsUri.toString())
            .replace('__CODICON__', codiconUri.toString());
    }
}
exports.IssueViewController = IssueViewController;
IssueViewController.viewId = 'devToolkit.issueView';
//# sourceMappingURL=IssueViewController.js.map