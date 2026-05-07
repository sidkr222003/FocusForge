import * as vscode from "vscode";

export interface PlannedSession {
  id: string;
  date: string;
  startTime: string;
  durationMinutes: number;
  label?: string;
  fulfilledSessionId?: string;
  fulfilledAt?: string;
}

const PLANNER_KEY = "devToolkit.sessionTracker.plannedSessions";

export function getPlannedSessions(state: vscode.Memento): PlannedSession[] {
  return state.get<PlannedSession[]>(PLANNER_KEY, []);
}

export async function savePlannedSessions(
  state: vscode.Memento,
  plans: PlannedSession[]
): Promise<void> {
  await state.update(PLANNER_KEY, plans.slice(-200));
}

export function createPlan(input: {
  date: string;
  startTime: string;
  durationMinutes: number;
  label?: string;
}): PlannedSession {
  return {
    id: `plan_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    date: input.date,
    startTime: input.startTime,
    durationMinutes: input.durationMinutes,
    label: input.label?.trim() || undefined,
  };
}

export function fulfillCoveredPlans(
  plans: PlannedSession[],
  session: { id: string; date: string; totalTime: number }
): PlannedSession[] {
  const start = new Date(session.date).getTime();
  const end = start + Math.max(0, session.totalTime) * 1000;
  return plans.map((plan) => {
    if (plan.fulfilledSessionId) {
      return plan;
    }
    const planStart = new Date(`${plan.date}T${plan.startTime}:00`).getTime();
    const planEnd = planStart + plan.durationMinutes * 60000;
    const overlap = Math.max(0, Math.min(end, planEnd) - Math.max(start, planStart));
    const required = Math.min(plan.durationMinutes * 60000, 20 * 60000);
    if (overlap >= required) {
      return {
        ...plan,
        fulfilledSessionId: session.id,
        fulfilledAt: new Date().toISOString(),
      };
    }
    return plan;
  });
}

export async function exportPlansAsIcs(plans: PlannedSession[]): Promise<vscode.Uri | undefined> {
  const workspace = vscode.workspace.workspaceFolders?.[0];
  if (!workspace) {
    throw new Error("Open a workspace folder before exporting planned sessions.");
  }
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//FocusForge//Session Planner//EN",
  ];
  for (const plan of plans) {
    const start = new Date(`${plan.date}T${plan.startTime}:00`);
    const end = new Date(start.getTime() + plan.durationMinutes * 60000);
    lines.push(
      "BEGIN:VEVENT",
      `UID:${plan.id}@focusforge`,
      `DTSTAMP:${icsDate(new Date())}`,
      `DTSTART:${icsDate(start)}`,
      `DTEND:${icsDate(end)}`,
      `SUMMARY:${escapeIcs(plan.label || "Planned coding session")}`,
      "END:VEVENT"
    );
  }
  lines.push("END:VCALENDAR");
  const dir = vscode.Uri.joinPath(workspace.uri, ".vscode", "session-reports");
  await vscode.workspace.fs.createDirectory(dir);
  const file = vscode.Uri.joinPath(dir, "planned-sessions.ics");
  await vscode.workspace.fs.writeFile(file, Buffer.from(lines.join("\r\n"), "utf8"));
  return file;
}

function icsDate(date: Date): string {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function escapeIcs(value: string): string {
  return value.replace(/[\\;,]/g, (match) => `\\${match}`).replace(/\n/g, "\\n");
}
