import { IssueCompletionLog } from './types';

interface AchievementRule {
  id: string;
  title: string;
  matches: (logs: IssueCompletionLog[]) => boolean;
}

const rules: AchievementRule[] = [
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

export const IssueAchievements = {
  unlock(logs: IssueCompletionLog[]): string[] {
    return rules.filter((r) => r.matches(logs)).map((r) => r.title);
  }
};