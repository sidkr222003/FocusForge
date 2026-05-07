import { WeeklyReport } from '../issueLog/types';

export class HtmlRenderer {
  static render(report: WeeklyReport): string {
    const issues = report.issuesWorkedOn
      .map((entry) => {
        const labels = entry.issue.labels.map((l) => `<span class="label">${l.name}</span>`).join(' ');
        const changes = entry.changeSummary.map((c) => `<li>${c}</li>`).join('');
        const files = entry.filesTouched.map((f) => `<li><code>${f}</code></li>`).join('');
        return `
<article>
  <h3><a href="${entry.issue.htmlUrl}">${entry.repoSlug}#${entry.issue.number}</a> - ${entry.issue.title}</h3>
  <p><strong>Status:</strong> ${entry.finalStatus} | <strong>Completed:</strong> ${entry.completedAt}</p>
  <p>${labels}</p>
  <p>${entry.outcomeNote}</p>
  ${changes ? `<ul>${changes}</ul>` : ''}
  ${files ? `<ul>${files}</ul>` : ''}
</article>`;
      })
      .join('');
    const projects = (report.topProjects ?? [])
      .map((p) => `<li><strong>${p.project}</strong>: ${(p.minutes / 60).toFixed(1)}h</li>`)
      .join('');
    const languages = (report.topLanguages ?? [])
      .map((l) => `<li><strong>${l.language}</strong>: ${(l.minutes / 60).toFixed(1)}h</li>`)
      .join('');

    return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Weekly Focus Report</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; margin: 24px; color: #1f2328; }
    article { border-top: 1px solid #d0d7de; padding: 12px 0; }
    .label { background: #ddf4ff; color: #0969da; padding: 2px 6px; border-radius: 12px; margin-right: 6px; font-size: 12px; }
  </style>
</head>
<body>
  <h1>Weekly Focus Report (${report.weekStart} -> ${report.weekEnd})</h1>
  <p>Total sessions: ${report.totalSessions} | Total focused time: ${(report.totalMinutes / 60).toFixed(1)}h | Pomodoros: ${report.pomodorosCompleted ?? 0} | Commits: ${report.totalCommits ?? 0}</p>
  <h2>Top projects</h2>
  ${projects ? `<ul>${projects}</ul>` : '<p>No project data yet.</p>'}
  <h2>Top languages</h2>
  ${languages ? `<ul>${languages}</ul>` : '<p>No language data yet.</p>'}
  ${issues || '<p>No issues logged this week.</p>'}
</body>
</html>`;
  }
}
