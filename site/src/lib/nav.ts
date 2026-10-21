import { loadDocs } from "./docs";
import { repos } from "../data/repos";
import { tags } from "./openapi";

export interface NavItem {
  href: string;
  label: string;
}
export interface NavGroup {
  title: string;
  items: NavItem[];
}

/** The sidebar, and the reading order prev/next follows. */
export async function navGroups(): Promise<NavGroup[]> {
  const docs = await loadDocs();
  const of = (group: string) =>
    docs
      .filter((d) => d.group === group)
      .map((d) => ({ href: d.route, label: d.label }));
  const groups: NavGroup[] = [
    { title: "Infrastructure", items: of("Infrastructure") },
    {
      title: "PaceStreak",
      items: [
        { href: "/stack", label: "Product and stack" },
        { href: "/repos", label: "Repositories" },
        ...repos.map((r) => ({ href: `/repos/${r.slug}`, label: r.name })),
      ],
    },
    {
      title: "API reference",
      items: [
        { href: "/api", label: "Overview" },
        ...tags.map((t) => ({ href: `/api/${t.slug}`, label: t.label })),
      ],
    },
    { title: "Project", items: of("Project") },
    { title: "More", items: of("More") },
  ];
  return groups.filter((g) => g.items.length);
}

export async function prevNext(
  route: string,
): Promise<{ prev: NavItem | null; next: NavItem | null }> {
  const flat = (await navGroups()).flatMap((g) => g.items);
  const i = flat.findIndex((x) => x.href === route);
  if (i === -1) return { prev: null, next: null };
  return { prev: flat[i - 1] ?? null, next: flat[i + 1] ?? null };
}

export const SITES: NavItem[] = [
  { href: "https://www.pacestreak.com", label: "Website" },
  { href: "https://app.pacestreak.com", label: "App" },
  { href: "https://blog.pacestreak.com", label: "Blog" },
  { href: "https://status.pacestreak.com", label: "Status" },
  { href: "https://docs.pacestreak.com", label: "Docs" },
  { href: "https://github.com/PaceStreak", label: "GitHub" },
];
