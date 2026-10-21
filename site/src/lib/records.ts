// Derive a date and a status from a DECISIONS.md record.
//
// The records are written by hand over months and do not share one format:
//   **Date:** 2026-08-28 · **Status:** decided, implemented
//   **Decided 11 October 2026. Status: superseded 19 October 2026** by …
//   **Decided (September 2026).**
//   > **Superseded on 11 October 2026** by …
//   **Asked 25 September 2026, answered "skip".**
// and some have neither. Whatever cannot be read reliably is left out rather
// than guessed: the card then shows "Recorded" and no date.

export type RecordKind =
  "implemented" | "decided" | "superseded" | "revisit" | "irreversible" | "recorded";

export interface DecisionRecord {
  id: string;
  title: string;
  date: string | null;
  iso: string | null;
  status: string | null;
  statusLabel: string;
  kind: RecordKind;
}

const MONTHS = [
  "january",
  "february",
  "march",
  "april",
  "may",
  "june",
  "july",
  "august",
  "september",
  "october",
  "november",
  "december",
];
const SHORT = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

/** "2026-08-28", "17 October 2026" or "September 2026" -> ISO + display. */
export function parseDate(raw: string): { iso: string; display: string } | null {
  let m = raw.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (m)
    return { iso: m[0], display: `${Number(m[3])} ${SHORT[Number(m[2]) - 1]} ${m[1]}` };
  m = raw.match(/(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})/);
  if (m && MONTHS.includes(m[2].toLowerCase())) {
    const mo = MONTHS.indexOf(m[2].toLowerCase());
    return {
      iso: `${m[3]}-${String(mo + 1).padStart(2, "0")}-${m[1].padStart(2, "0")}`,
      display: `${Number(m[1])} ${SHORT[mo]} ${m[3]}`,
    };
  }
  m = raw.match(/([A-Za-z]+)\s+(\d{4})/);
  if (m && MONTHS.includes(m[1].toLowerCase())) {
    const mo = MONTHS.indexOf(m[1].toLowerCase());
    return {
      iso: `${m[2]}-${String(mo + 1).padStart(2, "0")}`,
      display: `${SHORT[mo]} ${m[2]}`,
    };
  }
  return null;
}

export function parseRecord(id: string, title: string, body: string): DecisionRecord {
  const head = body.slice(0, 600);
  let dateRaw: string | null = null;
  let status: string | null = null;

  const dateField = head.match(/Date:\s*([^·\n]+)/);
  const decided = head.match(
    /Decided\s+(\(?[A-Za-z]*\s*\d{1,2}?\s*[A-Za-z]*\s*\d{4}\)?)/,
  );
  const asked = head.match(/Asked\s+(\d{1,2}\s+[A-Za-z]+\s+\d{4})/);
  if (dateField) dateRaw = dateField[1];
  else if (decided) dateRaw = decided[1];
  else if (asked) dateRaw = asked[1];

  const statusField = head.match(/Status:\s*([^\n]+?)(?:\.\s|\.$|\*\*|\n|$)/);
  if (statusField) status = statusField[1].replace(/\s+by$/, "").trim();
  else if (/^\s*Superseded on/i.test(head)) status = "superseded";
  else if (asked) status = "answered";

  const parsed = dateRaw ? parseDate(dateRaw) : null;
  const s = (status ?? "").toLowerCase();
  const kind: RecordKind = /superseded/.test(s)
    ? "superseded"
    : /irreversible/.test(s)
      ? "irreversible"
      : /revisit/.test(s)
        ? "revisit"
        : /implemented|enforced|live/.test(s)
          ? "implemented"
          : /decided|answered/.test(s) || decided
            ? "decided"
            : "recorded";

  const statusLabel =
    {
      superseded: "Superseded",
      irreversible: "Irreversible",
      revisit: "Revisit on trigger",
      implemented: "Implemented",
      decided: /answered/.test(s) ? "Answered" : "Decided",
      recorded: "Recorded",
    }[kind] ?? "Recorded";

  return {
    id,
    title,
    date: parsed?.display ?? null,
    iso: parsed?.iso ?? null,
    status,
    statusLabel,
    kind,
  };
}
