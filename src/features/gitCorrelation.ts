import { execFileSync } from "node:child_process";

export interface SessionCommit {
  hash: string;
  message: string;
  committedAt?: string;
}

export function collectSessionCommits(
  rootPath: string | undefined,
  start: Date,
  end: Date = new Date()
): SessionCommit[] {
  if (!rootPath) {
    return [];
  }
  try {
    const output = execFileSync(
      "git",
      [
        "log",
        "--date=iso-strict",
        "--pretty=format:%h%x09%ad%x09%s",
        `--since=${start.toISOString()}`,
        `--until=${end.toISOString()}`,
      ],
      {
        cwd: rootPath,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      }
    ).trim();
    if (!output) {
      return [];
    }
    return output
      .split(/\r?\n/)
      .map((line) => {
        const [hash, committedAt, ...messageParts] = line.split("\t");
        return {
          hash,
          committedAt,
          message: messageParts.join("\t").trim(),
        };
      })
      .filter((commit) => commit.hash && commit.message);
  } catch {
    return [];
  }
}
