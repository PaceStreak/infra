# Changelog

Changes to infrastructure, and to the documentation of it.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Dated rather than versioned — infrastructure is continuously deployed.

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
