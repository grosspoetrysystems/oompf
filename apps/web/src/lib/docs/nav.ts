/**
 * Shared docs navigation model.
 *
 * One source of truth for the ordering, grouping, and link metadata used by the
 * docs sidebar, the `/docs` index, and the `llms.txt` indexes. Everything is
 * derived from the `docs` content collection so HTML and Markdown never diverge.
 */

import { getCollection } from "astro:content";

/** A single documentation page as a navigable entry. */
export interface DocLink {
  /** Collection entry id / slug (also the `/docs/<id>` path segment). */
  id: string;
  /** Clean Markdown variant, `/docs/<id>.md`. */
  markdownPath: string;
  /** Ordinal within the section. */
  order: number;
  /** Page path, `/docs/<id>`. */
  path: string;
  /** Section this page groups under. */
  section: string;
  summary: string;
  title: string;
}

/** A section with its ordered pages. */
export interface DocSection {
  links: DocLink[];
  title: string;
}

/** Canonical section order for navigation and the indexes. */
const SECTION_ORDER = ["Introduction", "Profiles", "Workflow", "Reference"];

/** Load every docs entry as flat {@link DocLink}s, sorted by section then order. */
export async function loadDocLinks(): Promise<DocLink[]> {
  const entries = await getCollection("docs");
  return entries
    .map((entry) => ({
      id: entry.id,
      markdownPath: `/docs/${entry.id}.md`,
      order: entry.data.order,
      path: `/docs/${entry.id}`,
      section: entry.data.section,
      summary: entry.data.summary,
      title: entry.data.title,
    }))
    .sort((a, b) => {
      const sectionDelta =
        sectionRank(a.section) - sectionRank(b.section) ||
        a.section.localeCompare(b.section);
      return sectionDelta === 0 ? a.order - b.order : sectionDelta;
    });
}

/** Group ordered {@link DocLink}s into sections for sidebar/index rendering. */
export async function loadDocSections(): Promise<DocSection[]> {
  const links = await loadDocLinks();
  const sections: DocSection[] = [];
  for (const link of links) {
    let section = sections.find(
      (candidate) => candidate.title === link.section
    );
    if (section === undefined) {
      section = { links: [], title: link.section };
      sections.push(section);
    }
    section.links.push(link);
  }
  return sections;
}

/** Rank a section for ordering; unknown sections sort after known ones. */
function sectionRank(section: string): number {
  const index = SECTION_ORDER.indexOf(section);
  return index === -1 ? SECTION_ORDER.length : index;
}
