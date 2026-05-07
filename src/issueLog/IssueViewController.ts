import * as vscode from 'vscode';
import { readFileSync } from 'node:fs';
import { GitHubClient, RepoCandidate } from './GitHubClient';
import { IssueStore } from './IssueStore';
import { WeeklyReportGenerator } from '../weeklyReport/WeeklyReportGenerator';
import { GitHubIssue, IssueCompletionLog } from './types';

interface ViewMessage {
  type: string;
  [key: string]: unknown;
}

export class IssueViewController implements vscode.WebviewViewProvider {
  public static readonly viewId = 'devToolkit.issueView';
  private view?: vscode.WebviewView;
  private repo?: string;
  private issueCache: GitHubIssue[] = [];

  constructor(
    private readonly ctx: vscode.ExtensionContext,
    private readonly store: IssueStore,
    private readonly client: GitHubClient
  ) {}

  async resolveWebviewView(webviewView: vscode.WebviewView): Promise<void> {
    this.view = webviewView;
    const webview = webviewView.webview;
    webview.options = {
      enableScripts: true,
      localResourceRoots: [
        vscode.Uri.joinPath(this.ctx.extensionUri, 'src', 'issueLog', 'webview'),
        vscode.Uri.joinPath(this.ctx.extensionUri, 'node_modules', '@vscode', 'codicons', 'dist'),
        vscode.Uri.joinPath(this.ctx.extensionUri, 'node_modules', 'markdown-it', 'dist')
      ]
    };
    webview.html = this.renderHtml(webview);

    webview.onDidReceiveMessage((msg) => this.onMessage(msg as ViewMessage), undefined, this.ctx.subscriptions);
  }

  async refresh(): Promise<void> {
    this.client.invalidateCache();
    await this.bootstrap();
  }

  private async onMessage(msg: ViewMessage): Promise<void> {
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
          const nextRepo = String(msg.repo ?? this.repo ?? '').trim();
          const previousRepo = this.repo;
          await this.loadIssues(Number(msg.page ?? 1), {
            repo: nextRepo,
            state: msg.state as 'open' | 'closed' | 'all',
            labels: String(msg.labels ?? '')
          });
          if (nextRepo && nextRepo !== previousRepo) {
            await this.loadRepoMetadata(nextRepo);
            await this.postAccess(nextRepo);
          }
          break;
        }
        case 'searchIssues': {
          const query = String(msg.query ?? '').toLowerCase().trim();
          const issues = !query
            ? this.issueCache
            : this.issueCache.filter((i) =>
                `${i.number} ${i.title} ${i.body}`.toLowerCase().includes(query)
              );
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
        case 'createIssue': {
          const title = String(msg.title ?? '').trim();
          if (!title) {
            throw new Error('Issue title is required.');
          }
          const labels = String(msg.labels ?? '')
            .split(',')
            .map((label) => label.trim())
            .filter(Boolean);
          const issue = await this.client.createIssue(this.requiredRepo(), {
            title,
            body: String(msg.body ?? ''),
            labels
          });
          this.client.invalidateCache();
          await this.post({ type: 'issueCreated', issue });
          await this.loadIssues(1);
          break;
        }
        case 'openIssueExternal': {
          await vscode.env.openExternal(vscode.Uri.parse(`https://github.com/${this.requiredRepo()}/issues/${Number(msg.number)}`));
          break;
        }
        case 'copyIssueLink': {
          await vscode.env.clipboard.writeText(`https://github.com/${this.requiredRepo()}/issues/${Number(msg.number)}`);
          await this.post({ type: 'toast', message: 'Issue link copied.' });
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
          const labels = (msg.labels as string[]) ?? [];
          const updated = await this.client.updateIssue(this.requiredRepo(), Number(msg.number), { labels });
          this.client.invalidateCache();
          await this.post({ type: 'issueUpdated', issue: updated });
          break;
        }
        case 'updateAssignees': {
          const assignees = (msg.assignees as string[]) ?? [];
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
          await this.store.save(msg.log as IssueCompletionLog);
          await this.post({ type: 'completionLog', log: msg.log });
          break;
        }
        case 'requestAuth': {
          // Webview will render token input UI; controller just opens the token creation page.
          await this.openTokenCreationPage();
          break;
        }
        case 'activateGit': {
          const status = await GitHubClient.activateGitExtension();
          this.client.invalidateCache();
          await this.post({ type: 'gitStatus', status });
          await this.bootstrap();
          break;
        }
        case 'submitToken': {
          const token = String(msg.token ?? '').trim();
          if (!token) {
            throw new Error('Token is required.');
          }
          await this.store.setToken(token);
          await this.bootstrap();
          await this.post({ type: 'authUpdated', showAuthBanner: false });
          break;
        }
        case 'newIssue': {
          await vscode.env.openExternal(vscode.Uri.parse(`https://github.com/${this.requiredRepo()}/issues/new`));
          break;
        }
        case 'generateCurrentWeekReport': {
          const reportGen = new WeeklyReportGenerator(this.ctx, this.store);
          const file = await reportGen.generateCurrentWeek();
          await vscode.window.showInformationMessage('Weekly report generated.', 'Open Report').then(
            (choice) => {
              if (choice === 'Open Report') {
                vscode.commands.executeCommand('vscode.open', file);
              }
            }
          );
          await this.post({ type: 'reportGenerated', file: file.toString() });
          break;
        }
        case 'generateLastWeekReport': {
          const reportGen = new WeeklyReportGenerator(this.ctx, this.store);
          const file = await reportGen.generateLastWeek();
          await vscode.commands.executeCommand('vscode.open', file);
          await this.post({ type: 'reportGenerated', file: file.toString() });
          break;
        }
      }
    } catch (error) {
      await this.post({ type: 'error', message: error instanceof Error ? error.message : String(error) });
    }
  }

  async connectGitHub(): Promise<void> {
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
    await this.bootstrap();
    await this.post({ type: 'authUpdated', showAuthBanner: false });
  }

  private async openTokenCreationPage(): Promise<void> {
    await vscode.env.openExternal(
      vscode.Uri.parse('https://github.com/settings/tokens/new?scopes=repo&description=VSCode+Session+Tracker')
    );
  }

  private async bootstrap(): Promise<void> {
    await this.post({ type: 'gitStatus', status: GitHubClient.getGitExtensionStatus() });
    const detectedRepoOptions = await GitHubClient.detectRepoCandidates();
    const detectedRepos = detectedRepoOptions.map((repo) => repo.slug);
    const detected = detectedRepoOptions[0]?.slug;
    this.repo = detected;
    if (detected) {
      await this.store.setLastRepo(detected);
    }

    const token = await this.store.getToken();
    await this.post({ type: 'boot', repo: this.repo ?? '', showAuthBanner: !token });

    const repos = token ? await this.loadRepositories(this.repo, detectedRepoOptions) : [...new Set(detectedRepos)];
    if (!token) {
      await this.post({
        type: 'reposLoaded',
        repos,
        repoOptions: detectedRepoOptions,
        selectedRepo: this.repo ?? repos[0] ?? ''
      });
    }
    if (!this.repo) {
      await this.post({
        type: 'error',
        message: 'No local GitHub repo detected. Open a file inside the cloned repo or select a repo from the dropdown.'
      });
      return;
    }
    await this.postAccess(this.repo);
    await this.loadRepoMetadata(this.repo);
    await this.loadIssues(1);
  }

  private async loadRepositories(selectedRepo?: string, localRepos: RepoCandidate[] = []): Promise<string[]> {
    const repos = new Set<string>();
    const repoOptions = new Map<string, RepoCandidate>();
    if (selectedRepo) {
      repos.add(selectedRepo);
    }
    for (const repo of localRepos) {
      repos.add(repo.slug);
      repoOptions.set(repo.slug, repo);
    }
    try {
      for (const repo of await this.client.listRepositories()) {
        repos.add(repo);
      }
    } catch (error) {
      await this.post({
        type: 'repoListError',
        message: error instanceof Error ? error.message : String(error)
      });
    }
    const orderedRepos = [...repos];
    await this.post({
      type: 'reposLoaded',
      repos: orderedRepos,
      repoOptions: [...repoOptions.values()],
      selectedRepo: selectedRepo ?? ''
    });
    return orderedRepos;
  }

  private async loadRepoMetadata(repo: string): Promise<void> {
    const labels = await this.client.listLabels(repo).catch(() => []);
    const assignees = await this.client.listAssignees(repo).catch(() => []);
    await this.post({ type: 'labelsLoaded', labels });
    await this.post({ type: 'assigneesLoaded', assignees });
  }

  private async postAccess(repo: string): Promise<void> {
    const access = await this.client.getRepoAccess(repo);
    await this.post({ type: 'repoAccess', access });
  }

  private async loadIssues(
    page: number,
    opts: { repo?: string; state?: 'open' | 'closed' | 'all'; labels?: string } = {}
  ): Promise<void> {
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

  private requiredRepo(): string {
    if (!this.repo) {
      throw new Error('Repository is not configured.');
    }
    return this.repo;
  }

  private async post(message: unknown): Promise<void> {
    await this.view?.webview.postMessage(message);
  }

  private renderHtml(webview: vscode.Webview): string {
    const root = vscode.Uri.joinPath(this.ctx.extensionUri, 'src', 'issueLog', 'webview');
    const htmlPath = vscode.Uri.joinPath(root, 'issuesTab.html');
    const cssUri = webview.asWebviewUri(vscode.Uri.joinPath(root, 'issuesTab.css'));
    const jsUri = webview.asWebviewUri(vscode.Uri.joinPath(root, 'issuesTab.js'));
    const markdownItUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.ctx.extensionUri, 'node_modules', 'markdown-it', 'dist', 'markdown-it.min.js')
    );
    const codiconUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.ctx.extensionUri, 'node_modules', '@vscode', 'codicons', 'dist', 'codicon.css')
    );
    const nonce = String(Date.now());
    const html = readFileSync(htmlPath.fsPath, 'utf8');
    return html
      .replace(/__NONCE__/g, nonce)
      .replace(/__CSP_SOURCE__/g, webview.cspSource)
      .replace('__CSS__', cssUri.toString())
      .replace('__MARKDOWN_IT__', markdownItUri.toString())
      .replace('__JS__', jsUri.toString())
      .replace('__CODICON__', codiconUri.toString());
  }
}
