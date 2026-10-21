import { defineCollection } from "astro:content";
import { glob } from "astro/loaders";

// The Markdown at the repository root is the single source. The site reads it
// in place (base "..") and never keeps a copy, so the two cannot drift.
const docs = defineCollection({
  loader: glob({ pattern: "*.md", base: ".." }),
});

export const collections = { docs };
