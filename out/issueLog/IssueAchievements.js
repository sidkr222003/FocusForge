"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.IssueAchievements = void 0;
const rules = [
    {
        id: 'first-issue',
        title: 'First Issue Logged',
        matches: (logs) => logs.length >= 1
    },
    {
        id: 'bug-crusher',
        title: 'Bug Crusher',
        matches: (logs) => logs.filter((l) => l.outcomeStatus === 'shipped').length >= 5
    },
    {
        id: 'night-owl',
        title: 'Night Owl',
        matches: (logs) => logs.some((l) => new Date(l.completedAt).getHours() < 5)
    }
];
exports.IssueAchievements = {
    unlock(logs) {
        return rules.filter((r) => r.matches(logs)).map((r) => r.title);
    }
};
//# sourceMappingURL=IssueAchievements.js.map