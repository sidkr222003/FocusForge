const vscode = acquireVsCodeApi();

const state = {
  repo: '',
  issues: [],
  filteredIssues: [],
  page: 1,
  hasMore: false,
  issue: null,
  labels: [],
  editedLabels: [],
  assignees: [],
  canEdit: false,
  canComment: false,
  isAuthenticated: false,
  repoOptions: new Map()
};

const el = (id) => document.getElementById(id);
const markdown = window.markdownit?.({
  html: false,
  linkify: true,
  breaks: true
});

function escapeHtml(s) {
  return String(s)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function relative(iso) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  if (mins < 1440) return `${Math.round(mins / 60)}h ago`;
  return `${Math.round(mins / 1440)}d ago`;
}

function renderMarkdown(text) {
  const value = String(text || '').trim();
  if (!value) {
    return '<p class="empty-copy">No description provided.</p>';
  }
  return markdown ? markdown.render(value) : `<p>${escapeHtml(value)}</p>`;
}

function renderIssues(list) {
  const html = list
    .map((issue) => {
      const labels = issue.labels
        .slice(0, 4)
        .map((l) => `<span class="label" style="--label-color:#${l.color}">${escapeHtml(l.name)}</span>`)
        .join('');
      const extraLabels = issue.labels.length > 4 ? `<span class="label label-muted">+${issue.labels.length - 4}</span>` : '';
      return `<button class="issue-row" data-number="${issue.number}">
        <span class="codicon codicon-issue-${issue.state === 'open' ? 'opened' : 'closed'} issue-state-icon"></span>
        <span class="issue-content">
          <span class="issue-title">#${issue.number} ${escapeHtml(issue.title)}</span>
          <span class="issue-meta">
            <span>${relative(issue.createdAt)}</span>
            <span>${issue.state}</span>
            <span>${issue.comments} comments</span>
          </span>
          <span class="issue-labels">${labels}${extraLabels}</span>
        </span>
      </button>`;
    })
    .join('');
  el('issuesList').innerHTML = html || '<div class="empty-state"><span class="codicon codicon-issues"></span><strong>No issues found</strong><span>Try another state, label, or repository.</span></div>';
  document.querySelectorAll('.issue-row').forEach((row) => {
    row.addEventListener('click', () => {
      const number = Number(row.getAttribute('data-number'));
      vscode.postMessage({ type: 'loadIssueDetail', number });
      vscode.postMessage({ type: 'loadComments', number });
    });
  });
}

function renderRepos(repos, selectedRepo = state.repo, repoOptions = []) {
  state.repoOptions = new Map((repoOptions || []).map((repo) => [repo.slug, repo]));
  const repoValues = (repos || []).map((repo) => typeof repo === 'string' ? repo : repo.slug).filter(Boolean);
  const uniqueRepos = Array.from(new Set([selectedRepo, ...repoValues].filter(Boolean)));
  state.repo = selectedRepo || '';
  if (uniqueRepos.length) {
    el('gitBanner').classList.add('hidden');
  }
  el('repoSelect').innerHTML = uniqueRepos.length
    ? `${state.repo ? '' : '<option value="">Select detected repo...</option>'}${uniqueRepos
        .map((repo) => {
          const option = state.repoOptions.get(repo);
          const label = option?.folder ? `${repo} — ${option.folder}` : repo;
          return `<option value="${escapeHtml(repo)}" ${repo === state.repo ? 'selected' : ''}>${escapeHtml(label)}</option>`;
        })
        .join('')}`
    : '<option value="">No repository detected</option>';
  renderRepoHint(uniqueRepos);
}

function renderRepoHint(repos = []) {
  if (!state.repo) {
    el('repoHint').textContent = 'Open a GitHub-backed workspace or connect GitHub to choose a repository.';
    return;
  }
  const option = state.repoOptions.get(state.repo);
  const folder = option?.folder ? ` · ${option.folder}` : '';
  const source = option?.source === 'remote-v'
    ? ` · git remote -v (${option.remote || 'remote'})`
    : option?.remote
      ? ` · ${option.remote}`
      : repos.includes(state.repo) ? ' · detected/account' : '';
  el('repoHint').textContent = `${state.repo}${source}${folder}`;
}

function renderIssueDetail(issue) {
  state.issue = issue;
  el('listView').classList.add('hidden');
  el('detailView').classList.remove('hidden');
  el('detailTitle').textContent = issue.title;
  el('detailNumber').textContent = `#${issue.number}`;
  el('titleInput').value = issue.title;
  el('bodyInput').value = issue.body || '';
  el('detailBody').innerHTML = renderMarkdown(issue.body);
  el('detailMeta').innerHTML = `<span class="status-pill ${issue.state === 'open' ? 'status-open' : 'status-closed'}">${issue.state}</span><span>Opened ${new Date(issue.createdAt).toLocaleString()}</span><span>Updated ${relative(issue.updatedAt)}</span>`;
  el('closeIssueBtn').classList.toggle('hidden', !state.canEdit || issue.state !== 'open');
  el('reopenIssueBtn').classList.toggle('hidden', !state.canEdit || issue.state === 'open');
  state.editedLabels = issue.labels.map((l) => l.name);
  renderCurrentLabels();
  renderCurrentAssignees();
  applyAccess();
  initTimePicker();
}

function renderCurrentLabels() {
  const issue = state.issue;
  if (!issue) return;
  el('currentLabels').innerHTML = state.editedLabels
    .map((label) => {
      const full = state.labels.find((l) => l.name === label);
      const color = full ? full.color : '888888';
      return `<span class="label" style="--label-color:#${color}">${escapeHtml(label)}</span>`;
    })
    .join('');
}

function renderCurrentAssignees() {
  if (!state.issue) return;
  const names = state.issue.assignees.map((a) => a.login);
  el('currentAssignees').innerHTML = names.length ? names.map((n) => `<span class="assignee-pill">${escapeHtml(n)}</span>`).join('') : '<span class="hint">Unassigned</span>';
}

function renderComments(comments) {
  el('conversation').innerHTML = comments.length ? comments
    .map(
      (c) => `<div class="comment">
      <div class="comment-head"><img class="avatar" src="${c.author.avatarUrl}" /> ${escapeHtml(c.author.login)} <span>${new Date(c.createdAt).toLocaleString()}</span></div>
      <div class="markdown-body">${renderMarkdown(c.body)}</div>
    </div>`
    )
    .join('') : '<div class="hint">No comments yet.</div>';
}

function applyAccess() {
  document.querySelectorAll('.edit-control').forEach((node) => node.classList.toggle('hidden', !state.canEdit));
  el('commentInput').disabled = !state.canComment;
  el('commentInput').placeholder = state.canComment ? 'Leave a comment...' : 'Connect GitHub to comment on this issue...';
  el('commentBtn').classList.toggle('hidden', !state.canComment);
  el('workOnIssueBtn').classList.toggle('hidden', !state.canComment);
  el('connectForCommentBtn').classList.toggle('hidden', state.canComment);

  if (state.issue) {
    el('closeIssueBtn').classList.toggle('hidden', !state.canEdit || state.issue.state !== 'open');
    el('reopenIssueBtn').classList.toggle('hidden', !state.canEdit || state.issue.state === 'open');
  }
}

function renderGitStatus(status) {
  const shouldShow = status && !status.active && !state.repo;
  el('gitBanner').classList.toggle('hidden', !shouldShow);
}

function addBullet(value = '') {
  const input = document.createElement('input');
  input.className = 'text-input bullet-input';
  input.placeholder = 'What changed...';
  input.value = value;
  el('changeBullets').appendChild(input);
}

function initTimePicker() {
  const now = new Date();
  el('completedDate').value = now.toISOString().slice(0, 10);
  el('completedTime').value = now.toTimeString().slice(0, 5);
  updateTimeHint();
  if (!el('changeBullets').children.length) {
    addBullet();
    addBullet();
  }
}

function getCompletedAtMs() {
  return new Date(`${el('completedDate').value}T${el('completedTime').value}`).getTime();
}

function updateTimeHint() {
  const diff = Date.now() - getCompletedAtMs();
  const mins = Math.round(diff / 60000);
  const hint = mins < 1 ? 'just now' : mins < 60 ? `${mins}m ago` : mins < 1440 ? `${Math.round(mins / 60)}h ago` : `${Math.round(mins / 1440)}d ago`;
  el('timeHint').textContent = hint;
}

function saveLog() {
  if (!state.issue) return;
  const log = {
    issueNumber: state.issue.number,
    repoSlug: state.repo,
    issueTitle: state.issue.title,
    completedAt: getCompletedAtMs(),
    outcomeStatus: el('outcomeSelect').value,
    outcomeNote: el('outcomeNote').value.trim(),
    filesTouched: [],
    changeSummary: Array.from(document.querySelectorAll('.bullet-input')).map((i) => i.value.trim()).filter(Boolean),
    mood: Number(el('moodInput').value) || undefined,
    createdAt: Date.now()
  };
  vscode.postMessage({ type: 'saveCompletionLog', log });
}

window.addEventListener('message', (event) => {
  const msg = event.data;
  switch (msg.type) {
    case 'boot':
      state.repo = msg.repo || '';
      renderRepos([], state.repo);
      if (msg.showAuthBanner) {
        el('authBanner').classList.remove('hidden');
        // Show connect button initially; token form will be revealed on click
        el('tokenForm').classList.add('hidden');
        el('connectBtn').classList.remove('hidden');
        document.getElementById('connectBtn')?.addEventListener('click', () => {
          // Show token input form in the webview
          el('connectBtn').classList.add('hidden');
          el('tokenForm').classList.remove('hidden');
          // Also open token creation page for user convenience
          vscode.postMessage({ type: 'requestAuth' });
        });
        // Handle save token button
        document.getElementById('saveTokenBtn')?.addEventListener('click', () => {
          const token = el('tokenInput').value.trim();
          if (token) {
            vscode.postMessage({ type: 'submitToken', token });
            // Hide the auth banner after submitting token
            el('authBanner').classList.add('hidden');
            // Show loading state or feedback
            el('issuesList').innerHTML = '<div class="hint">Loading issues...</div>';
          }
        });
      } else {
        // Already authenticated - hide banner
        el('authBanner').classList.add('hidden');
      }
      break;
    case 'gitStatus':
      renderGitStatus(msg.status);
      break;
    case 'repoAccess':
      state.canEdit = Boolean(msg.access?.canEdit);
      state.canComment = Boolean(msg.access?.canComment);
      state.isAuthenticated = Boolean(msg.access?.isAuthenticated);
      applyAccess();
      break;
    case 'reposLoaded':
      renderRepos(msg.repos || [], msg.selectedRepo || state.repo, msg.repoOptions || []);
      break;
    case 'repoListError':
      renderRepos([], state.repo);
      break;
    case 'authUpdated':
      // Hide auth banner after successful authentication
      if (!msg.showAuthBanner) {
        el('authBanner').classList.add('hidden');
        // Re-bootstrap to load issues and labels
        vscode.postMessage({ type: 'ready' });
      }
      break;
    case 'issuesLoaded':
      state.repo = msg.repo;
      renderRepoHint();
      state.page = msg.page;
      state.hasMore = msg.hasMore;
      state.issues = msg.page === 1 ? msg.issues : [...state.issues, ...msg.issues];
      state.filteredIssues = state.issues;
      renderIssues(state.filteredIssues);
      el('loadMoreBtn').classList.toggle('hidden', !state.hasMore);
      break;
    case 'filterApplied':
      state.filteredIssues = msg.issues;
      renderIssues(state.filteredIssues);
      break;
    case 'issueDetail':
      renderIssueDetail(msg.issue);
      break;
    case 'commentsLoaded':
      renderComments(msg.comments);
      break;
    case 'commentPosted':
      el('commentInput').value = '';
      vscode.postMessage({ type: 'loadComments', number: state.issue.number });
      break;
    case 'issueUpdated':
      renderIssueDetail(msg.issue);
      vscode.postMessage({ type: 'loadIssues', repo: state.repo, state: el('stateFilter').value, labels: el('labelsFilter').value, page: 1 });
      break;
    case 'issueCreated':
      el('newIssueForm').classList.add('hidden');
      el('newIssueTitle').value = '';
      el('newIssueBody').value = '';
      el('newIssueLabels').value = '';
      state.issues = [msg.issue, ...state.issues.filter((issue) => issue.number !== msg.issue.number)];
      state.filteredIssues = state.issues;
      renderIssues(state.filteredIssues);
      renderIssueDetail(msg.issue);
      vscode.postMessage({ type: 'loadComments', number: msg.issue.number });
      break;
    case 'labelsLoaded':
      state.labels = msg.labels;
      break;
    case 'assigneesLoaded':
      state.assignees = msg.assignees;
      el('assigneeSelect').innerHTML = '<option value="">Select assignee</option>' + state.assignees.map((u) => `<option value="${escapeHtml(u.login)}">${escapeHtml(u.login)}</option>`).join('');
      break;
    case 'completionLog':
      if (msg.log) {
        el('logBadge').classList.remove('hidden');
        el('outcomeSelect').value = msg.log.outcomeStatus;
        const d = new Date(msg.log.completedAt);
        el('completedDate').value = d.toISOString().slice(0, 10);
        el('completedTime').value = d.toTimeString().slice(0, 5);
        el('outcomeNote').value = msg.log.outcomeNote;
        el('changeBullets').innerHTML = '';
        (msg.log.changeSummary || []).forEach(addBullet);
      }
      break;
    case 'reportGenerated':
      el('weeklyReportOutput').innerHTML = `<div class="hint">Report generated: <a href="${escapeHtml(String(msg.file))}">${escapeHtml(String(msg.file))}</a></div>`;
      break;
    case 'toast':
      el('repoHint').textContent = msg.message || '';
      break;
    case 'error':
      el('repoHint').textContent = '';
      el('issuesList').innerHTML = `<div class="hint">${escapeHtml(msg.message)}</div>`;
      break;
  }
});

el('stateFilter').addEventListener('change', () => {
  vscode.postMessage({ type: 'loadIssues', repo: state.repo, state: el('stateFilter').value, labels: el('labelsFilter').value, page: 1 });
});

el('labelsFilter').addEventListener('change', () => {
  vscode.postMessage({ type: 'loadIssues', repo: state.repo, state: el('stateFilter').value, labels: el('labelsFilter').value, page: 1 });
});

el('repoSelect').addEventListener('change', () => {
  state.repo = el('repoSelect').value;
  if (!state.repo) return;
  state.issues = [];
  state.filteredIssues = [];
  el('issuesList').innerHTML = '<div class="hint">Loading issues...</div>';
  vscode.postMessage({ type: 'loadIssues', repo: state.repo, state: el('stateFilter').value, labels: el('labelsFilter').value, page: 1 });
});

el('searchInput').addEventListener('input', () => {
  vscode.postMessage({ type: 'searchIssues', query: el('searchInput').value });
});

el('loadMoreBtn').addEventListener('click', () => {
  vscode.postMessage({ type: 'loadIssues', repo: state.repo, state: el('stateFilter').value, labels: el('labelsFilter').value, page: state.page + 1 });
});

el('newIssueBtn').addEventListener('click', () => {
  if (state.isAuthenticated) {
    el('newIssueForm').classList.toggle('hidden');
    el('newIssueTitle').focus();
    return;
  }
  vscode.postMessage({ type: 'newIssue' });
});
el('cancelCreateIssueBtn').addEventListener('click', () => el('newIssueForm').classList.add('hidden'));
el('createIssueBtn').addEventListener('click', () => {
  const title = el('newIssueTitle').value.trim();
  if (!title) {
    el('newIssueTitle').focus();
    return;
  }
  vscode.postMessage({
    type: 'createIssue',
    title,
    body: el('newIssueBody').value,
    labels: el('newIssueLabels').value
  });
});
el('openIssueBtn').addEventListener('click', () => {
  if (!state.issue) return;
  vscode.postMessage({ type: 'openIssueExternal', number: state.issue.number });
});
el('copyIssueBtn').addEventListener('click', () => {
  if (!state.issue) return;
  vscode.postMessage({ type: 'copyIssueLink', number: state.issue.number });
});
el('activateGitBtn').addEventListener('click', () => vscode.postMessage({ type: 'activateGit' }));
el('connectForCommentBtn').addEventListener('click', () => {
  el('authBanner').classList.remove('hidden');
  el('connectBtn').click();
});
el('backBtn').addEventListener('click', () => {
  el('detailView').classList.add('hidden');
  el('listView').classList.remove('hidden');
});

el('detailTitle').addEventListener('dblclick', () => {
  if (!state.canEdit) return;
  el('titleInput').classList.remove('hidden');
  el('detailTitle').classList.add('hidden');
  el('titleInput').focus();
});

el('titleInput').addEventListener('blur', () => {
  if (!state.issue) return;
  const title = el('titleInput').value.trim();
  if (!title) return;
  vscode.postMessage({ type: 'updateTitle', number: state.issue.number, title });
  el('detailTitle').classList.remove('hidden');
  el('titleInput').classList.add('hidden');
});

el('detailBody').addEventListener('dblclick', () => {
  if (!state.canEdit) return;
  el('bodyInput').classList.remove('hidden');
  el('detailBody').classList.add('hidden');
  el('bodyInput').focus();
});

el('bodyInput').addEventListener('blur', () => {
  if (!state.issue) return;
  vscode.postMessage({ type: 'updateBody', number: state.issue.number, body: el('bodyInput').value });
  el('detailBody').classList.remove('hidden');
  el('bodyInput').classList.add('hidden');
  el('detailBody').innerHTML = renderMarkdown(el('bodyInput').value);
});

el('editLabelsBtn').addEventListener('click', () => {
  const picker = el('labelsPicker');
  picker.classList.toggle('hidden');
  picker.innerHTML = state.labels
    .map((l) => `<label><input type="checkbox" value="${escapeHtml(l.name)}" ${state.editedLabels.includes(l.name) ? 'checked' : ''}/> ${escapeHtml(l.name)}</label>`)
    .join('<br/>');
  el('saveLabelsBtn').classList.remove('hidden');
});

el('saveLabelsBtn').addEventListener('click', () => {
  if (!state.issue) return;
  const checked = Array.from(el('labelsPicker').querySelectorAll('input:checked')).map((i) => i.value);
  state.editedLabels = checked;
  vscode.postMessage({ type: 'updateLabels', number: state.issue.number, labels: checked });
});

el('addAssigneeBtn').addEventListener('click', () => {
  if (!state.issue) return;
  const selected = el('assigneeSelect').value;
  if (!selected) return;
  const assignees = Array.from(new Set([...state.issue.assignees.map((a) => a.login), selected]));
  vscode.postMessage({ type: 'updateAssignees', number: state.issue.number, assignees });
});

el('commentBtn').addEventListener('click', () => {
  if (!state.issue) return;
  const body = el('commentInput').value.trim();
  if (!body) return;
  vscode.postMessage({ type: 'postComment', number: state.issue.number, body });
});

el('workOnIssueBtn').addEventListener('click', () => {
  if (!state.issue || !state.canComment) return;
  vscode.postMessage({
    type: 'postComment',
    number: state.issue.number,
    body: 'I would like to work on this issue.'
  });
});

el('closeIssueBtn').addEventListener('click', () => {
  if (!state.issue) return;
  vscode.postMessage({ type: 'closeIssue', number: state.issue.number });
});

el('reopenIssueBtn').addEventListener('click', () => {
  if (!state.issue) return;
  vscode.postMessage({ type: 'reopenIssue', number: state.issue.number });
});

el('addBulletBtn').addEventListener('click', () => addBullet());
el('saveLogBtn').addEventListener('click', saveLog);
el('setNowBtn').addEventListener('click', initTimePicker);
el('completedDate').addEventListener('change', updateTimeHint);
el('completedTime').addEventListener('change', updateTimeHint);

// Tab switching logic
document.querySelectorAll('.tab').forEach((tab) => {
  tab.addEventListener('click', () => {
    const tabName = tab.getAttribute('data-tab');
    document.querySelectorAll('.tab').forEach((t) => t.classList.remove('tab-active'));
    document.querySelectorAll('.panel').forEach((p) => p.classList.add('hidden'));
    tab.classList.add('tab-active');
    if (tabName === 'issues') {
      el('issuesPanel').classList.remove('hidden');
    } else if (tabName === 'weekly') {
      el('weeklyPanel').classList.remove('hidden');
    }
  });
});

// Weekly report buttons
el('generateCurrentWeekBtn')?.addEventListener('click', () => {
  vscode.postMessage({ type: 'generateCurrentWeekReport' });
});

el('generateLastWeekBtn')?.addEventListener('click', () => {
  vscode.postMessage({ type: 'generateLastWeekReport' });
});

vscode.postMessage({ type: 'ready' });
