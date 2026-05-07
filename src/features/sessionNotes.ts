import type { SessionRecord } from "../sessionTimer";

export interface SessionNote {
  summary: string;
  mood: number;
  blockers?: string;
  createdAt: string;
}

export interface SessionNotePayload {
  sessionId: string;
  summary: string;
  mood: number;
  blockers?: string;
}

const PENDING_NOTE_KEY = "devToolkit.pendingSessionNoteId";

export function buildSessionNote(payload: SessionNotePayload): SessionNote | undefined {
  const summary = payload.summary?.trim();
  if (!summary) return undefined;
  const mood = clampMood(payload.mood);
  const blockers = payload.blockers?.trim();
  return {
    summary,
    mood,
    blockers: blockers ? blockers : undefined,
    createdAt: new Date().toISOString(),
  };
}

export function clampMood(value: number): number {
  if (!Number.isFinite(value)) return 3;
  return Math.max(1, Math.min(5, Math.round(value)));
}

export function applySessionNote(
  history: SessionRecord[],
  sessionId: string,
  note: SessionNote
): SessionRecord[] {
  const updated = history.map((session) => {
    if (session.id !== sessionId) return session;
    return { ...session, note };
  });
  if (!updated.find((s) => s.id === sessionId)) {
    return history;
  }
  return updated;
}

export function resolveNoteTarget(
  history: SessionRecord[],
  currentSessionId?: string
): string | undefined {
  if (currentSessionId) return currentSessionId;
  const last = history[history.length - 1];
  return last?.id;
}

export function getPendingNoteId(
  storage: { get: <T>(key: string, defaultValue: T) => T }
): string | undefined {
  return storage.get<string | undefined>(PENDING_NOTE_KEY, undefined);
}

export async function setPendingNoteId(
  storage: { update: (key: string, value: string | undefined) => Thenable<void> },
  sessionId?: string
) {
  await storage.update(PENDING_NOTE_KEY, sessionId);
}
