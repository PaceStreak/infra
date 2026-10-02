# Topology

Zone: **`pacestreak.com`**, on Cloudflare (free plan). Nameservers
`dante.ns.cloudflare.com` / `grace.ns.cloudflare.com`.

## DNS records

| Name | Type | Content | Proxy | Why |
| --- | --- | --- | --- | --- |
| `pacestreak.com` | CNAME | `pacestreak.pages.dev` | Proxied | Must resolve so the redirect rule can fire. The target is never fetched — the rule answers at the edge first. |
| `www` | CNAME | `pacestreak.pages.dev` | Proxied | Canonical public site. |
| `blog` | CNAME | `pacestreak-blog.pages.dev` | Proxied | Blog. |
| `app` | CNAME | `pacestreak-app.pages.dev` | Proxied | The product. Written by attaching the custom domain to the Pages project, not by hand. |
| `api` | CNAME | `<tunnel-id>.cfargotunnel.com` | Proxied | The API, through a Cloudflare Tunnel. Written by the tunnel's Public Hostname config. |
| `status` | CNAME | `pacestreak.github.io` | **DNS only** | GitHub Pages must validate the domain to issue its certificate; it cannot do that through Cloudflare's proxy. |
| `pacestreak.com` | MX ×3 | `mx.zoho.in`, `mx2`, `mx3` | DNS only | Mail. |
| `pacestreak.com` | TXT | `v=spf1 include:zoho.in ~all` | DNS only | SPF. |
| `zmail._domainkey` | TXT | `v=DKIM1; …` | DNS only | DKIM. |
| `_dmarc` | TXT | `v=DMARC1; p=reject; …` | DNS only | DMARC. |
| `brevo1._domainkey`, `brevo2._domainkey` | CNAME | `b1`/`b2.pacestreak-com.dkim.brevo.com` | DNS only | DKIM for the app's mail, sent through Brevo. |
| `pacestreak.com` | TXT | `brevo-code:…` | DNS only | Brevo domain verification. |
| `pacestreak.com` | TXT | `google-site-verification=…` | DNS only | Search Console. |

### Two senders, one SPF record

SPF lists only Zoho (`include:zoho.in`). Brevo, which sends the app's mail
(verification codes, resets, digests, the monthly backup), is **not** in it,
and that is fine: Brevo sends from its own return-path domain, so its mail
passes DMARC through **aligned DKIM** (`d=pacestreak.com`, the `brevo1`/`brevo2`
keys), not SPF. With `p=reject`, deleting those two CNAMEs would get every app
email rejected. Adding Brevo to SPF is unnecessary and would only spend one of
SPF's ten DNS lookups.

### A CNAME at the apex is not normally legal

RFC 1034 forbids a CNAME coexisting with other records at a name, and the apex
must carry SOA, NS and — here — MX. Cloudflare's **CNAME flattening** resolves
the target server-side and answers with A/AAAA, which is why the apex CNAME and
the Zoho MX records can coexist.

**This is a Cloudflare feature.** Moving DNS to a provider without flattening
(or ALIAS/ANAME) means replacing the apex CNAME with hardcoded A/AAAA records
and maintaining them by hand.

### `status` is the one grey-cloud record

Proxying it would break GitHub's certificate issuance. Once the certificate is
issued the record *can* be proxied, but there is no reason to and it removes a
way for the status page to fail independently of Cloudflare — which is the point
of a status page.

## Redirect rule

### Rules → Redirect Rules → "Redirect apex to www"

```text
When:  Hostname equals pacestreak.com
Then:  Dynamic redirect, 301, preserve query string
       concat("https://www.pacestreak.com", http.request.uri.path)
```

Dynamic rather than static, so `pacestreak.com/pricing` reaches `/pricing`
instead of dumping everyone on the homepage.

**If this rule is deleted, the apex returns 522** — the DNS record points at a
Pages project that does not recognise `pacestreak.com` as a custom domain.

## Cloudflare Pages projects

| Project | Repo | Serves | Branch | Build | Output |
| --- | --- | --- | --- | --- | --- |
| `pacestreak-web` | `PaceStreak/web` | apex + `www` | `main` | `npm run build` | `dist` |
| `pacestreak-blog` | `PaceStreak/blog` | `blog` | `main` | `npm run build` | `dist` |
| `pacestreak-app` | `PaceStreak/app` | `app` | `main` | `npm run build` | `dist` |

All three are **Git-connected**, so a push to `main` deploys and a push to any
other branch gets a preview at `<branch>.pacestreak-<repo>.pages.dev`. None
needs a Cloudflare API token. Build commands were confirmed from the Pages API
on 2026-10-02; `web`'s build runs a post-build step
(`scripts/csp-style-hashes.mjs`), so the command must stay `npm run build`, not
`astro build`.

### The app's SPA routing

`app` is a single-page app. Its build generates `_redirects` from
`src/routes.json`: each known route prefix is rewritten to the shell, and
everything else gets a real 404 from `404.html`.

```text
/habits   / 200
/habits/* / 200
```

**The target is `/`, not `/index.html`.** Pages normalises `/index.html` to `/`
with a 308, and applies that to rewrite targets too: with `/index.html`, every
deep link (a reload, a shared link, a home-screen shortcut) was redirected to
the home page. That was true from the first deployment until 2026-10-02. See
the runbook.

### Naming

**The convention is `pacestreak-<repo>`**, and both live projects follow it:
`pacestreak-web` and `pacestreak-blog`.

**A Pages project CAN be renamed, from the dashboard.** This is worth stating
plainly because the CLI implies otherwise — `wrangler pages project` offers only
`list`, `create` and `delete`, and the project name appears in the
`<project>.pages.dev` hostname, which together read as "immutable". It is not.

What makes it safe: **the `pages.dev` subdomain does not follow the rename.**
`pacestreak-web` still serves `pacestreak.pages.dev`. Nothing is recreated, so
custom domains stay attached, certificates are untouched, and the Git connection
and deployment history survive. Renaming `pacestreak` to `pacestreak-web` caused
no downtime and no incident on the status page.

The consequence to remember is the inverse of the usual warning: the project
name and its `pages.dev` hostname can disagree permanently, so **do not infer
the project name from the `pages.dev` URL** — check `wrangler pages project
list`.

### `api.pacestreak.com`: live via Cloudflare Tunnel, not Pages

Created 27 September 2026 by setting a Public Hostname in the Cloudflare Zero
Trust dashboard's Tunnel config, which is what actually wrote the DNS record -
same "never by hand in the DNS tab" rule, different mechanism than Pages'
custom-domain flow. It's a CNAME to the tunnel, not to a `pages.dev` project:
`api` isn't Pages at all, it's a FastAPI app on a GCP `e2-micro` VM (see
`infra/DECISIONS.md`'s hosting entry). `dig api.pacestreak.com` resolves to
Cloudflare's anycast IPs like every other proxied record here; the VM itself
has no public inbound port open anywhere.

Capacity, measured 2 October 2026 with `api/scripts/loadtest.py`: one API
process (`WEB_CONCURRENCY=1`) handles about 40-45 requests a second before
it only queues. From India, about 340 ms of each production request is the
round trip to us-central1; `/health` takes about 45 ms on the VM. Details in
`api/README.md#capacity-measured-2026-10-02`.

### How `app` got its record

`app.pacestreak.com` was attached as a custom domain on the `pacestreak-app`
project once a real deployment existed, which let Cloudflare write the CNAME.
Never create a record ahead of a deployment: a proxied record pointing at
nothing returns `522`, which reads as a broken product.

> A direct-upload project **can** be connected to a repository afterwards,
> from the project's Settings. The API reports `source: NONE` until one is
> configured, which is easy to misread as "not possible".

## Certificates

| Hostname | Issuer | Notes |
| --- | --- | --- |
| `pacestreak.com` | Google Trust Services | Pages-issued, **separate** cert |
| `www.pacestreak.com` | Google Trust Services | Pages-issued, **separate** cert |
| `blog.pacestreak.com` | Google Trust Services | Pages-issued |
| `app.pacestreak.com` | Google Trust Services | Pages-issued |
| `api.pacestreak.com` | Cloudflare edge certificate | Tunnel hostname; the VM serves plain HTTP to `cloudflared` only |
| `status.pacestreak.com` | Let's Encrypt | GitHub Pages, HTTPS enforced |

Cloudflare Pages issues **one certificate per custom domain**, not one with
multiple SANs — verified 2026-08-28: the apex cert's SAN list is
`[pacestreak.com]` and www's is `[www.pacestreak.com]`, with different
`notAfter` timestamps. That is why `PaceStreak/status` monitors both
independently. An expired apex certificate is a browser interstitial *before*
the redirect ever runs, so it matters even though the apex only redirects.

## Security headers

Every site ships a Content-Security-Policy from its `public/_headers`, and
none allows inline scripts.

| Site | `style-src` | `connect-src` | Notes |
| --- | --- | --- | --- |
| `www` | `'self'` plus the SHA-256 of its one inline stylesheet | `'self'` | The CSS is inlined for first paint; the hash is computed after each build and written into `dist/_headers`. `check-html.py` fails the build if a `<style>` block's hash is missing. |
| `blog` | `'self' 'unsafe-inline'` | `'self'` | Shiki colours code with `style` attributes. Scripts stay `'self'`. |
| `app` | `'self'` | `'self'`, the API, Turnstile, the R2 bucket | Turnstile (`challenges.cloudflare.com`) is the one third-party script, on auth forms only. |

An inlined script or a `data:` URI is blocked by the browser **silently**,
which is why the sites run `check-html.py` in CI and Vite/Astro build with
`assetsInlineLimit: 0`.

### `Cache-Control: no-transform` on pages

Cloudflare Web Analytics was enabled on the zone and injected
`static.cloudflareinsights.com/beacon.min.js` into HTML responses. The CSP
blocks it, so it collected nothing and logged a console error on every page,
costing Lighthouse Best Practices points. Page routes now send
`no-transform`, which stops the edge rewriting the HTML. Scoped to page routes
(`/`, `/:page`, `/posts/:slug` …) so it never merges with the immutable
`/_astro/*` and `/assets/*` rules; a more specific rule wins for the same
header. Web Analytics was switched off in the dashboard on 2026-10-02; the
header stays as a guard against any edge rewrite.

### Files for agents

`www` and `blog` serve `llms.txt` and `/.well-known/ai-catalog.json`, and
`www` registers one read-only WebMCP tool (`find_page`). All three are static
and say nothing about any user.
