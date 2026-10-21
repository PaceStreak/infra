// Build-time SVG of how PaceStreak fits together. Plain data in, markup out:
// every colour is a class in global.css, so it follows the theme and needs
// no `style` attribute. The <desc> spells out every arrow in words.

export interface ArchNode {
  id: string;
  x: number;
  y: number;
  w: number;
  label: string;
  sub: string;
  kind: "client" | "pages" | "worker" | "store" | "vendor" | "github";
}
export interface ArchEdge {
  from: string;
  to: string;
  says: string;
  dashed?: boolean;
}

const NODE_H = 46;

export const nodes: ArchNode[] = [
  {
    id: "browser",
    x: 16,
    y: 178,
    w: 132,
    label: "Browser",
    sub: "PWA, any device",
    kind: "client",
  },
  { id: "www", x: 206, y: 64, w: 164, label: "www", sub: "web, Pages", kind: "pages" },
  {
    id: "blog",
    x: 206,
    y: 124,
    w: 164,
    label: "blog",
    sub: "blog, Pages",
    kind: "pages",
  },
  { id: "app", x: 206, y: 184, w: 164, label: "app", sub: "app, Pages", kind: "pages" },
  {
    id: "api",
    x: 430,
    y: 184,
    w: 170,
    label: "api Worker",
    sub: "Hono, Free plan",
    kind: "worker",
  },
  {
    id: "d1",
    x: 664,
    y: 64,
    w: 180,
    label: "D1",
    sub: "pacestreak (apac)",
    kind: "store",
  },
  { id: "r2", x: 664, y: 124, w: 180, label: "R2", sub: "photos", kind: "store" },
  {
    id: "queues",
    x: 664,
    y: 184,
    w: 180,
    label: "Queues",
    sub: "jobs + dead letters",
    kind: "store",
  },
  {
    id: "cron",
    x: 664,
    y: 244,
    w: 180,
    label: "Cron triggers",
    sub: "3 of 5 per account",
    kind: "store",
  },
  {
    id: "turnstile",
    x: 430,
    y: 304,
    w: 170,
    label: "Turnstile",
    sub: "auth forms",
    kind: "pages",
  },
  {
    id: "brevo",
    x: 664,
    y: 324,
    w: 180,
    label: "Brevo SMTP",
    sub: "300 mails a day",
    kind: "vendor",
  },
  {
    id: "neon",
    x: 664,
    y: 384,
    w: 180,
    label: "Neon Postgres",
    sub: "nightly D1 copy",
    kind: "vendor",
  },
  {
    id: "upptime",
    x: 16,
    y: 344,
    w: 132,
    label: "Upptime",
    sub: "Actions, 5 min",
    kind: "github",
  },
  {
    id: "status",
    x: 206,
    y: 344,
    w: 164,
    label: "status",
    sub: "GitHub Pages",
    kind: "github",
  },
];

export const edges: ArchEdge[] = [
  {
    from: "browser",
    to: "www",
    says: "The browser loads the public site from Cloudflare Pages",
  },
  { from: "browser", to: "blog", says: "and the blog from Cloudflare Pages" },
  { from: "browser", to: "app", says: "and the product, a PWA, from Cloudflare Pages" },
  {
    from: "app",
    to: "api",
    says: "The app calls the API Worker with a session cookie scoped to pacestreak.com",
  },
  {
    from: "app",
    to: "turnstile",
    says: "Auth forms in the app show a Cloudflare Turnstile challenge",
    dashed: true,
  },
  {
    from: "api",
    to: "turnstile",
    says: "and the API verifies its token",
    dashed: true,
  },
  { from: "api", to: "d1", says: "The Worker stores data in D1" },
  { from: "api", to: "r2", says: "photos in R2" },
  {
    from: "api",
    to: "queues",
    says: "and runs background jobs through Queues, with a dead-letter queue",
  },
  {
    from: "cron",
    to: "api",
    says: "Three cron triggers wake the Worker for reminders, digests and maintenance",
  },
  { from: "api", to: "brevo", says: "Mail goes out through Brevo SMTP" },
  {
    from: "d1",
    to: "neon",
    says: "A nightly GitHub Actions job copies D1 into Neon Postgres as an off-host backup",
    dashed: true,
  },
  {
    from: "upptime",
    to: "status",
    says: "Upptime checks every host every five minutes and publishes the status page",
  },
];

const byId = new Map(nodes.map((n) => [n.id, n]));
const esc = (t: string) =>
  t
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

function route(e: ArchEdge): string {
  const a = byId.get(e.from)!;
  const b = byId.get(e.to)!;
  const ay = a.y + NODE_H / 2;
  const by = b.y + NODE_H / 2;
  if (b.x > a.x + a.w) {
    const x1 = a.x + a.w;
    const x2 = b.x - 6;
    const mid = Math.round(x1 + (x2 - x1) / 2);
    return ay === by ? `M${x1} ${ay} H${x2}` : `M${x1} ${ay} H${mid} V${by} H${x2}`;
  }
  if (a.x > b.x + b.w) {
    const x1 = a.x;
    const x2 = b.x + b.w + 6;
    const mid = Math.round(x2 + (x1 - x2) / 2);
    // Enter low on the target's side, clear of its outgoing arrows.
    const low = Math.round(b.y + NODE_H * 0.78);
    return `M${x1} ${ay} H${mid} V${low} H${x2}`;
  }
  // Same column: detour around the right edge, clear of the boxes between.
  const rx = a.x + a.w + 14;
  return `M${a.x + a.w} ${ay} H${rx} V${by} H${b.x + b.w + 6}`;
}

/** Returns trusted markup (no user input reaches it) for set:html. */
export function architectureSvg(): string {
  const W = 872;
  const H = 446;
  const desc = edges.map((e) => e.says + ".").join(" ");
  const groups = [
    `<rect x="190" y="30" width="196" height="216" rx="14" class="ar-group"/>`,
    `<text x="204" y="50" class="ar-group-label">Cloudflare Pages</text>`,
    `<rect x="414" y="30" width="446" height="330" rx="14" class="ar-group"/>`,
    `<text x="428" y="50" class="ar-group-label">Cloudflare Workers platform</text>`,
    `<rect x="0" y="318" width="386" height="96" rx="14" class="ar-group ar-group--gh"/>`,
    `<text x="14" y="336" class="ar-group-label">GitHub</text>`,
  ];
  const lines = edges.map(
    (e) =>
      `<path d="${route(e)}" class="ar-edge${e.dashed ? " ar-edge--dashed" : ""}" marker-end="url(#ar-head)"/>`,
  );
  const boxes = nodes.map(
    (n) =>
      `<g class="ar-node ar-node--${n.kind}"><rect x="${n.x}" y="${n.y}" width="${n.w}" height="${NODE_H}" rx="9"/>` +
      `<text x="${n.x + 12}" y="${n.y + 20}" class="ar-label">${esc(n.label)}</text>` +
      `<text x="${n.x + 12}" y="${n.y + 36}" class="ar-sub">${esc(n.sub)}</text></g>`,
  );
  return (
    `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-labelledby="arch-title arch-desc" class="diagram__svg">` +
    `<title id="arch-title">How PaceStreak fits together</title><desc id="arch-desc">${esc(desc)}</desc>` +
    `<defs><marker id="ar-head" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" class="ar-head"/></marker></defs>` +
    groups.join("") +
    lines.join("") +
    boxes.join("") +
    `</svg>`
  );
}
