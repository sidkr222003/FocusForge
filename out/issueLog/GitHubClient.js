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
const BASE = 'https://api.github.com';
class GitHubClient {
    constructor(getToken) {
        this.getToken = getToken;
        this.cache = new Map();
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
    static async detectRepo() {
        const folder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        if (!folder) {
            return undefined;
        }
        try {
            const { execFile } = await Promise.resolve().then(() => __importStar(require('node:child_process')));
            const { promisify } = await Promise.resolve().then(() => __importStar(require('node:util')));
            const exec = promisify(execFile);
            const { stdout } = await exec('git', ['remote', 'get-url', 'origin'], { cwd: folder });
            const url = stdout.trim();
            const match = url.match(/github\.com[:/](.+?)(?:\.git)?$/) ??
                url.match(/github\.com\/(.+?)(?:\.git)?$/);
            return match?.[1];
        }
        catch {
            return undefined;
        }
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