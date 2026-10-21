import { execFileSync } from "node:child_process";
import path from "node:path";
import { getCollection } from "astro:content";
import { defineDocs, type DocDef } from "./registry";
import { REPO_ROOT, renderDoc, type Rendered } from "./render";

export interface GitMeta {
  /** ISO date of the last commit touching the file. */
  iso: string;
  hash: string;
}

export interface Doc extends DocDef, Rendered {
  updated: GitMeta | null;
}

function git(args: string[]): string {
  try {
    return execFileSync("git", args, {
      cwd: REPO_ROOT,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return "";
  }
}

// In a shallow clone every file appears to have been changed by the one commit
// fetched, which would print a confidently wrong date on every page. Better to
// print none.
const shallow = git(["rev-parse", "--is-shallow-repository"]) !== "false";

function lastCommit(file: string): GitMeta | null {
  if (shallow) return null;
  const out = git(["log", "-1", "--format=%cI %h", "--", file]);
  if (!out) return null;
  const [iso, hash] = out.split(" ");
  return { iso, hash };
}

let cache: Promise<Doc[]> | undefined;

/** Every root document, rendered once per build, links verified. */
export function loadDocs(): Promise<Doc[]> {
  cache ??= build();
  return cache;
}

async function build(): Promise<Doc[]> {
  const entries = await getCollection("docs");
  const bodies = new Map<string, string>();
  for (const e of entries) {
    if (!e.filePath || e.body === undefined) continue;
    bodies.set(path.basename(e.filePath), e.body);
  }
  const defs = defineDocs([...bodies.keys()]);
  const byFile = new Map(defs.map((d) => [d.file, d]));
  const docs: Doc[] = defs.map((def) => ({
    ...def,
    ...renderDoc(def, bodies.get(def.file)!, byFile),
    updated: lastCommit(def.file),
  }));

  // Every internal link must land on a page, and every #anchor on a heading.
  const ids = new Map(
    docs.map((d) => [
      d.route,
      new Set(d.html.matchAll(/\sid="([^"]+)"/g).map((m) => m[1])),
    ]),
  );
  const broken: string[] = [];
  for (const d of docs) {
    for (const ref of d.refs) {
      const target = ids.get(ref.route);
      if (!target) broken.push(`${ref.from}: ${ref.href} -> no page at ${ref.route}`);
      else if (ref.hash && !target.has(ref.hash))
        broken.push(`${ref.from}: ${ref.href} -> no #${ref.hash} on ${ref.route}`);
    }
  }
  if (broken.length)
    throw new Error(`Broken internal links:\n  ${broken.join("\n  ")}`);
  return docs;
}

export function neighbours(docs: Doc[], route: string) {
  const i = docs.findIndex((d) => d.route === route);
  return {
    prev: i > 0 ? docs[i - 1] : null,
    next: i >= 0 && i < docs.length - 1 ? docs[i + 1] : null,
  };
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}
