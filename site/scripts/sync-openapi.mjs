#!/usr/bin/env node
// Vendors the API's OpenAPI document into src/data/openapi.json, so the site
// builds from this repository alone. The API generates it from its router
// (scripts/openapi.ts in PaceStreak/api); never edit the copy by hand.
// `npm run freshness` fails when the copy differs from api main's.
//
//   npm run sync:openapi

import { writeFile } from "node:fs/promises";

const OPENAPI_URL =
  "https://raw.githubusercontent.com/PaceStreak/api/main/openapi.json";
const dest = new URL("../src/data/openapi.json", import.meta.url);

const res = await fetch(OPENAPI_URL, { signal: AbortSignal.timeout(30000) });
if (!res.ok) {
  console.error(`FAIL ${OPENAPI_URL} answered ${res.status}`);
  process.exit(1);
}
const text = await res.text();
const spec = JSON.parse(text);
if (!spec.openapi || !spec.paths) {
  console.error("FAIL the download is not an OpenAPI document");
  process.exit(1);
}
await writeFile(dest, text);
const ops = Object.values(spec.paths).reduce(
  (n, item) => n + Object.keys(item).filter((k) => k !== "parameters").length,
  0,
);
console.log(
  `ok   wrote src/data/openapi.json (OpenAPI ${spec.openapi}, ${ops} operations)`,
);
