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
  assignees: []
};

const el = (id) => document.getElementById(id);

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

function renderIssues(list) {
  const html = list
    .map((issue) => {
      const labels = issue.labels
        .map((l) => `<span class="label" style="background:#${l.color}22;color:#${l.color}">${escapeHtml(l.name)}</span>`)
        .join('');
      return `<button class="issue-row" data-number="${issue.number}">
        <div class="issue-title">#${issue.number} - ${escapeHtml(issue.title)}</div>
        <div class="issue-meta">${labels} ${relative(issue.createdAt)} | ${issue.state} | comments ${issue.comments}</div>
      </button>`;
    })
    .join('');
  el('issuesList').innerHTML = html || '<div class="hint">No issues found.</div>';
  document.querySelectorAll('.issue-row').forEach((row) => {
    row.addEventListener('click', () => {
      const number = Number(row.getAttribute('data-number'));
      vscode.postMessage({ type: 'loadIssueDetail', number });
      vscode.postMessage({ type: 'loadComments', number });
    });
  });
}

function renderIssueDetail(issue) {
  state.issue = issue;
  el('listView').classList.add('hidden');
  el('detailView').classList.remove('hidden');
  el('detailTitle').textContent = `#${issue.number} - ${issue.title}`;
  el('titleInput').value = issue.title;
  el('bodyInput').value = issue.body || '';
  el('detailBody').textContent = issue.body || '(no description)';
  el('detailMeta').textContent = `${issue.state.toUpperCase()} | opened ${new Date(issue.createdAt).toLocaleString()} | updated ${new Date(issue.updatedAt).toLocaleString()}`;
  el('closeIssueBtn').classList.toggle('hidden', issue.state !== 'open');
  el('reopenIssueBtn').classList.toggle('hidden', issue.state === 'open');
  state.editedLabels = issue.labels.map((l) => l.name);
  renderCurrentLabels();
  renderCurrentAssignees();
  initTimePicker();
}

function renderCurrentLabels() {
  const issue = state.issue;
  if (!issue) return;
  el('currentLabels').innerHTML = state.editedLabels
    .map((label) => {
      const full = state.labels.find((l) => l.name === label);
      const color = full ? full.color : '888888';
      return `<span class="label" style="background:#${color}22;color:#${color}">${escapeHtml(label)}</span>`;
    })
    .join('');
}

function renderCurrentAssignees() {
  if (!state.issue) return;
  const names = state.issue.assignees.map((a) => a.login);
  el('currentAssignees').innerHTML = names.length ? names.map((n) => `<span class="label">${escapeHtml(n)}</span>`).join('') : '<span class="hint">Unassigned</span>';
}

function renderComments(comments) {
  el('conversation').innerHTML = comments
    .map(
      (c) => `<div class="comment">
      <div class="comment-head"><img class="avatar" src="${c.author.avatarUrl}" /> ${escapeHtml(c.author.login)} <span>${new Date(c.createdAt).toLocaleString()}</span></div>
      <div>${escapeHtml(c.body)}</div>
    </div>`
    )
    .join('');
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
      el('repoSelect').innerHTML = `<option value="${state.repo}">${state.repo || 'No repository detected'}</option>`;
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
    case 'error':
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

el('searchInput').addEventListener('input', () => {
  vscode.postMessage({ type: 'searchIssues', query: el('searchInput').value });
});

el('loadMoreBtn').addEventListener('click', () => {
  vscode.postMessage({ type: 'loadIssues', repo: state.repo, state: el('stateFilter').value, labels: el('labelsFilter').value, page: state.page + 1 });
});

el('newIssueBtn').addEventListener('click', () => vscode.postMessage({ type: 'newIssue' }));
el('backBtn').addEventListener('click', () => {
  el('detailView').classList.add('hidden');
  el('listView').classList.remove('hidden');
});

el('detailTitle').addEventListener('dblclick', () => {
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
  el('bodyInput').classList.remove('hidden');
  el('detailBody').classList.add('hidden');
  el('bodyInput').focus();
});

el('bodyInput').addEventListener('blur', () => {
  if (!state.issue) return;
  vscode.postMessage({ type: 'updateBody', number: state.issue.number, body: el('bodyInput').value });
  el('detailBody').classList.remove('hidden');
  el('bodyInput').classList.add('hidden');
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

vscode.postMessage({ type: 'ready' });