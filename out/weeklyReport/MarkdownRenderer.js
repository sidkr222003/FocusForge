"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MarkdownRenderer = void 0;
class MarkdownRenderer {
    static render(report) {
        let md = `# Weekly Focus Report\n\n`;
        md += `**Week:** ${report.weekStart} -> ${report.weekEnd}  \n`;
        md += `**Total sessions:** ${report.totalSessions}  \n`;
        md += `**Total focused time:** ${(report.totalMinutes / 60).toFixed(1)}h  \n`;
        md += `**Average focus score:** ${report.avgFocusScore.toFixed(1)}\n\n`;
        md += `**Pomodoros completed:** ${report.pomodorosCompleted ?? 0}  \n`;
        md += `**Commits logged:** ${report.totalCommits ?? 0}\n\n`;
        md += this.renderTopList('Top projects', report.topProjects ?? [], 'project');
        md += this.renderTopList('Top languages', report.topLanguages ?? [], 'language');
        md += this.renderIssues(report.issuesWorkedOn);
        return md;
    }
    static renderTopList(title, entries, labelKey) {
        if (!entries.length) {
            return `## ${title}\n\n_No data yet._\n\n`;
        }
        let md = `## ${title}\n\n`;
        for (const entry of entries) {
            md += `- **${entry[labelKey]}:** ${((Number(entry.minutes) || 0) / 60).toFixed(1)}h\n`;
        }
        return `${md}\n`;
    }
    static renderIssues(entries) {
        if (entries.length === 0) {
            return `## Issues worked on\n\n_No issues logged this week._\n\n`;
        }
        const statusText = {
            shipped: 'Shipped',
            'partially-fixed': 'Partial fix',
            investigated: 'Investigated',
            unblocked: 'Unblocked',
            open: 'Still open'
        };
        let md = `## Issues worked on\n\n`;
        md += `> Copy-paste ready for standups, PR descriptions, or academic submission logs.\n\n`;
        for (const entry of entries) {
            const { issue, repoSlug, sessionsCount, totalMinutes, finalStatus, outcomeNote, completedAt, filesTouched, changeSummary } = entry;
            const link = `[${repoSlug}#${issue.number}](${issue.htmlUrl})`;
            const labelTags = issue.labels.map((l) => `\`${l.name}\``).join(' ');
            md += `### ${link} - ${issue.title}\n\n`;
            md += `**Status:** ${statusText[finalStatus] ?? finalStatus}  \n`;
            md += `**Completed:** ${completedAt}  \n`;
            md += `**Time invested:** ${(totalMinutes / 60).toFixed(1)}h across ${sessionsCount} session${sessionsCount !== 1 ? 's' : ''}  \n`;
            if (labelTags) {
                md += `**Labels:** ${labelTags}  \n`;
            }
            md += `\n`;
            if (outcomeNote) {
                md += `**Outcome:** ${outcomeNote}\n\n`;
            }
            if (changeSummary.length) {
                md += `**What changed:**\n`;
                for (const bullet of changeSummary) {
                    md += `- ${bullet}\n`;
                }
                md += `\n`;
            }
            if (filesTouched.length) {
                md += `**Files:**\n`;
                for (const file of filesTouched) {
                    md += `- \`${file}\`\n`;
                }
                md += `\n`;
            }
            md += `---\n\n`;
        }
        return md;
    }
}
exports.MarkdownRenderer = MarkdownRenderer;
//# sourceMappingURL=MarkdownRenderer.js.map