/**
 * Shared OOMPF domain code.
 *
 * `VERSION` is the OOMPF workspace version used to prove that Bun workspace
 * resolution links `@oompf/core` into consuming packages and tests.
 */
export const VERSION = "0.0.0";

export {
  discoverProfiles,
  resolveInstallTarget,
  resolveProfileConfig,
} from "./omp-profile.ts";
export type {
  DiscoveredProfile,
  OmpProfileOptions,
  ResolvedProfileConfig,
} from "./omp-profile.ts";

export { validateProfileName, MAX_PROFILE_NAME_LENGTH } from "./profile-name.ts";
export type {
  InvalidProfileName,
  ProfileNameResult,
  ValidProfileName,
} from "./profile-name.ts";

export { assertProfileDocument, parseProfileYaml } from "./yaml-config.ts";
