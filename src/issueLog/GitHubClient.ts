import * as vscode from 'vscode';
import { GitHubComment, GitHubIssue, GitHubLabel, GitHubUser } from './types';

const BASE = 'https://api.github.com';

interface FetchOptions {
  method?: string;
  body?: unknown;
}

interface ApiIssue {
  number: number;
  title: string;
  body: string | null;
  state: 'open' | 'closed';
  html_url: string;
  labels: Array<{ name: string; color: string }>;
  assignees: Array<{ login: string; avatar_url: string }>;
  user: { login: string; avatar_url: string };
  created_at: string;
  updated_at: string;
  comments: number;
  pull_request?: unknown;
}

interface ApiComment {
  id: number;
  body: string;
  created_at: string;
  updated_at: string;
  user: { login: string; avatar_url: string };
}

export class GitHubClient {
  private cache = new Map<string, { data: unknown; etag: string; ts: number }>();

  constructor(private readonly getToken: () => Promise<string | undefined>) {}

  private async request<T>(path: string, opts: FetchOptions = {}): Promise<T> {
    const token = await this.getToken();
    const headers: Record<string, string> = {
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28'
    };
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    const cached = !opts.method || opts.method === 'GET' ? this.cache.get(path) : undefined;
    if (cached) {
      headers['If-None-Match'] = cached.etag;
    }

    const res = await fetch(`${BASE}${path}`, {
      method: opts.method ?? 'GET',
      headers,
      body: opts.body ? JSON.stringify(opts.body) : undefined
    });

    if (res.status === 304 && cached) {
      return cached.data as T;
    }

    if (!res.ok) {
      const msg = await res.json().catch(() => ({ message: res.statusText }));
      throw new Error(`GitHub ${res.status}: ${(msg as { message?: string }).message ?? res.statusText}`);
    }

    const data = (await res.json()) as T;
    const etag = res.headers.get('etag') ?? '';
    if (etag && (!opts.method || opts.method === 'GET')) {
      this.cache.set(path, { data, etag, ts: Date.now() });
    }
    return data;
  }

  private toIssue(i: ApiIssue): GitHubIssue {
    return {
      number: i.number,
      title: i.title,
      body: i.body ?? '',
      state: i.state,
      htmlUrl: i.html_url,
      labels: i.labels.map((l) => ({ name: l.name, color: l.color })),
      assignees: i.assignees.map((a) => ({ login: a.login, avatarUrl: a.avatar_url })),
      author: { login: i.user.login, avatarUrl: i.user.avatar_url },
      createdAt: i.created_at,
      updatedAt: i.updated_at,
      comments: i.comments
    };
  }

  private toComment(c: ApiComment): GitHubComment {
    return {
      id: c.id,
      body: c.body,
      author: { login: c.user.login, avatarUrl: c.user.avatar_url },
      createdAt: c.created_at,
      updatedAt: c.updated_at
    };
  }

  async listIssues(
    repo: string,
    opts: { state?: 'open' | 'closed' | 'all'; labels?: string; page?: number } = {}
  ): Promise<GitHubIssue[]> {
    const params = new URLSearchParams({
      state: opts.state ?? 'open',
      per_page: '30',
      page: String(opts.page ?? 1)
    });
    if (opts.labels) {
      params.set('labels', opts.labels);
    }
    const issues = await this.request<ApiIssue[]>(`/repos/${repo}/issues?${params.toString()}`);
    return issues.filter((i) => !i.pull_request).map((i) => this.toIssue(i));
  }

  async getIssue(repo: string, number: number): Promise<GitHubIssue> {
    const issue = await this.request<ApiIssue>(`/repos/${repo}/issues/${number}`);
    return this.toIssue(issue);
  }

  async getComments(repo: string, number: number): Promise<GitHubComment[]> {
    const comments = await this.request<ApiComment[]>(`/repos/${repo}/issues/${number}/comments?per_page=100`);
    return comments.map((c) => this.toComment(c));
  }

  async addComment(repo: string, number: number, body: string): Promise<GitHubComment> {
    const comment = await this.request<ApiComment>(`/repos/${repo}/issues/${number}/comments`, {
      method: 'POST',
      body: { body }
    });
    return this.toComment(comment);
  }

  async updateIssue(
    repo: string,
    number: number,
    patch: Partial<{ title: string; body: string; state: 'open' | 'closed'; labels: string[]; assignees: string[] }>
  ): Promise<GitHubIssue> {
    const issue = await this.request<ApiIssue>(`/repos/${repo}/issues/${number}`, {
      method: 'PATCH',
      body: patch
    });
    return this.toIssue(issue);
  }

  async listLabels(repo: string): Promise<GitHubLabel[]> {
    const labels = await this.request<Array<{ name: string; color: string }>>(`/repos/${repo}/labels?per_page=100`);
    return labels.map((l) => ({ name: l.name, color: l.color }));
  }

  async listAssignees(repo: string): Promise<GitHubUser[]> {
    const users = await this.request<Array<{ login: string; avatar_url: string }>>(`/repos/${repo}/assignees?per_page=100`);
    return users.map((u) => ({ login: u.login, avatarUrl: u.avatar_url }));
  }

  static async detectRepo(): Promise<string | undefined> {
    const folder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!folder) {
      return undefined;
    }
    try {
      const { execFile } = await import('node:child_process');
      const { promisify } = await import('node:util');
      const exec = promisify(execFile);
      const { stdout } = await exec('git', ['remote', 'get-url', 'origin'], { cwd: folder });
      const url = stdout.trim();
      const match =
        url.match(/github\.com[:/](.+?)(?:\.git)?$/) ??
        url.match(/github\.com\/(.+?)(?:\.git)?$/);
      return match?.[1];
    } catch {
      return undefined;
    }
  }

  invalidateCache(path?: string): void {
    if (path) {
      this.cache.delete(path);
      return;
    }
    this.cache.clear();
  }
}