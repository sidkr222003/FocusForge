import * as vscode from 'vscode';
import { IssueCompletionLog } from './types';

const LOG_KEY = 'devToolkit.issueCompletionLogs';
const REPO_KEY = 'devToolkit.lastKnownRepo';
const MAX_LOGS = 500;

export class IssueStore {
  constructor(private readonly ctx: vscode.ExtensionContext) {}

  getAll(): IssueCompletionLog[] {
    return this.ctx.globalState.get<IssueCompletionLog[]>(LOG_KEY) ?? [];
  }

  getByRange(fromMs: number, toMs: number): IssueCompletionLog[] {
    return this.getAll().filter((l) => l.completedAt >= fromMs && l.completedAt <= toMs);
  }

  getByIssue(repoSlug: string, issueNumber: number): IssueCompletionLog | undefined {
    return this.getAll().find((l) => l.repoSlug === repoSlug && l.issueNumber === issueNumber);
  }

  async save(log: IssueCompletionLog): Promise<void> {
    const existing = this.getAll().filter((l) => !(l.issueNumber === log.issueNumber && l.repoSlug === log.repoSlug));
    const trimmed = [...existing, log].sort((a, b) => b.completedAt - a.completedAt).slice(0, MAX_LOGS);
    await this.ctx.globalState.update(LOG_KEY, trimmed);
  }

  async getToken(): Promise<string | undefined> {
    return this.ctx.secrets.get('devToolkit.github.token');
  }

  async setToken(token: string): Promise<void> {
    await this.ctx.secrets.store('devToolkit.github.token', token);
  }

  async clearToken(): Promise<void> {
    await this.ctx.secrets.delete('devToolkit.github.token');
  }

  getLastRepo(): string | undefined {
    return this.ctx.globalState.get<string>(REPO_KEY);
  }

  async setLastRepo(repo: string): Promise<void> {
    await this.ctx.globalState.update(REPO_KEY, repo);
  }
}