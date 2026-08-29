# PaceStreak Infrastructure

DNS, Cloudflare configuration, deployment topology and operational runbooks for
[PaceStreak](https://www.pacestreak.com).

Copyright (c) 2026 PaceStreak. Licensed under [AGPL-3.0](./LICENSE).

> **This repository is documentation, not automation — for now.** Nothing here
> is applied automatically. The live configuration lives in Cloudflare and
> GitHub; this records what it is, why, and how to recover it. See
> [Why not Terraform yet](#why-not-terraform-yet).

## What is deployed

| Hostname | Serves | Source | Platform |
| --- | --- | --- | --- |
| `www.pacestreak.com` | Public site (**canonical**) | [`web`](https://github.com/PaceStreak/web) | Cloudflare Pages |
| `pacestreak.com` | 301 → `www` | Redirect Rule | Cloudflare |
| `blog.pacestreak.com` | Build log | [`blog`](https://github.com/PaceStreak/blog) | Cloudflare Pages |
| `status.pacestreak.com` | Public status page | [`status`](https://github.com/PaceStreak/status) | GitHub Pages |
| `app.pacestreak.com` | The product (**not built**) | [`app`](https://github.com/PaceStreak/app) | — |
| `api.pacestreak.com` | Backend (**not built**) | [`api`](https://github.com/PaceStreak/api) | — |

Mail is Zoho: `MX`, SPF, DKIM (`zmail._domainkey`) and DMARC records on the
apex. **Do not touch those when changing web hosting** — they are unrelated and
easy to delete by accident.

## Documentation

- **[TOPOLOGY.md](./TOPOLOGY.md)** — DNS records, what each one is for, and the
  non-obvious reasons behind them
- **[RUNBOOK.md](./RUNBOOK.md)** — what to do when something breaks, ordered by
  how often it has actually happened
- **[DECISIONS.md](./DECISIONS.md)** — choices that are expensive to reverse,
  and why they were made
- [CONTRIBUTING.md](./CONTRIBUTING.md), [SECURITY.md](./SECURITY.md),
  [CHANGELOG.md](./CHANGELOG.md)

## The short version

Four things account for most of the surprises here:

1. **A proxied DNS record with nothing behind it returns `522`, which is worse
   than no record at all.** Before, the hostname does not exist; after, it
   serves a Cloudflare error page that reads as "this product is broken". This
   is why `app` and `api` have no records yet, and why they should be created
   by attaching a custom domain to a deployment rather than by hand.
2. **Cloudflare Pages issues a separate certificate per custom domain.** The
   apex and `www` certificates have different SAN lists and different expiry
   dates. One check cannot cover both, which is why the status page monitors
   both.
3. **`GITHUB_TOKEN` can never write to `.github/workflows/`**, no matter what
   the organization's Actions permissions say. That needs a PAT with the
   `workflow` scope.
4. **Cloudflare's edge cache outlives a deploy.** Removing a file from the
   origin does not remove it from the edge; it can keep serving for days.

Each is expanded in the runbook with the symptom that led to it.

## Why not Terraform yet

Terraform for Cloudflare is worth it when there are enough resources that
drift becomes invisible. Right now there are two Pages projects, nine DNS
records and one redirect rule — small enough that a written record is
honest and an unapplied `.tf` file would be a lie waiting to happen.

The trigger to change this: **a second environment**, or the first time
something is changed in the dashboard and nobody can say when or why.
