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

**Symptom:** the status page shows `/health/worker` down while
`/health/ready` is up; nobody gets streak nudges or the Monday digest.

**Cause:** the worker is a scheduled GitHub Actions workflow
(`api/.github/workflows/worker.yml`, every five minutes), not a process.
Either the schedule is not firing, the image cannot be pulled, or every tick
is failing on one job. GitHub delays scheduled runs under load and disables
them after 60 days without repository activity.

**Fix:** open **Admin → Metrics** in the app, which names the last result of
each job; a job showing `Failed:` is the place to look. Then:

```bash
gh run list -R PaceStreak/api --workflow "Worker tick" -L 8   # firing? succeeding?
gh run view <id> -R PaceStreak/api --log                      # why a tick failed
gh workflow enable "Worker tick" -R PaceStreak/api            # if GitHub disabled it
gh workflow run "Worker tick" -R PaceStreak/api               # run one tick now
```

A failing job never stops the others; it is logged and the tick carries on.
The endpoint turns healthy again after the next clean tick.

## A deploy didn't reach the API

**Symptom:** a change merged to `api` `main`, CI is green, but the live API
behaves as before.

**Cause:** FastAPI Cloud's GitHub integration deploys the API on every push
to `main`; the schema is changed separately by the `Migrate` workflow.

**Fix:** check each link in order. Run the `fastapi cloud` commands from a
checkout of `api` (`uvx --from "fastapi[standard]" fastapi cloud ...`).

```bash
gh run list -R PaceStreak/api -L 5                  # CI, Publish image, Migrate
fastapi cloud deployments list                      # latest status; failure reason
fastapi cloud logs --no-follow --tail 100           # runtime errors
curl -s https://api.pacestreak.com/health
```

A deployment stuck in `verifying` means the app crashes on start; the logs
say why (once it was `No module named 'app'`, fixed by `[tool.fastapi]` in
`pyproject.toml`). A migration runs about a minute behind the deploy, so a
failing `Migrate` run (`gh run view <id> --log`) leaves the new code serving
against the old schema: fix the migration and re-run it with
`gh workflow run Migrate -R PaceStreak/api`.

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
         https://app.pacestreak.com/habits https://api.pacestreak.com/v1/library; do
  printf '%-40s %s\n' "$u" "$(curl -sS -o /dev/null -m 20 -w '%{http_code} %{redirect_url}' "$u")"
done
```

Expected: apex `301`, everything else `200`. A `308` on the app deep link is
the SPA rewrite problem above.
