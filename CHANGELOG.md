# Changelog

Changes to infrastructure, and to the documentation of it.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Dated rather than versioned — infrastructure is continuously deployed.

## 2026-08-29

### Changed

- `PaceStreak/landing` was renamed to `PaceStreak/web`, and the Pages project
  `pacestreak` now builds from it. Every reference here was updated. The old
  placeholder `web` was archived as `web-archived` and is pending deletion.

### Added

- A decision record for splitting the product onto `app.pacestreak.com`,
  separate from the public site on `www` — the caching and indexing policies of
  the two are opposites, and the public site must not gain an auth dependency.
- `TOPOLOGY.md` now states explicitly that `app` and `api` have no DNS records
  on purpose, and that they must be created by attaching a custom domain to a
  deployment rather than by hand — a proxied record pointing at nothing returns
  a `522` that reads as a broken product.

## 2026-08-28

### Added

- Repository created, documenting infrastructure that was already live.
- `TOPOLOGY.md` — DNS records, the redirect rule, Pages projects and
  certificates, with the reasoning for the non-obvious ones (the apex CNAME
  needing Cloudflare's flattening to coexist with Zoho's MX records; `status`
  being the single grey-cloud record).
- `RUNBOOK.md` — eight failure modes, every one of which actually occurred
  while building this, ordered by frequency rather than severity.
- `DECISIONS.md` — five choices that are expensive or impossible to reverse,
  including the AGPL licensing, which is one-way for published code.
