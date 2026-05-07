const vscode = acquireVsCodeApi();

const $ = (id) => document.getElementById(id);
const audio = $("audioPlayer");
let state = { githubSourceUrl: "", githubTracks: [], mfpTracks: [], status: "" };
let activeTrackId = "";
let activeSource = "";

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function iconFor(track) {
  if (track.source === "mfp") return "codicon-radio-tower";
  const name = `${track.title} ${track.fileName}`.toLowerCase();
  if (name.includes("cafe")) return "codicon-coffee";
  if (name.includes("forest")) return "codicon-leaf";
  if (name.includes("ocean")) return "codicon-symbol-water";
  if (name.includes("fire")) return "codicon-flame";
  if (name.includes("lofi")) return "codicon-pulse";
  return "codicon-music";
}

function render() {
  $("sourceUrlInput").value = state.githubSourceUrl;
  $("githubCount").textContent = `${state.githubTracks.length} track${state.githubTracks.length === 1 ? "" : "s"}`;
  $("mfpCount").textContent = `${state.mfpTracks.length} episode${state.mfpTracks.length === 1 ? "" : "s"}`;
  $("statusLine").textContent = state.status || "Ready";
  renderGrid("githubGrid", state.githubTracks, "No GitHub MP3 files found. Save a GitHub folder/blob/raw URL, then refresh.");
  renderMfp();
}

function renderMfp() {
  const q = $("searchInput").value.trim().toLowerCase();
  const rows = q
    ? state.mfpTracks.filter((track) => `${track.title} ${track.fileName}`.toLowerCase().includes(q))
    : state.mfpTracks;
  renderGrid("mfpGrid", rows, "No music-for-programming episodes loaded yet.");
}

function renderGrid(id, tracks, emptyText) {
  const grid = $(id);
  if (!tracks.length) {
    grid.innerHTML = `<div class="empty-card"><i class="codicon codicon-info"></i><span>${escapeHtml(emptyText)}</span></div>`;
    return;
  }
  grid.innerHTML = tracks.map((track) => {
    const isPlaying = track.id === activeTrackId && track.source === activeSource && !audio.paused;
    return `
      <article class="sound-card ${isPlaying ? "playing" : ""}">
        <div class="sound-icon"><i class="codicon ${iconFor(track)}"></i></div>
        <div class="sound-body">
          <strong>${escapeHtml(track.title)}</strong>
          <span>${escapeHtml(track.mood)} · ${escapeHtml(track.tone)}</span>
          <small>${escapeHtml(track.sizeLabel || track.fileName)}</small>
        </div>
        <div class="sound-actions">
          <button data-play="${escapeHtml(track.source)}:${escapeHtml(track.id)}" title="${isPlaying ? "Pause" : "Play"}">
            <i class="codicon ${isPlaying ? "codicon-debug-pause" : "codicon-play"}"></i>
          </button>
          <button data-open="${escapeHtml(track.url)}" title="Open source">
            <i class="codicon codicon-link-external"></i>
          </button>
        </div>
      </article>
    `;
  }).join("");

  grid.querySelectorAll("[data-play]").forEach((button) => {
    button.addEventListener("click", () => {
      const [source, idValue] = button.getAttribute("data-play").split(":");
      playTrack(source, idValue);
    });
  });
  grid.querySelectorAll("[data-open]").forEach((button) => {
    button.addEventListener("click", () => vscode.postMessage({ type: "openExternal", url: button.getAttribute("data-open") }));
  });
}

async function playTrack(source, id) {
  const collection = source === "mfp" ? state.mfpTracks : state.githubTracks;
  const track = collection.find((item) => item.id === id);
  if (!track) return;
  if (activeTrackId === track.id && activeSource === source && !audio.paused) {
    audio.pause();
    render();
    return;
  }
  activeTrackId = track.id;
  activeSource = source;
  audio.src = track.url;
  audio.volume = Number($("volumeInput").value || 0.4);
  $("nowTitle").textContent = track.title;
  $("nowMeta").textContent = `${track.tone} · ${track.fileName}`;
  render();
  try {
    await audio.play();
    render();
  } catch {
    $("nowMeta").textContent = "Could not play this track. Open the source URL to confirm it is public and serves audio directly.";
    render();
  }
}

$("saveSourceBtn").addEventListener("click", () => {
  $("statusLine").textContent = "Refreshing GitHub library...";
  vscode.postMessage({ type: "saveSource", githubSourceUrl: $("sourceUrlInput").value });
});

$("refreshBtn").addEventListener("click", () => {
  $("statusLine").textContent = "Refreshing libraries...";
  vscode.postMessage({ type: "refresh", githubSourceUrl: $("sourceUrlInput").value || state.githubSourceUrl });
});

$("openSourceBtn").addEventListener("click", () => {
  vscode.postMessage({ type: "openExternal", url: $("sourceUrlInput").value || state.githubSourceUrl });
});

$("openMfpRepoBtn").addEventListener("click", () => {
  vscode.postMessage({ type: "openExternal", url: "https://github.com/isdampe/music-for-programming" });
});

$("stopBtn").addEventListener("click", () => {
  audio.pause();
  audio.currentTime = 0;
  activeTrackId = "";
  activeSource = "";
  $("nowTitle").textContent = "Nothing yet";
  $("nowMeta").textContent = "Refresh libraries, then select a track.";
  render();
});

$("volumeInput").addEventListener("input", () => {
  audio.volume = Number($("volumeInput").value || 0.4);
});

$("searchInput").addEventListener("input", renderMfp);

window.addEventListener("message", (event) => {
  if (event.data?.type === "state") {
    state = event.data.state;
    render();
  }
});

vscode.postMessage({ type: "ready" });
