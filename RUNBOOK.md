# Runbook

Ordered by how often each has actually happened here, not by severity.

Check **<https://status.pacestreak.com>** first. If a monitor is already red,
what you are seeing is probably a symptom rather than a separate fault.

---

## The apex returns 522

**Symptom:** `https://pacestreak.com` returns a Cloudflare error page,
`error code: 522`. `www` is fine.

**Cause:** the apex DNS record is proxied but nothing answers for it — either
the redirect rule was deleted or disabled, or the record points at a Pages
project that does not list `pacestreak.com` as a custom domain.

**Why it matters:** 522 is *worse* than no DNS record. With no record the
hostname does not exist; with a 522 it exists and serves an error page that
reads to a visitor as "this product is broken".

**Fix:** confirm the Redirect Rule still exists and is enabled
(Rules → Redirect Rules). Recreate it from [TOPOLOGY.md](./TOPOLOGY.md) if not.

```bash
curl -sSI https://pacestreak.com | head -3   # expect 301 → https://www.pacestreak.com/
```

---

## A file that was deleted is still being served

**Symptom:** a path returns 200 with old content, but the same path with a
cache-busting query returns 404.

```bash
curl -sS -o /dev/null -w '%{http_code}\n' https://www.pacestreak.com/old-file
curl -sS -o /dev/null -w '%{http_code}\n' "https://www.pacestreak.com/old-file?cb=$RANDOM"
```

**Cause:** Cloudflare's edge cached it with a long `s-maxage`. Removing the file
from the origin does not remove it from the edge; it can keep serving for days.

**Fix:** Caching → Configuration → **Purge Cache** → Custom Purge, listing the
exact URLs. Purge Everything is fine for a site this size.

**Note:** this needs a token with cache-purge permission. Wrangler's OAuth token
has `zone:read` only and cannot do it.

---

## A deploy shipped but the site looks stale or broken

**Symptom:** new markup, old styling. Or a layout that is subtly wrong in a way
that matches a previous version.

**Cause:** asset filenames without a content hash, cached at the edge. This has
happened here: footer icons rendered at ~170px instead of 20px because new HTML
loaded a four-hour-old stylesheet.

**Fix:** both sites now build with Astro, which content-hashes assets, so a
changed file gets a new URL. If you see this again, check that `_headers` caches
the path Astro actually emits (`/_astro/*`) — it once still referenced
`/assets/*`, a path that stopped existing at the migration, so the rule was
silently dead.

---

## Upptime workflows fail with a 403

**Symptom:** in `PaceStreak/status`, Actions fail with
`Permission to PaceStreak/status.git denied to github-actions[bot]`.

**Cause:** the organization's default workflow permission is read-only. Upptime
must commit its history data.

**Fix:** Organization → Settings → Actions → General → Workflow permissions →
**Read and write**.

**Related and separate:** `GITHUB_TOKEN` may *never* write under
`.github/workflows/`, whatever that setting says — GitHub refuses it outright.
So Upptime's `update-template` job cannot regenerate its own workflows. That
needs a PAT with `repo` + `workflow` scope stored as the `GH_PAT` secret.
Without it nothing breaks; only automatic template upgrades are disabled.

---

## A workflow exists but cannot be dispatched

**Symptom:** the file is in `.github/workflows/` but
`gh workflow run <name>.yml` returns 404, and it is absent from
`gh api repos/OWNER/REPO/actions/workflows`.

**Cause:** GitHub registers a workflow when a push **modifies** it. Files
arriving via a template copy are never registered.

**Fix:** make any change to the file and push.

---

## Unknown URLs return 200 instead of 404

**Symptom:** `https://site/anything-made-up` returns 200 and renders the
homepage.

**Cause:** Cloudflare Pages serves `index.html` for unmatched paths when the
build emits no `404.html`. This is a soft 404 — search engines index the
homepage under arbitrary URLs.

**Worse variant seen here:** with no `robots.txt` in the build, `/robots.txt`
returned the site's HTML, and Cloudflare concatenated it onto its own
content-signals policy. Crawlers received a robots.txt with a full HTML document
inside it.

**Fix:** both sites emit `404.html` and `robots.txt`, and CI asserts they exist.

---

## Cloudflare rewrote my robots.txt

**Not a fault.** Cloudflare injects a **Content Signals Policy** preamble (the
block disallowing `GPTBot`, `CCBot`, `ClaudeBot` and similar) into `robots.txt`
on proxied zones. It **prepends** to yours rather than replacing it, so your
`Sitemap:` and `User-agent` directives survive — provided a real `robots.txt`
exists to append. If one does not, see the entry above.

---

## Email stopped working after a DNS change

**Cause:** the Zoho `MX`, SPF, DKIM and DMARC records live on the apex alongside
the web CNAME. They are easy to delete while changing web hosting.

**Fix:** restore from [TOPOLOGY.md](./TOPOLOGY.md).

```bash
dig +short MX pacestreak.com      # expect mx.zoho.in, mx2, mx3
dig +short TXT pacestreak.com     # expect v=spf1 include:zoho.in ~all
```

---

## Reminders, digests or deletions stopped (the API is up)

**Symptom:** the status page shows `/health/worker` down while `/health` is
up; nobody gets streak nudges or the Monday digest.

**Cause:** `/health/worker` answers 503 after 900 s without a scheduler tick.
The scheduler is the Worker's three cron triggers plus the `pacestreak-jobs`
queue consumer; there is no GitHub Actions worker any more.

**Fix:** open **Admin → Metrics** in the app, which names the last result of
each job. Then check, in order:

1. Workers → `pacestreak-api` → Settings → Triggers: three crons listed. A
   deploy registers them from `wrangler.jsonc`; a hand edit in the dashboard
   is overwritten by the next deploy.
2. `pnpm wrangler tail` (or Workers Logs, filter `scheduled`): a tick that
   throws is logged with the job name. A lease that never expires (240 s)
   means a tick died mid-run; the next tick after expiry takes over.
3. Queues → `pacestreak-jobs`: a growing backlog means consumers are failing
   or slow; see "Messages in the dead-letter queue".

## A deploy didn't reach the API

**Symptom:** a change merged to `api` `main`, CI is green, but the live API
behaves as before.

**Cause:** almost always that nobody deployed. **Workers Builds is not
connected**, so a push to `main` deploys nothing.

**Fix:** from a clean `api` `main`:

```bash
pnpm wrangler deployments list                         # what is live, and when
pnpm wrangler d1 migrations apply pacestreak --remote  # schema first
pnpm wrangler deploy
curl -s https://api.pacestreak.com/health
```

Migrations must stay backward compatible: they land before the code, and
`pnpm wrangler rollback` returns to the previous Worker version without
rolling the schema back. Never run `wrangler triggers deploy` casually; it
counts as a production deployment.

## Messages in the dead-letter queue

A message reaches `pacestreak-jobs-dlq` after six failed attempts. The DLQ's
consumer (in the same Worker) records each one, and the hourly `error_alerts`
job emails them. Find the error in `wrangler tail` or Workers Logs by the job
name, fix and deploy, then send the body back to `pacestreak-jobs` from the
dashboard. Consumers take one message per invocation because D1 allows 50
queries per invocation on Free; never raise `max_batch_size`.

## D1 says "overloaded" or queries time out

D1 is single-threaded per database. Look for `D1_ERROR` in Workers Logs and
at D1 → Metrics query duration. Usual causes: a job slice too large (see
`SLICE_COSTS` in `src/jobs/dispatch.ts`) or a missing index (`test/explain`).
A request that exceeds 50 queries fails outright on Free; the code budgets 45
(`src/lib/plan.ts`), so a new failure here means a path that doesn't respect
the budget.

## Requests fail with "exceeded CPU" (1102)

**Cause:** the Free plan allows 10 ms CPU per request or cron, with no
`cpu_ms` setting to raise it. Waiting on D1 or fetch doesn't count; WebCrypto
work (PBKDF2 at sign-in) does. Look for `exceededCpu` in Workers Logs. An
import or export that hits it is a bug in the resumable slice code
(`src/heavy`). Moving to Workers Paid (the `PLAN` var in `wrangler.jsonc`, see
`api/docs/rewrite/CUTOVER.md`) lifts the limit; weakening hashing never does.

## Restoring the database

1. **D1 Time Travel**, 7 days on Free:
   `pnpm wrangler d1 time-travel info pacestreak`, then
   `pnpm wrangler d1 time-travel restore pacestreak --timestamp=<unix>`.
   A restore rewinds the whole database, every user included.
2. **Older than 7 days, or D1 itself is gone:** the nightly copy in Neon
   Postgres, schema `d1_backup`, written by `api/.github/workflows/backup.yml`
   (23:30 IST). [OPERATING-GUIDE.md](./OPERATING-GUIDE.md) has the commands.

## Reloading a page in the app lands on Today

**Symptom:** inside the app everything works, but reloading any page except
Today, opening a shared link, or using a home-screen shortcut lands on Today.

**Cause:** `curl -sI https://app.pacestreak.com/habits` shows a `308` to `/`.
The SPA rewrites in `_redirects` pointed at `/index.html`, and Pages
normalises `/index.html` to `/` with a redirect, including for rewrite
targets. It had been that way on every deployment until 2026-10-02.

**Fix:** rewrite to `/` (`vite.config.ts` generates the rules). Check the
**status code without following redirects**; a browser or `curl -L` shows
the page loading and hides the bug.

## Every page logs a CSP error for `cloudflareinsights.com`

**Symptom:** a console error on every page, `Loading the script
'https://static.cloudflareinsights.com/beacon.min.js/…' violates the following
Content Security Policy directive`, and Lighthouse Best Practices below 100.
Plain `curl` doesn't show it; a browser User-Agent does.

**Cause:** Cloudflare Web Analytics is on for the zone and injects its beacon
into HTML at the edge. Our CSP blocks it, correctly.

**Fix:** pages send `Cache-Control: no-transform` (in each repo's
`public/_headers`), which stops the edge rewriting them. The root fix, turning
Web Analytics off in the dashboard, was done on 2026-10-02; if the error
returns, check whether someone switched it back on.

## Verifying everything at once

```bash
for u in https://pacestreak.com https://www.pacestreak.com \
         https://blog.pacestreak.com https://status.pacestreak.com \
         https://app.pacestreak.com/habits https://api.pacestreak.com/v1/library \
         https://api.pacestreak.com/health/worker; do
  printf '%-40s %s\n' "$u" "$(curl -sS -o /dev/null -m 20 -w '%{http_code} %{redirect_url}' "$u")"
done
```

Expected: apex `301`, everything else `200`. A `308` on the app deep link is
the SPA rewrite problem above.
