// Everything interactive on the site, bundled into one external file.
// The pages work without it: links, anchors, the sidebar and the content
// all render; this adds search, the theme toggle, scroll-spy and copying.

const $ = <T extends Element>(sel: string, root: ParentNode = document) =>
  root.querySelector<T>(sel);
const $$ = <T extends Element>(sel: string, root: ParentNode = document) => [
  ...root.querySelectorAll<T>(sel),
];
const announcer = $<HTMLElement>("#announcer");
const announce = (msg: string) => {
  if (!announcer) return;
  announcer.textContent = "";
  window.setTimeout(() => (announcer.textContent = msg), 30);
};

/* ---------- Theme ---------- */

type Mode = "system" | "light" | "dark";
const KEY = "ps-docs-theme";
const media = window.matchMedia("(prefers-color-scheme: dark)");
const root = document.documentElement;

function readMode(): Mode {
  try {
    const v = localStorage.getItem(KEY);
    return v === "light" || v === "dark" ? v : "system";
  } catch {
    return "system";
  }
}
function applyMode(mode: Mode) {
  const dark = mode === "dark" || (mode === "system" && media.matches);
  root.setAttribute("data-theme", dark ? "dark" : "light");
  root.setAttribute("data-theme-mode", mode);
  const btn = $<HTMLButtonElement>(".theme-btn");
  if (btn) {
    const next = mode === "system" ? "light" : mode === "light" ? "dark" : "system";
    btn.setAttribute("aria-label", `Theme: ${mode}. Switch to ${next}.`);
    btn.title = `Theme: ${mode}`;
  }
}
let mode = readMode();
applyMode(mode);
media.addEventListener("change", () => mode === "system" && applyMode(mode));
$(".theme-btn")?.addEventListener("click", () => {
  mode = mode === "system" ? "light" : mode === "light" ? "dark" : "system";
  try {
    if (mode === "system") localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, mode);
  } catch {
    /* Private mode or storage blocked: the choice lasts for this page only. */
  }
  applyMode(mode);
  announce(`Theme: ${mode}`);
});

/* ---------- Mobile navigation ---------- */

const menuBtn = $<HTMLButtonElement>(".menu-btn");
const sidebar = $<HTMLElement>("#sidebar");
const scrim = $<HTMLElement>(".scrim");
function setNav(open: boolean) {
  document.body.classList.toggle("nav-open", open);
  menuBtn?.setAttribute("aria-expanded", String(open));
  menuBtn?.setAttribute("aria-label", open ? "Close navigation" : "Open navigation");
  if (scrim) scrim.hidden = !open;
  if (open) $<HTMLElement>("a", sidebar ?? document)?.focus();
}
menuBtn?.addEventListener("click", () =>
  setNav(!document.body.classList.contains("nav-open")),
);
scrim?.addEventListener("click", () => setNav(false));
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && document.body.classList.contains("nav-open")) {
    setNav(false);
    menuBtn?.focus();
  }
});
$<HTMLAnchorElement>('.nav-link[aria-current="page"]')?.scrollIntoView({
  block: "nearest",
});

/* ---------- Copy helpers ---------- */

async function copy(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

for (const a of $$<HTMLAnchorElement>("a.anchor")) {
  a.addEventListener("click", async () => {
    const url = new URL(a.getAttribute("href") ?? "", location.href).href;
    if (await copy(url)) {
      a.classList.add("is-copied");
      announce("Link copied");
      window.setTimeout(() => a.classList.remove("is-copied"), 1400);
    }
  });
}

for (const btn of $$<HTMLButtonElement>(".code__copy")) {
  btn.hidden = false;
  btn.addEventListener("click", async () => {
    const code = btn.closest(".code")?.querySelector("pre")?.textContent ?? "";
    const ok = await copy(code);
    btn.textContent = ok ? "Copied" : "Press Ctrl+C";
    announce(ok ? "Code copied" : "Copy failed");
    window.setTimeout(() => (btn.textContent = "Copy"), 1600);
  });
}

/* ---------- Table of contents scroll-spy ---------- */

const tocLinks = $$<HTMLAnchorElement>(".toc__link");
if (tocLinks.length && "IntersectionObserver" in window) {
  const targets = tocLinks
    .map((l) => document.getElementById(l.dataset.toc ?? ""))
    .filter((x): x is HTMLElement => !!x);
  const visible = new Set<string>();
  const setActive = (id: string) => {
    for (const l of tocLinks) {
      const on = l.dataset.toc === id;
      l.classList.toggle("is-active", on);
      if (on) l.setAttribute("aria-current", "location");
      else l.removeAttribute("aria-current");
    }
  };
  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (e.isIntersecting) visible.add(e.target.id);
        else visible.delete(e.target.id);
      }
      const first = targets.find((t) => visible.has(t.id));
      if (first) setActive(first.id);
      else {
        // Between headings: the last one above the viewport is current.
        const above = targets.filter((t) => t.getBoundingClientRect().top < 120);
        if (above.length) setActive(above[above.length - 1].id);
      }
    },
    { rootMargin: "-72px 0px -60% 0px" },
  );
  targets.forEach((t) => io.observe(t));
}

/* ---------- Search ---------- */

interface Rec {
  p: string;
  h: string;
  u: string;
  t: string;
}
interface Hit {
  rec: Rec;
  score: number;
}

const dialog = $<HTMLDialogElement>("#search");
const input = $<HTMLInputElement>("#search-input");
const list = $<HTMLUListElement>("#search-results");
const statusEl = $<HTMLElement>(".search__status");
let index: Promise<Rec[]> | null = null;
let hits: Hit[] = [];
let active = -1;
let lastFocus: HTMLElement | null = null;

const loadIndex = () =>
  (index ??= fetch("/search.json")
    .then((r) => (r.ok ? (r.json() as Promise<Rec[]>) : []))
    .catch(() => []));

const norm = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "");
const terms = (q: string) =>
  norm(q)
    .split(/[^a-z0-9.@_-]+/)
    .filter(Boolean);
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function score(rec: Rec, ts: string[]): number {
  const h = norm(rec.h);
  const p = norm(rec.p);
  const t = norm(rec.t);
  let total = 0;
  for (const term of ts) {
    const word = new RegExp(`(^|[^a-z0-9])${escapeRe(term)}`);
    let s = 0;
    if (word.test(h)) s += 12;
    else if (h.includes(term)) s += 6;
    if (word.test(p)) s += 3;
    const inBody = t.split(term).length - 1;
    if (inBody) s += Math.min(inBody, 6) + (word.test(t) ? 2 : 0);
    if (!s) return 0; // every term must match somewhere
    total += s;
  }
  if (h.includes(ts.join(" "))) total += 10;
  return total;
}

/** Text with each term wrapped in <mark>, built with DOM nodes, never innerHTML. */
function highlight(el: HTMLElement, text: string, ts: string[]) {
  el.textContent = "";
  if (!ts.length) {
    el.textContent = text;
    return;
  }
  const re = new RegExp(
    `(${ts
      .map(escapeRe)
      .sort((a, b) => b.length - a.length)
      .join("|")})`,
    "gi",
  );
  let last = 0;
  for (const m of text.matchAll(re)) {
    const i = m.index ?? 0;
    if (i > last) el.append(text.slice(last, i));
    const mark = document.createElement("mark");
    mark.textContent = m[0];
    el.append(mark);
    last = i + m[0].length;
  }
  el.append(text.slice(last));
}

function snippet(text: string, ts: string[]): string {
  const low = norm(text);
  let at = -1;
  for (const term of ts) {
    const i = low.indexOf(term);
    if (i !== -1 && (at === -1 || i < at)) at = i;
  }
  if (at === -1) return text.slice(0, 150) + (text.length > 150 ? "…" : "");
  const start = Math.max(0, at - 50);
  const end = Math.min(text.length, at + 110);
  return (
    (start ? "…" : "") + text.slice(start, end).trim() + (end < text.length ? "…" : "")
  );
}

function render(ts: string[]) {
  if (!list || !input || !statusEl) return;
  list.textContent = "";
  hits.forEach((hit, i) => {
    const li = document.createElement("li");
    li.id = `sr-${i}`;
    li.setAttribute("role", "option");
    li.setAttribute("aria-selected", String(i === active));
    li.className = "search__hit";
    const a = document.createElement("a");
    a.href = hit.rec.u;
    a.tabIndex = -1;
    const crumb = document.createElement("span");
    crumb.className = "search__crumb";
    crumb.textContent = hit.rec.p;
    const title = document.createElement("span");
    title.className = "search__title";
    highlight(title, hit.rec.h, ts);
    const text = document.createElement("span");
    text.className = "search__text";
    highlight(text, snippet(hit.rec.t, ts), ts);
    a.append(crumb, title, text);
    a.addEventListener("click", () => dialog?.close());
    li.append(a);
    li.addEventListener("mousemove", () => {
      if (active !== i) select(i);
    });
    list.append(li);
  });
  input.setAttribute("aria-expanded", String(hits.length > 0));
  if (active >= 0) input.setAttribute("aria-activedescendant", `sr-${active}`);
  else input.removeAttribute("aria-activedescendant");
  const q = input.value.trim();
  statusEl.textContent = !q
    ? ""
    : hits.length
      ? `${hits.length} result${hits.length === 1 ? "" : "s"}`
      : `No results for “${q}”`;
}

function select(i: number) {
  active = i;
  const items = $$<HTMLLIElement>(".search__hit", list ?? document);
  items.forEach((li, j) => li.setAttribute("aria-selected", String(j === i)));
  if (i >= 0) {
    input?.setAttribute("aria-activedescendant", `sr-${i}`);
    items[i]?.scrollIntoView({ block: "nearest" });
  }
}

async function runSearch() {
  if (!input) return;
  const ts = terms(input.value);
  const recs = await loadIndex();
  hits = ts.length
    ? recs
        .map((rec) => ({ rec, score: score(rec, ts) }))
        .filter((h) => h.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 24)
    : [];
  active = hits.length ? 0 : -1;
  render(ts);
}

function openSearch() {
  if (!dialog || dialog.open) return;
  lastFocus = document.activeElement as HTMLElement | null;
  if (document.body.classList.contains("nav-open")) setNav(false);
  dialog.showModal();
  input?.focus();
  input?.select();
  void loadIndex();
}

$$<HTMLButtonElement>(".search-trigger").forEach((b) =>
  b.addEventListener("click", openSearch),
);
dialog?.addEventListener("close", () => lastFocus?.focus());
dialog?.addEventListener("click", (e) => {
  if (e.target === dialog) dialog.close(); // a click on the backdrop
});
input?.addEventListener("input", () => void runSearch());
input?.addEventListener("keydown", (e) => {
  if (e.key === "ArrowDown" || e.key === "ArrowUp") {
    e.preventDefault();
    if (!hits.length) return;
    const d = e.key === "ArrowDown" ? 1 : -1;
    select((active + d + hits.length) % hits.length);
  } else if (e.key === "Enter") {
    e.preventDefault();
    const hit = hits[active];
    if (hit) {
      dialog?.close();
      location.href = hit.rec.u;
    }
  }
});

document.addEventListener("keydown", (e) => {
  const t = e.target as HTMLElement;
  const typing = t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName);
  if ((e.key === "k" || e.key === "K") && (e.metaKey || e.ctrlKey)) {
    e.preventDefault();
    openSearch();
  } else if (e.key === "/" && !typing && !e.altKey && !e.metaKey && !e.ctrlKey) {
    e.preventDefault();
    openSearch();
  }
});
export {};
