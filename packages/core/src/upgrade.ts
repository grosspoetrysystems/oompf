import { parse, stringify } from "yaml";

import { isRecord } from "./guards.ts";
import type { ModelCatalog, ModelRole } from "./model-catalog.ts";

/** Thinking suffixes that belong to the model selector's execution settings. */
const THINKING_LEVELS: Record<string, true> = {
  auto: true,
  high: true,
  inherit: true,
  low: true,
  max: true,
  medium: true,
  minimal: true,
  off: true,
  xhigh: true,
};

function splitThinkingSuffix(model: string): {
  readonly modelSelector: string;
  readonly thinkingLevel: string | null;
} {
  const colon = model.lastIndexOf(":");
  if (colon <= 0) {
    return { modelSelector: model, thinkingLevel: null };
  }
  const suffix = model.slice(colon + 1);
  return Object.hasOwn(THINKING_LEVELS, suffix)
    ? {
        modelSelector: model.slice(0, colon),
        thinkingLevel: suffix,
      }
    : { modelSelector: model, thinkingLevel: null };
}

/** Map common profile role labels to the catalog's broader role-fit classes. */
const ROLE_TO_CATALOG_ROLE: Record<string, ModelRole> = {
  chat: "chat",
  coder: "coding",
  coding: "coding",
  planner: "planning",
  planning: "planning",
  review: "review",
  reviewer: "review",
};

/** One model replacement proposed by the catalog. */
export interface UpgradeChange {
  readonly from: string;
  readonly path: string;
  readonly reason: "successor";
  readonly role: string | null;
  readonly to: string;
}

/** One selector deliberately left unchanged by the planner. */
export interface UpgradeUnchanged {
  readonly model: string;
  readonly path: string;
  readonly reason:
    | "already_current"
    | "no_successor"
    | "slot_mismatch"
    | "unavailable"
    | "unclassified";
  readonly role: string | null;
}

/** Full deterministic result of planning a model-only upgrade. */
export interface UpgradePlan {
  readonly catalogRevision: string;
  readonly changes: readonly UpgradeChange[];
  readonly unchanged: readonly UpgradeUnchanged[];
  readonly yaml: string;
}

interface MutablePlan {
  readonly changes: UpgradeChange[];
  readonly unchanged: UpgradeUnchanged[];
}

function replacementFor(
  model: string,
  path: string,
  role: string | null,
  catalog: ModelCatalog,
  plan: MutablePlan
): string {
  if (model.startsWith("@")) {
    return model;
  }

  const parsed = splitThinkingSuffix(model);
  const current = catalog.models.find(
    (entry) => entry.id === parsed.modelSelector
  );
  if (current === undefined) {
    plan.unchanged.push({
      model,
      path,
      reason: "unclassified",
      role,
    });
    return model;
  }

  if (current.successor === null || current.successor === current.id) {
    plan.unchanged.push({
      model,
      path,
      reason:
        current.successor === current.id ? "already_current" : "no_successor",
      role,
    });
    return model;
  }

  const successor = catalog.models.find(
    (entry) => entry.id === current.successor
  );
  if (successor === undefined) {
    plan.unchanged.push({
      model,
      path,
      reason: "unavailable",
      role,
    });
    return model;
  }

  const catalogRole = role === null ? undefined : ROLE_TO_CATALOG_ROLE[role];
  if (catalogRole !== undefined && !successor.roles.includes(catalogRole)) {
    plan.unchanged.push({
      model,
      path,
      reason: "slot_mismatch",
      role,
    });
    return model;
  }

  const to =
    parsed.thinkingLevel === null
      ? successor.id
      : `${successor.id}:${parsed.thinkingLevel}`;
  plan.changes.push({ from: model, path, reason: "successor", role, to });
  return to;
}

function replaceArray(
  values: unknown[],
  path: string,
  role: string | null,
  catalog: ModelCatalog,
  plan: MutablePlan
): void {
  for (let index = 0; index < values.length; index++) {
    const value = values[index];
    if (typeof value !== "string") {
      continue;
    }
    values[index] = replacementFor(
      value,
      `${path}[${index}]`,
      role,
      catalog,
      plan
    );
  }
}

function replaceModelRoles(
  document: Record<string, unknown>,
  catalog: ModelCatalog,
  plan: MutablePlan
): void {
  const modelRoles = document.modelRoles;
  if (!isRecord(modelRoles)) {
    return;
  }
  for (const [role, assigned] of Object.entries(modelRoles)) {
    const path = `modelRoles.${role}`;
    if (typeof assigned === "string") {
      modelRoles[role] = replacementFor(assigned, path, role, catalog, plan);
    } else if (Array.isArray(assigned)) {
      replaceArray(assigned, path, role, catalog, plan);
    }
  }
}

function replaceEnabledModels(
  document: Record<string, unknown>,
  catalog: ModelCatalog,
  plan: MutablePlan
): void {
  if (Array.isArray(document.enabledModels)) {
    replaceArray(document.enabledModels, "enabledModels", null, catalog, plan);
  }
}

function replaceRetryChains(
  document: Record<string, unknown>,
  catalog: ModelCatalog,
  plan: MutablePlan
): void {
  if (!isRecord(document.retry)) {
    return;
  }
  const chains = document.retry.fallbackChains;
  if (isRecord(chains)) {
    for (const [role, value] of Object.entries(chains)) {
      if (Array.isArray(value)) {
        replaceArray(
          value,
          `retry.fallbackChains.${role}`,
          role,
          catalog,
          plan
        );
      }
    }
    return;
  }
  if (!Array.isArray(chains)) {
    return;
  }
  if (chains.every((value) => typeof value === "string")) {
    replaceArray(chains, "retry.fallbackChains", "default", catalog, plan);
    return;
  }
  for (let index = 0; index < chains.length; index++) {
    const value = chains[index];
    if (Array.isArray(value)) {
      replaceArray(
        value,
        `retry.fallbackChains[${index}]`,
        `chain[${index}]`,
        catalog,
        plan
      );
    }
  }
}

/**
 * Produce a model-only YAML upgrade plan. The input document is never mutated;
 * only recognized model-selector locations are changed in the serialized copy.
 */
export function proposeUpgrade(
  yaml: string,
  catalog: ModelCatalog
): UpgradePlan {
  const parsed = parse(yaml);
  if (!isRecord(parsed)) {
    throw new Error("Profile YAML must have a mapping root.");
  }

  const plan: MutablePlan = { changes: [], unchanged: [] };
  replaceModelRoles(parsed, catalog, plan);
  replaceEnabledModels(parsed, catalog, plan);
  replaceRetryChains(parsed, catalog, plan);

  return {
    catalogRevision: catalog.revision,
    changes: plan.changes,
    unchanged: plan.unchanged,
    yaml: stringify(parsed),
  };
}
