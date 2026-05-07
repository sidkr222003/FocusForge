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
exports.GitHubClient = void 0;
const vscode = __importStar(require("vscode"));
const node_fs_1 = require("node:fs");
const node_path_1 = require("node:path");
const BASE = 'https://api.github.com';
class GitHubClient {
    constructor(getToken) {
        this.getToken = getToken;
        this.cache = new Map();
    }
    async hasToken() {
        return Boolean(await this.getToken());
    }
    async request(path, opts = {}) {
        const token = await this.getToken();
        const headers = {
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
            return cached.data;
        }
        if (!res.ok) {
            const msg = await res.json().catch(() => ({ message: res.statusText }));
            throw new Error(`GitHub ${res.status}: ${msg.message ?? res.statusText}`);
        }
        const data = (await res.json());
        const etag = res.headers.get('etag') ?? '';
        if (etag && (!opts.method || opts.method === 'GET')) {
            this.cache.set(path, { data, etag, ts: Date.now() });
        }
        return data;
    }
    toIssue(i) {
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
    toComment(c) {
        return {
            id: c.id,
            body: c.body,
            author: { login: c.user.login, avatarUrl: c.user.avatar_url },
            createdAt: c.created_at,
            updatedAt: c.updated_at
        };
    }
    async listIssues(repo, opts = {}) {
        const params = new URLSearchParams({
            state: opts.state ?? 'open',
            per_page: '30',
            page: String(opts.page ?? 1)
        });
        if (opts.labels) {
            params.set('labels', opts.labels);
        }
        const issues = await this.request(`/repos/${repo}/issues?${params.toString()}`);
        return issues.filter((i) => !i.pull_request).map((i) => this.toIssue(i));
    }
    async getIssue(repo, number) {
        const issue = await this.request(`/repos/${repo}/issues/${number}`);
        return this.toIssue(issue);
    }
    async getComments(repo, number) {
        const comments = await this.request(`/repos/${repo}/issues/${number}/comments?per_page=100`);
        return comments.map((c) => this.toComment(c));
    }
    async addComment(repo, number, body) {
        const comment = await this.request(`/repos/${repo}/issues/${number}/comments`, {
            method: 'POST',
            body: { body }
        });
        return this.toComment(comment);
    }
    async createIssue(repo, input) {
        const issue = await this.request(`/repos/${repo}/issues`, {
            method: 'POST',
            body: {
                title: input.title,
                body: input.body ?? '',
                labels: input.labels ?? []
            }
        });
        return this.toIssue(issue);
    }
    async updateIssue(repo, number, patch) {
        const issue = await this.request(`/repos/${repo}/issues/${number}`, {
            method: 'PATCH',
            body: patch
        });
        return this.toIssue(issue);
    }
    async listLabels(repo) {
        const labels = await this.request(`/repos/${repo}/labels?per_page=100`);
        return labels.map((l) => ({ name: l.name, color: l.color }));
    }
    async listAssignees(repo) {
        const users = await this.request(`/repos/${repo}/assignees?per_page=100`);
        return users.map((u) => ({ login: u.login, avatarUrl: u.avatar_url }));
    }
    async listRepositories() {
        const repos = await this.request('/user/repos?per_page=100&sort=updated&affiliation=owner,collaborator,organization_member');
        return repos.filter((repo) => !repo.archived && !repo.disabled).map((repo) => repo.full_name);
    }
    async getRepoAccess(repo) {
        const isAuthenticated = await this.hasToken();
        if (!isAuthenticated) {
            return { canEdit: false, canComment: false, isAuthenticated };
        }
        try {
            const data = await this.request(`/repos/${repo}`);
            const permissions = data.permissions ?? {};
            const canEdit = Boolean(permissions.admin || permissions.maintain || permissions.push || permissions.triage);
            return { canEdit, canComment: true, isAuthenticated };
        }
        catch {
            return { canEdit: false, canComment: true, isAuthenticated };
        }
    }
    static async detectRepo() {
        return (await this.detectRepoCandidates())[0]?.slug;
    }
    static async detectRepos() {
        return (await this.detectRepoCandidates()).map((repo) => repo.slug);
    }
    static async detectRepoCandidates() {
        const folders = await this.getCandidateFolders();
        if (!folders.length) {
            return [];
        }
        const { execFile } = await Promise.resolve().then(() => __importStar(require('node:child_process')));
        const { promisify } = await Promise.resolve().then(() => __importStar(require('node:util')));
        const exec = promisify(execFile);
        const repos = new Map();
        for (const folder of folders) {
            for (const repo of await this.detectReposFromFolder(folder, exec)) {
                if (!repos.has(repo.slug)) {
                    repos.set(repo.slug, repo);
                }
            }
        }
        return [...repos.values()];
    }
    static getGitExtensionStatus() {
        try {
            const extension = vscode.extensions.getExtension('vscode.git');
            if (!extension) {
                return {
                    available: false,
                    active: false,
                    message: "VS Code's built-in Git extension is not available."
                };
            }
            const repositories = extension.isActive
                ? extension.exports?.getAPI?.(1)?.repositories?.length ?? 0
                : 0;
            return { available: true, active: extension.isActive, repositories };
        }
        catch (error) {
            return {
                available: false,
                active: false,
                message: error instanceof Error ? error.message : String(error)
            };
        }
    }
    static async activateGitExtension() {
        try {
            const extension = vscode.extensions.getExtension('vscode.git');
            if (!extension) {
                await vscode.commands.executeCommand('workbench.view.scm').then(undefined, () => undefined);
                return this.getGitExtensionStatus();
            }
            if (!extension.isActive) {
                await extension.activate();
            }
            await vscode.commands.executeCommand('workbench.view.scm').then(undefined, () => undefined);
            await new Promise((resolve) => setTimeout(resolve, 350));
            return this.getGitExtensionStatus();
        }
        catch (error) {
            return {
                available: false,
                active: false,
                message: error instanceof Error ? error.message : String(error)
            };
        }
    }
    static async getCandidateFolders() {
        const folders = new Set();
        for (const folder of await this.getEditorGitFolders()) {
            folders.add(folder);
        }
        for (const folder of vscode.workspace.workspaceFolders ?? []) {
            if ((0, node_fs_1.existsSync)(vscode.Uri.joinPath(folder.uri, '.git').fsPath)) {
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
        }
        catch {
            // Shell-based detection above is the primary path; Git extension discovery is optional.
        }
        return [...folders];
    }
    static async getEditorGitFolders() {
        const roots = new Set();
        const uris = [
            vscode.window.activeTextEditor?.document.uri,
            ...vscode.window.visibleTextEditors.map((editor) => editor.document.uri)
        ];
        for (const uri of uris) {
            if (uri?.scheme !== 'file') {
                continue;
            }
            const root = await this.gitRootForPath((0, node_path_1.dirname)(uri.fsPath));
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
    static async gitRootForPath(folder) {
        try {
            const { execFile } = await Promise.resolve().then(() => __importStar(require('node:child_process')));
            const { promisify } = await Promise.resolve().then(() => __importStar(require('node:util')));
            const exec = promisify(execFile);
            const { stdout } = await exec('git', ['rev-parse', '--show-toplevel'], { cwd: folder });
            return stdout.trim() || undefined;
        }
        catch {
            return undefined;
        }
    }
    static async findGitChildren(root, depth = 1) {
        const found = [];
        try {
            const entries = await vscode.workspace.fs.readDirectory(root);
            for (const [name, type] of entries) {
                if (name.startsWith('.') || type !== vscode.FileType.Directory) {
                    continue;
                }
                const child = vscode.Uri.joinPath(root, name);
                if ((0, node_fs_1.existsSync)(vscode.Uri.joinPath(child, '.git').fsPath)) {
                    found.push(child.fsPath);
                }
                else if (depth < 3) {
                    found.push(...(await this.findGitChildren(child, depth + 1)));
                }
            }
        }
        catch {
            return found;
        }
        return found;
    }
    static async detectReposFromFolder(folder, exec) {
        try {
            const { stdout: rootStdout } = await exec('git', ['rev-parse', '--show-toplevel'], { cwd: folder });
            const gitRoot = rootStdout.trim() || folder;
            const remotes = [
                { name: 'upstream', url: await this.remoteUrl('upstream', gitRoot, exec), source: 'workspace' },
                { name: 'origin', url: await this.remoteUrl('origin', gitRoot, exec), source: 'workspace' },
                ...(await this.remoteUrls(gitRoot, exec)).map((remote) => ({ ...remote, source: 'remote-v' }))
            ].filter((remote) => Boolean(remote.url));
            const repos = new Map();
            for (const remote of remotes) {
                const slug = this.parseGitHubSlug(remote.url);
                if (slug) {
                    repos.set(slug, { slug, folder: gitRoot, remote: remote.name, source: remote.source });
                }
            }
            return [...repos.values()];
        }
        catch {
            return this.detectReposFromRemoteV(folder, exec);
        }
    }
    static async remoteUrl(remote, cwd, exec) {
        try {
            const { stdout } = await exec('git', ['remote', 'get-url', remote], { cwd });
            return stdout.trim() || undefined;
        }
        catch {
            return undefined;
        }
    }
    static async remoteUrls(cwd, exec) {
        try {
            const { stdout } = await exec('git', ['remote', '-v'], { cwd });
            return stdout
                .split(/\r?\n/)
                .map((line) => {
                const [name, url] = line.trim().split(/\s+/);
                return { name: name || 'remote', url };
            })
                .filter((remote) => Boolean(remote.url));
        }
        catch {
            return [];
        }
    }
    static async detectReposFromRemoteV(folder, exec) {
        const repos = new Map();
        for (const remote of await this.remoteUrls(folder, exec)) {
            const slug = this.parseGitHubSlug(remote.url);
            if (slug) {
                repos.set(slug, {
                    slug,
                    folder,
                    remote: remote.name,
                    source: 'remote-v'
                });
            }
        }
        return [...repos.values()];
    }
    static parseGitHubSlug(url) {
        const match = url.match(/github\.com[:/]([^/\s]+\/[^/\s]+?)(?:\.git)?(?:[/#?].*)?$/) ??
            url.match(/github\.com\/([^/\s]+\/[^/\s]+?)(?:\.git)?(?:[/#?].*)?$/);
        return match?.[1]?.replace(/\.git$/, '');
    }
    invalidateCache(path) {
        if (path) {
            this.cache.delete(path);
            return;
        }
        this.cache.clear();
    }
}
exports.GitHubClient = GitHubClient;
//# sourceMappingURL=GitHubClient.js.map