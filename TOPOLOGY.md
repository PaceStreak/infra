# Topology

Zone: **`pacestreak.com`**, on Cloudflare (free plan). Nameservers
`dante.ns.cloudflare.com` / `grace.ns.cloudflare.com`.

## DNS records

| Name | Type | Content | Proxy | Why |
| --- | --- | --- | --- | --- |
| `pacestreak.com` | CNAME | `pacestreak.pages.dev` | Proxied | Must resolve so the redirect rule can fire. The target is never fetched — the rule answers at the edge first. |
| `www` | CNAME | `pacestreak.pages.dev` | Proxied | Canonical public site. |
| `blog` | CNAME | `pacestreak-blog.pages.dev` | Proxied | Blog. |
| `status` | CNAME | `pacestreak.github.io` | **DNS only** | GitHub Pages must validate the domain to issue its certificate; it cannot do that through Cloudflare's proxy. |
| `pacestreak.com` | MX ×3 | `mx.zoho.in`, `mx2`, `mx3` | DNS only | Mail. |
| `pacestreak.com` | TXT | `v=spf1 include:zoho.in ~all` | DNS only | SPF. |
| `zmail._domainkey` | TXT | `v=DKIM1; …` | DNS only | DKIM. |
| `_dmarc` | TXT | `v=DMARC1; p=reject; …` | DNS only | DMARC. |

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

Both are **Git-connected**, so a push deploys. Neither needs a Cloudflare API
token any more.

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

### Not yet created

`app.pacestreak.com` has **no DNS record**, and that is deliberate. Create it
by attaching the custom domain to a real deployment, which lets Cloudflare
write the record — never by hand in the DNS tab. A proxied record pointing at
nothing returns `522`, which looks to a visitor like a broken product rather
than an unlaunched one.

When `app` is created it becomes a third Pages project — **named
`pacestreak-app`**, Git-connected to `PaceStreak/app` — and a proxied CNAME.

> A direct-upload project **can** be connected to a repository afterwards —
> Cloudflare supports it from the project's Settings. What it cannot do is
> convert in place *without* the connection dialog; the API reports
> `source: NONE` until one is configured, which is easy to misread as "not
> possible".

## Certificates

| Hostname | Issuer | Notes |
| --- | --- | --- |
| `pacestreak.com` | Google Trust Services | Pages-issued, **separate** cert |
| `www.pacestreak.com` | Google Trust Services | Pages-issued, **separate** cert |
| `blog.pacestreak.com` | Google Trust Services | Pages-issued |
| `status.pacestreak.com` | Let's Encrypt | GitHub Pages, HTTPS enforced |

Cloudflare Pages issues **one certificate per custom domain**, not one with
multiple SANs — verified 2026-08-28: the apex cert's SAN list is
`[pacestreak.com]` and www's is `[www.pacestreak.com]`, with different
`notAfter` timestamps. That is why `PaceStreak/status` monitors both
independently. An expired apex certificate is a browser interstitial *before*
the redirect ever runs, so it matters even though the apex only redirects.

## Security headers

Both sites ship a Content-Security-Policy from `public/_headers`:

```text
default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:;
font-src 'self'; connect-src 'self'; base-uri 'self'; form-action 'self';
frame-ancestors 'none'
```

There is no `unsafe-inline`. An inlined script or a `data:` URI is blocked by
the browser **silently**, which is why both repositories run `check-html.py` in
CI to fail the build instead.

`connect-src 'self'` will block the first call to `api.pacestreak.com`. Widen it
in the same change that makes that call.
