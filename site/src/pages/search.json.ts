import type { APIRoute } from "astro";
import { loadDocs } from "../lib/docs";
import { repos } from "../data/repos";
import { operations, opUrl, AUTH_LABEL } from "../lib/openapi";

// One record per heading section. Fetched by the search dialog on first open,
// so pages that never search never pay for it.
export const GET: APIRoute = async () => {
  const docs = await loadDocs();
  const records = docs.flatMap((d) =>
    d.sections.map((s) => ({
      p: d.title,
      h: s.heading,
      u: s.id ? `${d.route}#${s.id}` : d.route,
      t: s.text,
    })),
  );
  for (const r of repos) {
    records.push({
      p: "Repositories",
      h: `${r.name}: ${r.title}`,
      u: `/repos/${r.slug}`,
      t: [r.summary, r.stack.join(", "), r.deploy, ...r.rules, ...r.ci].join(" "),
    });
  }
  records.push({
    p: "Product and stack",
    h: "Product and stack",
    u: "/stack",
    t: "Architecture: browser, Cloudflare Pages, the API Worker, D1, R2, Queues, cron triggers, Brevo, Turnstile, Neon backups, Upptime monitoring, Workers Free plan limits.",
  });
  // One record per API operation, findable by method, path or operationId.
  records.push({
    p: "API reference",
    h: "API reference",
    u: "/api",
    t: "Base URLs, authentication (bearer token, session cookie, CSRF), error shapes, rate limits and Free-plan notes for api.pacestreak.com.",
  });
  for (const o of operations) {
    records.push({
      p: "API reference",
      h: `${o.method} ${o.path}`,
      u: opUrl(o),
      t: [o.id, o.tag, o.summary, o.description, AUTH_LABEL[o.auth]].join(" "),
    });
  }
  return new Response(JSON.stringify(records), {
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
};
