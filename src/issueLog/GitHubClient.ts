import * as vscode from 'vscode';
import { existsSync } from 'node:fs';
import { dirname } from 'node:path';
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

interface ApiRepo {
  full_name: string;
  archived: boolean;
  disabled: boolean;
  permissions?: {
    admin?: boolean;
    maintain?: boolean;
    push?: boolean;
    triage?: boolean;
    pull?: boolean;
  };
}

export interface RepoAccess {
  canEdit: boolean;
  canComment: boolean;
  isAuthenticated: boolean;
}

export interface GitExtensionStatus {
  available: boolean;
  active: boolean;
  message?: string;
}

export interface RepoCandidate {
  slug: string;
  folder?: string;
  remote?: string;
}

export class GitHubClient {
  private cache = new Map<string, { data: unknown; etag: string; ts: number }>();

  constructor(private readonly getToken: () => Promise<string | undefined>) {}

  async hasToken(): Promise<boolean> {
    return Boolean(await this.getToken());
  }

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

  async createIssue(repo: string, input: { title: string; body?: string; labels?: string[] }): Promise<GitHubIssue> {
    const issue = await this.request<ApiIssue>(`/repos/${repo}/issues`, {
      method: 'POST',
      body: {
        title: input.title,
        body: input.body ?? '',
        labels: input.labels ?? []
      }
    });
    return this.toIssue(issue);
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

  async listRepositories(): Promise<string[]> {
    const repos = await this.request<ApiRepo[]>(
      '/user/repos?per_page=100&sort=updated&affiliation=owner,collaborator,organization_member'
    );
    return repos.filter((repo) => !repo.archived && !repo.disabled).map((repo) => repo.full_name);
  }

  async getRepoAccess(repo: string): Promise<RepoAccess> {
    const isAuthenticated = await this.hasToken();
    if (!isAuthenticated) {
      return { canEdit: false, canComment: false, isAuthenticated };
    }

    try {
      const data = await this.request<ApiRepo>(`/repos/${repo}`);
      const permissions = data.permissions ?? {};
      const canEdit = Boolean(permissions.admin || permissions.maintain || permissions.push || permissions.triage);
      return { canEdit, canComment: true, isAuthenticated };
    } catch {
      return { canEdit: false, canComment: true, isAuthenticated };
    }
  }

  static async detectRepo(): Promise<string | undefined> {
    return (await this.detectRepoCandidates())[0]?.slug;
  }

  static async detectRepos(): Promise<string[]> {
    return (await this.detectRepoCandidates()).map((repo) => repo.slug);
  }

  static async detectRepoCandidates(): Promise<RepoCandidate[]> {
    const folders = await this.getCandidateFolders();
    if (!folders.length) {
      return [];
    }

    const { execFile } = await import('node:child_process');
    const { promisify } = await import('node:util');
    const exec = promisify(execFile);
    const repos = new Map<string, RepoCandidate>();

    for (const folder of folders) {
      for (const repo of await this.detectReposFromFolder(folder, exec)) {
        if (!repos.has(repo.slug)) {
          repos.set(repo.slug, repo);
        }
      }
    }

    return [...repos.values()];
  }

  static getGitExtensionStatus(): GitExtensionStatus {
    try {
      const extension = vscode.extensions.getExtension('vscode.git');
      if (!extension) {
        return {
          available: false,
          active: false,
          message: "VS Code's built-in Git extension is not available."
        };
      }
      return { available: true, active: extension.isActive };
    } catch (error) {
      return {
        available: false,
        active: false,
        message: error instanceof Error ? error.message : String(error)
      };
    }
  }

  static async activateGitExtension(): Promise<GitExtensionStatus> {
    try {
      const extension = vscode.extensions.getExtension('vscode.git');
      if (!extension) {
        await vscode.commands.executeCommand('workbench.view.scm').then(undefined, () => undefined);
        return this.getGitExtensionStatus();
      }
      if (!extension.isActive) {
        await extension.activate();
      }
      return this.getGitExtensionStatus();
    } catch (error) {
      return {
        available: false,
        active: false,
        message: error instanceof Error ? error.message : String(error)
      };
    }
  }

  private static async getCandidateFolders(): Promise<string[]> {
    const folders = new Set<string>();
    for (const folder of await this.getEditorGitFolders()) {
      folders.add(folder);
    }

    for (const folder of vscode.workspace.workspaceFolders ?? []) {
      if (existsSync(vscode.Uri.joinPath(folder.uri, '.git').fsPath)) {
        folders.add(folder.uri.fsPath);
      }
    }

    for (const folder of vscode.workspace.workspaceFolders ?? []) {
      for (const child of await this.findGitChildren(folder.uri)) {
        folders.add(child);
      }
      folders.add(folder.uri.fsPath);
    }

    try {
      const gitExtension = vscode.extensions.getExtension('vscode.git');
      if (gitExtension?.isActive) {
        const gitApi = gitExtension.exports?.getAPI?.(1);
        for (const repo of gitApi?.repositories ?? []) {
          if (repo.rootUri?.fsPath) {
            folders.add(repo.rootUri.fsPath);
          }
        }
      }
    } catch {
      // Shell-based detection above is the primary path; Git extension discovery is optional.
    }

    return [...folders];
  }

  private static async getEditorGitFolders(): Promise<string[]> {
    const roots = new Set<string>();
    const uris = [
      vscode.window.activeTextEditor?.document.uri,
      ...vscode.window.visibleTextEditors.map((editor) => editor.document.uri)
    ];

    for (const uri of uris) {
      if (uri?.scheme !== 'file') {
        continue;
      }
      const root = await this.gitRootForPath(dirname(uri.fsPath));
      if (root) {
        roots.add(root);
        continue;
      }
      const activeFolder = vscode.workspace.getWorkspaceFolder(uri);
      if (activeFolder) {
        roots.add(activeFolder.uri.fsPath);
      }
    }
    return [...roots];
  }

  private static async gitRootForPath(folder: string): Promise<string | undefined> {
    try {
      const { execFile } = await import('node:child_process');
      const { promisify } = await import('node:util');
      const exec = promisify(execFile);
      const { stdout } = await exec('git', ['rev-parse', '--show-toplevel'], { cwd: folder });
      return stdout.trim() || undefined;
    } catch {
      return undefined;
    }
  }

  private static async findGitChildren(root: vscode.Uri): Promise<string[]> {
    const found: string[] = [];
    try {
      const entries = await vscode.workspace.fs.readDirectory(root);
      for (const [name, type] of entries) {
        if (name.startsWith('.') || type !== vscode.FileType.Directory) {
          continue;
        }
        const child = vscode.Uri.joinPath(root, name);
        if (existsSync(vscode.Uri.joinPath(child, '.git').fsPath)) {
          found.push(child.fsPath);
        }
      }
    } catch {
      return found;
    }
    return found;
  }

  private static async detectReposFromFolder(
    folder: string,
    exec: (
      file: string,
      args: readonly string[],
      options: { cwd: string }
    ) => Promise<{ stdout: string; stderr: string }>
  ): Promise<RepoCandidate[]> {
    try {
      const { stdout: rootStdout } = await exec('git', ['rev-parse', '--show-toplevel'], { cwd: folder });
      const gitRoot = rootStdout.trim() || folder;
      const remotes = [
        { name: 'upstream', url: await this.remoteUrl('upstream', gitRoot, exec) },
        { name: 'origin', url: await this.remoteUrl('origin', gitRoot, exec) },
        ...(await this.remoteUrls(gitRoot, exec)).map((url) => ({ name: 'remote', url }))
      ].filter((remote): remote is { name: string; url: string } => Boolean(remote.url));
      const repos = new Map<string, RepoCandidate>();
      for (const remote of remotes) {
        const slug = this.parseGitHubSlug(remote.url);
        if (slug) {
          repos.set(slug, { slug, folder: gitRoot, remote: remote.name });
        }
      }
      return [...repos.values()];
    } catch {
      return [];
    }
  }

  private static async remoteUrl(
    remote: string,
    cwd: string,
    exec: (
      file: string,
      args: readonly string[],
      options: { cwd: string }
    ) => Promise<{ stdout: string; stderr: string }>
  ): Promise<string | undefined> {
    try {
      const { stdout } = await exec('git', ['remote', 'get-url', remote], { cwd });
      return stdout.trim() || undefined;
    } catch {
      return undefined;
    }
  }

  private static async remoteUrls(
    cwd: string,
    exec: (
      file: string,
      args: readonly string[],
      options: { cwd: string }
    ) => Promise<{ stdout: string; stderr: string }>
  ): Promise<string[]> {
    try {
      const { stdout } = await exec('git', ['remote', '-v'], { cwd });
      return stdout
        .split(/\r?\n/)
        .map((line) => line.trim().split(/\s+/)[1])
        .filter((url): url is string => Boolean(url));
    } catch {
      return [];
    }
  }

  private static parseGitHubSlug(url: string): string | undefined {
    const match =
      url.match(/github\.com[:/]([^/\s]+\/[^/\s]+?)(?:\.git)?(?:[/#?].*)?$/) ??
      url.match(/github\.com\/([^/\s]+\/[^/\s]+?)(?:\.git)?(?:[/#?].*)?$/);
    return match?.[1]?.replace(/\.git$/, '');
  }

  invalidateCache(path?: string): void {
    if (path) {
      this.cache.delete(path);
      return;
    }
    this.cache.clear();
  }
}
