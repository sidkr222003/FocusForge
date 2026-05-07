"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildSessionNote = buildSessionNote;
exports.clampMood = clampMood;
exports.applySessionNote = applySessionNote;
exports.resolveNoteTarget = resolveNoteTarget;
exports.getPendingNoteId = getPendingNoteId;
exports.setPendingNoteId = setPendingNoteId;
const PENDING_NOTE_KEY = "devToolkit.pendingSessionNoteId";
function buildSessionNote(payload) {
    const summary = payload.summary?.trim();
    if (!summary)
        return undefined;
    const mood = clampMood(payload.mood);
    const blockers = payload.blockers?.trim();
    return {
        summary,
        mood,
        blockers: blockers ? blockers : undefined,
        createdAt: new Date().toISOString(),
    };
}
function clampMood(value) {
    if (!Number.isFinite(value))
        return 3;
    return Math.max(1, Math.min(5, Math.round(value)));
}
function applySessionNote(history, sessionId, note) {
    const updated = history.map((session) => {
        if (session.id !== sessionId)
            return session;
        return { ...session, note };
    });
    if (!updated.find((s) => s.id === sessionId)) {
        return history;
    }
    return updated;
}
function resolveNoteTarget(history, currentSessionId) {
    if (currentSessionId)
        return currentSessionId;
    const last = history[history.length - 1];
    return last?.id;
}
function getPendingNoteId(storage) {
    return storage.get(PENDING_NOTE_KEY, undefined);
}
async function setPendingNoteId(storage, sessionId) {
    await storage.update(PENDING_NOTE_KEY, sessionId);
}
//# sourceMappingURL=sessionNotes.js.map