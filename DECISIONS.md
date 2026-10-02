# Decisions

Choices that are expensive or impossible to reverse, and the reasoning at the
time. Recorded so they are re-litigated on evidence rather than memory.

---

## `www` is canonical, not the apex

**Date:** 2026-08-28 · **Status:** decided, implemented

The apex 301-redirects to `www.pacestreak.com`.

**Why:** consistency with the owner's other domains (`rajpoot.dev`,
`scorefit.net` both redirect apex → www), and DNS portability — `www` is a plain
CNAME that works anywhere, while an apex CNAME depends on Cloudflare's flattening.

**The argument that did NOT apply:** cookie isolation. It is the usual reason to
prefer `www`, but with the API on `api.pacestreak.com` the auth cookie must be
scoped `Domain=pacestreak.com` regardless, so `www` isolates nothing. Identical
blast radius either way.

**Cost to reverse:** ~20 minutes — reverse the redirect rule, update canonical
tags, `og:url`, sitemaps and the status monitors.

---

## AGPL-3.0, not MIT or proprietary

**Date:** 2026-08-28 · **Status:** decided, **irreversible for published code**

`web`, `app`, `blog`, `api` and `infra` are AGPL-3.0. `status` remains MIT because it
is largely upstream Upptime code, which is MIT — relicensing someone else's work
is not ours to do. `.github` is MIT because templates are more useful reusable.

**Why AGPL over GPL:** it closes the hosting loophole. A competitor cannot take
this and run a closed SaaS from it.

**Note:** a permissive licence can be granted later; it cannot be withdrawn once
code is published under it. This direction is one-way.

---

## Deploy from Cloudflare's Git integration, not GitHub Actions

**Date:** 2026-08-28 · **Status:** decided, implemented

Both Pages projects build from their repository on push.

**Why:** no API token to store or rotate, build logs in the same place as the
deploy, and preview deployments come free.

**Superseded:** an Actions-based deploy using `wrangler pages deploy`. It worked,
but required a `CLOUDFLARE_API_TOKEN` secret in every repository for no benefit
once the Git connection existed.

---

## No third-party runtime dependencies on the public sites

**Date:** 2026-08-28 · **Status:** decided, enforced by CSP and CI

Both sites ship `default-src 'self'`. No font CDN, no analytics, no widgets.

**Why:** a status page or public site that depends on a third-party CDN can be
taken down by that CDN. It also keeps the pages at 26KB and 8KB respectively.

**Enforcement:** the CSP blocks violations in the browser — silently — so
`check-html.py` fails the build on inline scripts and `data:` URIs instead.

**Cost of reversing:** low technically, but it is the reason "no tracking" can be
claimed truthfully on the public site.

---

## Documentation over Terraform, for now

**Date:** 2026-08-28 · **Status:** decided, revisit on trigger

**Why:** two Pages projects, nine DNS records and one redirect rule. A `.tf`
file that is never applied is worse than a written record, because it looks
authoritative while drifting.

**Trigger to revisit:** a second environment, or the first time a change is made
in the dashboard that nobody can date or explain.

---

## The product gets its own host, separate from the public site

**Date:** 2026-08-29 · **Status:** decided, not yet implemented

`www.pacestreak.com` serves only the public site
([`web`](https://github.com/PaceStreak/web), formerly `landing`). The signed-in
product is built in [`app`](https://github.com/PaceStreak/app) and will be
served from `app.pacestreak.com`. The alternative — `www.pacestreak.com/app` —
was rejected.

**Why:**

- **The public site must never depend on auth.** It is what a stranger sees
  first, and what the status page reports on. An outage in the product must not
  be able to take down the page that explains the product.
- **Caching policies are opposite.** The public site wants long-lived edge
  caching; signed-in responses must never reach a shared cache. Separate
  origins make that a property of the deployment rather than a per-route rule
  someone eventually forgets.
- **Indexing policies are opposite.** One must be crawled, the other must be
  `noindex`. A single origin serving both invites exactly one mistake in
  `robots.txt` — and this organization has already shipped a `robots.txt` bug
  once, on the blog.

**What it costs:** a third Pages project, a fourth proxied CNAME, and a session
cookie scoped `Domain=pacestreak.com` — which was already required to reach
`api.pacestreak.com`, so the split adds no new exposure. The standing
consequence is that **nothing untrusted may ever be hosted under
`pacestreak.com`**.

**Cost to reverse:** moderate. Merging the two back onto one origin means
reworking cache and indexing rules per route, and unpicking whichever
assumptions the app has made about being alone on its host.

---

## Cloudflare Pages projects are named `pacestreak-<repo>`

**Date:** 2026-08-30 · **Status:** decided, implemented

`pacestreak` was renamed to `pacestreak-web`. Both live projects now match the
repository they build: `pacestreak-web`, `pacestreak-blog`. Anything created
later follows the same rule — `pacestreak-app`, `pacestreak-api`.

**This entry originally said the opposite.** It argued the names had to stay
because a Pages project cannot be renamed, and priced the change at real
downtime plus two certificate re-issues. That reasoning was wrong, and the
mistake is worth keeping rather than deleting because of where it came from:
`wrangler pages project` exposes only `list`, `create` and `delete`, and the
name appears in the `<project>.pages.dev` hostname. Absent from the CLI plus
apparently load-bearing in a hostname read as immutable. **The dashboard renames
it in place.**

**Why it is safe:** the `pages.dev` subdomain does not follow the rename —
`pacestreak-web` still serves `pacestreak.pages.dev`. Nothing is recreated, so
custom domains, certificates, the Git connection and the deployment history all
survive untouched. The rename produced no downtime and no status page incident.

**The lesson worth generalising:** absence from a CLI is evidence about the
CLI, not about the platform. Check the dashboard or the API before concluding
something is impossible — this is the second time that exact inference has been
wrong here, after the direct-upload-to-Git-connected claim in
[TOPOLOGY.md](./TOPOLOGY.md#cloudflare-pages-projects).

## The app is a static SPA shell

**Decided (September 2026).** `app.pacestreak.com` is a React + Vite single-page
app served from Cloudflare Pages, not server-rendered.

Why: it keeps the app in the same operational shape as every other site (Pages,
Git-connected, no runtime), and a shell that holds no user data can be cached
at the edge without ever leaking one person's training data to another.
Offline support comes from IndexedDB and a service worker in the app, not from
the edge.

Cost: a blank first paint until data loads, and auth redirects happen on the
client. Both are acceptable for a signed-in tool used mostly from the home
screen.

## The API's hosting: decided - GCP e2-micro, Neon, Upstash

**Decided 27 September 2026.** A GCP `e2-micro` (Always Free tier: 1 instance,
`us-west1`/`us-central1`/`us-east1` only) running Ubuntu 24.04 LTS, 30GB
`pd-standard` boot disk, `STANDARD` network tier. Instance: `pacestreak-api`,
zone `us-central1-a`. No HTTP/HTTPS firewall rule and no external reverse
proxy - see the Cloudflare Tunnel entry below.

Postgres and Redis are **not** containers on this host. An e2-micro has
~1GB RAM; running a database, a cache, the API and the worker on it at once
left no headroom. Postgres is Neon (serverless, scales to zero, pooled
connection string for the app, direct connection string only for
`alembic upgrade head`); Redis is Upstash (`rediss://`, TLS). This is why
`api/compose.gcp.yaml` exists as a **separate, self-contained** compose file
rather than another `compose.prod.yaml` overlay: Compose has no clean way to
*remove* a service through file-merging, and there was no `postgres`/`redis`
service left to keep.

**Image distribution and deploy: the VM pulls, CI never reaches in.**
`.github/workflows/publish.yml` builds and pushes
`ghcr.io/pacestreak/api:<sha>` and `:latest` on every merge to main - that is
the entire job, and this repo's GitHub Actions secrets hold no credential for
the VM at all. A systemd timer on the VM (`autodeploy.timer`, every 2
minutes, unit files in `deploy/gcp/`) runs `autodeploy.sh`: pull `:latest`,
compare its resolved digest against what's currently running
(`docker service inspect`), and if they differ, `docker service update
--image <digest> --with-registry-auth --update-order start-first` for `api`
and `worker`, pinned to the resolved digest rather than the mutable `:latest`
tag - Swarm only re-checks an image reference when it changes, so re-applying
`:latest` verbatim would silently no-op on a later restart. The VM runs a
single-node Docker Swarm (`docker swarm init`, no other node ever joins)
specifically so that update is a real rolling update: Swarm starts the new
task, waits for its healthcheck to pass, and only then stops the old one -
the overlay network's routing mesh never sends traffic to a task that hasn't
passed its healthcheck, so there is no gap `cloudflared` can observe. The VM
never clones this repository; it only ever pulls a prebuilt image.

**This replaces an earlier CI-SSH design that was written up but never
actually wired into `publish.yml`.** A forced-command-only deploy key existed
on the VM (a `deploy` system user whose `authorized_keys` could run nothing
but one script) with no corresponding GitHub Actions secret ever created, so
every deploy up to this point was applied by hand. Decided instead: no SSH
credential for deployment should exist at all, in either direction - the VM
decides when to update itself, and a leaked GHCR pull credential (read-only,
and already needed just to run the image) is a smaller blast radius than any
credential that can update a running service. The `deploy` user, its key, and
the old hand-invoked `deploy.sh` have been removed from the VM.

**Migrations run in the entrypoint here (`RUN_MIGRATIONS=1`), unlike every
other environment.** `compose.prod.yaml` runs migrations from a one-shot
container specifically so two API replicas can never race each other running
`alembic upgrade head` at once. An e2-micro cannot afford a second replica of
anything - that race is structurally impossible here - and the tradeoff flips:
without this, an unattended Watchtower auto-deploy would need a human to SSH
in and migrate by hand after every schema change, defeating the point of
auto-deploy. Do not copy this default to a host that runs more than one
replica.

**Ingress is a Cloudflare Tunnel**, not a reverse proxy with an open port.
`cloudflared` runs as a container on the same Docker network as `api`,
reachable only by service name (`http://api:8000`) - nothing binds to the
VM's network interface at all. The tunnel's public hostname
(`api.pacestreak.com`) is set from the Cloudflare Zero Trust dashboard, which
is what actually creates the DNS record - consistent with never hand-creating
one in the DNS tab.

## API hosting and email provider: no longer open

**Asked 25 September 2026, answered "decide later" for both; hosting resolved
27 September 2026 (above).** Email was resolved earlier - Brevo, see
`api/README.md`'s Turnstile section and `HANDOFF.md` §4.

## Waitlist on www: skipped

**Asked 25 September 2026, answered "skip".** A Pages Function + KV waitlist
would have been the first network request `web` ever makes. It stays
`mailto:` until launch, when "Sign up" on the app replaces it. This closes
site-audit item 10.

## Passkeys are bound to `app.pacestreak.com`, not the apex

A WebAuthn relying-party id may be the registrable domain, which would let any
`*.pacestreak.com` host request the same credentials. Binding to the app's own
host keeps that power with the one origin that needs it. The cost is that
passkeys can never move to another host without every user re-registering,
so the id is fixed for good.

## Shared streaks are judged from personal verdicts

Buddy and group streaks never look at sessions: they combine each member's
own kept/frozen/repaired/paused/missed verdict. So every way a person's week
is forgiven (freeze, repair, pause, planned rest) forgives the shared week
too, and a shared streak can never ask more of someone than their own. The
verdicts are projected into `user_stats.recent_weeks`, so reading a group
costs one row per member.

## Encouragement is preset, not free text

Six fixed messages, only towards people who already chose a connection with
the sender, once a day per pair. Free-text messages would need moderation
tooling, reporting flows and abuse handling that a streak tracker should not
have to carry.

## The monthly backup email: data only on a second, confirmed opt-in

**Date:** 2026-09-26, revised 2026-10-02 · **Status:** decided

Originally the reminder carried no data and no token: an export in an email
puts a person's whole history, quit habits included, in an inbox, where it is
forwarded, indexed by the mail provider and exposed if that account is taken
over.

The owner asked for the file to be emailable anyway. It is now, under three
guards: a **separate** opt-in from the reminder (`backup_attachment`, off by
default); a confirmation in the app that says in plain words what the email
will contain and who can read it; and still **no token**. The zip is the
whole message, so a forwarded email can fetch nothing later. Exports over
10 MB fall back to the link. Recorded so the next person doesn't "simplify"
the confirmation away.

## Undo is a server-side restore, from a snapshot trash

**Date:** 2026-10-02 · **Status:** decided

Client-side undo (delay the delete) fails when the tab closes or another
device deletes. A soft-delete column on every table makes every query
responsible for filtering it out. So deletes are immediate, and a snapshot of
the rows (a habit with its logs) goes to `trash_items` for 30 days. Restores
keep original ids so references reconnect, and refuse with 409, changing
nothing, if something now occupies the place. Workouts keep their existing
soft delete, which sync needs.

## Notification buttons use signed links, not a session

**Date:** 2026-10-02 · **Status:** decided

The service worker has no access token, by design. Done and Snooze buttons on
reminders carry an HMAC over user, habit, action, day and an 18-hour expiry,
keyed from the JWT key like unsubscribe links. A leaked link can do one thing
to one habit until it expires. Giving the worker a token instead would undo
the reason tokens live in memory.

## Insights and the coach are arithmetic, not a model

**Date:** 2026-10-01 · **Status:** decided

No AI provider: it would be the first service to receive what people log. A
pattern is shown only with 8+ days each side and a Welch t-test |t| ≥ 2. The
daily coach is fixed rules. Barcode lookups go to Open Food Facts, sending
the barcode and nothing else, cached in Redis, and named on the privacy page.
An AI vendor remains possible but undecided by the owner.

## `www` inlines its stylesheet and allows it by hash

**Date:** 2026-10-02 · **Status:** decided

For mobile first paint the CSS is inlined; the CSP gains that block's SHA-256,
never `'unsafe-inline'`. The hash is computed after each build and written into
`dist/_headers`; `check-html.py` fails the build on a missing hash, so it
cannot drift into an unstyled production page.

## Crash reports are self-hosted and anonymous

No third-party error service: the app posts crashes to the API. Reports carry
no account and no query string (reset links live there), are grouped by
fingerprint, and are capped so an unauthenticated endpoint can't be flooded.

## Recovery without the mailbox goes through 2FA recovery codes only

Anyone who has lost both password and email needs a proof that was never in
that mailbox. The recovery codes shown when 2FA is turned on are exactly
that. Without 2FA there is no self-service path, by design: a support email
is the fallback, and support must verify ownership by hand.

## Terms have a version, and a change asks again

`TERMS_VERSION` is compared with each account's accepted version. The gate
steps aside on the export screen, so nobody is forced to agree to keep
their own data.

## A plan never changes what the streak counts

Plans, plan challenges and coach suggestions only describe what to do.
Completion is read from the log; a coach's plan starts only when the member
starts it.
