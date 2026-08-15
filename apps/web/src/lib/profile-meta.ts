/**
 * Social (Open Graph / Twitter) meta for a profile page, derived from the
 * render-ready {@link ProfileView}. Kept separate so the `/p/<id>` page stays a
 * thin consumer and the facts line is unit-testable.
 */
import type { ProfileView } from "./profile-view.ts";

/** The profile-title suffix shared by the page `<title>` and og:title. */
const TITLE_SUFFIX = "— OOMPF";

/** Per-profile Open Graph / Twitter meta values. */
export interface ProfileMeta {
  /** og:description / twitter:description — a one-line, value-free facts line. */
  readonly description: string;
  /** og:title / twitter:title / `<title>` — profile name (+ owner). */
  readonly title: string;
  /** og:url — the canonical `/p/<id>` URL. */
  readonly url: string;
}

function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}

/**
 * Build the per-profile social meta from the already-computed profile view,
 * reusing its facts (model roles, providers, indexed label) rather than
 * reading the raw record a second time. The description is one line and
 * value-free: it states facts, never a judgement or a hard sell.
 */
export function buildProfileMeta(view: ProfileView): ProfileMeta {
  const facts: string[] = [];
  if (view.behavior.modelRoles.length > 0) {
    facts.push(
      view.behavior.modelRoles
        .map((role) => `${role.role}: ${role.model.friendlyName}`)
        .join(" · ")
    );
  } else if (view.models.length > 0) {
    facts.push(plural(view.models.length, "model"));
  }
  facts.push(plural(view.providers.length, "provider"));
  if (view.provenance.indexedLabel !== null) {
    facts.push(`updated ${view.provenance.indexedLabel}`);
  }

  const title =
    view.owner !== null
      ? `${view.profileName} by ${view.owner} ${TITLE_SUFFIX}`
      : `${view.profileName} ${TITLE_SUFFIX}`;

  return {
    description: facts.join(" · "),
    title,
    url: view.profileUrl,
  };
}
