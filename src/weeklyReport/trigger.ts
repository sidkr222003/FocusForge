import * as vscode from 'vscode';
import { WeeklyReportGenerator } from './WeeklyReportGenerator';

export function registerWeeklyTrigger(ctx: vscode.ExtensionContext, generator: WeeklyReportGenerator): void {
  const timer = setInterval(async () => {
    const now = new Date();
    if (now.getDay() !== 0 || now.getHours() !== 18) {
      return;
    }
    try {
      const file = await generator.generateCurrentWeek();
      vscode.window.showInformationMessage(`Weekly report generated: ${file.path.split('/').pop()}`);
    } catch {
      // Silent by design to avoid noisy background errors.
    }
  }, 30 * 60 * 1000);

  ctx.subscriptions.push({ dispose: () => clearInterval(timer) });
}