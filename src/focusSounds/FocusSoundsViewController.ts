import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";

interface SoundTrack {
  id: string;
  title: string;
  fileName: string;
  url: string;
  source: "github" | "mfp";
  mood: string;
  tone: string;
  sizeLabel?: string;
}

interface FocusSoundsState {
  githubSourceUrl: string;
  githubTracks: SoundTrack[];
  mfpTracks: SoundTrack[];
  status: string;
}

type GitHubContentItem = {
  name?: string;
  type?: string;
  download_url?: string | null;
  size?: number;
};

const STATE_KEY = "focusForge.focusSounds.state";
const DEFAULT_GITHUB_SOURCE =
  "https://github.com/sidkr222003/FocusForge/tree/main/media/sounds";
const MFP_RSS_URL = "https://musicforprogramming.net/rss.php";

export class FocusSoundsViewController implements vscode.WebviewViewProvider {
  public static readonly viewId = "devToolkit.focusSounds";
  private view?: vscode.WebviewView;

  constructor(private readonly ctx: vscode.ExtensionContext) {}

  public resolveWebviewView(webviewView: vscode.WebviewView): void {
    this.view = webviewView;
    const webview = webviewView.webview;
    webview.options = {
      enableScripts: true,
      localResourceRoots: [
        vscode.Uri.joinPath(this.ctx.extensionUri, "src", "focusSounds", "webview"),
        vscode.Uri.joinPath(this.ctx.extensionUri, "node_modules", "@vscode", "codicons", "dist"),
      ],
    };
    webview.html = this.renderHtml(webview);
    webview.onDidReceiveMessage((msg) => this.onMessage(msg), undefined, this.ctx.subscriptions);
  }

  private async onMessage(msg: { type?: string; [key: string]: unknown }): Promise<void> {
    try {
      switch (msg.type) {
        case "ready":
          await this.refreshState();
          break;
        case "refresh":
          await this.refreshState(String(msg.githubSourceUrl ?? this.getSourceUrl()).trim());
          break;
        case "saveSource":
          await this.saveSourceUrl(String(msg.githubSourceUrl ?? "").trim() || DEFAULT_GITHUB_SOURCE);
          await this.refreshState();
          break;
        case "openExternal":
          if (msg.url) {
            await vscode.env.openExternal(vscode.Uri.parse(String(msg.url)));
          }
          break;
      }
    } catch (error) {
      vscode.window.showErrorMessage(error instanceof Error ? error.message : String(error));
      await this.postState({ status: error instanceof Error ? error.message : String(error) });
    }
  }

  private getSourceUrl(): string {
    const saved = this.ctx.globalState.get<Partial<FocusSoundsState>>(STATE_KEY, {});
    return saved.githubSourceUrl || DEFAULT_GITHUB_SOURCE;
  }

  private async saveSourceUrl(githubSourceUrl: string): Promise<void> {
    const saved = this.ctx.globalState.get<Partial<FocusSoundsState>>(STATE_KEY, {});
    await this.ctx.globalState.update(STATE_KEY, { ...saved, githubSourceUrl });
  }

  private async refreshState(nextSourceUrl?: string): Promise<void> {
    if (nextSourceUrl) {
      await this.saveSourceUrl(nextSourceUrl);
    }
    const githubSourceUrl = this.getSourceUrl();
    const [githubResult, mfpResult] = await Promise.allSettled([
      discoverGitHubTracks(githubSourceUrl),
      loadMusicForProgrammingTracks(),
    ]);

    const githubTracks = githubResult.status === "fulfilled" ? githubResult.value : [];
    const mfpTracks = mfpResult.status === "fulfilled" ? mfpResult.value : [];
    const statusParts = [
      `${githubTracks.length} GitHub MP3${githubTracks.length === 1 ? "" : "s"}`,
      `${mfpTracks.length} music-for-programming episode${mfpTracks.length === 1 ? "" : "s"}`,
    ];
    if (githubResult.status === "rejected") {
      statusParts.push(`GitHub scan failed: ${githubResult.reason instanceof Error ? githubResult.reason.message : String(githubResult.reason)}`);
    }
    if (mfpResult.status === "rejected") {
      statusParts.push(`music-for-programming failed: ${mfpResult.reason instanceof Error ? mfpResult.reason.message : String(mfpResult.reason)}`);
    }

    const state: FocusSoundsState = {
      githubSourceUrl,
      githubTracks,
      mfpTracks,
      status: statusParts.join(" · "),
    };
    await this.ctx.globalState.update(STATE_KEY, state);
    await this.postState(state);
  }

  private async postState(state = this.ctx.globalState.get<Partial<FocusSoundsState>>(STATE_KEY, {})): Promise<void> {
    await this.view?.webview.postMessage({
      type: "state",
      state: {
        githubSourceUrl: state.githubSourceUrl || DEFAULT_GITHUB_SOURCE,
        githubTracks: state.githubTracks ?? [],
        mfpTracks: state.mfpTracks ?? [],
        status: state.status || "Ready",
      },
    });
  }

  private renderHtml(webview: vscode.Webview): string {
    const root = vscode.Uri.joinPath(this.ctx.extensionUri, "src", "focusSounds", "webview");
    const htmlPath = path.join(root.fsPath, "focusSounds.html");
    const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(root, "focusSounds.css"));
    const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(root, "focusSounds.js"));
    const codiconsUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.ctx.extensionUri, "node_modules", "@vscode", "codicons", "dist", "codicon.css")
    );
    const html = fs.readFileSync(htmlPath, "utf8");
    return html
      .replace(/\$\{webview\.cspSource\}/g, webview.cspSource)
      .replace(/\$\{codiconsUri\}/g, String(codiconsUri))
      .replace(/\$\{styleUri\}/g, String(styleUri))
      .replace(/\$\{scriptUri\}/g, String(scriptUri));
  }
}

async function discoverGitHubTracks(inputUrl: string): Promise<SoundTrack[]> {
  const source = parseGitHubSource(inputUrl);
  if (!source) {
    const raw = normalizeDirectMp3Url(inputUrl);
    if (!raw) {
      throw new Error("Use a GitHub folder, GitHub blob URL, raw GitHub MP3, or direct HTTPS MP3 URL.");
    }
    return [trackFromUrl(raw, raw.split("/").pop() || "track.mp3", "github")];
  }

  if (source.kind === "file") {
    return [trackFromUrl(source.rawUrl, source.path.split("/").pop() || "track.mp3", "github")];
  }

  const apiUrl = `https://api.github.com/repos/${source.owner}/${source.repo}/contents/${source.path}?ref=${encodeURIComponent(source.ref)}`;
  const res = await fetch(apiUrl, { headers: { Accept: "application/vnd.github+json" } });
  if (!res.ok) {
    throw new Error(`GitHub contents request failed (${res.status}).`);
  }
  const payload = (await res.json()) as GitHubContentItem | GitHubContentItem[];
  const items = Array.isArray(payload) ? payload : [payload];
  return items
    .filter((item) => item.type === "file" && item.name?.toLowerCase().endsWith(".mp3") && item.download_url)
    .map((item) => trackFromUrl(item.download_url || "", item.name || "track.mp3", "github", item.size));
}

function parseGitHubSource(inputUrl: string):
  | { kind: "folder"; owner: string; repo: string; ref: string; path: string }
  | { kind: "file"; owner: string; repo: string; ref: string; path: string; rawUrl: string }
  | undefined {
  try {
    const url = new URL(inputUrl);
    if (url.hostname === "github.com") {
      const parts = url.pathname.split("/").filter(Boolean);
      const [owner, repo, mode, ref, ...pathParts] = parts;
      if (!owner || !repo || !mode || !ref) return undefined;
      const pathName = pathParts.join("/");
      if (mode === "blob" && pathName.toLowerCase().endsWith(".mp3")) {
        return {
          kind: "file",
          owner,
          repo,
          ref,
          path: pathName,
          rawUrl: `https://raw.githubusercontent.com/${owner}/${repo}/${ref}/${pathName}`,
        };
      }
      if (mode === "tree") {
        return { kind: "folder", owner, repo, ref, path: pathName };
      }
    }
    if (url.hostname === "raw.githubusercontent.com") {
      const parts = url.pathname.split("/").filter(Boolean);
      const [owner, repo, ref, ...pathParts] = parts;
      if (!owner || !repo || !ref || !pathParts.length) return undefined;
      const pathName = pathParts.join("/");
      if (pathName.toLowerCase().endsWith(".mp3")) {
        return { kind: "file", owner, repo, ref, path: pathName, rawUrl: url.toString() };
      }
      return { kind: "folder", owner, repo, ref, path: pathName };
    }
  } catch {
    return undefined;
  }
  return undefined;
}

function normalizeDirectMp3Url(inputUrl: string): string | undefined {
  try {
    const url = new URL(inputUrl);
    if (url.protocol !== "https:" || !url.pathname.toLowerCase().endsWith(".mp3")) return undefined;
    return url.toString();
  } catch {
    return undefined;
  }
}

async function loadMusicForProgrammingTracks(): Promise<SoundTrack[]> {
  const res = await fetch(MFP_RSS_URL);
  if (!res.ok) {
    throw new Error(`RSS request failed (${res.status}).`);
  }
  const xml = await res.text();
  const items = xml.match(/<item\b[\s\S]*?<\/item>/gi) ?? [];
  const tracks: SoundTrack[] = [];
  items.forEach((item, index) => {
      const title = decodeXml(readTag(item, "title") || `musicForProgramming #${index + 1}`);
      const url = normalizeMusicUrl(decodeXml(readAttr(item, "enclosure", "url") || readTag(item, "comments") || ""));
      const length = Number(readAttr(item, "enclosure", "length") || 0);
      if (!url) return;
      tracks.push({
        id: `mfp_${index}_${slugify(title)}`,
        title,
        fileName: url.split("/").pop() || "episode.mp3",
        url,
        source: "mfp" as const,
        mood: "Programming",
        tone: "musicforprogramming.net",
        sizeLabel: length > 0 ? formatBytes(length) : undefined,
      });
    });
  return tracks.reverse();
}

function trackFromUrl(url: string, fileName: string, source: SoundTrack["source"], size?: number): SoundTrack {
  const title = fileName
    .replace(/\.mp3$/i, "")
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
  return {
    id: `${source}_${slugify(fileName)}`,
    title,
    fileName,
    url,
    source,
    mood: source === "github" ? "Focus" : "Programming",
    tone: source === "github" ? "GitHub MP3" : "musicforprogramming.net",
    sizeLabel: size ? formatBytes(size) : undefined,
  };
}

function readTag(xml: string, tag: string): string | undefined {
  return xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i"))?.[1]?.replace(/^<!\[CDATA\[/, "").replace(/\]\]>$/, "");
}

function readAttr(xml: string, tag: string, attr: string): string | undefined {
  return xml.match(new RegExp(`<${tag}[^>]*\\s${attr}=["']([^"']+)["'][^>]*>`, "i"))?.[1];
}

function decodeXml(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .trim();
}

function slugify(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function normalizeMusicUrl(url: string): string {
  if (url.startsWith("http://musicforprogramming.net/")) {
    return url.replace(/^http:\/\//, "https://");
  }
  return url;
}
