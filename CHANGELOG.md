# Changelog

Changes to infrastructure, and to the documentation of it.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Dated rather than versioned — infrastructure is continuously deployed.

## 2026-08-30

### Changed

- **`pacestreak` renamed to `pacestreak-web`.** Both Pages projects now match
  the repository they build. The rename was done in the Cloudflare dashboard
  and caused no downtime: the `pages.dev` subdomain does not follow it
  (`pacestreak-web` still serves `pacestreak.pages.dev`), so custom domains,
  certificates, the Git connection and the deployment history were all
  untouched.

### Fixed

- **A decision record that was wrong on the facts.** It claimed Pages projects
  cannot be renamed and priced a rename at real downtime plus two certificate
  re-issues. `wrangler pages project` exposes only `list`, `create` and
  `delete`, and the name appears in the `pages.dev` hostname — which together
  read as immutable. The dashboard renames in place. Rewritten, with the wrong
  inference kept on the record: absence from a CLI is evidence about the CLI,
  not the platform.

### Added

- The Pages naming convention (`pacestreak-<repo>`) in `TOPOLOGY.md`, plus the
  warning that a project's name and its `pages.dev` hostname can disagree
  permanently after a rename — so the project name cannot be inferred from the
  URL.

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
