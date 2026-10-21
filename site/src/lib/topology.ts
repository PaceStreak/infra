// Build-time SVG of TOPOLOGY.md's DNS table: each web hostname and what
// serves it. Read from the rendered table, so the diagram cannot disagree
// with the Markdown. Colours come from classes in global.css, which keeps the
// SVG free of `style` attributes and lets it follow the theme.

import { toString } from "hast-util-to-string";
import { h, s } from "hastscript";
import type { Element } from "hast";

export type HostKind = "pages" | "worker" | "github" | "redirect" | "other";

export interface HostRow {
  host: string;
  kind: HostKind;
  service: string;
  target: string;
  proxied: boolean;
}

const KIND_LABEL: Record<HostKind, string> = {
  pages: "Cloudflare Pages",
  worker: "Cloudflare Worker",
  github: "GitHub Pages",
  redirect: "Redirect rule",
  other: "Other",
};

const cells = (tr: Element) =>
  tr.children
    .filter(
      (c): c is Element =>
        c.type === "element" && (c.tagName === "td" || c.tagName === "th"),
    )
    .map((c) => toString(c).trim());

export function parseHostRows(table: Element): HostRow[] {
  const rows: HostRow[] = [];
  const trs: Element[] = [];
  const walk = (n: Element) => {
    for (const c of n.children) {
      if (c.type !== "element") continue;
      if (c.tagName === "tr") trs.push(c);
      else walk(c);
    }
  };
  walk(table);
  const [header, ...body] = trs;
  const cols = cells(header).map((c) => c.toLowerCase());
  const at = (r: string[], name: string) => r[cols.indexOf(name)] ?? "";
  for (const tr of body) {
    const r = cells(tr);
    const name = at(r, "name");
    const type = at(r, "type");
    const content = at(r, "content");
    const why = at(r, "why");
    // Web hostnames only: mail and verification records are not "served".
    if (!/cname|worker/i.test(type) || name.includes("_domainkey")) continue;
    const host = name === "pacestreak.com" ? name : `${name}.pacestreak.com`;
    let kind: HostKind = "other";
    let service = content;
    if (/redirect/i.test(why)) {
      kind = "redirect";
      service = "301 → www.pacestreak.com";
    } else if (/pages\.dev$/.test(content)) kind = "pages";
    else if (/worker/i.test(type + content)) kind = "worker";
    else if (/github\.io$/.test(content)) kind = "github";
    rows.push({
      host,
      kind,
      service,
      target: content,
      proxied: /proxied/i.test(at(r, "proxy")),
    });
  }
  return rows;
}

export function topologySvg(rows: HostRow[]): Element {
  const W = 760;
  const rowH = 60;
  const top = 40;
  const H = top + rows.length * rowH + 8;
  const hostX = 0;
  const hostW = 220;
  const edgeX = 268;
  const edgeW = 150;
  const svcX = 470;
  const svcW = W - svcX;

  const desc = rows
    .map(
      (r) =>
        `${r.host}: ${KIND_LABEL[r.kind]}, ${r.service}${r.proxied ? ", proxied through Cloudflare" : ", DNS only"}.`,
    )
    .join(" ");

  const parts: Element[] = [
    s("title", { id: "topo-title" }, "Public hostnames and what serves them"),
    s("desc", { id: "topo-desc" }, desc),
    s("text", { x: hostX, y: 18, class: "dg-colhead" }, "Hostname"),
    s("text", { x: edgeX, y: 18, class: "dg-colhead" }, "Cloudflare edge"),
    s("text", { x: svcX, y: 18, class: "dg-colhead" }, "Served by"),
    s("rect", {
      x: edgeX,
      y: top - 12,
      width: edgeW,
      height: rows.length * rowH,
      rx: 12,
      class: "dg-edge",
    }),
  ];

  rows.forEach((r, i) => {
    const y = top + i * rowH;
    const cy = y + 23;
    parts.push(
      s("g", { class: `dg-row dg-row--${r.kind}` }, [
        s("rect", {
          x: hostX + 1,
          y,
          width: hostW,
          height: 46,
          rx: 8,
          class: "dg-host",
        }),
        s("text", { x: hostX + 14, y: cy + 5, class: "dg-mono" }, r.host),
        r.proxied
          ? s("path", { d: `M${hostW + 1} ${cy} H${svcX - 8}`, class: "dg-line" })
          : s("path", {
              d: `M${hostW + 1} ${cy} H${svcX - 8}`,
              class: "dg-line dg-line--direct",
            }),
        r.proxied
          ? s("circle", { cx: edgeX + edgeW / 2, cy, r: 4, class: "dg-dot" })
          : s(
              "text",
              {
                x: edgeX + edgeW / 2,
                y: cy - 7,
                class: "dg-small",
                "text-anchor": "middle",
              },
              "DNS only",
            ),
        s("path", {
          d: `M${svcX - 14} ${cy - 5} L${svcX - 6} ${cy} L${svcX - 14} ${cy + 5}`,
          class: "dg-arrow",
        }),
        s("rect", { x: svcX, y, width: svcW - 1, height: 46, rx: 8, class: "dg-svc" }),
        s("rect", { x: svcX, y, width: 5, height: 46, rx: 2, class: "dg-svc-mark" }),
        s("text", { x: svcX + 16, y: cy - 4, class: "dg-strong" }, KIND_LABEL[r.kind]),
        s("text", { x: svcX + 16, y: cy + 13, class: "dg-mono dg-dim" }, r.service),
      ]),
    );
  });

  return h("figure.diagram", [
    h(
      "div.diagram__scroll",
      { role: "group", tabindex: 0, "aria-label": "Topology diagram, scrollable" },
      [
        s(
          "svg",
          {
            viewBox: `0 0 ${W} ${H}`,
            width: W,
            height: H,
            role: "img",
            "aria-labelledby": "topo-title topo-desc",
            class: "diagram__svg",
          },
          parts,
        ),
      ],
    ),
    h("figcaption", [
      "Each public hostname and what serves it, drawn at build time from the DNS records table below. Dashed: DNS only, not proxied.",
    ]),
  ]);
}
