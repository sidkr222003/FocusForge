/**
 * Dev Toolkit — Session Tracker Dashboard
 * Full featured: expanded achievements, 4 progressive badges,
 * heatmap, goal ring, history chart, idle/flow detection.
 */
(() => {
  'use strict';

  const vscode = acquireVsCodeApi();
  const uiState = vscode.getState() || { activeTab: 'today', goalMinutes: 120 };

  // ══════════════════════════════════════════════════════════════
  // THEME-AWARE CONTRAST HELPERS
  // ══════════════════════════════════════════════════════════════
  const rootStyle = document.documentElement.style;

  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

  function parseColor(input) {
    if (!input) return null;
    const value = input.trim();
    if (!value || value === 'transparent') return { r: 0, g: 0, b: 0, a: 0 };
    if (value.startsWith('#')) {
      const hex = value.slice(1);
      if (hex.length === 3) {
        return {
          r: parseInt(hex[0] + hex[0], 16),
          g: parseInt(hex[1] + hex[1], 16),
          b: parseInt(hex[2] + hex[2], 16),
          a: 1,
        };
      }
      if (hex.length === 6) {
        return {
          r: parseInt(hex.slice(0, 2), 16),
          g: parseInt(hex.slice(2, 4), 16),
          b: parseInt(hex.slice(4, 6), 16),
          a: 1,
        };
      }
    }
    const match = value.match(/rgba?\(([^)]+)\)/i);
    if (!match) return null;
    const parts = match[1].split(',').map(part => part.trim());
    const [r, g, b] = parts.slice(0, 3).map(Number);
    const a = parts[3] !== undefined ? Number(parts[3]) : 1;
    if ([r, g, b].some(Number.isNaN)) return null;
    return { r, g, b, a: Number.isFinite(a) ? a : 1 };
  }

  function toRgbString(color) {
    return `rgb(${Math.round(color.r)}, ${Math.round(color.g)}, ${Math.round(color.b)})`;
  }

  function mixColors(a, b, weight) {
    return {
      r: a.r + (b.r - a.r) * weight,
      g: a.g + (b.g - a.g) * weight,
      b: a.b + (b.b - a.b) * weight,
      a: a.a + (b.a - a.a) * weight,
    };
  }

  function relativeLuminance(color) {
    const channel = value => {
      const v = value / 255;
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    };
    return 0.2126 * channel(color.r) + 0.7152 * channel(color.g) + 0.0722 * channel(color.b);
  }

  function contrastRatio(a, b) {
    const l1 = relativeLuminance(a);
    const l2 = relativeLuminance(b);
    const bright = Math.max(l1, l2);
    const dark = Math.min(l1, l2);
    return (bright + 0.05) / (dark + 0.05);
  }

  function adjustForContrast(fg, bg, minRatio) {
    if (!fg || !bg) return fg;
    if (contrastRatio(fg, bg) >= minRatio) return fg;
    const target = relativeLuminance(bg) > 0.5
      ? { r: 0, g: 0, b: 0, a: 1 }
      : { r: 255, g: 255, b: 255, a: 1 };
    let low = 0;
    let high = 1;
    for (let i = 0; i < 8; i++) {
      const mid = (low + high) / 2;
      const mixed = mixColors(fg, target, mid);
      if (contrastRatio(mixed, bg) >= minRatio) {
        high = mid;
      } else {
        low = mid;
      }
    }
    return mixColors(fg, target, high);
  }

  function applyThemeContrast() {
    const computed = getComputedStyle(document.documentElement);
    const bg = parseColor(computed.getPropertyValue('--vscode-sideBar-background')) || { r: 37, g: 37, b: 38, a: 1 };
    const fg = parseColor(computed.getPropertyValue('--vscode-sideBar-foreground')) || { r: 204, g: 204, b: 204, a: 1 };
    const desc = parseColor(computed.getPropertyValue('--vscode-descriptionForeground')) || fg;

    const isDark = relativeLuminance(bg) < 0.45;
    const contrastTargetFg = isDark ? 3.2 : 4.5;
    const contrastTargetDesc = isDark ? 2.6 : 3.2;
    const ratio = contrastRatio(fg, bg);
    const boost = ratio < contrastTargetFg ? 0.06 : ratio < contrastTargetFg + 0.4 ? 0.03 : 0;

    const tunedFg = adjustForContrast(fg, bg, contrastTargetFg);
    const tunedDesc = adjustForContrast(desc, bg, contrastTargetDesc);

    rootStyle.setProperty('--vscode-sideBar-foreground', toRgbString(tunedFg));
    rootStyle.setProperty('--vscode-descriptionForeground', toRgbString(tunedDesc));

    if (isDark) {
      const alpha = value => clamp(value + boost, 0.03, 0.28);
      const baseRgb = '255, 255, 255';
      rootStyle.setProperty('--surface-1', `rgba(${baseRgb}, ${alpha(0.04)})`);
      rootStyle.setProperty('--surface-2', `rgba(${baseRgb}, ${alpha(0.06)})`);
      rootStyle.setProperty('--surface-3', `rgba(${baseRgb}, ${alpha(0.08)})`);
      rootStyle.setProperty('--surface-4', `rgba(${baseRgb}, ${alpha(0.12)})`);
      rootStyle.setProperty('--surface', `rgba(${baseRgb}, ${alpha(0.05)})`);
      rootStyle.setProperty('--border-faint', `rgba(${baseRgb}, ${alpha(0.05)})`);
      rootStyle.setProperty('--border-subtle', `rgba(${baseRgb}, ${alpha(0.08)})`);
      rootStyle.setProperty('--border-strong', `rgba(${baseRgb}, ${alpha(0.16)})`);
      rootStyle.setProperty('--border', `rgba(${baseRgb}, ${alpha(0.16)})`);
      rootStyle.setProperty('--hover-bg', `rgba(${baseRgb}, ${alpha(0.07)})`);
      rootStyle.setProperty('--track-bg', `rgba(${baseRgb}, ${alpha(0.08)})`);
      rootStyle.setProperty('--heatmap-0', `rgba(${baseRgb}, ${alpha(0.07)})`);
      rootStyle.setProperty('--tier-none', `rgba(${baseRgb}, ${alpha(0.22)})`);
      rootStyle.setProperty('--scrollbar-thumb', `rgba(${baseRgb}, ${alpha(0.15)})`);
      rootStyle.setProperty('--scrollbar-thumb-hover', `rgba(${baseRgb}, ${alpha(0.24)})`);
      rootStyle.setProperty('--scrim', 'rgba(0, 0, 0, 0.25)');
    } else {
      const surfaceAlpha = value => clamp(value + 0.15, 0.65, 0.95);
      const lineAlpha = value => clamp(value + boost, 0.08, 0.26);
      rootStyle.setProperty('--surface-1', `rgba(255, 255, 255, ${surfaceAlpha(0.65)})`);
      rootStyle.setProperty('--surface-2', `rgba(255, 255, 255, ${surfaceAlpha(0.72)})`);
      rootStyle.setProperty('--surface-3', `rgba(255, 255, 255, ${surfaceAlpha(0.78)})`);
      rootStyle.setProperty('--surface-4', `rgba(255, 255, 255, ${surfaceAlpha(0.85)})`);
      rootStyle.setProperty('--surface', `rgba(255, 255, 255, ${surfaceAlpha(0.7)})`);
      rootStyle.setProperty('--border-faint', `rgba(0, 0, 0, ${lineAlpha(0.06)})`);
      rootStyle.setProperty('--border-subtle', `rgba(0, 0, 0, ${lineAlpha(0.1)})`);
      rootStyle.setProperty('--border-strong', `rgba(0, 0, 0, ${lineAlpha(0.18)})`);
      rootStyle.setProperty('--border', `rgba(0, 0, 0, ${lineAlpha(0.18)})`);
      rootStyle.setProperty('--hover-bg', `rgba(0, 0, 0, ${lineAlpha(0.05)})`);
      rootStyle.setProperty('--track-bg', `rgba(0, 0, 0, ${lineAlpha(0.12)})`);
      rootStyle.setProperty('--heatmap-0', `rgba(0, 0, 0, ${lineAlpha(0.08)})`);
      rootStyle.setProperty('--tier-none', `rgba(0, 0, 0, ${lineAlpha(0.16)})`);
      rootStyle.setProperty('--scrollbar-thumb', `rgba(0, 0, 0, ${lineAlpha(0.22)})`);
      rootStyle.setProperty('--scrollbar-thumb-hover', `rgba(0, 0, 0, ${lineAlpha(0.3)})`);
      rootStyle.setProperty('--scrim', 'rgba(0, 0, 0, 0.12)');
    }

    document.body.dataset.theme = isDark ? 'dark' : 'light';
  }

  applyThemeContrast();

  const themeObserver = new MutationObserver(() => applyThemeContrast());
  themeObserver.observe(document.body, { attributes: true, attributeFilter: ['class'] });

  // ══════════════════════════════════════════════════════════════
  // SVG ICON LIBRARY — Unique custom icons for each achievement
  // ══════════════════════════════════════════════════════════════
  const ICONS = {
    // Milestones
    first_commit:    `<svg viewBox="0 0 20 20"><circle cx="10" cy="10" r="3" fill="none" stroke="currentColor" stroke-width="2"/><path d="M10 2v5M10 13v5M2 10h5M13 10h5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>`,
    hour_one:        `<svg viewBox="0 0 20 20"><circle cx="10" cy="10" r="8" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M10 5v5l3 3" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`,
    five_hours:      `<svg viewBox="0 0 20 20"><path d="M10 2l1.8 5.5h5.8l-4.7 3.4 1.8 5.5L10 13l-4.7 3.4 1.8-5.5L2.4 7.5h5.8z" fill="currentColor"/></svg>`,
    tenner:          `<svg viewBox="0 0 20 20"><path d="M4 16V4h3l3 4 3-4h3v12h-3V9l-3 4-3-4v7z" fill="currentColor"/></svg>`,
    half_century:    `<svg viewBox="0 0 20 20"><circle cx="10" cy="10" r="8" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M7 13c0-2.5 6-2.5 6-5a3 3 0 00-6 0" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><circle cx="10" cy="14.5" r="1" fill="currentColor"/></svg>`,
    century:         `<svg viewBox="0 0 20 20"><path d="M10 1L3 7v6l7 6 7-6V7z" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M10 5v5l3 2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>`,
    five_hundred:    `<svg viewBox="0 0 20 20"><path d="M10 2l2.5 5 5.5.8-4 3.9.9 5.5L10 14.5l-4.9 2.7.9-5.5-4-3.9 5.5-.8z" fill="currentColor"/></svg>`,
    thousand_hours:  `<svg viewBox="0 0 20 20"><path d="M10 1l2.5 5 5.5.8-4 3.9.9 5.5L10 14.5l-4.9 2.7.9-5.5-4-3.9 5.5-.8z" fill="none" stroke="currentColor" stroke-width="1.2"/><path d="M10 5l1.5 3 3.3.5-2.4 2.3.6 3.3L10 12.7l-3 1.4.6-3.3L5.2 8.5l3.3-.5z" fill="currentColor"/></svg>`,
    five_thousand:   `<svg viewBox="0 0 20 20"><circle cx="10" cy="10" r="9" fill="none" stroke="currentColor" stroke-width="1.5"/><circle cx="10" cy="10" r="6" fill="none" stroke="currentColor" stroke-width="1"/><circle cx="10" cy="10" r="3" fill="currentColor"/></svg>`,

    // Streaks
    day_one:         `<svg viewBox="0 0 20 20"><path d="M10 3C7 6 6 8 7 11c.3 1-.5 1.8-1.5 1.5.7 2.5 3 3.5 5 3 2 .5 4.3-.5 5-3-1 .3-1.8-.5-1.5-1.5C15 8 14 6 10 3z" fill="currentColor"/></svg>`,
    three_day:       `<svg viewBox="0 0 20 20"><path d="M10 2C7 5 6.5 7 7.5 10c.4 1.2-.4 2-1.5 1.7.8 2.8 3.2 4 5 3.5 1.8.5 4.2-.7 5-3.5-1.1.3-1.9-.5-1.5-1.7C15.5 7 15 5 10 2z" fill="currentColor" opacity="0.7"/><path d="M10 5C8 7 7.5 8.5 8.5 10.5c.3.8-.3 1.5-1 1.3.6 2 2.3 3 3.5 2.5 1.2.5 2.9-.5 3.5-2.5-.7.2-1.3-.5-1-1.3C14.5 8.5 14 7 10 5z" fill="currentColor"/></svg>`,
    week_warrior:    `<svg viewBox="0 0 20 20"><rect x="2" y="3" width="16" height="14" rx="2" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M2 8h16" stroke="currentColor" stroke-width="1"/><path d="M7 3v3M13 3v3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><path d="M6 12l2 2 4-4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
    fortnight:       `<svg viewBox="0 0 20 20"><path d="M10 2l1.5 4.5h4.7l-3.8 2.8 1.5 4.5L10 11l-3.9 2.8 1.5-4.5-3.8-2.8h4.7z" fill="none" stroke="currentColor" stroke-width="1.3"/><circle cx="10" cy="11" r="2.5" fill="currentColor"/></svg>`,
    month_master:    `<svg viewBox="0 0 20 20"><circle cx="10" cy="10" r="8" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M6 10c0-2.2 1.8-4 4-4s4 1.8 4 4-1.8 4-4 4" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><circle cx="6" cy="10" r="1.5" fill="currentColor"/></svg>`,
    sixty_days:      `<svg viewBox="0 0 20 20"><path d="M10 2l2.3 4.7 5.2.8-3.7 3.6.9 5.1L10 13.7l-4.7 2.5.9-5.1L2.5 7.5l5.2-.8z" fill="currentColor" opacity="0.5"/><path d="M10 5l1.5 3.1 3.4.5-2.5 2.4.6 3.4L10 12.7l-3 1.7.6-3.4-2.5-2.4 3.4-.5z" fill="currentColor"/></svg>`,
    century_streak:  `<svg viewBox="0 0 20 20"><path d="M10 1L4 5v5c0 4 2.7 7.4 6 8.5 3.3-1.1 6-4.5 6-8.5V5z" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M7 10l2 2 4-4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
    no_days_off:     `<svg viewBox="0 0 20 20"><circle cx="10" cy="10" r="8" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M6 10h8M10 6v8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>`,
    iron_will:       `<svg viewBox="0 0 20 20"><path d="M10 2l1.5 3h3.3l-2.6 2 1 3.1L10 8.5 7.8 10.1l1-3.1-2.6-2h3.3z" fill="currentColor"/><path d="M5 13c0 3 2.2 5 5 5s5-2 5-5" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>`,
    year_streak:     `<svg viewBox="0 0 20 20"><path d="M10 1l2 6h6l-5 3.6 1.9 5.8-4.9-3.6-4.9 3.6L7 10.6 2 7h6z" fill="currentColor"/><circle cx="10" cy="10" r="2" fill="none" stroke="white" stroke-width="1.2"/></svg>`,

    // Flow State
    first_flow:      `<svg viewBox="0 0 20 20"><path d="M11 2L4 11h6l-1 7 8-10h-6z" fill="currentColor"/></svg>`,
    deep_work:       `<svg viewBox="0 0 20 20"><circle cx="10" cy="10" r="8" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M10 4l1.5 4.5h4.7l-3.8 2.7 1.5 4.5L10 13l-3.9 2.7 1.5-4.5-3.8-2.7H9z" fill="currentColor"/></svg>`,
    in_the_zone:     `<svg viewBox="0 0 20 20"><path d="M10 2c-4.4 0-8 3.6-8 8s3.6 8 8 8 8-3.6 8-8-3.6-8-8-8zm0 3c2.8 0 5 2.2 5 5s-2.2 5-5 5-5-2.2-5-5 2.2-5 5-5zm0 2c-1.7 0-3 1.3-3 3s1.3 3 3 3 3-1.3 3-3-1.3-3-3-3z" fill="currentColor"/></svg>`,
    focus_master:    `<svg viewBox="0 0 20 20"><path d="M10 3v14M3 10h14" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><circle cx="10" cy="10" r="3" fill="currentColor"/></svg>`,
    the_architect:   `<svg viewBox="0 0 20 20"><path d="M10 2L2 8v10h5v-6h6v6h5V8z" fill="none" stroke="currentColor" stroke-width="1.5"/><circle cx="10" cy="7" r="2" fill="currentColor"/></svg>`,
    monk_mode:       `<svg viewBox="0 0 20 20"><circle cx="10" cy="7" r="4" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M4 18c0-3.3 2.7-6 6-6s6 2.7 6 6" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M7 7c.5-1.5 5.5-1.5 6 0" stroke="currentColor" stroke-width="1" stroke-linecap="round"/></svg>`,
    laser_focus:     `<svg viewBox="0 0 20 20"><circle cx="10" cy="10" r="2" fill="currentColor"/><circle cx="10" cy="10" r="5" fill="none" stroke="currentColor" stroke-width="1.2"/><circle cx="10" cy="10" r="8" fill="none" stroke="currentColor" stroke-width="1" opacity="0.5"/><path d="M10 1v3M10 16v3M1 10h3M16 10h3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>`,
    flow_god:        `<svg viewBox="0 0 20 20"><path d="M10 2l2 4 4.5 1-3.2 3.2.8 4.5L10 12.5l-4.1 2.2.8-4.5L3.5 7 8 6z" fill="currentColor"/><path d="M10 5l1.2 2.5 2.8.4-2 2 .5 2.8L10 11.2l-2.5 1.5.5-2.8-2-2 2.8-.4z" fill="white" opacity="0.4"/></svg>`,
    time_crystal:    `<svg viewBox="0 0 20 20"><path d="M10 2l4 4-4 3-4-3z" fill="currentColor"/><path d="M6 6l-4 4 4 3 4-3z" fill="currentColor" opacity="0.6"/><path d="M14 6l4 4-4 3-4-3z" fill="currentColor" opacity="0.6"/><path d="M10 13l4 4H6z" fill="currentColor" opacity="0.8"/></svg>`,
    hyper_focus:     `<svg viewBox="0 0 20 20"><path d="M10 2L5 10h3v8l7-10h-4z" fill="currentColor"/><circle cx="10" cy="10" r="9" fill="none" stroke="currentColor" stroke-width="1" opacity="0.3"/></svg>`,
    deep_diver:      `<svg viewBox="0 0 20 20"><circle cx="10" cy="10" r="8" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M10 4v8M6.5 9.5L10 13l3.5-3.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
    perfect_100:     `<svg viewBox="0 0 20 20"><circle cx="10" cy="10" r="8" fill="none" stroke="currentColor" stroke-width="1.5"/><circle cx="10" cy="10" r="3" fill="currentColor"/><path d="M10 2v3M10 15v3M2 10h3M15 10h3" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>`,
    polyglot:        `<svg viewBox="0 0 20 20"><circle cx="10" cy="10" r="8" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M2 10h16M10 2a10 10 0 000 16M10 2a10 10 0 010 16" stroke="currentColor" stroke-width="1.2"/></svg>`,
    reflective_coder:`<svg viewBox="0 0 20 20"><rect x="4" y="3" width="12" height="14" rx="2" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M7 7h6M7 10h6M7 13h4" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>`,

    // Productivity
    early_riser:     `<svg viewBox="0 0 20 20"><circle cx="10" cy="10" r="4" fill="currentColor"/><path d="M10 2v2M10 16v2M2 10h2M16 10h2M4.2 4.2l1.4 1.4M14.4 14.4l1.4 1.4M4.2 15.8l1.4-1.4M14.4 5.6l1.4-1.4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>`,
    marathon:        `<svg viewBox="0 0 20 20"><path d="M2 16l4-8 4 4 4-8 4 4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
    weekend_warrior: `<svg viewBox="0 0 20 20"><path d="M3 6h14v10a2 2 0 01-2 2H5a2 2 0 01-2-2V6z" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M3 6l2-3h10l2 3" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M8 10h4M10 9v4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>`,
    daily_double:    `<svg viewBox="0 0 20 20"><path d="M4 10a6 6 0 0112 0" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M10 4v12M7 7l3-3 3 3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
    speed_demon:     `<svg viewBox="0 0 20 20"><path d="M2 10h6l2-6 2 12 2-6h4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg>`,
    efficiency_king: `<svg viewBox="0 0 20 20"><circle cx="10" cy="10" r="8" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M6 14l3-8 3 8" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><path d="M7 12h6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>`,
    ten_sessions:    `<svg viewBox="0 0 20 20"><rect x="2" y="3" width="7" height="7" rx="1.5" fill="currentColor" opacity="0.6"/><rect x="11" y="3" width="7" height="7" rx="1.5" fill="currentColor"/><rect x="2" y="12" width="7" height="7" rx="1.5" fill="currentColor" opacity="0.3"/><rect x="11" y="12" width="7" height="7" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.2"/></svg>`,
    fifty_sessions:  `<svg viewBox="0 0 20 20"><path d="M10 2a8 8 0 100 16A8 8 0 0010 2zm0 2a6 6 0 110 12A6 6 0 0110 4z" fill="currentColor" opacity="0.3"/><path d="M10 6l1.2 3.6h3.8l-3.1 2.2 1.2 3.6L10 13.2l-3.1 2.2 1.2-3.6L5 9.6h3.8z" fill="currentColor"/></svg>`,
    hundred_sessions:`<svg viewBox="0 0 20 20"><path d="M10 1l2.9 5.9 6.5.9-4.7 4.6 1.1 6.5L10 15.5l-5.8 3.4 1.1-6.5-4.7-4.6 6.5-.9z" fill="currentColor"/></svg>`,
    high_efficiency: `<svg viewBox="0 0 20 20"><path d="M10 3v14M5 8l5-5 5 5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none"/><path d="M5 14h10" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>`,
    code_ninja:      `<svg viewBox="0 0 20 20"><path d="M5 6l-3 4 3 4M15 6l3 4-3 4M11 4l-2 12" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg>`,
    machine:         `<svg viewBox="0 0 20 20"><rect x="3" y="5" width="14" height="10" rx="2" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M7 9h6M7 12h4" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/><path d="M1 9h2M17 9h2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>`,
    triple_session:  `<svg viewBox="0 0 20 20"><rect x="3" y="3" width="5" height="5" rx="1.3" fill="currentColor"/><rect x="12" y="3" width="5" height="5" rx="1.3" fill="currentColor" opacity="0.75"/><rect x="7.5" y="12" width="5" height="5" rx="1.3" fill="currentColor" opacity="0.45"/><path d="M8 5.5h4M10 8v4" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>`,
    sprint_starter:  `<svg viewBox="0 0 20 20"><path d="M3 14h5l2-8 2 8h5" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/><path d="M5 17h10" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>`,
    clean_finish:    `<svg viewBox="0 0 20 20"><path d="M4 10l3.5 3.5L16 5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M3 16h14" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" opacity=".55"/></svg>`,
    planner_pro:     `<svg viewBox="0 0 20 20"><rect x="3" y="4" width="14" height="13" rx="2" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M3 8h14M7 2v4M13 2v4" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/><path d="M7 12h6M7 15h3" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>`,
    break_balancer:  `<svg viewBox="0 0 20 20"><path d="M5 5h10v5a5 5 0 01-10 0z" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M15 7h1.5a2 2 0 010 4H15M6 17h8" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>`,
    steady_hands:    `<svg viewBox="0 0 20 20"><path d="M3 11c2-4 4-4 7 0s5 4 7 0" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/><circle cx="5" cy="11" r="1.5" fill="currentColor"/><circle cx="15" cy="11" r="1.5" fill="currentColor"/></svg>`,
    repo_runner:     `<svg viewBox="0 0 20 20"><circle cx="5" cy="5" r="2" fill="none" stroke="currentColor" stroke-width="1.5"/><circle cx="15" cy="15" r="2" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M7 5h3a3 3 0 013 3v5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>`,
    note_keeper:     `<svg viewBox="0 0 20 20"><path d="M5 3h8l3 3v11H5z" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M13 3v4h3M8 10h5M8 13h4" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>`,
    language_scout:  `<svg viewBox="0 0 20 20"><path d="M4 4h12v12H4z" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M7 13l-2-3 2-3M13 7l2 3-2 3M11 6l-2 8" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
    week_anchor:     `<svg viewBox="0 0 20 20"><path d="M10 2v12" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><path d="M5 8a5 5 0 0010 0" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M6 16h8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>`,
    quiet_power:     `<svg viewBox="0 0 20 20"><path d="M6 4h8l2 5-6 7-6-7z" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M8 9h4M10 6v6" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>`,
    reset_rebound:   `<svg viewBox="0 0 20 20"><path d="M5 7a6 6 0 019.5-1.5L17 8" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/><path d="M15 13a6 6 0 01-9.5 1.5L3 12" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`,

    // Time of Day
    night_owl:       `<svg viewBox="0 0 20 20"><path d="M14 10a6 6 0 01-8.5 5.4A7 7 0 1014 10z" fill="currentColor"/></svg>`,
    early_bird:      `<svg viewBox="0 0 20 20"><path d="M10 3C7.5 3 5.5 5 5.5 7.5c0 3.6 4.5 9 4.5 9s4.5-5.4 4.5-9C14.5 5 12.5 3 10 3z" fill="currentColor"/><circle cx="10" cy="7.5" r="1.5" fill="white"/></svg>`,
    graveyard:       `<svg viewBox="0 0 20 20"><rect x="7" y="2" width="6" height="10" rx="3" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M10 5v4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><path d="M4 17h12v1H4zM7 12v5M13 12v5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>`,
    lunch_coder:     `<svg viewBox="0 0 20 20"><circle cx="10" cy="10" r="7" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M10 5v5l3.5 3.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>`,
    golden_hour:     `<svg viewBox="0 0 20 20"><circle cx="10" cy="12" r="5" fill="currentColor" opacity="0.8"/><path d="M10 2v3M10 17v3M3 8l2 2M15 8l-2 2M2 12h3M15 12h3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>`,
    midnight_coder:  `<svg viewBox="0 0 20 20"><path d="M10 2l.8 2.4 2.5.4-1.8 1.7.4 2.5L10 7.8 7.9 9l.4-2.5-1.8-1.7 2.5-.4z" fill="currentColor"/><path d="M17 11a7 7 0 01-10.5 6.1A8 8 0 1017 11z" fill="currentColor" opacity="0.5"/></svg>`,
    sunrise_session: `<svg viewBox="0 0 20 20"><path d="M3 13h14M10 5v4M6 9l1.5 1.5M14 9l-1.5 1.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><path d="M5 13a5 5 0 0110 0" fill="currentColor" opacity="0.6"/></svg>`,
    after_dark:      `<svg viewBox="0 0 20 20"><circle cx="10" cy="10" r="7" fill="none" stroke="currentColor" stroke-width="1.5"/><circle cx="10" cy="10" r="3" fill="currentColor"/><path d="M10 3v2M10 15v2M3 10h2M15 10h2" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>`,

    // Consistency
    back_to_back:    `<svg viewBox="0 0 20 20"><path d="M3 6h6v6H3zM11 8h6v6h-6z" fill="none" stroke="currentColor" stroke-width="1.5" rx="1"/><path d="M9 9l2-1" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>`,
    clockwork:       `<svg viewBox="0 0 20 20"><circle cx="10" cy="10" r="7" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M10 6v4l2.5 2.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><circle cx="10" cy="10" r="1" fill="currentColor"/></svg>`,
    habit_builder:   `<svg viewBox="0 0 20 20"><path d="M4 10a6 6 0 016-6v2a4 4 0 00-4 4H4zm7-6a6 6 0 016 6h-2a4 4 0 00-4-4V4zm-1 14a6 6 0 01-6-6h2a4 4 0 004 4v2zm1 0v-2a4 4 0 004-4h2a6 6 0 01-6 6z" fill="currentColor"/></svg>`,
    daily_grind:     `<svg viewBox="0 0 20 20"><path d="M3 5h14v2H3zM3 9h14v2H3zM3 13h14v2H3z" fill="currentColor" opacity="0.4"/><rect x="2" y="4" width="16" height="12" rx="2" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>`,
    five_days_week:  `<svg viewBox="0 0 20 20"><rect x="2" y="4" width="16" height="13" rx="2" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M2 8h16" stroke="currentColor" stroke-width="1"/><circle cx="6" cy="12" r="1.5" fill="currentColor"/><circle cx="10" cy="12" r="1.5" fill="currentColor"/><circle cx="14" cy="12" r="1.5" fill="currentColor"/><circle cx="6" cy="12" r="1.5" fill="currentColor"/></svg>`,
    quarter_century: `<svg viewBox="0 0 20 20"><path d="M10 2l1.5 4.5H16l-3.7 2.7 1.4 4.5L10 11l-3.7 2.7 1.4-4.5L4 6.5h4.5z" fill="none" stroke="currentColor" stroke-width="1.3"/><path d="M10 5l1 3h3l-2.5 1.8 1 3L10 11l-2.5 1.8 1-3L6 8h3z" fill="currentColor"/></svg>`,
    two_months:      `<svg viewBox="0 0 20 20"><path d="M3 4h14v13H3z" fill="none" stroke="currentColor" stroke-width="1.5" rx="2"/><path d="M3 8h14" stroke="currentColor" stroke-width="1"/><path d="M7 4V2M13 4V2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><path d="M6 12l2 2 4-4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
    power_user:      `<svg viewBox="0 0 20 20"><path d="M10 2v6" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/><path d="M6 5.1a7 7 0 100 9.8" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="M14 5.1a7 7 0 010 9.8" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>`,
    relentless:      `<svg viewBox="0 0 20 20"><path d="M5 10c0-2.8 2.2-5 5-5s5 2.2 5 5-2.2 5-5 5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><path d="M15 10l3-3M15 10l3 3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><circle cx="10" cy="10" r="2" fill="currentColor"/></svg>`,
    legendary:       `<svg viewBox="0 0 20 20"><path d="M10 1l2.3 4.7 5.2.8-3.7 3.6.9 5.1L10 12.7l-4.7 2.5.9-5.1L2.5 6.5l5.2-.8z" fill="currentColor"/><path d="M10 4l1.5 3.1 3.4.5-2.5 2.4.6 3.4L10 11.8l-3 1.6.6-3.4-2.5-2.4 3.4-.5z" fill="white" opacity="0.3"/></svg>`,
  };

  // Achievement check icon SVG
  const CHECK_SVG = `<svg viewBox="0 0 16 16"><path d="M3 8l3.5 3.5L13 4.5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg>`;

  // ══════════════════════════════════════════════════════════════
  // ACHIEVEMENT DEFINITIONS — 100+ across 6 categories
  // ══════════════════════════════════════════════════════════════
  const ACHIEVEMENTS = {
    milestones: [
      { id: 'first_commit',   name: 'First Commit',    desc: 'Complete your first tracked session',   icon: 'first_commit',   check: h => h.length >= 1 },
      { id: 'hour_one',       name: 'Hour One',        desc: 'Accumulate 1 hour total active time',   icon: 'hour_one',       check: h => totalActiveHours(h) >= 1 },
      { id: 'five_hours',     name: 'Five Hours',      desc: 'Reach 5 total active hours',            icon: 'five_hours',     check: h => totalActiveHours(h) >= 5 },
      { id: 'tenner',         name: 'The Tenner',      desc: 'Reach 10 total active hours',           icon: 'tenner',         check: h => totalActiveHours(h) >= 10 },
      { id: 'half_century',   name: 'Half Century',    desc: 'Reach 50 total active hours',           icon: 'half_century',   check: h => totalActiveHours(h) >= 50 },
      { id: 'century',        name: 'Century',         desc: 'Reach 100 total active hours',          icon: 'century',        check: h => totalActiveHours(h) >= 100 },
      { id: 'five_hundred',   name: '500 Club',        desc: 'Reach 500 total active hours',          icon: 'five_hundred',   check: h => totalActiveHours(h) >= 500 },
      { id: 'thousand_hours', name: 'Thousand Hours',  desc: '1,000 hours — a true legend',           icon: 'thousand_hours', check: h => totalActiveHours(h) >= 1000 },
      { id: 'five_thousand',  name: 'Grand Master',    desc: '5,000 total hours — elite tier',        icon: 'five_thousand',  check: h => totalActiveHours(h) >= 5000 },
      { id: 'ten_sessions',   name: 'Ten Sessions',    desc: 'Complete 10 coding sessions',           icon: 'ten_sessions',   check: h => h.length >= 10 },
      { id: 'fifty_sessions', name: 'Fifty Sessions',  desc: 'Complete 50 coding sessions',           icon: 'fifty_sessions', check: h => h.length >= 50 },
      { id: 'hundred_sessions',name:'Century Coder',   desc: '100 coding sessions completed',         icon: 'hundred_sessions',check:h => h.length >= 100 },
    ],
    streaks: [
      { id: 'day_one',        name: 'Day One',         desc: 'First day coding streak',               icon: 'day_one',        check: h => maxDayStreak(h) >= 1 },
      { id: 'three_day',      name: 'Three Peat',      desc: '3-day coding streak',                   icon: 'three_day',      check: h => maxDayStreak(h) >= 3 },
      { id: 'week_warrior',   name: 'Week Warrior',    desc: '7-day coding streak',                   icon: 'week_warrior',   check: h => maxDayStreak(h) >= 7 },
      { id: 'fortnight',      name: 'Fortnight',       desc: '14-day coding streak',                  icon: 'fortnight',      check: h => maxDayStreak(h) >= 14 },
      { id: 'month_master',   name: 'Month Master',    desc: '30-day coding streak',                  icon: 'month_master',   check: h => maxDayStreak(h) >= 30 },
      { id: 'sixty_days',     name: 'Two Month Run',   desc: '60-day coding streak',                  icon: 'sixty_days',     check: h => maxDayStreak(h) >= 60 },
      { id: 'century_streak', name: 'Century Streak',  desc: '100-day coding streak',                 icon: 'century_streak', check: h => maxDayStreak(h) >= 100 },
      { id: 'iron_will',      name: 'Iron Will',       desc: '200-day coding streak',                 icon: 'iron_will',      check: h => maxDayStreak(h) >= 200 },
      { id: 'year_streak',    name: 'Year of Code',    desc: '365-day coding streak',                 icon: 'year_streak',    check: h => maxDayStreak(h) >= 365 },
      { id: 'no_days_off',    name: 'No Days Off',     desc: 'Full calendar month without a miss',    icon: 'no_days_off',    check: h => fullMonthStreak(h) },
    ],
    flow: [
      { id: 'first_flow',     name: 'First Flow',      desc: 'Enter flow state for the first time',   icon: 'first_flow',     check: h => h.some(s => s.maxStreak >= 1500) },
      { id: 'in_the_zone',    name: 'In the Zone',     desc: '5 sessions with 25+ min streak',        icon: 'in_the_zone',    check: h => h.filter(s => s.maxStreak >= 1500).length >= 5 },
      { id: 'deep_work',      name: 'Deep Work',       desc: '2-hour uninterrupted session',          icon: 'deep_work',      check: h => h.some(s => s.maxStreak >= 7200) },
      { id: 'the_architect',  name: 'The Architect',   desc: '5 flow sessions in one day',            icon: 'the_architect',  check: h => fiveFlowInDay(h) },
      { id: 'monk_mode',      name: 'Monk Mode',       desc: '4-hour continuous focus streak',        icon: 'monk_mode',      check: h => h.some(s => s.maxStreak >= 14400) },
      { id: 'focus_master',   name: 'Focus Master',    desc: '20 total flow sessions achieved',       icon: 'focus_master',   check: h => h.filter(s => s.maxStreak >= 1500).length >= 20 },
      { id: 'laser_focus',    name: 'Laser Focus',     desc: '50 total flow sessions',                icon: 'laser_focus',    check: h => h.filter(s => s.maxStreak >= 1500).length >= 50 },
      { id: 'hyper_focus',    name: 'Hyper Focus',     desc: '6-hour single-session streak',          icon: 'hyper_focus',    check: h => h.some(s => s.maxStreak >= 21600) },
      { id: 'time_crystal',   name: 'Time Crystal',    desc: 'Accumulate 10 hours of flow time',      icon: 'time_crystal',   check: h => totalFlowSeconds(h) >= 36000 },
      { id: 'flow_god',       name: 'Flow God',        desc: '100 total flow sessions',               icon: 'flow_god',       check: h => h.filter(s => s.maxStreak >= 1500).length >= 100 },
      { id: 'deep_diver',     name: 'Deep Diver',      desc: 'Complete 10 Deep Work sessions',        icon: 'deep_diver',     check: h => totalDeepWorkCompleted(h) >= 10 },
      { id: 'sprint_starter',  name: 'Sprint Starter',  desc: 'Complete 3 sessions under 30 minutes', icon: 'sprint_starter', check: h => h.filter(s => s.totalTime > 0 && s.totalTime <= 1800).length >= 3 },
      { id: 'quiet_power',     name: 'Quiet Power',     desc: 'Finish a 90+ min session with 2 or fewer idle events', icon: 'quiet_power', check: h => h.some(s => s.totalTime >= 5400 && (s.idleCount || 0) <= 2) },
    ],
    productivity: [
      { id: 'early_riser',    name: 'Early Riser',     desc: 'Complete a session before 8 AM',        icon: 'early_riser',    check: h => h.some(s => new Date(s.date).getHours() < 8) },
      { id: 'marathon',       name: 'Marathon',        desc: 'Single session longer than 6 hours',    icon: 'marathon',       check: h => h.some(s => s.totalTime >= 21600) },
      { id: 'weekend_warrior',name: 'Weekend Warrior', desc: '4+ hours active on a weekend day',      icon: 'weekend_warrior',check: h => weekendWarrior(h) },
      { id: 'daily_double',   name: 'Daily Double',    desc: '2+ sessions in a single day',           icon: 'daily_double',   check: h => Object.values(sessionsByDay(h)).some(ss => ss.length >= 2) },
      { id: 'speed_demon',    name: 'Speed Demon',     desc: '90%+ efficiency in a session',          icon: 'speed_demon',    check: h => h.some(s => s.totalTime > 0 && s.activeTime / s.totalTime >= 0.9) },
      { id: 'efficiency_king',name: 'Efficiency King', desc: '85%+ avg efficiency over 10 sessions',  icon: 'efficiency_king',check: h => avgEfficiency(h, 10) >= 85 },
      { id: 'high_efficiency',name: 'Peak Performer',  desc: '5 sessions with 90%+ efficiency',       icon: 'high_efficiency',check: h => h.filter(s => s.totalTime > 0 && s.activeTime/s.totalTime >= 0.9).length >= 5 },
      { id: 'code_ninja',     name: 'Code Ninja',      desc: 'Complete 5 sessions in one day',        icon: 'code_ninja',     check: h => Object.values(sessionsByDay(h)).some(ss => ss.length >= 5) },
      { id: 'machine',        name: 'The Machine',     desc: '8+ hours active in a single day',       icon: 'machine',        check: h => Object.values(sessionsByDay(h)).some(ss => ss.reduce((a,s)=>a+s.activeTime,0) >= 28800) },
      { id: 'daily_double2',  name: 'Triple Session',  desc: '3+ sessions in a single day',           icon: 'triple_session', check: h => Object.values(sessionsByDay(h)).some(ss => ss.length >= 3) },
      { id: 'polyglot',        name: 'Polyglot',        desc: 'Use 5+ languages in a week',            icon: 'polyglot',       check: h => distinctLanguagesSince(h, 7) >= 5 },
      { id: 'perfect_100',     name: 'Perfect 100',     desc: 'Score 100 on a 30+ min session',        icon: 'perfect_100',    check: h => h.some(s => s.totalTime >= 1800 && focusScoreForSession(s) >= 100) },
      { id: 'clean_finish',    name: 'Clean Finish',    desc: 'End 5 sessions with 80%+ efficiency',   icon: 'clean_finish',   check: h => h.filter(s => s.totalTime > 0 && (s.engagedTime ?? s.activeTime) / s.totalTime >= 0.8).length >= 5 },
      { id: 'planner_pro',     name: 'Planner Pro',     desc: 'Fulfill 5 planned sessions',           icon: 'planner_pro',    check: () => completedPlannedSessions(lastPlans) >= 5 },
      { id: 'break_balancer',  name: 'Break Balancer',  desc: 'Take 20 tracked breaks',               icon: 'break_balancer', check: h => totalBreakCount(h) >= 20 },
      { id: 'steady_hands',    name: 'Steady Hands',    desc: 'Complete 10 sessions with 3 or fewer idle events', icon: 'steady_hands', check: h => h.filter(s => (s.idleCount || 0) <= 3).length >= 10 },
      { id: 'repo_runner',     name: 'Repo Runner',     desc: 'Track sessions across 3 projects',      icon: 'repo_runner',    check: () => (lastProjects || []).length >= 3 },
      { id: 'language_scout',  name: 'Language Scout',  desc: 'Use 3+ languages in a day',             icon: 'language_scout', check: h => Object.values(sessionsByDay(h)).some(ss => distinctLanguagesSince(ss, 3650) >= 3) },
    ],
    timeOfDay: [
      { id: 'night_owl',      name: 'Night Owl',       desc: 'Code past midnight, 5 sessions',        icon: 'night_owl',      check: h => timeOfDayCount(h, 0, 3) >= 5 },
      { id: 'early_bird',     name: 'Early Bird',      desc: 'Code before 7 AM, 5 sessions',          icon: 'early_bird',     check: h => timeOfDayCount(h, 4, 7) >= 5 },
      { id: 'graveyard',      name: 'Graveyard Shift', desc: 'Code between 2–4 AM, 3 times',          icon: 'graveyard',      check: h => timeOfDayCount(h, 2, 4) >= 3 },
      { id: 'lunch_coder',    name: 'Lunch Coder',     desc: 'Code during lunch hours 10 times',      icon: 'lunch_coder',    check: h => timeOfDayCount(h, 11, 14) >= 10 },
      { id: 'golden_hour',    name: 'Golden Hour',     desc: 'Code at golden hour (5–7 PM) 5 times',  icon: 'golden_hour',    check: h => timeOfDayCount(h, 17, 19) >= 5 },
      { id: 'midnight_coder', name: 'Midnight Coder',  desc: 'Code exactly at midnight (10 times)',    icon: 'midnight_coder', check: h => timeOfDayCount(h, 0, 1) >= 10 },
      { id: 'sunrise_session',name: 'Sunrise Session', desc: 'Code before 6 AM (3 times)',            icon: 'sunrise_session',check: h => timeOfDayCount(h, 4, 6) >= 3 },
      { id: 'after_dark',     name: 'After Dark',      desc: 'Code after 10 PM for 20 sessions',      icon: 'after_dark',     check: h => timeOfDayCount(h, 22, 24) >= 20 },
    ],
    consistency: [
      { id: 'back_to_back',   name: 'Back to Back',    desc: 'Code 2 days in a row',                  icon: 'back_to_back',   check: h => maxDayStreak(h) >= 2 },
      { id: 'clockwork',      name: 'Clockwork',       desc: 'Code every day for 5 days',             icon: 'clockwork',      check: h => maxDayStreak(h) >= 5 },
      { id: 'habit_builder',  name: 'Habit Builder',   desc: 'Code at least 21 days total',           icon: 'habit_builder',  check: h => uniqueCodingDays(h) >= 21 },
      { id: 'daily_grind',    name: 'Daily Grind',     desc: 'Code 10 different days',                icon: 'daily_grind',    check: h => uniqueCodingDays(h) >= 10 },
      { id: 'five_days_week', name: 'Work Week',       desc: 'Code all 5 weekdays in a week',         icon: 'five_days_week', check: h => fullWorkWeek(h) },
      { id: 'quarter_century',name: 'Quarter Century', desc: '25 total unique coding days',           icon: 'quarter_century',check: h => uniqueCodingDays(h) >= 25 },
      { id: 'two_months',     name: 'Two Month Club',  desc: '60 unique coding days',                 icon: 'two_months',     check: h => uniqueCodingDays(h) >= 60 },
      { id: 'power_user',     name: 'Power User',      desc: 'Code 100 unique days',                  icon: 'power_user',     check: h => uniqueCodingDays(h) >= 100 },
      { id: 'relentless',     name: 'Relentless',      desc: '90% consistency in last 90 days',       icon: 'relentless',     check: h => consistencyPct(h) >= 90 },
      { id: 'legendary',      name: 'Legendary',       desc: 'Code 365 unique days',                  icon: 'legendary',      check: h => uniqueCodingDays(h) >= 365 },
      { id: 'reflective_coder',name: 'Reflective Coder',desc: 'Add notes to 10 sessions in a row',     icon: 'reflective_coder',check: h => maxConsecutiveNotes(h) >= 10 },
      { id: 'note_keeper',    name: 'Note Keeper',     desc: 'Attach notes to 25 sessions',           icon: 'note_keeper',    check: h => h.filter(s => s.note?.summary).length >= 25 },
      { id: 'week_anchor',    name: 'Week Anchor',     desc: 'Log 10+ active hours in one week',      icon: 'week_anchor',    check: h => Object.values(sessionsByWeek(h)).some(seconds => seconds >= 36000) },
      { id: 'reset_rebound',  name: 'Reset Rebound',   desc: 'Return after 7+ days away and complete a session', icon: 'reset_rebound', check: h => hasComebackGap(h, 7) },
    ],
  };

  // ══════════════════════════════════════════════════════════════
  // BADGE DEFINITIONS — 4 progressive badges with 5 tiers each
  // ══════════════════════════════════════════════════════════════
  const BADGE_TIERS = ['none','bronze','silver','gold','platinum','diamond'];
  const BADGE_TIER_LABELS = ['—','Bronze','Silver','Gold','Platinum','Diamond'];

  const BADGE_SVG = {
    code_clock: `<svg viewBox="0 0 20 20"><circle cx="10" cy="10" r="8" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M10 5v5l3 2" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><circle cx="10" cy="10" r="1.5" fill="currentColor"/></svg>`,
    fire_keeper:`<svg viewBox="0 0 20 20"><path d="M10 2C8 5.5 7 7.5 8 10.5c.4 1.2-.4 2.2-1.5 2A6 6 0 1016 10c-.8 3.5-3.5 4-4.5 2.5C12.5 10 13 7 10 2z" fill="currentColor"/></svg>`,
    focus_forge:`<svg viewBox="0 0 20 20"><path d="M10 2l2 6h6l-5 3.6L15 18l-5-3.6L5 18l2-6.4L2 8h6z" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M10 5l1.2 3.6h3.8l-3.1 2.2 1.2 3.6L10 12l-3.1 2.4 1.2-3.6L5 8.6h3.8z" fill="currentColor"/></svg>`,
    iron_coder: `<svg viewBox="0 0 20 20"><path d="M5 3h10l2 5-7 9-7-9z" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M5 3l2 5h6l2-5" stroke="currentColor" stroke-width="1"/><path d="M7 8l3 7 3-7" stroke="currentColor" stroke-width="1"/></svg>`,
  };

  const BADGES = [
    {
      id: 'code_clock', name: 'Code Clock', svg: 'code_clock',
      desc: 'Total active coding hours',
      thresholds: [10, 50, 200, 500, 1000],
      value: h => totalActiveHours(h),
      fmt: v => v >= 1 ? v.toFixed(1) + 'h' : Math.round(v * 60) + 'm',
      rawFmt: t => t >= 1 ? t.toFixed(1) : (t * 60).toFixed(0),
      unit: 'h',
    },
    {
      id: 'fire_keeper', name: 'Fire Keeper', svg: 'fire_keeper',
      desc: 'Max consecutive coding days',
      thresholds: [3, 7, 30, 60, 100],
      value: h => maxDayStreak(h),
      fmt: v => v + ' days',
      rawFmt: v => v,
      unit: ' days',
    },
    {
      id: 'focus_forge', name: 'Focus Forge', svg: 'focus_forge',
      desc: 'Total flow state sessions (25+ min streak)',
      thresholds: [5, 20, 50, 100, 250],
      value: h => h.filter(s => s.maxStreak >= 1500).length,
      fmt: v => v + ' sessions',
      rawFmt: v => v,
      unit: '',
    },
    {
      id: 'iron_coder', name: 'Iron Coder', svg: 'iron_coder',
      desc: '% of days coded in last 90 days',
      thresholds: [25, 50, 75, 90, 100],
      value: h => consistencyPct(h),
      fmt: v => v + '%',
      rawFmt: v => v,
      unit: '%',
    },
  ];

  // ══════════════════════════════════════════════════════════════
  // LANGUAGE + MOOD META
  // ══════════════════════════════════════════════════════════════
  const LANGUAGE_META = {
    typescript: { label: 'TypeScript', shortLabel: 'TS', color: '#3178C6' },
    typescriptreact: { label: 'TypeScript React', shortLabel: 'TSX', color: '#3178C6' },
    javascript: { label: 'JavaScript', shortLabel: 'JS', color: '#F7DF1E' },
    javascriptreact: { label: 'JavaScript React', shortLabel: 'JSX', color: '#F7DF1E' },
    python: { label: 'Python', shortLabel: 'PY', color: '#3572A5' },
    json: { label: 'JSON', shortLabel: 'JSON', color: '#F5C542' },
    markdown: { label: 'Markdown', shortLabel: 'MD', color: '#083FA1' },
    html: { label: 'HTML', shortLabel: 'HTML', color: '#E44D26' },
    css: { label: 'CSS', shortLabel: 'CSS', color: '#1572B6' },
    scss: { label: 'SCSS', shortLabel: 'SCSS', color: '#CF649A' },
    less: { label: 'Less', shortLabel: 'LESS', color: '#1D365D' },
    go: { label: 'Go', shortLabel: 'GO', color: '#00ADD8' },
    rust: { label: 'Rust', shortLabel: 'RS', color: '#DEA584' },
    java: { label: 'Java', shortLabel: 'JAVA', color: '#B07219' },
    csharp: { label: 'C#', shortLabel: 'C#', color: '#178600' },
    cpp: { label: 'C++', shortLabel: 'C++', color: '#F34B7D' },
    c: { label: 'C', shortLabel: 'C', color: '#555555' },
    shellscript: { label: 'Shell', shortLabel: 'SH', color: '#89E051' },
    yaml: { label: 'YAML', shortLabel: 'YAML', color: '#CB171E' },
    toml: { label: 'TOML', shortLabel: 'TOML', color: '#9C4221' },
  };
  const DEFAULT_LANG_COLOR = '#4FC3F7';

  const MOOD_LABELS = {
    1: '😴 Drained',
    2: '😐 Low',
    3: '🙂 Ok',
    4: '😄 Good',
    5: '🔥 Fired up',
  };

  // ══════════════════════════════════════════════════════════════
  // STAT HELPERS
  // ══════════════════════════════════════════════════════════════

  function totalActiveSeconds(h) { return h.reduce((a,s) => a + (s.activeTime||0), 0); }
  function totalActiveHours(h) { return totalActiveSeconds(h) / 3600; }
  function totalFlowSeconds(h) { return h.filter(s=>s.maxStreak>=1500).reduce((a,s)=>a+s.maxStreak,0); }
  function totalDeepWorkCompleted(h) { return h.reduce((a,s)=>a+(s.deepWorkCompleted||0),0); }
  function totalBreakCount(h) { return h.reduce((a,s)=>a+(s.breaks||0),0); }
  function completedPlannedSessions(plans) { return (plans || []).filter(plan => plan.fulfilledSessionId).length; }

  function sessionsByDay(h) {
    const map = {};
    h.forEach(s => {
      const day = new Date(s.date).toDateString();
      if (!map[day]) map[day] = [];
      map[day].push(s);
    });
    return map;
  }

  function sessionsByWeek(h) {
    const map = {};
    h.forEach(s => {
      const date = new Date(s.date);
      const weekStart = new Date(date);
      weekStart.setHours(0, 0, 0, 0);
      weekStart.setDate(date.getDate() - ((date.getDay() + 6) % 7));
      const key = weekStart.toISOString().slice(0, 10);
      map[key] = (map[key] || 0) + (s.activeTime || 0);
    });
    return map;
  }

  function uniqueCodingDays(h) {
    return Object.keys(sessionsByDay(h)).length;
  }

  function maxDayStreak(h) {
    const days = Object.keys(sessionsByDay(h))
      .map(d => new Date(d).getTime())
      .sort((a,b) => a-b);
    if (!days.length) return 0;
    let max = 1, cur = 1;
    for (let i = 1; i < days.length; i++) {
      const diff = (days[i] - days[i-1]) / 86400000;
      if (diff <= 1.5) { cur++; max = Math.max(max, cur); } else cur = 1;
    }
    return max;
  }

  function hasComebackGap(h, gapDays) {
    const days = Object.keys(sessionsByDay(h))
      .map(d => new Date(d).getTime())
      .sort((a,b) => a-b);
    for (let i = 1; i < days.length; i++) {
      if ((days[i] - days[i - 1]) / 86400000 >= gapDays) return true;
    }
    return false;
  }

  function currentDayStreak(h) {
    const days = Object.keys(sessionsByDay(h))
      .map(d => new Date(d).getTime())
      .sort((a,b) => b-a);
    if (!days.length) return 0;
    const today = new Date(); today.setHours(0,0,0,0);
    let cur = 0, check = today.getTime();
    for (const d of days) {
      const ds = new Date(d); ds.setHours(0,0,0,0);
      const diff = (check - ds.getTime()) / 86400000;
      if (diff < 1.5) { cur++; check = ds.getTime()-1; } else break;
    }
    return cur;
  }

  function fullMonthStreak(h) {
    const byDay = sessionsByDay(h);
    const now = new Date();
    const y = now.getFullYear(), m = now.getMonth();
    const days = new Date(y, m, 0).getDate();
    for (let d = 1; d <= days; d++) {
      const key = new Date(y, m-1, d).toDateString();
      if (!byDay[key]) return false;
    }
    return true;
  }

  function fiveFlowInDay(h) {
    return Object.values(sessionsByDay(h)).some(ss =>
      ss.filter(s => s.maxStreak >= 1500).length >= 5
    );
  }

  function weekendWarrior(h) {
    return Object.entries(sessionsByDay(h)).some(([dayStr, ss]) => {
      const dow = new Date(dayStr).getDay();
      if (dow !== 0 && dow !== 6) return false;
      return ss.reduce((a,s) => a+s.activeTime, 0) >= 14400;
    });
  }

  function timeOfDayCount(h, hourStart, hourEnd) {
    return h.filter(s => {
      const hr = new Date(s.date).getHours();
      return hr >= hourStart && hr < hourEnd;
    }).length;
  }

  function consistencyPct(h) {
    const byDay = sessionsByDay(h);
    let coded = 0;
    for (let i = 0; i < 90; i++) {
      const d = new Date(Date.now() - i*86400000).toDateString();
      if (byDay[d]) coded++;
    }
    return Math.round((coded / 90) * 100);
  }

  function avgEfficiency(h, last) {
    const recent = h.slice(-last);
    if (!recent.length) return 0;
    const sum = recent.reduce((a,s) => {
      const engaged = Number.isFinite(s.engagedTime) ? s.engagedTime : s.activeTime;
      return a + (s.totalTime > 0 ? engaged / s.totalTime : 1);
    }, 0);
    return Math.round((sum / recent.length) * 100);
  }

  function fullWorkWeek(h) {
    const byDay = sessionsByDay(h);
    const days = Object.keys(byDay).map(d => new Date(d));
    // Check any Mon-Fri run
    for (let i = 0; i < days.length - 4; i++) {
      const base = days[i];
      const dow = base.getDay();
      if (dow !== 1) continue;
      let allPresent = true;
      for (let d = 0; d < 5; d++) {
        const check = new Date(base.getTime() + d*86400000).toDateString();
        if (!byDay[check]) { allPresent = false; break; }
      }
      if (allPresent) return true;
    }
    return false;
  }

  function todaySeconds(h) {
    const today = new Date().toDateString();
    return h.filter(s => new Date(s.date).toDateString() === today)
      .reduce((a,s) => a+s.activeTime, 0);
  }

  function todayEngagedSeconds(h) {
    const today = new Date().toDateString();
    return h.filter(s => new Date(s.date).toDateString() === today)
      .reduce((a,s) => a + (Number.isFinite(s.engagedTime) ? s.engagedTime : s.activeTime), 0);
  }

  function todayTotalSeconds(h) {
    const today = new Date().toDateString();
    return h.filter(s => new Date(s.date).toDateString() === today)
      .reduce((a,s) => a+s.totalTime, 0);
  }

  function todayFlowSeconds(h) {
    const today = new Date().toDateString();
    return h.filter(s => new Date(s.date).toDateString() === today)
      .reduce((a,s) => a + (s.flowTime || 0), 0);
  }

  function todayBreaks(h) {
    const today = new Date().toDateString();
    return h.filter(s => new Date(s.date).toDateString() === today)
      .reduce((a,s) => a+(s.breaks||0), 0);
  }

  function todayIdleCount(h) {
    const today = new Date().toDateString();
    return h.filter(s => new Date(s.date).toDateString() === today)
      .reduce((a,s) => a+(s.idleCount||0), 0);
  }

  function todayFlowCount(h) {
    const today = new Date().toDateString();
    return h.filter(s => new Date(s.date).toDateString() === today && s.maxStreak >= 1500).length;
  }

  function todayBestStreak(h) {
    const today = new Date().toDateString();
    return h.filter(s => new Date(s.date).toDateString() === today)
      .reduce((a,s) => Math.max(a, s.maxStreak), 0);
  }

  function normalizeLang(id) {
    return (id || '').trim().toLowerCase();
  }

  function getLangMeta(id) {
    const key = normalizeLang(id);
    const meta = LANGUAGE_META[key];
    if (meta) return meta;
    const label = key
      ? key.replace(/_/g, ' ').replace(/\b\w/g, m => m.toUpperCase())
      : 'Unknown';
    return {
      label,
      shortLabel: label.split(' ').map(p => p[0]).join('') || '—',
      color: DEFAULT_LANG_COLOR,
    };
  }

  function mergeLanguageBreakdowns(entries) {
    const merged = {};
    entries.forEach(entry => {
      if (!entry) return;
      Object.entries(entry).forEach(([id, seconds]) => {
        merged[id] = (merged[id] || 0) + (seconds || 0);
      });
    });
    return merged;
  }

  function breakdownFromSessions(sessions) {
    const merged = {};
    sessions.forEach(session => {
      if (session.languageBreakdown) {
        Object.entries(session.languageBreakdown).forEach(([id, seconds]) => {
          merged[id] = (merged[id] || 0) + (seconds || 0);
        });
        return;
      }
      if (session.language) {
        const key = normalizeLang(session.language);
        if (key) {
          merged[key] = (merged[key] || 0) + (session.activeTime || 0);
        }
      }
    });
    return merged;
  }

  function historyLanguageBreakdown(h, daysBack) {
    const cutoff = daysBack ? Date.now() - (daysBack * 86400000) : null;
    const sessions = h.filter(s => {
      if (!cutoff) return true;
      return new Date(s.date).getTime() >= cutoff;
    });
    return breakdownFromSessions(sessions);
  }

  function todayLanguageBreakdown(h) {
    const today = new Date().toDateString();
    const sessions = h.filter(s => new Date(s.date).toDateString() === today);
    return breakdownFromSessions(sessions);
  }

  function topLanguages(breakdown, count) {
    return Object.entries(breakdown)
      .map(([id, seconds]) => ({ id, seconds }))
      .sort((a,b) => b.seconds - a.seconds)
      .slice(0, count);
  }

  function calculateBreakHygiene(totalTime, breaks, intervalMinutes) {
    const safeInterval = Math.max(1, intervalMinutes || 45);
    const expected = Math.floor(totalTime / (safeInterval * 60));
    if (expected <= 0) return 1;
    if (breaks <= 0) return 0;
    return Math.min(1, breaks / expected);
  }

  function calculateFocusScore(activeTime, totalTime, flowTime, breaks, idleCount, intervalMinutes) {
    if (!totalTime || totalTime <= 0) return 0;
    const activeScore = (activeTime / totalTime) * 40;
    const flowScore = (flowTime / totalTime) * 30;
    const breakScore = calculateBreakHygiene(totalTime, breaks, intervalMinutes) * 20;
    const idleBonus = idleCount < 3 ? 10 : 0;
    return Math.max(0, Math.min(100, Math.round(activeScore + flowScore + breakScore + idleBonus)));
  }

  function focusScoreForSession(session) {
    if (Number.isFinite(session.focusScore)) return session.focusScore;
    return calculateFocusScore(
      session.activeTime,
      session.totalTime,
      session.flowTime || 0,
      session.breaks || 0,
      session.idleCount || 0,
      lastBreakInterval
    );
  }

  function distinctLanguagesSince(h, days) {
    const cutoff = Date.now() - (days * 86400000);
    const set = new Set();
    h.filter(s => new Date(s.date).getTime() >= cutoff)
      .forEach(s => {
        if (s.languageBreakdown) {
          Object.keys(s.languageBreakdown).forEach(id => set.add(id));
        } else if (s.language) {
          set.add(normalizeLang(s.language));
        }
      });
    return set.size;
  }

  function maxConsecutiveNotes(h) {
    const sorted = [...h].sort((a,b) => new Date(a.date) - new Date(b.date));
    let max = 0;
    let current = 0;
    sorted.forEach(session => {
      if (session.note && session.note.summary) {
        current += 1;
        max = Math.max(max, current);
      } else {
        current = 0;
      }
    });
    return max;
  }

  function focusClass(score) {
    if (score >= 85) return 'focus-elite';
    if (score >= 70) return 'focus-strong';
    if (score >= 40) return 'focus-warm';
    return 'focus-low';
  }

  function goalDaysHit(h, goalSec) {
    const byDay = sessionsByDay(h);
    return Object.values(byDay).filter(ss =>
      ss.reduce((a,s) => a+s.activeTime, 0) >= goalSec
    ).length;
  }

  function goalDayStreak(h, goalSec) {
    const byDay = sessionsByDay(h);
    const days = Object.entries(byDay)
      .map(([d, ss]) => ({
        ms: new Date(d).getTime(),
        hit: ss.reduce((a,s) => a+s.activeTime, 0) >= goalSec
      }))
      .filter(x => x.hit)
      .map(x => x.ms)
      .sort((a,b) => b-a);

    if (!days.length) return 0;
    const today = new Date(); today.setHours(0,0,0,0);
    let cur = 0, check = today.getTime();
    for (const ms of days) {
      const ds = new Date(ms); ds.setHours(0,0,0,0);
      const diff = (check - ds.getTime()) / 86400000;
      if (diff < 1.5) { cur++; check = ds.getTime()-1; } else break;
    }
    return cur;
  }

  // ══════════════════════════════════════════════════════════════
  // FORMAT HELPERS
  // ══════════════════════════════════════════════════════════════

  function fmt(sec) {
    sec = Math.max(0, Math.round(sec));
    const h = Math.floor(sec/3600);
    const m = Math.floor((sec%3600)/60);
    const s = sec%60;
    if (h > 0) return `${h}h ${m}m`;
    if (m > 0) return `${m}m ${s}s`;
    return `${s}s`;
  }

  function fmtHours(sec) { return (sec/3600).toFixed(1) + 'h'; }

  function fmtDate(dateStr) {
    const d = new Date(dateStr);
    return d.toLocaleDateString(undefined, { month:'short', day:'numeric' });
  }

  function escapeText(value) {
    return String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  // ══════════════════════════════════════════════════════════════
  // DOM
  // ══════════════════════════════════════════════════════════════

  const $ = id => document.getElementById(id);
  const tabs   = document.querySelectorAll('.tab');
  const panels = document.querySelectorAll('.tab-panel');

  function activateTab(name) {
    tabs.forEach(t => t.classList.toggle('active', t.dataset.tab === name));
    panels.forEach(p => p.classList.toggle('active', p.id === `tab-${name}`));
    uiState.activeTab = name;
    vscode.setState(uiState);

    syncAddNoteVisibility();
  }

  tabs.forEach(t => t.addEventListener('click', () => activateTab(t.dataset.tab)));
  activateTab(uiState.activeTab || 'today');

  // ══════════════════════════════════════════════════════════════
  // RENDER: LIVE STRIP
  // ══════════════════════════════════════════════════════════════

  function renderLiveStrip(isTracking, efficiency, session, isIdle, streakSec, flowActive, deepWorkActive) {
    const strip = $('liveStrip');
    if (!isTracking && !session) {
      strip.classList.add('hidden');
      return;
    }
    strip.classList.remove('hidden');

    const dot   = $('liveDot');
    const label = $('liveLabel');
    $('liveTime').textContent = session ? fmt(session.activeTime) : '0s';

    // Flow streak badge
    const badge = $('liveStreak');
    if (flowActive && streakSec >= 1500) {
      badge.classList.remove('hidden');
      $('liveStreakVal').textContent = fmt(streakSec);
    } else {
      badge.classList.add('hidden');
    }

    dot.className = 'live-dot';
    label.className = 'live-label';

    if (!isTracking) {
      dot.classList.add('paused');
      label.textContent = 'PAUSED';
      $('liveState').textContent = 'Paused';
    } else if (deepWorkActive) {
      dot.classList.add('deep');
      label.classList.add('deep');
      label.textContent = 'DEEP';
      $('liveState').textContent = 'Deep Work';
    } else if (isIdle) {
      dot.classList.add('idle');
      label.classList.add('idle');
      label.textContent = 'IDLE';
      $('liveState').textContent = 'Idle';
    } else if (flowActive) {
      dot.classList.add('flow');
      label.classList.add('flow');
      label.textContent = 'FLOW';
      $('liveState').textContent = '⚡ Flow';
    } else {
      label.textContent = 'LIVE';
      $('liveState').textContent = 'Active';
    }

    const pct = Math.max(0, Math.min(100, Math.round(efficiency)));
    $('effPct').textContent = `${pct}%`;
    const fill = $('effFill');
    fill.style.width = `${pct}%`;
    fill.style.backgroundColor =
      pct >= 70 ? 'var(--accent-green)' :
      pct >= 40 ? 'var(--accent-orange)' :
                  'var(--accent-red)';
  }

  // ══════════════════════════════════════════════════════════════
  // RENDER: TODAY TAB
  // ══════════════════════════════════════════════════════════════

  function renderToday(history, goalMinutes, breakIntervalMinutes, focusEnabled) {
    const hasData = history.length > 0;
    $('emptyToday').classList.toggle('hidden', hasData);
    $('todayContent').style.display = hasData ? '' : 'none';
    if (!hasData) return;

    const todaySec     = todaySeconds(history);
    const todayEngaged = todayEngagedSeconds(history);
    const todayTotal   = todayTotalSeconds(history);
    const todayIdleSec = Math.max(0, todayTotal - todaySec);
    const todayEff     = todayTotal > 0 ? Math.round((todayEngaged/todayTotal)*100) : 0;
    const todaySess    = (sessionsByDay(history)[new Date().toDateString()] || []).length;
    const bestSt       = todayBestStreak(history);
    const flowCnt      = todayFlowCount(history);
    const brkCnt       = todayBreaks(history);
    const todayFlowSec = todayFlowSeconds(history);
    const idleEvents = todayIdleCount(history);
    const focusScore = focusEnabled
      ? calculateFocusScore(todaySec, todayTotal, todayFlowSec, brkCnt, idleEvents, breakIntervalMinutes)
      : 0;

    $('todayActive').textContent   = fmt(todaySec);
    $('todayStreak').textContent   = fmt(bestSt);
    $('todaySessions').textContent = todaySess;
    $('todayFlow').textContent     = flowCnt > 0 ? `${flowCnt} × ⚡` : '—';

    $('todayTotal').textContent    = fmt(todayTotal);
    $('todayActive2').textContent  = fmt(todaySec);
    $('todayIdle').textContent     = fmt(todayIdleSec);
    $('todayEff').textContent      = todayTotal > 0 ? `${todayEff}%` : '—';
    $('todayFlowCount').textContent= flowCnt;
    $('todayBreaks').textContent   = brkCnt;

    const allSec    = totalActiveSeconds(history);
    const allStreak = history.reduce((a,s) => Math.max(a,s.maxStreak), 0);
    const longest   = history.reduce((a,s) => Math.max(a,s.totalTime), 0);
    const allFlow   = history.filter(s => s.maxStreak >= 1500).length;
    const allAvgSec = history.length ? allSec/history.length : 0;
    const daySt     = currentDayStreak(history);
    const first     = history.length
      ? new Date(history[0].date).toLocaleDateString(undefined, {year:'numeric',month:'short',day:'numeric'})
      : '—';

    $('allSessions').textContent  = history.length;
    $('allActive').textContent    = fmtHours(allSec);
    $('allStreak').textContent    = fmt(allStreak);
    $('allLongest').textContent   = fmt(longest);
    $('allDayStreak').textContent = `${daySt} days`;
    $('allFlow').textContent      = allFlow;
    $('allAvg').textContent       = fmt(allAvgSec);
    $('allSince').textContent     = first;

    renderHeatmap(history);
    renderFocusScore(focusScore, focusEnabled);
    renderLanguageBreakdown(history);
    const heatEl = $('heatmapRange');
    if (heatEl && history.length) {
      heatEl.textContent = `${first} – now`;
    }
  }

  // ══════════════════════════════════════════════════════════════
  // RENDER: HEATMAP
  // ══════════════════════════════════════════════════════════════

  function renderHeatmap(history) {
    const container = $('heatmap');
    container.innerHTML = '';
    const byDay = {};
    history.forEach(s => {
      const key = new Date(s.date).toDateString();
      byDay[key] = (byDay[key]||0) + s.activeTime;
    });
    const maxSec = Math.max(...Object.values(byDay), 1);
    const WEEKS = 12;
    const now = new Date(); now.setHours(23,59,59,999);

    for (let w = WEEKS-1; w >= 0; w--) {
      const col = document.createElement('div');
      col.className = 'heatmap-col';
      for (let d = 6; d >= 0; d--) {
        const dayOffset = w*7 + d;
        const date = new Date(now.getTime() - dayOffset*86400000);
        const key  = date.toDateString();
        const sec  = byDay[key] || 0;
        const level= sec===0 ? 0 : Math.min(4, Math.ceil((sec/maxSec)*4));
        const cell = document.createElement('div');
        cell.className = 'hcell';
        cell.dataset.level = level;
        cell.title = `${date.toLocaleDateString(undefined,{month:'short',day:'numeric'})}: ${sec>0?fmt(sec):'No coding'}`;
        col.appendChild(cell);
      }
      container.appendChild(col);
    }
  }

  // ══════════════════════════════════════════════════════════════
  // RENDER: FOCUS SCORE
  // ══════════════════════════════════════════════════════════════

  function renderFocusScore(score, enabled) {
    const valueEl = $('focusScoreValue');
    const labelEl = $('focusScoreLabel');
    const hintEl = $('focusScoreHint');
    const arc = $('focusArc');
    if (!valueEl || !labelEl || !arc) return;

    if (!enabled) {
      valueEl.textContent = '—';
      labelEl.textContent = 'Focus score disabled';
      if (hintEl) hintEl.textContent = '';
      arc.style.strokeDashoffset = '157';
      arc.style.stroke = 'var(--accent-red)';
      return;
    }

    const safeScore = Math.max(0, Math.min(100, Math.round(score)));
    valueEl.textContent = safeScore.toString();
    labelEl.textContent =
      safeScore >= 85 ? 'Elite focus' :
      safeScore >= 70 ? 'Strong focus' :
      safeScore >= 40 ? 'Warming up' :
      safeScore > 0 ? 'Needs reset' : 'No data';
    if (hintEl) {
      hintEl.textContent = lastDeepWorkActive ? 'Deep Work active' : 'Today';
    }

    const arcLen = 157;
    const offset = arcLen - (safeScore / 100) * arcLen;
    arc.style.strokeDashoffset = offset.toFixed(2);
    arc.style.stroke =
      safeScore >= 85 ? '#2DD4BF' :
      safeScore >= 70 ? '#22C55E' :
      safeScore >= 40 ? '#F59E0B' : '#EF4444';
  }

  // ══════════════════════════════════════════════════════════════
  // RENDER: LANGUAGE BREAKDOWN
  // ══════════════════════════════════════════════════════════════

  function renderLanguageBreakdown(history) {
    const listEl = $('langList');
    const slicesEl = $('langDonutSlices');
    const totalEl = $('langTotal');
    if (!listEl || !slicesEl || !totalEl) return;

    const breakdown = todayLanguageBreakdown(history);
    const entries = topLanguages(breakdown, 5);
    const total = entries.reduce((a, e) => a + e.seconds, 0);
    totalEl.textContent = total > 0 ? fmt(total) : '0m';

    listEl.innerHTML = '';
    slicesEl.innerHTML = '';

    if (!entries.length) {
      const empty = document.createElement('div');
      empty.className = 'lang-empty';
      empty.textContent = 'No language data yet.';
      listEl.appendChild(empty);
      return;
    }

    const radius = 46;
    const circumference = 2 * Math.PI * radius;
    let offset = 0;

    entries.forEach(entry => {
      const meta = getLangMeta(entry.id);
      const pct = total > 0 ? (entry.seconds / total) : 0;
      const dash = circumference * pct;
      const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      circle.setAttribute('cx', '60');
      circle.setAttribute('cy', '60');
      circle.setAttribute('r', radius.toString());
      circle.setAttribute('fill', 'none');
      circle.setAttribute('stroke', meta.color);
      circle.setAttribute('stroke-width', '10');
      circle.setAttribute('stroke-dasharray', `${dash} ${circumference - dash}`);
      circle.setAttribute('stroke-dashoffset', (-offset).toString());
      circle.setAttribute('stroke-linecap', 'round');
      slicesEl.appendChild(circle);
      offset += dash;

      const row = document.createElement('div');
      row.className = 'lang-row';
      row.innerHTML = `
        <span class="lang-dot" style="background:${meta.color}"></span>
        <span>${meta.label}</span>
        <span class="lang-time">${fmt(entry.seconds)}</span>
      `;
      listEl.appendChild(row);
    });
  }

  function renderLanguageLeaderboard(history) {
    const listEl = $('languageLeaderboard');
    if (!listEl) return;
    const breakdown = historyLanguageBreakdown(history);
    const entries = topLanguages(breakdown, 8);
    listEl.innerHTML = '';

    if (!entries.length) {
      const empty = document.createElement('div');
      empty.className = 'lang-empty';
      empty.textContent = 'No language history yet.';
      listEl.appendChild(empty);
      return;
    }

    entries.forEach(entry => {
      const meta = getLangMeta(entry.id);
      const row = document.createElement('div');
      row.className = 'lang-row';
      row.innerHTML = `
        <span class="lang-dot" style="background:${meta.color}"></span>
        <span>${meta.label}</span>
        <span class="lang-time">${fmt(entry.seconds)}</span>
      `;
      listEl.appendChild(row);
    });
  }

  function renderProjects(projects) {
    const list = $('projectList');
    if (!list) return;
    list.innerHTML = '';
    const rows = (projects || []).slice(0, 8);
    if (!rows.length) {
      list.innerHTML = '<div class="lang-empty">No project data yet.</div>';
      return;
    }
    const max = Math.max(...rows.map(p => p.weekMinutes || p.totalMinutes || 0), 1);
    rows.forEach(project => {
      const minutes = project.totalMinutes || 0;
      const week = project.weekMinutes || 0;
      const row = document.createElement('div');
      row.className = 'project-row';
      row.innerHTML = `
        <div class="project-main">
          <div class="project-title">${escapeText(project.displayName || project.projectId)}</div>
          <div class="project-meta">${fmt(minutes * 60)} all-time · ${fmt(week * 60)} this week · ${project.sessions || 0} sessions</div>
          <div class="project-bar"><div class="project-bar-fill" style="width:${Math.max(3, Math.round((week / max) * 100))}%"></div></div>
        </div>
      `;
      list.appendChild(row);
    });
  }

  function renderPlanner(plans) {
    const list = $('plannerList');
    if (!list) return;
    list.innerHTML = '';
    const safePlans = plans || [];
    const now = new Date();
    const todayIso = localDateIso(now);
    const upcoming = safePlans.filter(plan => !plan.fulfilledSessionId && new Date(`${plan.date}T${plan.startTime}:00`) >= startOfDay(now));
    const todayPlans = safePlans.filter(plan => plan.date === todayIso);
    const doneCount = safePlans.filter(plan => plan.fulfilledSessionId).length;
    const queuedMinutes = upcoming.reduce((sum, plan) => sum + (Number(plan.durationMinutes) || 0), 0);
    if ($('plannerTodayCount')) $('plannerTodayCount').textContent = String(todayPlans.length);
    if ($('plannerUpcomingMinutes')) $('plannerUpcomingMinutes').textContent = fmt(queuedMinutes * 60);
    if ($('plannerDoneCount')) $('plannerDoneCount').textContent = String(doneCount);
    if ($('plannerSummary')) $('plannerSummary').textContent = `${upcoming.length} upcoming`;
    const rows = (plans || [])
      .slice()
      .sort((a,b) => new Date(`${a.date}T${a.startTime}:00`) - new Date(`${b.date}T${b.startTime}:00`))
      .slice(0, 12);
    if (!rows.length) {
      list.innerHTML = '<div class="lang-empty">No planned sessions yet. Schedule one to anchor your next focus block.</div>';
      return;
    }
    rows.forEach(plan => {
      const start = new Date(`${plan.date}T${plan.startTime}:00`);
      const end = new Date(start.getTime() + (Number(plan.durationMinutes) || 0) * 60000);
      const isDone = Boolean(plan.fulfilledSessionId);
      const isOverdue = !isDone && end < now;
      const day = start.toLocaleDateString(undefined, { day: '2-digit' });
      const month = start.toLocaleDateString(undefined, { month: 'short' });
      const time = start.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
      const relative = relativePlanLabel(start, now);
      const row = document.createElement('div');
      row.className = `planner-row${isDone ? ' done' : ''}${isOverdue ? ' overdue' : ''}`;
      row.innerHTML = `
        <div class="planner-date-chip" aria-hidden="true">
          <strong>${escapeText(day)}</strong>
          <span>${escapeText(month)}</span>
        </div>
        <div class="planner-main">
          <div class="planner-title">${escapeText(plan.label || 'Planned coding session')}</div>
          <div class="planner-meta">
            <span class="planner-pill"><i class="codicon codicon-clock"></i>${escapeText(time)}</span>
            <span class="planner-pill"><i class="codicon codicon-watch"></i>${Number(plan.durationMinutes) || 0}m</span>
            <span class="planner-pill ${isDone ? 'done' : isOverdue ? 'overdue' : ''}">${isDone ? 'Fulfilled' : isOverdue ? 'Missed' : escapeText(relative)}</span>
          </div>
        </div>
        <button class="icon-btn planner-delete" title="Delete plan" data-delete-plan="${escapeText(plan.id)}"><i class="codicon codicon-trash"></i></button>
      `;
      list.appendChild(row);
    });
    list.querySelectorAll('[data-delete-plan]').forEach(btn => {
      btn.addEventListener('click', () => vscode.postMessage({ type: 'deletePlan', id: btn.getAttribute('data-delete-plan') }));
    });
  }

  function startOfDay(date) {
    const copy = new Date(date);
    copy.setHours(0, 0, 0, 0);
    return copy;
  }

  function relativePlanLabel(start, now) {
    const diffMs = start.getTime() - now.getTime();
    if (diffMs < 0) return 'Started';
    const minutes = Math.round(diffMs / 60000);
    if (minutes < 60) return `In ${Math.max(1, minutes)}m`;
    const hours = Math.round(minutes / 60);
    if (hours < 24) return `In ${hours}h`;
    const days = Math.round(hours / 24);
    return `In ${days}d`;
  }

  function localDateIso(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  function renderPomodoro(history) {
    const today = new Date().toDateString();
    const sessions = history.filter(s => new Date(s.date).toDateString() === today);
    const count = sessions.reduce((sum, s) => sum + (s.pomodorosCompleted || 0), 0);
    const focusSeconds = sessions.reduce((sum, s) => sum + (s.pomodoroFocusSeconds || 0), 0);
    const ring = $('pomodoroRing');
    if (ring) {
      const pct = Math.min(100, (count % 4) * 25);
      ring.setAttribute('stroke-dashoffset', (314.16 - (pct / 100) * 314.16).toFixed(2));
      ring.setAttribute('stroke', count >= 4 ? 'var(--accent-green)' : 'var(--accent-orange)');
    }
    if ($('pomodoroCount')) $('pomodoroCount').textContent = count;
    if ($('pomodoroStatus')) $('pomodoroStatus').textContent = count >= 4 ? 'Pomodoro rhythm complete' : 'Focus rhythm building';
    if ($('pomodoroSub')) $('pomodoroSub').textContent = `${fmt(focusSeconds)} tracked inside Pomodoro work blocks today.`;
  }

  function renderInsight(insights) {
    const card = $('insightCard');
    if (!card) return;
    const latest = (insights || [])[0];
    if (!latest) {
      card.innerHTML = 'No AI insight yet. Enable AI insights and generate one when you want a weekly coaching note.';
      return;
    }
    card.innerHTML = `
      <div><strong>${new Date(latest.generatedAt).toLocaleDateString()}</strong></div>
      <ul>${(latest.bullets || []).map(b => `<li>${escapeText(b)}</li>`).join('')}</ul>
      <div><strong>Suggestion:</strong> ${escapeText(latest.suggestion || '')}</div>
    `;
  }

  function renderLeaderboard(rows, updatedAt) {
    const list = $('leaderboardList');
    if (!list) return;
    list.innerHTML = '';
    const data = rows || lastLeaderboardRows || [];
    if (!data.length) {
      list.innerHTML = '<div class="lang-empty">Refresh to load your opt-in Gist leaderboard.</div>';
      return;
    }
    data.forEach(row => {
      const item = document.createElement('div');
      item.className = 'leaderboard-row';
      item.innerHTML = `
        <div class="leaderboard-rank">#${row.rank}</div>
        <div class="leaderboard-main">
          <div class="leaderboard-name">${escapeText(row.avatar || '◆')} ${escapeText(row.name || 'Teammate')}</div>
          <div class="leaderboard-meta">${row.todayMinutes || 0}m today · ${row.streak || 0}d streak · ${row.focusScore || 0} focus</div>
        </div>
      `;
      list.appendChild(item);
    });
    if (updatedAt) {
      const stamp = document.createElement('div');
      stamp.className = 'leaderboard-meta';
      stamp.textContent = `Updated ${new Date(updatedAt).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}`;
      list.appendChild(stamp);
    }
  }

  // ══════════════════════════════════════════════════════════════
  // RENDER: GOALS TAB
  // ══════════════════════════════════════════════════════════════

  function renderGoals(history, isTracking, goalMinutes) {
    const safeGoalMinutes = Number.isFinite(goalMinutes) && goalMinutes > 0 ? goalMinutes : 120;
    const goalSec   = safeGoalMinutes * 60;
    const codedSec  = todaySeconds(history);
    const pct       = Math.min(100, Math.round((codedSec/goalSec)*100));
    const remaining = Math.max(0, goalSec - codedSec);

    $('goalTarget').textContent    = fmt(goalSec);
    $('goalCoded').textContent     = fmt(codedSec);
    $('goalRemaining').textContent = remaining > 0 ? fmt(remaining) : '🎉 Goal reached!';
    $('goalPct').textContent       = `${pct}%`;
    $('goalStatus').textContent    = pct >= 100 ? 'Goal reached! 🎉' : 'of daily goal';
    if (!goalInputDirty) {
      $('goalInput').value = safeGoalMinutes;
    }

    // Update preset buttons
    document.querySelectorAll('.preset-btn').forEach(btn => {
      btn.classList.toggle('active', parseInt(btn.dataset.val,10) === safeGoalMinutes);
    });

    // Ring fill
    const circ  = 314.16;
    const offset = circ - (pct/100)*circ;
    const color  = pct >= 100
      ? 'var(--accent-green)'
      : pct >= 75
        ? 'var(--accent-orange)'
        : 'var(--accent)';

    ['ringFill','ringGlow'].forEach(id => {
      const el = $(id);
      if (!el) return;
      el.setAttribute('stroke-dashoffset', offset.toFixed(2));
      el.setAttribute('stroke', color);
    });

    // Milestones
    [25,50,75,100].forEach(pctVal => {
      const el = document.getElementById(`ms${pctVal}`);
      if (el) el.classList.toggle('reached', pct >= pctVal);
    });

    // ETA
    if (isTracking && codedSec > 0 && remaining > 0) {
      const todaySess = (sessionsByDay(history)[new Date().toDateString()] || []);
      const totalToday= todaySess.reduce((a,s) => a+s.totalTime, 1);
      const rate = codedSec / totalToday;
      const etaSec = remaining / Math.max(rate, 0.01);
      const eta = new Date(Date.now() + etaSec*1000);
      $('goalEta').textContent = eta.toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'});
    } else {
      $('goalEta').textContent = pct >= 100 ? 'Done! 🎉' : '—';
    }

    $('goalDaysHit').textContent = goalDaysHit(history, goalSec);
    $('goalStreak').textContent  = goalDayStreak(history, goalSec) + ' days';

    // Week bars
    renderWeekBars(history, goalSec);
  }

  function renderWeekBars(history, goalSec) {
    const container = $('weekGoalBars');
    container.innerHTML = '';
    const DAYS = ['S','M','T','W','T','F','S'];
    const byDay = sessionsByDay(history);
    const now = new Date();
    const lastWeekSecs = [];

    for (let i = 6; i >= 0; i--) {
      const date = new Date(now.getTime() - i*86400000);
      const key  = date.toDateString();
      const sec  = (byDay[key]||[]).reduce((a,s)=>a+s.activeTime, 0);
      lastWeekSecs.push(sec);
    }

    const maxSec = Math.max(goalSec || 0, ...lastWeekSecs, 3600);

    for (let i = 6; i >= 0; i--) {
      const date = new Date(now.getTime() - i*86400000);
      const key  = date.toDateString();
      const sec  = lastWeekSecs[6 - i] ?? 0;
      const pct  = Math.min(100, Math.round((sec/maxSec)*100));
      const hit  = sec >= goalSec;

      const wrap = document.createElement('div');
      wrap.className = 'week-bar-wrap';

      const bar = document.createElement('div');
      bar.className = `week-bar${hit?' goal-hit':''}`;
      bar.style.height = `${Math.max(2, pct * 0.85)}%`;
      bar.title = `${date.toLocaleDateString(undefined,{weekday:'short',month:'short',day:'numeric'})}: ${sec>0?fmt(sec):'No coding'}`;

      const lbl = document.createElement('div');
      lbl.className = 'week-bar-lbl';
      lbl.textContent = DAYS[date.getDay()];

      wrap.appendChild(bar);
      wrap.appendChild(lbl);
      container.appendChild(wrap);
    }
  }

  // ══════════════════════════════════════════════════════════════
  // RENDER: ACHIEVEMENTS
  // ══════════════════════════════════════════════════════════════

  let prevUnlocked = new Set();

  function renderAchievements(history) {
    const unlocked = new Set();
    let totalCount = 0;

    const searchVal  = ($('achSearch') || {value:''}).value.toLowerCase();
    const filterVal  = ($('achFilter') || {value:'all'}).value;

    function renderCategory(containerId, list) {
      const el = $(containerId);
      if (!el) return;
      el.innerHTML = '';
      list.forEach(ach => {
        totalCount++;
        const isUnlocked = ach.check(history);
        if (isUnlocked) unlocked.add(ach.id);

        const matchSearch = !searchVal ||
          ach.name.toLowerCase().includes(searchVal) ||
          ach.desc.toLowerCase().includes(searchVal);
        const matchFilter = filterVal === 'all' ||
          (filterVal === 'unlocked' && isUnlocked) ||
          (filterVal === 'locked'   && !isUnlocked);

        const item = document.createElement('div');
        item.className = `ach-item ${isUnlocked?'unlocked':'locked'} ${(!matchSearch||!matchFilter)?'hidden':''}`;

        const iconSvg = ICONS[ach.icon] || ICONS['first_commit'];

        item.innerHTML = `
          <div class="ach-svg-icon">${iconSvg}</div>
          <div class="ach-text">
            <span class="ach-name">${ach.name}</span>
            <span class="ach-desc">${ach.desc}</span>
          </div>
          ${isUnlocked ? `<div class="ach-check">${CHECK_SVG}</div>` : ''}
        `;
        el.appendChild(item);
      });
    }

    renderCategory('achMilestones',   ACHIEVEMENTS.milestones);
    renderCategory('achStreaks',       ACHIEVEMENTS.streaks);
    renderCategory('achFlow',         ACHIEVEMENTS.flow);
    renderCategory('achProductivity', ACHIEVEMENTS.productivity);
    renderCategory('achTimeOfDay',    ACHIEVEMENTS.timeOfDay);
    renderCategory('achConsistency',  ACHIEVEMENTS.consistency);

    $('achCount').textContent = `${unlocked.size} / ${totalCount}`;

    const pct = totalCount > 0 ? Math.round((unlocked.size/totalCount)*100) : 0;
    $('achProgressFill').style.width = `${pct}%`;
    $('achProgressLabel').textContent = `${pct}%`;

    // Fire toasts for new unlocks
    unlocked.forEach(id => {
      if (!prevUnlocked.has(id) && prevUnlocked.size > 0) {
        const allAchs = [
          ...ACHIEVEMENTS.milestones, ...ACHIEVEMENTS.streaks,
          ...ACHIEVEMENTS.flow, ...ACHIEVEMENTS.productivity,
          ...ACHIEVEMENTS.timeOfDay, ...ACHIEVEMENTS.consistency,
        ];
        const ach = allAchs.find(a => a.id === id);
        if (ach) showToast(ach.name, ach.desc, ICONS[ach.icon]);
      }
    });
    prevUnlocked = new Set(unlocked);
  }

  // ══════════════════════════════════════════════════════════════
  // RENDER: BADGES
  // ══════════════════════════════════════════════════════════════

  function renderBadges(history) {
    const grid = $('badgeGrid');
    grid.innerHTML = '';
    let earned = 0;

    BADGES.forEach(badge => {
      const rawVal = badge.value(history);
      let tier = 0;
      badge.thresholds.forEach((t,i) => { if (rawVal >= t) tier = i+1; });
      if (tier > 0) earned++;

      const nextThreshold = badge.thresholds[tier] ?? null;
      const prevThreshold = badge.thresholds[tier-1] ?? 0;
      const progPct = nextThreshold
        ? Math.min(100, Math.round(((rawVal-prevThreshold)/(nextThreshold-prevThreshold))*100))
        : 100;

      const tierName  = BADGE_TIER_LABELS[tier];
      const tierClass = BADGE_TIERS[tier];
      const fmtVal    = badge.fmt(rawVal);
      const nextFmt   = nextThreshold !== null ? badge.fmt(nextThreshold) : null;

      const card = document.createElement('div');
      card.className = `badge-card tier-${tierClass} ${tier > 0 ? 'earned' : ''}`;
      card.innerHTML = `
        <div class="badge-top">
          <div class="badge-svg-wrap">${BADGE_SVG[badge.svg]}</div>
          <div>
            <div class="badge-name">${badge.name}</div>
            <div class="badge-tier">${tierName}</div>
          </div>
        </div>
        <div class="badge-prog-track">
          <div class="badge-prog-fill" style="width:${tier < 5 ? progPct : 100}%"></div>
        </div>
        <div class="badge-prog-label">
          ${tier < 5 ? `${fmtVal} → ${nextFmt}` : '🏆 Max tier reached!'}
        </div>
      `;
      grid.appendChild(card);
    });

    $('badgeCount').textContent = `${earned} / ${BADGES.length}`;
  }

  // ══════════════════════════════════════════════════════════════
  // RENDER: HISTORY TAB
  // ══════════════════════════════════════════════════════════════

  let selectedId = null;

  function renderHistory(history) {
    const chart = $('barChart');
    const empty = $('barEmpty');
    chart.querySelectorAll('.bar-wrapper').forEach(el => el.remove());

    if (!history.length) {
      empty.classList.remove('hidden');
      $('historyList').innerHTML = '';
      return;
    }
    empty.classList.add('hidden');

    const recent = history.slice(-14);
    const maxVal = Math.max(...recent.map(s => s.activeTime), 1);

    // Bar chart
    recent.forEach(session => {
      const pct = Math.max((session.activeTime/maxVal)*100, 2);
      const wrapper = document.createElement('div');
      wrapper.className = `bar-wrapper${session.id === selectedId ? ' selected' : ''}`;
      wrapper.dataset.id = session.id;
      const bar = document.createElement('div');
      bar.className = 'bar';
      bar.style.height = `${pct}%`;
      wrapper.appendChild(bar);
      wrapper.addEventListener('click', () => {
        chart.querySelectorAll('.bar-wrapper').forEach(el => el.classList.remove('selected'));
        wrapper.classList.add('selected');
        showDetail(session);
        selectedId = session.id;
      });
      chart.insertBefore(wrapper, empty);
    });

    // Axis labels
    const axis = $('barAxis');
    axis.innerHTML = '';
    recent.forEach(session => {
      const lbl = document.createElement('div');
      lbl.className = 'bar-axis-lbl';
      lbl.textContent = fmtDate(session.date);
      axis.appendChild(lbl);
    });

    // Session list
    const list = $('historyList');
    list.innerHTML = '';
    [...history].reverse().slice(0,20).forEach(session => {
      const item = document.createElement('div');
      item.className = `history-item${session.id === selectedId ? ' selected' : ''}`;
      const engaged = Number.isFinite(session.engagedTime)
        ? session.engagedTime
        : session.activeTime;
      const eff = session.totalTime > 0
        ? Math.round((engaged / session.totalTime) * 100)
        : 100;
      const focus = Number.isFinite(session.focusScore)
        ? session.focusScore
        : calculateFocusScore(
            session.activeTime,
            session.totalTime,
            session.flowTime || 0,
            session.breaks || 0,
            session.idleCount || 0,
            lastBreakInterval
          );
      const focusBadge = Number.isFinite(focus)
        ? `<span class="hi-focus ${focusClass(focus)}">${focus}</span>`
        : '';
      let langLabel = '';
      if (session.languageBreakdown) {
        const top = topLanguages(session.languageBreakdown, 3)
          .map(entry => getLangMeta(entry.id).shortLabel)
          .join(' · ');
        langLabel = top;
      } else if (session.language) {
        langLabel = getLangMeta(session.language).shortLabel;
      }
      const d = new Date(session.date);
      item.innerHTML = `
        <span class="hi-date">${d.toLocaleDateString(undefined,{month:'short',day:'numeric'})} ${d.toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}</span>
        <span class="hi-active">${fmt(session.activeTime)}</span>
        <span class="hi-eff">${eff}%</span>
        ${focusBadge}
        ${langLabel ? `<span class="hi-lang">${langLabel}</span>` : ''}
        ${session.project?.displayName ? `<span class="hi-lang">${escapeText(session.project.displayName)}</span>` : ''}
        ${session.commits?.length ? `<span class="hi-note">⑂ ${session.commits.length}</span>` : ''}
        ${session.pomodorosCompleted ? `<span class="hi-note">🍅 ${session.pomodorosCompleted}</span>` : ''}
        ${session.note ? `<span class="hi-note">note</span>` : ''}
      `;
      item.addEventListener('click', () => {
        list.querySelectorAll('.history-item').forEach(el => el.classList.remove('selected'));
        item.classList.add('selected');
        showDetail(session);
        selectedId = session.id;
      });
      list.appendChild(item);
    });

    // Show latest detail by default
    const defaultSel = history.find(s => s.id === selectedId) || history[history.length-1];
    if (defaultSel) showDetail(defaultSel);
  }

  function showDetail(session) {
    if (!session) return;
    const detail = $('selectionDetail');
    detail.classList.remove('hidden');
    const d = new Date(session.date);
    $('detailDate').textContent    = d.toLocaleDateString() + ' ' + d.toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'});
    $('detailDuration').textContent= fmt(session.totalTime);
    $('detailActive').textContent  = fmt(session.activeTime);
    $('detailStreak').textContent  = fmt(session.maxStreak);
    $('detailBreaks').textContent  = session.breaks ?? '—';
    $('detailIdle').textContent    = session.idleCount ?? '—';
    $('detailFlow').textContent    = fmt(session.flowTime || 0);
    $('detailDeepWork').textContent= fmt(session.deepWorkSeconds || 0);
    const engaged = Number.isFinite(session.engagedTime)
      ? session.engagedTime
      : session.activeTime;
    const eff = session.totalTime > 0 ? Math.round((engaged / session.totalTime) * 100) : 100;
    $('detailEff').textContent = `${eff}%`;
    $('detailEffBar').style.width = `${eff}%`;
    $('detailEffBar').style.backgroundColor =
      eff >= 70 ? 'var(--accent-green)' :
      eff >= 40 ? 'var(--accent-orange)' :
                  'var(--accent-red)';
    const langBadge = $('detailLang');
    if (langBadge) {
      let langLabel = '';
      if (session.languageBreakdown) {
        const top = topLanguages(session.languageBreakdown, 3)
          .map(entry => getLangMeta(entry.id).shortLabel)
          .join(' · ');
        langLabel = top;
      } else if (session.language) {
        langLabel = getLangMeta(session.language).shortLabel;
      }
      langBadge.textContent = langLabel;
      langBadge.style.display = langLabel ? '' : 'none';
    }

    const focusScore = Number.isFinite(session.focusScore)
      ? session.focusScore
      : calculateFocusScore(
          session.activeTime,
          session.totalTime,
          session.flowTime || 0,
          session.breaks || 0,
          session.idleCount || 0,
          lastBreakInterval
        );
    $('detailFocus').textContent = focusScore ? focusScore : '—';

    const noteEl = $('detailNote');
    if (noteEl) {
      if (session.note) {
        noteEl.classList.remove('hidden');
        noteEl.innerHTML = `
          ${session.project?.displayName ? `<div><strong>Project</strong> · ${escapeText(session.project.displayName)}</div>` : ''}
          ${session.commits?.length ? `<div><strong>Commits</strong> · ${session.commits.map(c => `${escapeText(c.hash)} ${escapeText(c.message)}`).join('<br>')}</div>` : ''}
          ${session.pomodorosCompleted ? `<div><strong>Pomodoros</strong> · ${session.pomodorosCompleted}</div>` : ''}
          <div><strong>Note</strong> · ${MOOD_LABELS[session.note.mood] || '🙂 Ok'}</div>
          <div>${session.note.summary}</div>
          ${session.note.blockers ? `<div>${session.note.blockers}</div>` : ''}
        `;
      } else {
        noteEl.classList.remove('hidden');
        noteEl.innerHTML = `
          ${session.project?.displayName ? `<div><strong>Project</strong> · ${escapeText(session.project.displayName)}</div>` : ''}
          ${session.commits?.length ? `<div><strong>Commits</strong> · ${session.commits.map(c => `${escapeText(c.hash)} ${escapeText(c.message)}`).join('<br>')}</div>` : ''}
          ${session.pomodorosCompleted ? `<div><strong>Pomodoros</strong> · ${session.pomodorosCompleted}</div>` : ''}
          <div><strong>Note</strong> · Not added</div>
          <button class="secondary-btn" id="detailAddNote">Add note</button>
        `;
        const addBtn = $('detailAddNote');
        if (addBtn) {
          // Only allow note adding from Journal tab UI.
          if (uiState.activeTab !== 'journal') {
            addBtn.style.display = 'none';
          } else {
            addBtn.style.display = '';
          }
          addBtn.addEventListener('click', () => openNoteComposer(session.id));
        }
      }
    }
  }

  // ══════════════════════════════════════════════════════════════
  // RENDER: JOURNAL
  // ══════════════════════════════════════════════════════════════

  function renderJournal(history) {
    const listEl = $('journalList');
    if (!listEl) return;
    const filterVal = ($('journalMoodFilter') || { value: 'all' }).value;
    const cutoff = Date.now() - (7 * 86400000);
    const notes = history
      .filter(s => s.note && new Date(s.date).getTime() >= cutoff)
      .map(s => ({
        sessionId: s.id,
        date: s.date,
        note: s.note,
      }))
      .filter(entry => {
        if (filterVal === 'all') return true;
        return String(entry.note.mood) === filterVal;
      })
      .sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    listEl.innerHTML = '';
    if (!notes.length) {
      const empty = document.createElement('div');
      empty.className = 'journal-empty';
      empty.textContent = 'No session notes for the last 7 days.';
      listEl.appendChild(empty);
      return;
    }

    notes.forEach(entry => {
      const item = document.createElement('div');
      item.className = 'journal-item';
      const d = new Date(entry.date);
      const moodLabel = MOOD_LABELS[entry.note.mood] || '🙂 Ok';
      item.innerHTML = `
        <div class="journal-item-header">
          <span>${d.toLocaleDateString(undefined,{month:'short',day:'numeric'})}</span>
          <span>${d.toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}</span>
          <span>${moodLabel}</span>
        </div>
        <div class="journal-item-title">${entry.note.summary}</div>
        ${entry.note.blockers ? `<div class="journal-item-blockers">${entry.note.blockers}</div>` : ''}
      `;
      listEl.appendChild(item);
    });
  }

  // ══════════════════════════════════════════════════════════════
  // ACHIEVEMENT TOAST
  // ══════════════════════════════════════════════════════════════

  let toastQueue = [];
  let toastBusy  = false;

  function showToast(name, desc, iconSvg) {
    toastQueue.push({ name, desc, iconSvg });
    if (!toastBusy) drainToast();
  }

  function drainToast() {
    if (!toastQueue.length) { toastBusy = false; return; }
    toastBusy = true;
    const { name, desc, iconSvg } = toastQueue.shift();
    const toast = $('achToast');
    $('toastName').textContent = name;
    $('toastDesc').textContent = desc;
    $('toastIcon').innerHTML   = iconSvg || '';
    toast.classList.add('show');
    setTimeout(() => {
      toast.classList.remove('show');
      setTimeout(drainToast, 400);
    }, 3500);
  }

  // ══════════════════════════════════════════════════════════════
  // MASTER RENDER
  // ══════════════════════════════════════════════════════════════

  let lastHistory    = [];
  // Notes saved optimistically but not yet persisted back from extension state.
  // Key: sessionId, Value: { summary, mood, blockers }
  let pendingNotesBySessionId = new Map();
  let lastTracking   = true;
  let lastEfficiency = 100;
  let lastSession    = null;
  let lastIdle       = false;
  let lastStreak     = 0;
  let lastFlow       = false;
  let lastBreakInterval = 45;
  let lastFlowThreshold = 25;
  let lastFocusEnabled = true;
  let lastFocusInStatus = true;
  let lastDeepWorkActive = false;
  let lastGoal       = uiState.goalMinutes || 120;
  let lastProjects   = [];
  let lastPlans      = [];
  let lastInsights   = [];
  let lastLeaderboardRows = [];
  let goalInputDirty = false;
  let goalDraftMinutes = null;
  let goalPendingMinutes = null;

  function syncAddNoteVisibility() {
    const isJournal = uiState.activeTab === 'journal';

    const addNoteBtn = $('addNoteBtn');
    if (addNoteBtn) addNoteBtn.style.display = isJournal ? '' : 'none';

    // History detail button is created only in showDetail() when note absent.
    const detailAddBtn = $('detailAddNote');
    if (detailAddBtn) detailAddBtn.style.display = isJournal ? '' : 'none';
  }

  function render(data) {
    const {
      history,
      projects,
      plannedSessions,
      aiInsights,
      isTracking,
      efficiency,
      liveSession,
      isIdle,
      streakSeconds,
      flowActive,
      dailyGoalMinutes,
      breakReminderInterval,
      flowStateThresholdMinutes,
      focusScoreEnabled,
      focusScoreInStatus,
      deepWorkActive,
    } = data;

    const incomingHistory = history || [];
    // Merge any pending optimistic notes into incoming history so the Journal
    // never loses the card while the backend catches up.
    if (pendingNotesBySessionId && pendingNotesBySessionId.size > 0 && incomingHistory.length > 0) {
      incomingHistory.forEach(s => {
        if (!s || !pendingNotesBySessionId.has(s.id)) return;
        const pending = pendingNotesBySessionId.get(s.id);
        const incomingNote = s.note;

        // If backend already persisted the note (match by summary+mood), clear it.
        const backendMatches =
          incomingNote &&
          incomingNote.summary === pending.summary &&
          String(incomingNote.mood) === String(pending.mood);

        if (backendMatches) {
          pendingNotesBySessionId.delete(s.id);
          return;
        }

        s.note = {
          ...(incomingNote || {}),
          summary: pending.summary,
          mood: pending.mood,
          blockers: pending.blockers,
        };
      });
    }

    lastHistory    = incomingHistory;
    lastProjects   = projects || [];
    lastPlans      = plannedSessions || [];
    lastInsights   = aiInsights || [];
    lastTracking   = isTracking ?? true;
    lastEfficiency = efficiency ?? 100;
    lastSession    = liveSession ?? null;
    lastIdle       = isIdle ?? false;
    lastStreak     = streakSeconds ?? 0;
    lastFlow       = flowActive ?? false;
    lastBreakInterval = Number.isFinite(breakReminderInterval) ? breakReminderInterval : 45;
    lastFlowThreshold = Number.isFinite(flowStateThresholdMinutes) ? flowStateThresholdMinutes : 25;
    lastFocusEnabled = focusScoreEnabled !== false;
    lastFocusInStatus = focusScoreInStatus !== false;
    lastDeepWorkActive = deepWorkActive === true;
    const incomingGoal = Number.isFinite(dailyGoalMinutes)
      ? dailyGoalMinutes
      : undefined;

    if (goalPendingMinutes !== null) {
      if (incomingGoal === goalPendingMinutes) {
        goalPendingMinutes = null;
        lastGoal = incomingGoal;
      } else {
        lastGoal = goalPendingMinutes;
      }
    } else {
      lastGoal = incomingGoal ?? uiState.goalMinutes ?? 120;
    }

    if (goalInputDirty && goalDraftMinutes !== null && incomingGoal === goalDraftMinutes) {
      goalInputDirty = false;
      goalDraftMinutes = null;
    }

    uiState.goalMinutes = lastGoal;
    vscode.setState(uiState);

    renderLiveStrip(lastTracking, lastEfficiency, lastSession, lastIdle, lastStreak, lastFlow, lastDeepWorkActive);
    renderToday(lastHistory, lastGoal, lastBreakInterval, lastFocusEnabled);
    renderGoals(lastHistory, lastTracking, lastGoal);
    renderAchievements(lastHistory);
    renderBadges(lastHistory);
    renderHistory(lastHistory);
    renderLanguageLeaderboard(lastHistory);
    renderProjects(lastProjects);
    renderPlanner(lastPlans);
    renderPomodoro(lastHistory);
    renderInsight(lastInsights);
    renderLeaderboard(lastLeaderboardRows);
    renderJournal(lastHistory);
    syncAddNoteVisibility();
    updateToggleBtn(lastTracking);
  }

  // ══════════════════════════════════════════════════════════════
  // CATEGORY ACCORDION
  // ══════════════════════════════════════════════════════════════

  document.querySelectorAll('.ach-cat-toggle').forEach(btn => {
    const catId  = btn.dataset.cat;
    const catEl  = $(catId);
    if (!catEl) return;
    catEl.style.maxHeight = catEl.scrollHeight + 'px';

    btn.addEventListener('click', () => {
      const collapsed = btn.classList.toggle('collapsed');
      if (collapsed) {
        catEl.style.maxHeight = '0';
      } else {
        catEl.style.maxHeight = catEl.scrollHeight + 'px';
      }
    });
  });

  // Update max-height after render so new items are included
  function refreshAccordions() {
    document.querySelectorAll('.ach-cat-toggle:not(.collapsed)').forEach(btn => {
      const catEl = $(btn.dataset.cat);
      if (catEl) catEl.style.maxHeight = catEl.scrollHeight + 'px';
    });
  }

  // ══════════════════════════════════════════════════════════════
  // BUTTON WIRING
  // ══════════════════════════════════════════════════════════════

  function updateToggleBtn(isTracking) {
    const btn  = $('toggleTrackingBtn');
    const icon = btn.querySelector('.codicon');
    btn.classList.toggle('paused', !isTracking);
    btn.title = isTracking ? 'Pause tracking' : 'Resume tracking';
    icon.className = `codicon ${isTracking ? 'codicon-debug-pause' : 'codicon-play'}`;
  }

  // ══════════════════════════════════════════════════════════════
  // NOTE COMPOSER
  // ══════════════════════════════════════════════════════════════

  let activeNoteSessionId = null;
  let activeMood = 3;
  let pendingJournalRefreshTimer = null;

  function openNoteComposer(sessionId) {
    if (!sessionId) return;
    const composer = $('noteComposer');
    if (!composer) return;
    activeNoteSessionId = sessionId;
    composer.classList.remove('hidden');
    $('noteSummary').value = '';
    $('noteBlockers').value = '';
    setMood(activeMood);
    $('noteSummary').focus();
  }

  function closeNoteComposer() {
    const composer = $('noteComposer');
    if (!composer) return;
    composer.classList.add('hidden');
    activeNoteSessionId = null;
  }

  function setMood(mood) {
    activeMood = mood;
    document.querySelectorAll('.mood-btn').forEach(btn => {
      btn.classList.toggle('active', parseInt(btn.dataset.mood, 10) === mood);
    });
  }

  const goalInput = $('goalInput');
  if (goalInput) {
    const markDirty = () => {
      const val = parseInt(goalInput.value, 10);
      if (!Number.isNaN(val)) {
        goalDraftMinutes = val;
      }
      goalInputDirty = true;
    };
    goalInput.addEventListener('input', markDirty);
    goalInput.addEventListener('change', markDirty);
  }

  $('toggleTrackingBtn').addEventListener('click', () => {
    vscode.postMessage({ type: 'toggleTracking' });
  });

  const addNoteBtn = $('addNoteBtn');
  if (addNoteBtn) {
    addNoteBtn.addEventListener('click', () => {
      const targetId = lastSession?.id || (lastHistory.length ? lastHistory[lastHistory.length - 1].id : null);
      if (targetId) {
        openNoteComposer(targetId);
        return;
      }
      vscode.postMessage({ type: 'showInfo', message: 'No sessions yet to add a note.' });
    });
  }

  $('clearHistoryBtn').addEventListener('click', () => {
    vscode.postMessage({ type: 'clearHistory' });
  });

  $('exportBtn').addEventListener('click', () => activateTab('history'));

  $('exportJsonBtn').addEventListener('click', () => {
    vscode.postMessage({ type: 'exportData', format: 'json', history: lastHistory });
  });

  $('exportCsvBtn').addEventListener('click', () => {
    vscode.postMessage({ type: 'exportData', format: 'csv', history: lastHistory });
  });

  document.querySelectorAll('.mood-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const mood = parseInt(btn.dataset.mood, 10);
      if (!Number.isNaN(mood)) {
        setMood(mood);
      }
    });
  });

  $('noteSaveBtn').addEventListener('click', () => {
    if (!activeNoteSessionId) return;
    const summary = $('noteSummary').value.trim();
    const blockers = $('noteBlockers').value.trim();

    const optimisticNote = {
      summary,
      mood: activeMood,
      blockers: blockers || undefined,
    };

    // Track optimistic note until backend history confirms it.
    pendingNotesBySessionId.set(activeNoteSessionId, optimisticNote);

    // Immediate optimistic render so the card appears right away.
    const current = Array.isArray(lastHistory) ? lastHistory : [];
    const idx = current.findIndex(s => s && s.id === activeNoteSessionId);

    if (idx >= 0) {
      const next = current.slice();
      next[idx] = { ...current[idx], note: optimisticNote };
      lastHistory = next;
    } else if (lastSession && lastSession.id === activeNoteSessionId) {
      lastHistory = current.concat([{ ...lastSession, note: optimisticNote }]);
    }

    renderHistory(lastHistory);
    renderJournal(lastHistory);

    vscode.postMessage({
      type: 'saveNote',
      payload: {
        sessionId: activeNoteSessionId,
        summary,
        mood: activeMood,
        blockers: blockers || undefined,
      },
    });
    closeNoteComposer();

    if (pendingJournalRefreshTimer) clearTimeout(pendingJournalRefreshTimer);
    pendingJournalRefreshTimer = setTimeout(() => {
      vscode.postMessage({ type: 'requestData' });
      pendingJournalRefreshTimer = null;
    }, 600);
  });

  $('noteCancelBtn').addEventListener('click', closeNoteComposer);
  $('noteCloseBtn').addEventListener('click', closeNoteComposer);

  $('goalSaveBtn').addEventListener('click', () => {
    const val = parseInt($('goalInput').value, 10);
    if (val >= 15 && val <= 720) {
      goalPendingMinutes = val;
      goalInputDirty = false;
      goalDraftMinutes = null;
      uiState.goalMinutes = val;
      vscode.setState(uiState);
      vscode.postMessage({ type: 'saveGoal', minutes: val });
      renderGoals(lastHistory, lastTracking, val);
    }
  });

  // Preset buttons
  document.querySelectorAll('.preset-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const val = parseInt(btn.dataset.val, 10);
      $('goalInput').value = val;
      goalDraftMinutes = val;
      goalInputDirty = true;
    });
  });

  // Achievement search & filter
  const achSearch = $('achSearch');
  const achFilter = $('achFilter');
  if (achSearch) {
    achSearch.addEventListener('input', () => {
      renderAchievements(lastHistory);
      refreshAccordions();
    });
  }
  if (achFilter) {
    achFilter.addEventListener('change', () => {
      renderAchievements(lastHistory);
      refreshAccordions();
    });
  }

  const journalMoodFilter = $('journalMoodFilter');
  if (journalMoodFilter) {
    journalMoodFilter.addEventListener('change', () => {
      renderJournal(lastHistory);
    });
  }

  const journalRefreshBtn = $('journalRefreshBtn');
  if (journalRefreshBtn) {
    journalRefreshBtn.addEventListener('click', () => {
      if (pendingJournalRefreshTimer) clearTimeout(pendingJournalRefreshTimer);
      pendingJournalRefreshTimer = setTimeout(() => {
        vscode.postMessage({ type: 'requestData' });
        pendingJournalRefreshTimer = null;
      }, 250);
    });
  }

  const todayIso = localDateIso(new Date());
  if ($('planDate')) $('planDate').value = todayIso;
  if ($('planTime')) {
    const nextHour = new Date(Date.now() + 3600000);
    $('planTime').value = nextHour.toTimeString().slice(0, 5);
  }
  if ($('addPlanBtn')) {
    $('addPlanBtn').addEventListener('click', () => {
      const duration = parseInt($('planDuration').value, 10);
      vscode.postMessage({
        type: 'addPlan',
        plan: {
          date: $('planDate').value,
          startTime: $('planTime').value,
          durationMinutes: Number.isFinite(duration) ? duration : 60,
          label: $('planLabel').value.trim(),
        },
      });
      $('planLabel').value = '';
    });
  }
  document.querySelectorAll('[data-plan-duration]').forEach(btn => {
    btn.addEventListener('click', () => {
      const minutes = btn.getAttribute('data-plan-duration');
      if ($('planDuration') && minutes) $('planDuration').value = minutes;
      document.querySelectorAll('[data-plan-duration]').forEach(other => other.classList.remove('active'));
      btn.classList.add('active');
    });
  });
  if ($('exportPlansBtn')) {
    $('exportPlansBtn').addEventListener('click', () => vscode.postMessage({ type: 'exportPlans' }));
  }
  if ($('refreshLeaderboardBtn')) {
    $('refreshLeaderboardBtn').addEventListener('click', () => vscode.postMessage({ type: 'refreshLeaderboard' }));
  }
  if ($('publishLeaderboardBtn')) {
    $('publishLeaderboardBtn').addEventListener('click', () => vscode.postMessage({ type: 'publishLeaderboard' }));
  }
  if ($('generateInsightBtn')) {
    $('generateInsightBtn').addEventListener('click', () => vscode.postMessage({ type: 'generateAiInsight' }));
  }

  // ══════════════════════════════════════════════════════════════
  // MESSAGE HANDLER
  // ══════════════════════════════════════════════════════════════

  window.addEventListener('message', event => {
    const msg = event.data;
    if (msg.type === 'history') {
      render(msg);
      refreshAccordions();
    } else if (msg.type === 'navigateTab') {
      activateTab(msg.tab);
    } else if (msg.type === 'openNoteComposer') {
      openNoteComposer(msg.sessionId);
    } else if (msg.type === 'leaderboard') {
      lastLeaderboardRows = msg.rows || [];
      renderLeaderboard(lastLeaderboardRows, msg.updatedAt);
    }
  });

  // ── Request initial data ────────────────────────────────────
  vscode.postMessage({ type: 'requestData' });

})();
