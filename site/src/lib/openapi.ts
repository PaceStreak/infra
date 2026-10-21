// The API reference: reads the vendored OpenAPI document (src/data/openapi.json,
// refreshed by `npm run sync:openapi`) and shapes it for the /api pages. All of
// it runs at build time; the pages ship no client-side code of their own.

import raw from "../data/openapi.json?raw";

/* ---------- The parts of OpenAPI 3.1 this site reads ---------- */

export interface Schema {
  $ref?: string;
  type?: string | string[];
  format?: string;
  description?: string;
  enum?: unknown[];
  const?: unknown;
  default?: unknown;
  properties?: Record<string, Schema>;
  required?: string[];
  items?: Schema;
  anyOf?: Schema[];
  oneOf?: Schema[];
  allOf?: Schema[];
  additionalProperties?: boolean | Schema;
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  minItems?: number;
  maxItems?: number;
  [k: string]: unknown;
}
interface Parameter {
  name: string;
  in: "path" | "query" | "header" | "cookie";
  required?: boolean;
  description?: string;
  schema?: Schema;
}
interface MediaType {
  schema?: Schema;
}
interface Response {
  $ref?: string;
  description?: string;
  headers?: Record<string, { schema?: Schema; description?: string }>;
  content?: Record<string, MediaType>;
}
interface RawOperation {
  operationId: string;
  tags?: string[];
  summary?: string;
  description?: string;
  parameters?: Parameter[];
  requestBody?: { required?: boolean; content?: Record<string, MediaType> };
  security?: Record<string, string[]>[];
  responses: Record<string, Response>;
}
interface SecurityScheme {
  type: string;
  scheme?: string;
  in?: string;
  name?: string;
  bearerFormat?: string;
  description?: string;
}
interface Spec {
  openapi: string;
  info: { title: string; version: string; description?: string };
  servers: { url: string; description?: string }[];
  tags: { name: string; description?: string }[];
  paths: Record<string, Record<string, RawOperation>>;
  components: {
    schemas: Record<string, Schema>;
    responses: Record<string, Response>;
    securitySchemes: Record<string, SecurityScheme>;
  };
}

export const spec = JSON.parse(raw) as Spec;
export const PRODUCTION = "https://api.pacestreak.com";

/* ---------- $ref resolution ---------- */

function lookup(ref: string): unknown {
  if (!ref.startsWith("#/")) throw new Error(`openapi: external $ref ${ref}`);
  let node: unknown = spec;
  for (const part of ref.slice(2).split("/")) {
    const key = part.replace(/~1/g, "/").replace(/~0/g, "~");
    node = (node as Record<string, unknown>)?.[key];
  }
  if (node === undefined) throw new Error(`openapi: unresolved $ref ${ref}`);
  return node;
}

/** Inline every schema $ref. A ref already on the path is left as a ref (cycles). */
export function deref(schema: Schema | undefined, seen: string[] = []): Schema {
  if (!schema || typeof schema !== "object") return {};
  if (schema.$ref) {
    if (seen.includes(schema.$ref)) return { $ref: schema.$ref };
    const { $ref, ...rest } = schema;
    return deref({ ...(lookup($ref) as Schema), ...rest }, [...seen, $ref]);
  }
  const out: Schema = {};
  for (const [k, v] of Object.entries(schema)) {
    if (k === "properties" && v && typeof v === "object") {
      out.properties = Object.fromEntries(
        Object.entries(v as Record<string, Schema>).map(([n, s]) => [
          n,
          deref(s, seen),
        ]),
      );
    } else if (
      (k === "items" || k === "additionalProperties") &&
      v &&
      typeof v === "object"
    ) {
      out[k] = deref(v as Schema, seen);
    } else if ((k === "anyOf" || k === "oneOf" || k === "allOf") && Array.isArray(v)) {
      out[k] = v.map((s: Schema) => deref(s, seen));
    } else {
      out[k] = v;
    }
  }
  return out;
}

const refName = (ref: string) => ref.split("/").pop()!;

/* ---------- Schema → rows of a property table ---------- */

export interface Row {
  /** Dotted path, e.g. `detail[].loc`. */
  name: string;
  depth: number;
  type: string;
  required: boolean;
  values: string[];
  notes: string[];
  description: string;
}

const isNull = (s: Schema) => s.type === "null";
const variants = (s: Schema) => s.anyOf ?? s.oneOf;

/** "string", "integer | null", "array of object", "any". */
export function typeLabel(s: Schema): string {
  if (s.$ref) return refName(s.$ref);
  const vs = variants(s);
  if (vs) return [...new Set(vs.map(typeLabel))].join(" | ");
  if (s.allOf) return [...new Set(s.allOf.map(typeLabel))].join(" & ");
  if (s.const !== undefined) return "const";
  let t: string;
  if (Array.isArray(s.type)) t = s.type.join(" | ");
  else if (s.type === "array") t = s.items ? `array of ${typeLabel(s.items)}` : "array";
  else if (s.type) t = s.type;
  else if (s.properties) t = "object";
  else t = "any";
  return s.format ? `${t} (${s.format})` : t;
}

function notes(s: Schema): string[] {
  const n: string[] = [];
  const range = (lo?: number, hi?: number, unit = "") =>
    lo !== undefined && hi !== undefined
      ? `${lo}–${hi}${unit}`
      : lo !== undefined
        ? `≥ ${lo}${unit}`
        : hi !== undefined
          ? `≤ ${hi}${unit}`
          : "";
  const v = range(s.minimum, s.maximum);
  if (v) n.push(v);
  const l = range(s.minLength, s.maxLength, " chars");
  if (l) n.push(l);
  const i = range(s.minItems, s.maxItems, " items");
  if (i) n.push(i);
  if (s.default !== undefined) n.push(`default ${JSON.stringify(s.default)}`);
  return n;
}

function enumOf(s: Schema): string[] {
  if (s.const !== undefined) return [JSON.stringify(s.const)];
  if (s.enum) return s.enum.map((v) => JSON.stringify(v));
  const vs = variants(s);
  if (vs) return vs.flatMap(enumOf);
  return [];
}

/** The object-shaped part of a schema whose children should become rows. */
function children(
  s: Schema,
): { props: Record<string, Schema>; required: string[]; suffix: string }[] {
  if (s.properties)
    return [{ props: s.properties, required: s.required ?? [], suffix: "" }];
  if (s.type === "array" && s.items) {
    return children(s.items).map((c) => ({ ...c, suffix: "[]" + c.suffix }));
  }
  if (Array.isArray(s.type) && s.type.includes("array") && s.items) {
    return children(s.items).map((c) => ({ ...c, suffix: "[]" + c.suffix }));
  }
  const vs = variants(s)?.filter((v) => !isNull(v));
  if (vs) return vs.flatMap(children);
  if (s.allOf) return s.allOf.flatMap(children);
  return [];
}

const MAX_DEPTH = 8;

export function rows(schema: Schema, prefix = "", depth = 0): Row[] {
  if (depth > MAX_DEPTH) return [];
  const out: Row[] = [];
  for (const { props, required, suffix } of children(schema)) {
    for (const [name, s] of Object.entries(props)) {
      const full = `${prefix}${suffix}.${name}`.replace(/^\./, "");
      out.push({
        name: full,
        depth,
        type: typeLabel(s),
        required: required.includes(name),
        values: enumOf(s),
        notes: notes(s),
        description: s.description ?? "",
      });
      out.push(...rows(s, full, depth + 1));
    }
  }
  return out;
}

/** True when a schema says nothing about the body (the generator's `{}`). */
export const isEmpty = (s: Schema) => Object.keys(s).length === 0;

/* ---------- Example values, for the curl request bodies ---------- */

export function example(s: Schema, depth = 0): unknown {
  if (depth > 5) return null;
  if (s.default !== undefined) return s.default;
  if (s.const !== undefined) return s.const;
  if (s.enum?.length) return s.enum[0];
  const vs = variants(s);
  if (vs) return example(vs.find((v) => !isNull(v)) ?? vs[0], depth);
  if (s.allOf) return Object.assign({}, ...s.allOf.map((x) => example(x, depth)));
  const t = Array.isArray(s.type) ? s.type.find((x) => x !== "null") : s.type;
  if (s.properties || t === "object") {
    const props = s.properties ?? {};
    const req = s.required ?? [];
    const keys = req.length ? req : Object.keys(props);
    return Object.fromEntries(keys.map((k) => [k, example(props[k] ?? {}, depth + 1)]));
  }
  if (t === "array") return s.items ? [example(s.items, depth + 1)] : [];
  if (t === "integer" || t === "number") return s.minimum ?? 0;
  if (t === "boolean") return false;
  if (t === "string") {
    switch (s.format) {
      case "date":
        return "2026-10-21";
      case "date-time":
        return "2026-10-21T09:00:00Z";
      case "email":
        return "you@example.com";
      case "uuid":
        return "01920000-0000-7000-8000-000000000000";
      case "uri":
        return "https://example.com";
    }
    return "string";
  }
  return null;
}

/* ---------- Operations ---------- */

export type Auth = "bearer" | "bearer-optional" | "cookie" | "none";

export interface ParamView {
  name: string;
  in: string;
  required: boolean;
  type: string;
  values: string[];
  notes: string[];
  description: string;
}
export interface ResponseView {
  status: string;
  description: string;
  /** Name of a shared response under components.responses, if it is one. */
  shared: string | null;
  media: string | null;
  schema: Schema | null;
  headers: string[];
}
export interface Operation {
  id: string;
  anchor: string;
  method: string;
  path: string;
  tag: string;
  summary: string;
  description: string;
  auth: Auth;
  params: ParamView[];
  body: { required: boolean; media: string; schema: Schema } | null;
  responses: ResponseView[];
  curl: string;
}

const METHODS = ["get", "post", "put", "patch", "delete", "head", "options"];

function authOf(sec: RawOperation["security"]): Auth {
  if (!sec || sec.length === 0) return "none";
  const names = sec.map((s) => Object.keys(s)[0] ?? "");
  if (names.includes("refreshCookie")) return "cookie";
  if (names.includes("bearerAuth"))
    return names.includes("") ? "bearer-optional" : "bearer";
  return "none";
}

export const AUTH_LABEL: Record<Auth, string> = {
  bearer: "Bearer token",
  "bearer-optional": "Bearer token optional",
  cookie: "Session cookie + CSRF",
  none: "No auth",
};

const shellQuote = (s: string) => `'${s.replace(/'/g, `'\\''`)}'`;

function curlFor(op: Omit<Operation, "curl">): string {
  const query = op.params
    .filter((p) => p.in === "query" && p.required)
    .map((p) => `${p.name}=${p.values[0]?.replace(/^"|"$/g, "") ?? `<${p.name}>`}`);
  const url = PRODUCTION + op.path + (query.length ? `?${query.join("&")}` : "");
  const lines = [`curl -X ${op.method} ${shellQuote(url)}`];
  if (op.auth === "bearer" || op.auth === "bearer-optional")
    lines.push(`-H "Authorization: Bearer $TOKEN"`);
  if (op.auth === "cookie")
    lines.push(
      `-b "__Secure-refresh_token=$REFRESH; __Secure-csrf_token=$CSRF"`,
      `-H "X-CSRF-Token: $CSRF"`,
    );
  if (op.body) {
    lines.push(`-H ${shellQuote(`Content-Type: ${op.body.media}`)}`);
    if (op.body.media === "application/json") {
      const ex = isEmpty(op.body.schema) ? {} : example(op.body.schema);
      lines.push(`-d ${shellQuote(JSON.stringify(ex))}`);
    } else {
      lines.push(`--data-binary @file`);
    }
  }
  return lines.join(" \\\n  ");
}

function responseView(status: string, r: Response): ResponseView {
  let shared: string | null = null;
  let res = r;
  if (r.$ref) {
    shared = refName(r.$ref);
    res = lookup(r.$ref) as Response;
  }
  const [media, mt] = Object.entries(res.content ?? {})[0] ?? [null, null];
  return {
    status,
    description: res.description ?? "",
    shared,
    media,
    schema: mt ? deref(mt.schema) : null,
    headers: Object.keys(res.headers ?? {}),
  };
}

function build(): Operation[] {
  const ops: Operation[] = [];
  for (const [path, item] of Object.entries(spec.paths)) {
    for (const method of METHODS) {
      const o = item[method];
      if (!o) continue;
      const params = [
        ...((item.parameters as unknown as Parameter[]) ?? []),
        ...(o.parameters ?? []),
      ]
        .filter((p) => p.in === "path" || p.in === "query")
        .map((p) => {
          const s = deref(p.schema);
          return {
            name: p.name,
            in: p.in,
            required: p.in === "path" || !!p.required,
            type: typeLabel(s),
            values: enumOf(s),
            notes: notes(s),
            description: p.description ?? s.description ?? "",
          };
        });
      const [media, mt] = Object.entries(o.requestBody?.content ?? {})[0] ?? [];
      const base = {
        id: o.operationId,
        anchor: o.operationId,
        method: method.toUpperCase(),
        path,
        tag: o.tags?.[0] ?? "other",
        summary: o.summary ?? `${method.toUpperCase()} ${path}`,
        description: o.description ?? "",
        auth: authOf(o.security),
        params,
        body:
          media && mt
            ? { required: !!o.requestBody?.required, media, schema: deref(mt.schema) }
            : null,
        responses: Object.entries(o.responses)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([status, r]) => responseView(status, r)),
      };
      ops.push({ ...base, curl: curlFor(base) });
    }
  }
  return ops;
}

export const operations = build();

/* ---------- Tags ---------- */

export interface Tag {
  name: string;
  slug: string;
  label: string;
  blurb: string;
  ops: Operation[];
}

// One line per tag for the index and the cards; the spec's tags carry no
// descriptions. A tag the API adds later still renders, with a generic line.
const TAG_INFO: Record<string, [string, string]> = {
  ops: ["Operations", "Health checks, client config and client error reports."],
  auth: ["Auth", "Sign-up, sign-in, sessions, two-factor, passkeys and recovery."],
  profile: [
    "Profile",
    "The signed-in user, their profile, onboarding, terms and handles.",
  ],
  game: [
    "Game",
    "Progress, XP, achievements, records, recaps, wagers and leaderboards.",
  ],
  account: [
    "Account",
    "Export, import, calendar feeds, security events and account deletion.",
  ],
  habits: [
    "Habits",
    "Habits, check-ins and their history. Never shown to anyone else.",
  ],
  insights: ["Insights", "Insights and the journal, from the user's own data."],
  training: ["Training", "Workouts, exercises, routines, gyms, records and plans."],
  nutrition: [
    "Nutrition",
    "Foods, entries, recipes, barcode lookups, targets and the daily coach.",
  ],
  social: [
    "Social",
    "Follows, buddies, the feed, kudos, comments, blocks and people search.",
  ],
  groups: ["Groups", "Groups, challenges and coaching."],
  notifications: ["Notifications", "In-app notifications, web push and reminders."],
  search: ["Search", "Search across the user's own records, and a single day's view."],
  trash: ["Trash", "Deleted items, kept for restore before they are purged."],
  admin: ["Admin", "Moderation and administration; other users get 404."],
};

export const tags: Tag[] = (() => {
  const order = spec.tags.map((t) => t.name);
  for (const o of operations) if (!order.includes(o.tag)) order.push(o.tag);
  return order
    .map((name) => {
      const [label, blurb] = TAG_INFO[name] ?? [
        name.charAt(0).toUpperCase() + name.slice(1),
        `The ${name} endpoints.`,
      ];
      return {
        name,
        slug: name.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
        label,
        blurb: spec.tags.find((t) => t.name === name)?.description ?? blurb,
        ops: operations.filter((o) => o.tag === name),
      };
    })
    .filter((t) => t.ops.length);
})();

export const opUrl = (o: Operation) =>
  `/api/${tags.find((t) => t.name === o.tag)!.slug}#${o.anchor}`;

/* ---------- Inline Markdown in descriptions ---------- */

/** Escape, then `code` and **bold**: all the descriptions in the spec use. */
export function inlineMd(t: string): string {
  return t
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
}
