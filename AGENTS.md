# AGENTS.md — infra

Documentation of PaceStreak's DNS, Cloudflare, hosting and operations. Nothing
here is applied automatically.

Workspace-wide rules (CSP, cookies, privacy, commit conventions, what is
already decided) live in the root
[`AGENTS.md`](https://github.com/PaceStreak/pacestreak/blob/main/AGENTS.md).
Read it first; this file only adds what is specific to this repository.

## Rules for this repo

- Keep `TOPOLOGY.md`, `RUNBOOK.md` and `DECISIONS.md` true to what is
  live. Check the live state (`dig`, `curl -I`, `wrangler pages deployment
  list`) before writing; don't document from memory.
- A decision record says what was chosen, what was rejected and why, with a
  date and a status. Update the status when it is implemented.
- **Never hand-create a DNS record** ahead of a deployment (522 is worse than
  NXDOMAIN). Never touch the Zoho or Brevo mail records when changing hosting.
- No secret values, keys or tokens, ever. The Cloudflare token available is
  `zone:read` only; cache purges and Pages settings need the dashboard.
- Never change the GCP VM's configuration (free tier).

## Commits

Conventional commits, subject says what, body says why. Commit as
`AlzyWelzy <welzyalzy@gmail.com>`. **Never credit an AI tool**: no
`Co-Authored-By` trailer and no "Generated with" line, in commits or PRs.
This repository is public, so never commit a secret.
