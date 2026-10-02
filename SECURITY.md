# Security Policy

## Reporting

**Do not open a public issue.** Email **<hello@pacestreak.com>**. You will get
an acknowledgement within 72 hours.

This file is kept per-repository, alongside the organisation-wide copy in
[PaceStreak/.github](https://github.com/PaceStreak/.github), so the policy
travels with the code if this repository is forked or mirrored.

## Why this repository is public

It documents the attack surface: which hostnames exist, what is proxied, which
records are grey-clouded, where the certificates come from, and how the trust
boundary is drawn. None of that is secret, all of it is observable from
outside, and publishing it lets anyone check the reasoning.

**Nothing in here is a credential, and nothing ever should be.** No API tokens,
no private keys, no secret values. If a change would add one, it belongs in
GitHub Actions secrets or Cloudflare, not in a file.

## Reportable here

- A documented configuration that is genuinely unsafe — an over-broad CORS
  origin, a missing security header, a cookie scoped wider than it needs to be
- A credential accidentally committed. Report it privately and immediately; it
  must be rotated, not merely deleted, because git history preserves it
- A DNS or certificate misconfiguration enabling takeover of a subdomain

## Known and deliberate

- **`status.pacestreak.com` is DNS-only, not proxied.** GitHub Pages cannot
  validate the domain for certificate issuance through Cloudflare's proxy. It
  also means the status page can survive a Cloudflare problem, which is the
  point of a status page.
- **The auth cookie will be scoped to the whole registrable domain.** The
  frontend and API sit on different subdomains, so it has to be. The mitigation
  is that nothing untrusted is hosted under `pacestreak.com`.
