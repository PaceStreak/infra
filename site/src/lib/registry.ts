// Which root Markdown file becomes which page, and in what order.
//
// A root .md file missing from this list still gets a page (under "More",
// at a slug derived from its name), so adding a document never breaks the
// build; listing it here only chooses its label and place in the sidebar.

export const REPO = "https://github.com/PaceStreak/infra";
export const BRANCH = "main";
export const ORG = "https://github.com/PaceStreak";

export interface DocDef {
  file: string;
  route: string;
  label: string;
  group: string;
}

const KNOWN: DocDef[] = [
  { file: "README.md", route: "/", label: "Overview", group: "Infrastructure" },
  {
    file: "TOPOLOGY.md",
    route: "/topology",
    label: "Topology",
    group: "Infrastructure",
  },
  { file: "RUNBOOK.md", route: "/runbook", label: "Runbook", group: "Infrastructure" },
  {
    file: "OPERATING-GUIDE.md",
    route: "/operating-guide",
    label: "Operating guide",
    group: "Infrastructure",
  },
  {
    file: "DECISIONS.md",
    route: "/decisions",
    label: "Decisions",
    group: "Infrastructure",
  },
  {
    file: "CHANGELOG.md",
    route: "/changelog",
    label: "Changelog",
    group: "Infrastructure",
  },
  {
    file: "CONTRIBUTING.md",
    route: "/contributing",
    label: "Contributing",
    group: "Project",
  },
  {
    file: "SECURITY.md",
    route: "/security",
    label: "Security policy",
    group: "Project",
  },
  {
    file: "CODE_OF_CONDUCT.md",
    route: "/code-of-conduct",
    label: "Code of conduct",
    group: "Project",
  },
  {
    file: "AGENTS.md",
    route: "/agents",
    label: "Agent instructions",
    group: "Project",
  },
];

export const GROUPS = ["Infrastructure", "Project", "More"];

export function slugFromFile(file: string): string {
  return file
    .replace(/\.md$/i, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/** Every root document, known ones first in their declared order. */
export function defineDocs(files: string[]): DocDef[] {
  const present = new Set(files);
  const known = KNOWN.filter((d) => present.has(d.file));
  const extra = files
    .filter((f) => !KNOWN.some((d) => d.file === f))
    .sort()
    .map((file) => ({
      file,
      route: `/${slugFromFile(file)}`,
      label: file.replace(/\.md$/i, ""),
      group: "More",
    }));
  return [...known, ...extra];
}

export const blobUrl = (path: string) => `${REPO}/blob/${BRANCH}/${path}`;
export const editUrl = (path: string) => `${REPO}/edit/${BRANCH}/${path}`;
export const historyUrl = (path: string) => `${REPO}/commits/${BRANCH}/${path}`;
