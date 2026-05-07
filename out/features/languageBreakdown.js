"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.normalizeLanguageId = normalizeLanguageId;
exports.getLanguageDisplayName = getLanguageDisplayName;
exports.getLanguageShortLabel = getLanguageShortLabel;
exports.getLanguageColor = getLanguageColor;
exports.addLanguageSeconds = addLanguageSeconds;
exports.mergeLanguageBreakdowns = mergeLanguageBreakdowns;
exports.getTopLanguages = getTopLanguages;
exports.getDominantLanguage = getDominantLanguage;
const LANGUAGE_DISPLAY = {
    typescript: { label: "TypeScript", shortLabel: "TS", color: "#3178C6" },
    typescriptreact: { label: "TypeScript React", shortLabel: "TSX", color: "#3178C6" },
    javascript: { label: "JavaScript", shortLabel: "JS", color: "#F7DF1E" },
    javascriptreact: { label: "JavaScript React", shortLabel: "JSX", color: "#F7DF1E" },
    python: { label: "Python", shortLabel: "PY", color: "#3572A5" },
    json: { label: "JSON", shortLabel: "JSON", color: "#F5C542" },
    markdown: { label: "Markdown", shortLabel: "MD", color: "#083FA1" },
    html: { label: "HTML", shortLabel: "HTML", color: "#E44D26" },
    css: { label: "CSS", shortLabel: "CSS", color: "#1572B6" },
    scss: { label: "SCSS", shortLabel: "SCSS", color: "#CF649A" },
    less: { label: "Less", shortLabel: "LESS", color: "#1D365D" },
    go: { label: "Go", shortLabel: "GO", color: "#00ADD8" },
    rust: { label: "Rust", shortLabel: "RS", color: "#DEA584" },
    java: { label: "Java", shortLabel: "JAVA", color: "#B07219" },
    csharp: { label: "C#", shortLabel: "C#", color: "#178600" },
    cpp: { label: "C++", shortLabel: "C++", color: "#F34B7D" },
    c: { label: "C", shortLabel: "C", color: "#555555" },
    shellscript: { label: "Shell", shortLabel: "SH", color: "#89E051" },
    yaml: { label: "YAML", shortLabel: "YAML", color: "#CB171E" },
    toml: { label: "TOML", shortLabel: "TOML", color: "#9C4221" },
};
const DEFAULT_LANGUAGE_COLOR = "#4FC3F7";
function normalizeLanguageId(languageId) {
    if (!languageId)
        return undefined;
    return languageId.trim().toLowerCase();
}
function getLanguageDisplayName(languageId) {
    const id = normalizeLanguageId(languageId) ?? "unknown";
    const display = LANGUAGE_DISPLAY[id];
    if (display)
        return display.label;
    const humanized = id
        .replace(/_/g, " ")
        .replace(/\b\w/g, (m) => m.toUpperCase());
    return humanized || "Unknown";
}
function getLanguageShortLabel(languageId) {
    const id = normalizeLanguageId(languageId) ?? "unknown";
    const display = LANGUAGE_DISPLAY[id];
    if (display)
        return display.shortLabel;
    return getLanguageDisplayName(id).split(" ").map((p) => p[0]).join("") || "?";
}
function getLanguageColor(languageId) {
    const id = normalizeLanguageId(languageId) ?? "unknown";
    return LANGUAGE_DISPLAY[id]?.color ?? DEFAULT_LANGUAGE_COLOR;
}
function addLanguageSeconds(breakdown, languageId, seconds) {
    if (!languageId)
        return;
    const id = normalizeLanguageId(languageId);
    if (!id)
        return;
    breakdown[id] = (breakdown[id] ?? 0) + seconds;
}
function mergeLanguageBreakdowns(entries) {
    const merged = {};
    entries.forEach((entry) => {
        if (!entry)
            return;
        Object.entries(entry).forEach(([id, seconds]) => {
            merged[id] = (merged[id] ?? 0) + seconds;
        });
    });
    return merged;
}
function getTopLanguages(breakdown, count = 3) {
    return Object.entries(breakdown)
        .map(([id, seconds]) => ({ id, seconds }))
        .sort((a, b) => b.seconds - a.seconds)
        .slice(0, Math.max(1, count));
}
function getDominantLanguage(breakdown) {
    const top = getTopLanguages(breakdown, 1)[0];
    return top?.id ?? "";
}
//# sourceMappingURL=languageBreakdown.js.map