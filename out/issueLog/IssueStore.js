"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.IssueStore = void 0;
const LOG_KEY = 'devToolkit.issueCompletionLogs';
const REPO_KEY = 'devToolkit.lastKnownRepo';
const MAX_LOGS = 500;
class IssueStore {
    constructor(ctx) {
        this.ctx = ctx;
    }
    getAll() {
        return this.ctx.globalState.get(LOG_KEY) ?? [];
    }
    getByRange(fromMs, toMs) {
        return this.getAll().filter((l) => l.completedAt >= fromMs && l.completedAt <= toMs);
    }
    getByIssue(repoSlug, issueNumber) {
        return this.getAll().find((l) => l.repoSlug === repoSlug && l.issueNumber === issueNumber);
    }
    async save(log) {
        const existing = this.getAll().filter((l) => !(l.issueNumber === log.issueNumber && l.repoSlug === log.repoSlug));
        const trimmed = [...existing, log].sort((a, b) => b.completedAt - a.completedAt).slice(0, MAX_LOGS);
        await this.ctx.globalState.update(LOG_KEY, trimmed);
    }
    async getToken() {
        return this.ctx.secrets.get('devToolkit.github.token');
    }
    async setToken(token) {
        await this.ctx.secrets.store('devToolkit.github.token', token);
    }
    async clearToken() {
        await this.ctx.secrets.delete('devToolkit.github.token');
    }
    getLastRepo() {
        return this.ctx.globalState.get(REPO_KEY);
    }
    async setLastRepo(repo) {
        await this.ctx.globalState.update(REPO_KEY, repo);
    }
}
exports.IssueStore = IssueStore;
//# sourceMappingURL=IssueStore.js.map