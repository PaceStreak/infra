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

**Cause:** the `worker` container has stopped, is crash-looping, or every
tick is failing on one job.

**Fix:** open **Admin → Metrics** in the app, which names the last result of
each job; a job showing `Failed:` is the place to look. Then:

```bash
docker compose -f compose.yaml -f compose.prod.yaml ps worker
docker compose -f compose.yaml -f compose.prod.yaml logs --tail=200 worker
docker compose -f compose.yaml -f compose.prod.yaml restart worker
```

A failing job never stops the others; it is logged and the tick carries on.
The endpoint turns healthy again after the next clean tick.

## Verifying everything at once

```bash
for u in https://pacestreak.com https://www.pacestreak.com \
         https://blog.pacestreak.com https://status.pacestreak.com; do
  printf '%-32s %s\n' "$u" "$(curl -sS -o /dev/null -m 20 -w '%{http_code} %{redirect_url}' "$u")"
done
```

Expected: apex `301`, the other three `200`.
