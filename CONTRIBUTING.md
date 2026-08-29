# Contributing

This repository is documentation about live infrastructure. The usual rule —
change the code, open a pull request — is inverted here: **the change happens in
Cloudflare or GitHub first, and this repository records it afterwards.**

## If you changed something live

Update the relevant file in the same sitting, while you still remember why:

| You changed | Update |
| --- | --- |
| A DNS record, redirect rule or Pages setting | [TOPOLOGY.md](./TOPOLOGY.md) |
| Something that will break again | [RUNBOOK.md](./RUNBOOK.md) |
| Something expensive to reverse | [DECISIONS.md](./DECISIONS.md) |

A change that is not written down here has effectively not happened — the next
person, including you in six months, has no way to know it was deliberate.

## Writing runbook entries

Entries are ordered by **how often something has actually happened**, not by how
bad it would be. Each one needs:

1. **Symptom** — what you would actually see, including the exact error text
2. **Cause** — the mechanism, not a guess
3. **Fix** — the specific steps
4. A **command that verifies** the fix worked

Do not add speculative entries for things that have never occurred. This file is
valuable precisely because everything in it is real.

## Verify before you document

Commands in the runbook should be ones you have run. A runbook that has never
been tested is a liability during an incident, which is the worst possible time
to find out it is wrong.

## Security

Do not open an issue for a vulnerability — this repository describes the attack
surface. Email **<hello@pacestreak.com>**. See [SECURITY.md](./SECURITY.md).
