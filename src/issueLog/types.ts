export type IssueStatus = 'shipped' | 'partially-fixed' | 'investigated' | 'unblocked' | 'open';

export interface GitHubLabel {
  name: string;
  color: string;
}

export interface GitHubUser {
  login: string;
  avatarUrl: string;
}

export interface GitHubComment {
  id: number;
  author: GitHubUser;
  body: string;
  createdAt: string;
  updatedAt: string;
}

export interface GitHubIssue {
  number: number;
  title: string;
  body: string;
  state: 'open' | 'closed';
  htmlUrl: string;
  labels: GitHubLabel[];
  assignees: GitHubUser[];
  author: GitHubUser;
  createdAt: string;
  updatedAt: string;
  comments: number;
  commentsData?: GitHubComment[];
}

export interface IssueCompletionLog {
  issueNumber: number;
  repoSlug: string;
  issueTitle: string;
  sessionId?: string;
  completedAt: number;
  outcomeStatus: IssueStatus;
  outcomeNote: string;
  filesTouched: string[];
  changeSummary: string[];
  mood?: 1 | 2 | 3 | 4 | 5;
  createdAt: number;
}

export interface WeeklyReport {
  weekStart: string;
  weekEnd: string;
  totalMinutes: number;
  totalSessions: number;
  avgFocusScore: number;
  topLanguages: Array<{ language: string; minutes: number }>;
  issuesWorkedOn: Array<{
    issue: Pick<GitHubIssue, 'number' | 'title' | 'htmlUrl' | 'labels'>;
    repoSlug: string;
    sessionsCount: number;
    totalMinutes: number;
    finalStatus: IssueStatus;
    outcomeNote: string;
    completedAt: string;
    filesTouched: string[];
    changeSummary: string[];
  }>;
  achievementsUnlocked: string[];
  goalPerformance: {
    daysHit: number;
    daysMissed: number;
    bestDay: string;
    currentStreak: number;
  };
}

export interface SessionEntry {
  id: string;
  startedAt: number;
  endedAt: number;
  totalMinutes: number;
  focusScore?: number;
  language?: string;
}