/**
 * Shared OOMPF domain code.
 *
 * `VERSION` is the OOMPF workspace version used to prove that Bun workspace
 * resolution links `@oompf/core` into consuming packages and tests.
 */
export const VERSION = "0.0.0";

export type {
  AdvisorFacts,
  FallbackChain,
  ModelRole,
  Prerequisite,
  ProfileFacts,
} from "./facts.ts";
export { extractFacts } from "./facts.ts";
export { sha256 } from "./hash.ts";
export type {
  MetadataExtraction,
  ProfileKind,
  ProfileLink,
  ProfileMetadata,
} from "./metadata.ts";
export {
  CONTROLLED_PROFILE_KINDS,
  EMPTY_METADATA,
  extractMetadata,
} from "./metadata.ts";
export type {
  DiscoveredProfile,
  OmpProfileOptions,
  ResolvedProfileConfig,
} from "./omp-profile.ts";
export {
  discoverProfiles,
  resolveInstallTarget,
  resolveProfileConfig,
} from "./omp-profile.ts";
export type {
  InvalidProfileName,
  ProfileNameResult,
  ValidProfileName,
} from "./profile-name.ts";
export {
  MAX_PROFILE_NAME_LENGTH,
  validateProfileName,
} from "./profile-name.ts";
export type { ModelDisplay, ProviderLink } from "./provider-links.ts";
export {
  listProviderLinks,
  listProviderModels,
  resolveModelDisplay,
  resolveProviderLink,
} from "./provider-links.ts";
export type { ArtifactValidation, SecretFinding } from "./validation.ts";
export {
  DEFAULT_MAX_BYTES,
  scanForSecrets,
  validateArtifact,
} from "./validation.ts";
export { assertProfileDocument, parseProfileYaml } from "./yaml-config.ts";
