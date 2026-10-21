#!/usr/bin/env node
// Keeps src/data/repos.ts honest. Run in CI on push and weekly.
//
//   1. Every repository in the PaceStreak GitHub organisation has an entry,
//      and every entry is a repository that exists.            (fails)
//   2. Every live URL answers 2xx or 3xx.                       (fails)
//   3. An entry not re-verified for 60 days.                    (warns)
//   4. src/data/openapi.json matches PaceStreak/api main's
//      openapi.json (`npm run sync:openapi` refreshes it).       (fails)
//
// Needs `gh` authenticated (GITHUB_TOKEN in CI is enough: the repositories
// are public). Pass --offline to skip the network checks locally.
//
//   node scripts/check-freshness.mjs

import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { repos } from "../src/data/repos.ts";

const offline = process.argv.includes("--offline");
const STALE_DAYS = 60;
const errors = [];
const warnings = [];
const gha = !!process.env.GITHUB_ACTIONS;
const fail = (msg) => {
  errors.push(msg);
  console.log(gha ? `::error::${msg}` : `FAIL ${msg}`);
};
const warn = (msg) => {
  warnings.push(msg);
  console.log(gha ? `::warning::${msg}` : `WARN ${msg}`);
};

// 1. Organisation vs repos.ts
if (!offline) {
  let names = [];
  try {
    const out = execFileSync(
      "gh",
      [
        "api",
        "--paginate",
        "orgs/PaceStreak/repos?per_page=100",
        "--jq",
        ".[] | select(.archived | not) | .name",
      ],
      { encoding: "utf8" },
    );
    names = out.split("\n").filter(Boolean);
  } catch (e) {
    fail(
      `could not list the organisation's repositories with gh: ${e.message.split("\n")[0]}`,
    );
  }
  if (names.length) {
    const listed = new Set(repos.map((r) => r.name));
    for (const n of names) {
      if (!listed.has(n))
        fail(
          `repository PaceStreak/${n} exists on GitHub but has no entry in src/data/repos.ts`,
        );
    }
    for (const n of listed) {
      if (!names.includes(n))
        fail(
          `src/data/repos.ts lists "${n}", which is not a repository in the organisation`,
        );
    }
    console.log(
      `ok   ${names.length} repositories in the organisation, ${listed.size} in repos.ts`,
    );
  }
}

// 2. Live URLs
if (!offline) {
  await Promise.all(
    repos
      .filter((r) => r.url && r.live !== false)
      .map(async (r) => {
        try {
          const res = await fetch(r.url, {
            redirect: "manual",
            headers: { "User-Agent": "PaceStreak" },
            signal: AbortSignal.timeout(20000),
          });
          // From GitHub's runners Cloudflare's bot protection can challenge
          // the request (403 with a cf-mitigated header). That says nothing
          // about whether the site is up, which is Upptime's job, so it warns.
          const mitigated = res.headers.get("cf-mitigated");
          if (res.status >= 200 && res.status < 400)
            console.log(`ok   ${r.url} ${res.status}`);
          else if (mitigated)
            warn(
              `${r.name}: ${r.url} was challenged by Cloudflare (${mitigated}), not checked`,
            );
          else fail(`${r.name}: ${r.url} answered ${res.status}`);
        } catch (e) {
          fail(`${r.name}: ${r.url} did not answer (${e.cause?.code ?? e.name})`);
        }
      }),
  );
  for (const r of repos.filter((r) => r.url && r.live === false)) {
    warn(`${r.name}: ${r.url} is marked live: false; flip it once it serves`);
  }
}

// 3. Verification age
const now = Date.now();
for (const r of repos) {
  const age = Math.floor((now - Date.parse(r.verified)) / 86400000);
  if (Number.isNaN(age)) fail(`${r.name}: verified "${r.verified}" is not a date`);
  else if (age > STALE_DAYS)
    warn(
      `${r.name}: facts last verified ${r.verified} (${age} days ago); re-check against the repository and bump \`verified\``,
    );
}

// 4. The vendored OpenAPI document
if (!offline) {
  const url = "https://raw.githubusercontent.com/PaceStreak/api/main/openapi.json";
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(20000) });
    if (!res.ok) throw new Error(`answered ${res.status}`);
    const upstream = await res.text();
    const local = await readFile(
      new URL("../src/data/openapi.json", import.meta.url),
      "utf8",
    );
    if (upstream === local) console.log("ok   src/data/openapi.json matches api main");
    else
      fail(
        "src/data/openapi.json differs from PaceStreak/api main's openapi.json; run `npm run sync:openapi` and commit",
      );
  } catch (e) {
    fail(`could not compare src/data/openapi.json with api main: ${e.message}`);
  }
}

console.log(`\n${errors.length} failure(s), ${warnings.length} warning(s)`);
process.exit(errors.length ? 1 : 0);
