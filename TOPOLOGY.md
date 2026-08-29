# Topology

Zone: **`pacestreak.com`**, on Cloudflare (free plan). Nameservers
`dante.ns.cloudflare.com` / `grace.ns.cloudflare.com`.

## DNS records

| Name | Type | Content | Proxy | Why |
| --- | --- | --- | --- | --- |
| `pacestreak.com` | CNAME | `pacestreak.pages.dev` | Proxied | Must resolve so the redirect rule can fire. The target is never fetched — the rule answers at the edge first. |
| `www` | CNAME | `pacestreak.pages.dev` | Proxied | Canonical site. |
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

| Project | Repo | Branch | Build | Output |
| --- | --- | --- | --- | --- |
| `pacestreak` | `PaceStreak/landing` | `main` | `npm run build` | `dist` |
| `pacestreak-blog` | `PaceStreak/blog` | `main` | `npm run build` | `dist` |

Both are **Git-connected**, so a push deploys. Neither needs a Cloudflare API
token any more.

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
