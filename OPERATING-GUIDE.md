# Operating guide: the Workers API, email and plans

How PaceStreak runs since the move to Cloudflare Workers on 2026-10-19,
and how to change the parts most likely to change: the plan, the mail
transport, email on or off, and sign-in security.

Last checked against the code on 2026-10-19. Where this guide and the
API's `README.md` disagree, the README wins; it lives next to the code.

---

## 1. What runs where

| Piece | Where | How it deploys |
| --- | --- | --- |
| API | Cloudflare Worker `pacestreak-api`, custom domain `api.pacestreak.com` | `cd api && pnpm wrangler deploy --env=""` |
| Database | D1 `pacestreak` (APAC), id `66803bc7-f7b4-40c7-ba13-e93c63753183` | `pnpm wrangler d1 migrations apply pacestreak --remote` before deploying |
| Background jobs | Cron triggers on the same Worker, plus queue `pacestreak-jobs` (dead letters in `pacestreak-jobs-dlq`) | Deployed with the Worker |
| Files | R2 buckets `pacestreak-photos`, `pacestreak-staging` | Created once |
| App | Cloudflare Pages `pacestreak-app`, `app.pacestreak.com` | Push to `app` `main` |
| Outgoing mail | Brevo SMTP relay (`MAILER=smtp`) | Secrets on the Worker |

**Branches in `PaceStreak/api`:**

- `main`: the TypeScript Workers API (what is live).
- `next`: same as `main`; where the rewrite was built. Safe to delete once
  nothing refers to it.
- `old`: the Python/FastAPI service, kept as a backup. Nothing deploys it.

The root repo `PaceStreak/pacestreak` pins each component. After a
component change: `git add <component>` at the root, commit, push.

---

## 2. Workers Free vs Workers Paid ($5/month)

PaceStreak runs on **Free** today. What that means in practice:

| | Free | Paid |
| --- | --- | --- |
| CPU per request | 10 ms | up to 5 min (we set 30 s) |
| D1 queries per request | 50 | 1,000 |
| Requests | 100,000 a day | 10 million a month included |
| D1 Time Travel (restore window) | 7 days | 30 days |
| Cloudflare Email Service sending | **not available** | 3,000 a month included |

**Known risks while on Free:**

1. **Sign-in CPU.** Passwords are PBKDF2-SHA256 at 100,000 iterations.
   Live sign-in worked on 2026-10-19, so it fits today. If sign-ins start
   failing with **error 1102**, that is the CPU limit. The fix is moving to
   Paid, not lowering the iterations.
2. **Heavy routes and jobs.** Background jobs are packed to stay under
   1,000 D1 queries per invocation (the Paid limit). On Free, a heavy job
   can hit the 50-query cap and fail; failed queue messages retry, then land
   in `pacestreak-jobs-dlq`. A single user will rarely hit it; many users will.
3. **Daily request cap.** Hitting 100,000 requests stops the API until the
   next UTC day.
4. **Backups.** Only 7 days of Time Travel. The proposed `/privacy` text in
   `api/docs/rewrite/CUTOVER.md` says 30; change it to 7 if you publish it
   while still on Free.

**Moving to Paid:** Workers & Pages → Plans → **Workers Paid**. Then
add back `"limits": { "cpu_ms": 30000 }` in `api/wrangler.jsonc` and
deploy. Nothing else changes.

---

## 3. Email

### 3.1 Two switches

All in `api/wrangler.jsonc` under `vars`, then deploy:

- **`EMAIL_ENABLED`**: `"1"` email on, `"0"` email off.
- **`MAILER`**: which service sends it.

| `MAILER` | Service | Needs | Cost |
| --- | --- | --- | --- |
| `smtp` | Brevo SMTP relay (**current**) | secrets `SMTP_USER`, `SMTP_PASSWORD`; vars `SMTP_HOST`, `SMTP_PORT` | Free, 300 emails a day |
| `brevo` | Brevo HTTP API | secret `BREVO_API_KEY` (an `xkeysib-…` key) | Free, 300 a day |
| `cloudflare` | Cloudflare Email Service | Workers Paid, the `send_email` binding, domain onboarded | 3,000 a month included |
| `console` | Prints to the log | nothing | Local development only; production refuses it |

The API refuses to start if `EMAIL_ENABLED=1` and the chosen transport is
missing its settings, so a misconfiguration shows up at deploy, not when
the first user signs up.

Every email is sent **from** `PaceStreak <noreply@pacestreak.com>` with
**Reply-To** `hello@pacestreak.com`. `hello@` is the public address; a
user who replies to a code email reaches it.

### 3.2 Brevo keys: SMTP key vs API key

Brevo has two kinds of key, and they are not interchangeable:

- **SMTP key** (`xsmtpsib-…`): only for SMTP login. This is the one we use,
  with `MAILER=smtp`. Brevo's HTTP API rejects it ("Key not found").
- **API key** (`xkeysib-…`): only for the HTTP API (`MAILER=brevo`).
  Create one in Brevo → Settings → SMTP & API → API Keys.

Workers cannot use port 25, but port 587 with STARTTLS works through
Cloudflare's TCP sockets, which is how the `smtp` transport talks to
`smtp-relay.brevo.com`.

**Setting the secrets** (paste at the prompt; never in a file or chat):

```bash
cd api
pnpm wrangler secret put SMTP_USER      # the Brevo SMTP login (…@smtp-brevo.com)
pnpm wrangler secret put SMTP_PASSWORD  # the xsmtpsib-… key
```

**Brevo's limits to remember:** 300 emails a day on the free plan, shared
by everything (sign-up codes, reset codes, sign-in codes, nudges, digests).
If they run out, codes stop until the next day. Watch usage in Brevo's
dashboard.

### 3.3 Switching to Cloudflare Email Service later

1. Move to **Workers Paid** (section 2).
2. Onboard the domain: `cd api && pnpm wrangler email sending enable pacestreak.com`.
   This adds Cloudflare's SPF and DKIM records. Check with
   `pnpm wrangler email sending dns get pacestreak.com`.
3. In `api/wrangler.jsonc`, top level:
   - add `"send_email": [{ "name": "EMAIL" }]`
   - set `"MAILER": "cloudflare"`
4. Deploy and sign up a test account to an inbox you control.
5. Once it works, optionally remove the Brevo secrets:
   `pnpm wrangler secret delete SMTP_USER` and `SMTP_PASSWORD`.

The app does not change; it never knows which service sends the mail.

### 3.4 Turning email off entirely

Set `"EMAIL_ENABLED": "0"` and deploy. The product keeps working:

- Sign-up needs no code, and nothing is locked behind a confirmed email.
- Each new account gets **recovery codes**; "Forgot your password?" uses
  them instead of an emailed link.
- Every email screen, card and setting disappears from the app, which asks
  `GET /v1/config` (signed out) or `/v1/me` (signed in).
- Push and the in-app inbox still work.
- Email sign-in codes are skipped, so a mail outage can never lock anyone out.

Turning it back on brings everything back. Accounts made while it was off
confirm their address once at their next sign-in.

### 3.5 Testing email on your machine

Nothing is delivered locally; `wrangler dev` saves each message as an
`.eml` file you can open:

```bash
cd api
pnpm dev:email      # wrangler dev with MAILER=cloudflare, EMAIL_ENABLED=1
pnpm email:last     # prints the newest captured email
```

To try a **real** Brevo send from your machine, put `MAILER=smtp`,
`EMAIL_ENABLED=1`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER` and
`SMTP_PASSWORD` in `api/.dev.vars` (gitignored), run `pnpm dev`, and sign
up with an address you can read. The README's "Testing email locally"
section has the exact `curl`.

### 3.6 When an email doesn't arrive

1. Check spam. If it's there, the domain isn't signing for that service
   (DKIM). Fix the DNS records in the provider's dashboard.
2. Watch the live log while you retry:
   `cd api && pnpm wrangler tail pacestreak-api --format pretty`.
   A send failure reads `smtp <step> answered <code>`:
   - `smtp auth answered 535`: Brevo refused the login. Check the secrets,
     or Brevo blocking logins from cloud IPs. Fallback: an API key and
     `MAILER=brevo`.
   - `smtp rcpt answered 550`: the address was rejected.
   - a timeout: Brevo didn't answer within 20 s.
3. Check Brevo's dashboard → Transactional → Logs, and the daily quota.

---

## 4. What emails we send, and the rules for them

**Sent today** (each category can be switched off in the app's notification
settings, and every one carries a one-click unsubscribe):

- codes: sign-up confirmation, password reset, email change, sign-in codes
- security notices: new sign-in, password changed
- streak-at-risk nudges, habit reminders, the weekly digest
- buddy nudges, challenge results
- milestones (long streaks, personal records, every 5th level)

**Not sent: newsletters and product marketing.** Reasons, in order:

1. They share the 300-a-day Brevo quota with sign-in codes; a newsletter
   could block sign-ins for a day.
2. Marketing needs explicit opt-in consent and a record of it (GDPR,
   India's DPDP Act); activity emails are part of the service.
3. Bulk mail that people ignore hurts the domain's reputation, and then
   codes land in spam too.
4. The app says **"No newsletters, no marketing email."** If that changes,
   change the copy first.

**The privacy rule for every email and push:** never put a habit's name,
note or amount in a **subject line or push title**. They show on lock
screens and in previews; someone breaking a drinking or smoking habit must
never be outed by one. Subjects stay generic ("Your week in PaceStreak");
details go only inside the email. A test enforces this.

---

## 5. Signing in: the layers

| Layer | Who | Notes |
| --- | --- | --- |
| Password | everyone | PBKDF2-SHA256, 100,000 iterations, plus a secret pepper |
| Turnstile | sign-up, sign-in, reset, recover | Cloudflare's bot check; secret `TURNSTILE_SECRET_KEY`, site key in the app |
| Email code | on by default, when email is on | 6 digits, 10 minutes, single use; "trust this device for 30 days" skips it |
| Authenticator app (TOTP) | optional | Replaces the email code; Google Authenticator, 1Password, etc. |
| Passkey | optional | Counts as two-factor on its own |
| Recovery codes | everyone | Single use; work in place of any code and for password reset |

**Why email codes come with "trust this device":** without it, every
sign-in spends one of the 300 daily Brevo emails, and an email outage
locks everyone out. Trusted devices are revoked by "Sign out everywhere"
and by a password change.

**Checking the Turnstile secret is valid** (prints no secret):

```bash
cd api
TS=$(grep -oP '^TURNSTILE_SECRET_KEY=\K.+' .env | tr -d '"')
curl -s https://challenges.cloudflare.com/turnstile/v0/siteverify \
  -d "secret=$TS" -d "response=dummy"
```

`invalid-input-response` means the secret is fine (only the dummy token
was rejected). `invalid-input-secret` means the secret is wrong.

---

## 6. Secrets

All are Worker secrets, set with `pnpm wrangler secret put NAME` (or
`secret bulk FILE.json`). None is in git. They cannot be read back.

| Secret | What | If lost |
| --- | --- | --- |
| `JWT_KEYS` | signs access tokens | Set a new one; everyone signs in again |
| `PEPPER` | mixed into every password hash | **Every password stops working.** Only rotate it with no users, or force resets |
| `DATA_KEY` | encrypts stored secrets (TOTP etc.) | Encrypted fields become unreadable |
| `TURNSTILE_SECRET_KEY` | bot check | Copy from the Turnstile widget in the dashboard |
| `SMTP_USER`, `SMTP_PASSWORD` | Brevo SMTP | Regenerate in Brevo |
| `BREVO_API_KEY` | only for `MAILER=brevo` | Regenerate in Brevo |

Generating a 32-byte key: `openssl rand -base64 32`.
`JWT_KEYS` is JSON: `{"current":"k1","keys":{"k1":"<32-byte base64>"}}`.

`PEPPER` was rotated on 2026-10-19 while creating the admin account; no
other accounts existed, so nothing broke.

---

## 7. Admin and operator tasks

The `admin` script prints SQL; you run it against D1. It needs the
Worker's `PEPPER`, which can't be read back, so keep a copy in a password
manager if you'll use these commands.

```bash
cd api
PEPPER=<base64> pnpm admin set-password admin@pacestreak.com > op.sql
pnpm wrangler d1 execute pacestreak --remote --file op.sql && rm op.sql
pnpm admin set-role someone@example.com moderator > op.sql   # no pepper needed
```

The simplest password change for your own account is Settings › Security
in the app.

---

## 8. Deploying a change

```bash
cd api
pnpm install --frozen-lockfile
pnpm -s typecheck && pnpm -s exec vitest run && pnpm -s build
pnpm wrangler d1 migrations apply pacestreak --remote   # if migrations/ changed
pnpm wrangler deploy --env=""
curl -s https://api.pacestreak.com/health/ready
```

Migrations go first and must stay backward compatible with the running
version. `--env=""` targets production explicitly (the config also has a
`staging` environment).

The app deploys itself on push to `app` `main`. If the API's address ever
changes, change `connect-src` in `app/public/_headers` in the same commit,
or every request fails silently.

---

## 9. Backups

1. **D1 Time Travel:** restore to any minute in the last 7 days (30 on Paid):
   `cd api && pnpm wrangler d1 time-travel restore pacestreak --timestamp <ISO time>`.
2. **Nightly copy in Neon:** `api/.github/workflows/backup.yml` runs at
   23:30 IST (or by hand: `gh workflow run backup.yml -R PaceStreak/api`).
   It exports D1 and loads every table into Neon's `d1_backup` schema,
   replacing the previous copy only if the whole load succeeds.
   - Secrets on `PaceStreak/api`: `CLOUDFLARE_API_TOKEN` (Account → D1 →
     **Edit**; Read is not enough for export), `CLOUDFLARE_ACCOUNT_ID`,
     `NEON_DATABASE_URL`.
   - Check it: `psql "$NEON_DATABASE_URL" -c "select count(*) from d1_backup.users"`.
   - It is a copy for reading and restoring by hand, not a live database:
     columns are typed by SQLite affinity and no constraints are copied.
3. **The Python-era data** (before 2026-10-19) is a `pg_dump` at
   `~/pacestreak-backups/neon-python-2026-10-19.dump`, verified by a full
   restore. Restore with `pg_restore --no-owner -d <database> <file>`.

## 10. Still to do by hand

Deleting these is permanent:

- **Neon:** the old Python-era Postgres project, if it is separate from the
  one holding the nightly `d1_backup` copy. Don't delete the backup's.
- **Upstash:** the old Redis database.
- **GHCR:** the old `api` container images (PaceStreak org → Packages).
- **FastAPI Cloud:** the `pacestreak-api` app, if it still exists.

Done on 2026-10-21: the leftover TXT record `_cf-custom-hostname.api` is
deleted, and the unused GitHub secret `WORKER_ENV_JSON` (old Neon and
Upstash credentials) is deleted from `PaceStreak/api`. `/privacy` already
names only Cloudflare, Brevo and Neon.
