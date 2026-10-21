// Markdown -> HTML for the docs, with everything GitHub's renderer does not do
// and a strict CSP needs:
//
// - Shiki highlighting with `transformerStyleToClass`, so no token carries a
//   `style` attribute; the classes are emitted into /code.css.
// - GitHub-compatible heading ids (github-slugger), so every `#anchor` that
//   works on GitHub works here, plus a copy-link anchor on each heading.
// - Cross-document links rewritten to site routes and recorded, so the caller
//   can fail the build on any broken link or anchor.

import fs from "node:fs";
import path from "node:path";
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkRehype from "remark-rehype";
import GithubSlugger from "github-slugger";
import { toString } from "hast-util-to-string";
import { toHtml } from "hast-util-to-html";
import { h, s } from "hastscript";
import { visit, SKIP } from "unist-util-visit";
import { createHighlighter } from "shiki";
import { transformerStyleToClass } from "@shikijs/transformers";
import type { Element, ElementContent, Root, RootContent } from "hast";
import { ORG, blobUrl, type DocDef } from "./registry";
import { parseRecord, type DecisionRecord } from "./records";
import { parseHostRows, topologySvg } from "./topology";

export const REPO_ROOT = path.resolve(process.cwd(), "..");

// One transformer for the whole build: it accumulates every class it hands
// out, and /code.css serialises the registry after rendering every document.
export const styleToClass = transformerStyleToClass({ classPrefix: "sk-" });

const LANGS = [
  "bash",
  "json",
  "yaml",
  "toml",
  "typescript",
  "javascript",
  "diff",
  "html",
  "css",
  "ini",
  "sql",
];
const highlighter = await createHighlighter({
  themes: ["github-light", "github-dark-default"],
  langs: LANGS,
});
const LANG_ALIAS: Record<string, string> = {
  sh: "bash",
  shell: "bash",
  ts: "typescript",
  js: "javascript",
  yml: "yaml",
};

export interface Heading {
  depth: number;
  id: string;
  text: string;
}
export interface SearchSection {
  heading: string;
  id: string;
  text: string;
}
export interface LinkRef {
  from: string;
  href: string;
  route: string;
  hash: string;
}
export interface RunbookEntry {
  id: string;
  title: string;
  summary: string;
}
export interface Rendered {
  title: string;
  lead: string;
  html: string;
  headings: Heading[];
  sections: SearchSection[];
  refs: LinkRef[];
  records: DecisionRecord[];
  runbook: RunbookEntry[];
}

const isEl = (n: unknown, tag?: string): n is Element =>
  !!n && (n as Element).type === "element" && (!tag || (n as Element).tagName === tag);

const HEADING = /^h[1-6]$/;

const linkIcon = () =>
  s(
    "svg",
    {
      viewBox: "0 0 16 16",
      width: 16,
      height: 16,
      "aria-hidden": "true",
      focusable: "false",
    },
    [
      s("path", {
        d: "M6.5 9.5a3 3 0 0 0 4.2 0l2.3-2.3a3 3 0 0 0-4.2-4.2l-.9.9M9.5 6.5a3 3 0 0 0-4.2 0L3 8.8A3 3 0 0 0 7.2 13l.9-.9",
        fill: "none",
        stroke: "currentColor",
        "stroke-width": 1.5,
        "stroke-linecap": "round",
      }),
    ],
  );

function firstSentence(text: string, max = 150): string {
  const t = text.replace(/\s+/g, " ").trim();
  const m = t.match(/^(.{20,}?[.!?])(\s|$)/);
  const out = m && m[1].length <= max ? m[1] : t;
  return out.length > max ? out.slice(0, max - 1).replace(/\s+\S*$/, "") + "…" : out;
}

/**
 * @param def      the document being rendered
 * @param markdown its raw Markdown
 * @param byFile   every document, to rewrite links to site routes
 */
export function renderDoc(
  def: DocDef,
  markdown: string,
  byFile: Map<string, DocDef>,
): Rendered {
  const proc = unified().use(remarkParse).use(remarkGfm).use(remarkRehype);
  const tree = proc.runSync(proc.parse(markdown)) as Root;

  // Drop whitespace-only text between blocks; it only gets in the way.
  tree.children = tree.children.filter((n) => !(n.type === "text" && !n.value.trim()));

  // 1. Title and lead.
  let title = def.label;
  const h1 = tree.children.findIndex((n) => isEl(n, "h1"));
  if (h1 !== -1) {
    title = toString(tree.children[h1] as Element).trim();
    tree.children.splice(h1, 1);
  }
  const leadNode = tree.children.find((n) => isEl(n, "p") || isEl(n, "blockquote"));
  const lead = leadNode ? firstSentence(toString(leadNode as Element), 180) : "";

  // 2. Heading ids, GitHub-compatible.
  const slugger = new GithubSlugger();
  const headings: Heading[] = [];
  visit(tree, "element", (node) => {
    if (!HEADING.test(node.tagName)) return;
    const text = toString(node).trim();
    const id = slugger.slug(text);
    node.properties.id = id;
    headings.push({ depth: Number(node.tagName[1]), id, text });
  });

  // 3. Links.
  const refs: LinkRef[] = [];
  const errors: string[] = [];
  visit(tree, "element", (node) => {
    if (node.tagName !== "a" || typeof node.properties.href !== "string") return;
    const href = node.properties.href;
    const out = rewriteLink(href, def, byFile);
    if ("error" in out) {
      errors.push(`${def.file}: ${out.error}: ${href}`);
      return;
    }
    node.properties.href = out.href;
    if (out.ref) refs.push({ from: def.file, href, ...out.ref });
    if (out.external) node.properties.className = ["ext"];
  });
  if (errors.length) throw new Error(`Broken links:\n  ${errors.join("\n  ")}`);

  // 4. Search sections, by h2/h3, from the flat top-level children.
  const sections: SearchSection[] = [];
  let cur: SearchSection = { heading: title, id: "", text: "" };
  for (const n of tree.children) {
    if (isEl(n) && (n.tagName === "h2" || n.tagName === "h3")) {
      if (cur.text.trim() || cur.id) sections.push(cur);
      cur = { heading: toString(n).trim(), id: String(n.properties.id), text: "" };
    } else if (isEl(n)) {
      cur.text += toString(n).replace(/\s+/g, " ").trim() + " ";
    }
  }
  sections.push(cur);
  for (const sec of sections) sec.text = sec.text.trim();

  // 5. Code blocks: Shiki, class-based, with a language label and copy button.
  visit(tree, "element", (node, index, parent) => {
    if (node.tagName !== "pre" || !parent || index === undefined) return;
    const code = node.children.find((c): c is Element => isEl(c, "code"));
    if (!code) return;
    const cls = (code.properties.className as string[] | undefined) ?? [];
    const raw = (cls.find((c) => c.startsWith("language-")) ?? "").slice(9);
    const lang = LANG_ALIAS[raw] ?? raw;
    const known = LANGS.includes(lang);
    const hast = highlighter.codeToHast(toString(code).replace(/\n$/, ""), {
      lang: known ? lang : "text",
      themes: { light: "github-light", dark: "github-dark-default" },
      defaultColor: false,
      transformers: [styleToClass],
    });
    const pre = hast.children[0] as Element;
    const wrapper = h("div.code", [
      h("div.code__bar", [
        h("span.code__lang", raw || "text"),
        h(
          "button.code__copy",
          { type: "button", hidden: true, "aria-label": "Copy code to clipboard" },
          "Copy",
        ),
      ]),
      pre,
    ]);
    parent.children[index] = wrapper;
    return SKIP;
  });

  // 6. Tables scroll horizontally inside a focusable, labelled region.
  let lastHeading = "";
  visit(tree, "element", (node, index, parent) => {
    if (HEADING.test(node.tagName)) lastHeading = String(node.properties.id);
    if (node.tagName !== "table" || !parent || index === undefined) return;
    const props: Record<string, string | number> = { role: "region", tabindex: 0 };
    if (lastHeading) props["aria-labelledby"] = lastHeading;
    else props["aria-label"] = "Table";
    parent.children[index] = h("div.table-wrap", props, [node]);
    return SKIP;
  });

  // 7. Copy-link anchors on h2-h4.
  visit(tree, "element", (node) => {
    if (!/^h[2-4]$/.test(node.tagName)) return;
    const id = String(node.properties.id);
    node.children = [
      h("span.heading__text", node.children as ElementContent[]),
      h(
        "a.anchor",
        { href: `#${id}`, "aria-label": `Copy link to “${toString(node).trim()}”` },
        [linkIcon()],
      ),
    ];
  });

  // 8. Group into <section>s by h2, then document-specific additions.
  const intro: RootContent[] = [];
  const groups: { h2: Element; body: RootContent[] }[] = [];
  for (const n of tree.children) {
    if (isEl(n, "h2")) groups.push({ h2: n, body: [] });
    else if (groups.length) groups[groups.length - 1].body.push(n);
    else intro.push(n);
  }

  const records: DecisionRecord[] = [];
  const runbook: RunbookEntry[] = [];
  const out: RootContent[] = [...intro];

  for (const g of groups) {
    const id = String(g.h2.properties.id);
    const heading = headings.find((x) => x.id === id)!;
    const text = g.body
      .filter((n) => isEl(n))
      .map((n) => toString(n as Element))
      .join("\n");
    const classes = ["doc-section"];
    const body = [...g.body];

    if (def.file === "DECISIONS.md") {
      const rec = parseRecord(id, heading.text, text);
      records.push(rec);
      classes.push("record", `record--${rec.kind}`);
      body.unshift(
        h("p.record__meta", [
          h(`span.badge.badge--${rec.kind}`, rec.statusLabel),
          ...(rec.date
            ? [h("time", rec.iso ? { datetime: rec.iso } : {}, rec.date)]
            : []),
        ]),
      );
    }
    if (def.file === "RUNBOOK.md") {
      runbook.push({ id, title: heading.text, summary: firstSentence(text, 130) });
    }
    if (def.file === "TOPOLOGY.md" && id === "dns-records") {
      const table = g.body.find(
        (n) => isEl(n, "div") && isEl((n as Element).children[0], "table"),
      );
      const rows = table
        ? parseHostRows((table as Element).children[0] as Element)
        : [];
      if (rows.length < 3) {
        throw new Error(
          "TOPOLOGY.md: could not read the hostnames from the DNS records table for the diagram",
        );
      }
      body.unshift(topologySvg(rows));
    }

    out.push(
      h("section", { className: classes, "aria-labelledby": id }, [
        g.h2,
        ...(body as ElementContent[]),
      ]),
    );
  }

  if (def.file === "RUNBOOK.md" && runbook.length) {
    out.splice(
      intro.length,
      0,
      h("nav.failure-index", { "aria-labelledby": "failure-index-title" }, [
        h("h2#failure-index-title.failure-index__title", "Failure modes"),
        h(
          "ol.failure-index__list",
          runbook.map((r) =>
            h("li", [
              h("a.failure-index__item", { href: `#${r.id}` }, [
                h("span.failure-index__name", r.title),
                h("span.failure-index__sum", r.summary),
              ]),
            ]),
          ),
        ),
      ]),
    );
  }

  if (def.file === "DECISIONS.md" && records.length) {
    const superseded = records.filter((r) => r.kind === "superseded").length;
    out.splice(
      intro.length,
      0,
      h("nav.records-index", { "aria-labelledby": "records-index-title" }, [
        h("h2#records-index-title.records-index__title", [
          "Decision records ",
          h(
            "span.records-index__count",
            `${records.length} records${superseded ? `, ${superseded} superseded` : ""}`,
          ),
        ]),
        h(
          "ol.records-index__list",
          records.map((r) =>
            h("li", [
              h(`a.record-card.record-card--${r.kind}`, { href: `#${r.id}` }, [
                h("span.record-card__title", r.title),
                h("span.record-card__meta", [
                  h(`span.badge.badge--${r.kind}`, r.statusLabel),
                  ...(r.date
                    ? [h("time", r.iso ? { datetime: r.iso } : {}, r.date)]
                    : []),
                ]),
              ]),
            ]),
          ),
        ),
      ]),
    );
  }

  tree.children = out;
  // Markers let check-html.py skip rendered Markdown in its whitespace check:
  // there, spacing comes from the Markdown, not from Astro.
  const html = `<!--md-->${toHtml(tree)}<!--/md-->`;
  return { title, lead, html, headings, sections, refs, records, runbook };
}

type Rewrite =
  | { error: string }
  | { href: string; ref?: { route: string; hash: string }; external?: boolean };

const routeHref = (route: string, hash: string) => (hash ? `${route}#${hash}` : route);

function rewriteLink(href: string, def: DocDef, byFile: Map<string, DocDef>): Rewrite {
  if (href.startsWith("#")) {
    const hash = decodeURIComponent(href.slice(1));
    return { href, ref: { route: def.route, hash } };
  }
  if (/^(mailto|tel):/i.test(href)) return { href };

  const gh = href.match(
    /^https:\/\/github\.com\/PaceStreak\/infra\/(?:blob|tree)\/main\/([^#?]+)(?:#(.*))?$/,
  );
  if (gh && byFile.has(gh[1])) {
    const target = byFile.get(gh[1])!;
    const hash = decodeURIComponent(gh[2] ?? "");
    return { href: routeHref(target.route, hash), ref: { route: target.route, hash } };
  }
  if (/^[a-z][a-z0-9+.-]*:/i.test(href) || href.startsWith("//"))
    return { href, external: true };

  const [rawPath, rawHash = ""] = href.split("#");
  const hash = decodeURIComponent(rawHash);
  let p = path.posix.normalize(rawPath.replace(/^\.\//, ""));
  if (p.startsWith("infra/")) p = p.slice(6);
  if (p === "." || p === "")
    return { href: routeHref(def.route, hash), ref: { route: def.route, hash } };

  const target = byFile.get(p);
  if (target)
    return { href: routeHref(target.route, hash), ref: { route: target.route, hash } };

  if (p.startsWith("../")) {
    const [repo, ...rest] = p.slice(3).split("/");
    const url = rest.length
      ? `${ORG}/${repo}/blob/main/${rest.join("/")}`
      : `${ORG}/${repo}`;
    return { href: url + (rawHash ? `#${rawHash}` : ""), external: true };
  }
  if (fs.existsSync(path.join(REPO_ROOT, p))) {
    return { href: blobUrl(p) + (rawHash ? `#${rawHash}` : ""), external: true };
  }
  return { error: "relative link to a file that does not exist" };
}
