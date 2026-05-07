# Focus Score

## Overview
Calculates a 0-100 score that weighs active time, flow time, break hygiene, and idle ratio.

## Formula
Focus Score =
  (ActiveTime / TotalTime * 40)
+ (FlowTime / TotalTime * 30)
+ (BreakHygiene * 20)
+ (LowIdleBonus * 10)

BreakHygiene = min(1, breaks / expectedBreaks)
expectedBreaks = floor(TotalTime / breakInterval)
LowIdleBonus = 1.0 if idle events < 3, else 0

## UI Surface
- Today tab: gauge with current focus score.
- History detail: per-session focus score.
- Session log: focus score badge.

## Settings
```
"devToolkit.sessionTracker.focusScore": {
  "enabled": true,
  "showInStatusBar": true
}
```
