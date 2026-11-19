import { type Actor, fail, type Reason, type Result } from "@espacios/domain";
import type { z } from "zod";

import { type ActionResult, toActionResult } from "../result/action-result";

/**
 * What an operator form hands back (spec 0005): the result with its catalog message, the values as posted so a refusal
 * loses nothing, and the fields to mark. `null` is the state before the first submit.
 */
export type OperatorFormState = {
  readonly result: ActionResult<unknown>;
  readonly values: Readonly<Record<string, string>>;
  readonly invalidFields: readonly string[];
} | null;

export type OperatorActionConfig<S extends z.ZodType, K extends string> = {
  /** Reads the posted strings into the use case's input. Shape only; the rules are the use case's. */
  readonly schema: S;
  readonly run: (actor: Actor, input: z.output<S>) => Promise<Result<unknown>>;
  /** The catalog key of the toast after a success. */
  readonly success: K;
  /** Fields a refusal marks (spec 0005, "Field marks per reason"). */
  readonly marks?: (reason: Reason) => readonly string[];
  /** Pages that show the change (and the ones under them); they are read again after a success. */
  readonly revalidate: readonly string[];
};

/** What the action needs from the framework, injected so the flow is tested without Next.js. */
export type OperatorActionDeps<K extends string> = {
  readonly actor: () => Promise<Actor | null>;
  readonly successText: (key: K) => string | Promise<string>;
  readonly errorText: (reason: Reason) => string;
  readonly revalidate: (path: string) => void;
};

function valuesOf(formData: FormData): Record<string, string> {
  const values: Record<string, string> = {};
  for (const [key, value] of formData.entries()) if (typeof value === "string") values[key] = value;
  return values;
}

/**
 * One operator Server Action, in order: the actor from the session (none is `unauthenticated`; a member is refused
 * `forbidden` by the use case, never trusting that the page checked), the form parsed with Zod (its failing fields are
 * marked), the use case, then the pages to read again. Every refusal keeps the values and carries `details` when the
 * use case gave them.
 */
export async function runOperatorFlow<S extends z.ZodType, K extends string>(
  formData: FormData,
  config: OperatorActionConfig<S, K>,
  deps: OperatorActionDeps<K>,
): Promise<OperatorFormState> {
  const values = valuesOf(formData);
  const refuse = (result: Result<never>, invalidFields: readonly string[]): OperatorFormState => ({
    result: toActionResult(result, "", deps.errorText),
    values,
    invalidFields,
  });

  const actor = await deps.actor();
  if (!actor) return refuse(fail("unauthenticated"), []);

  const parsed = config.schema.safeParse(values);
  if (!parsed.success) {
    const fields = parsed.error.issues.map((issue) => String(issue.path[0] ?? "")).filter(Boolean);
    return refuse(fail("invalid_input"), [...new Set(fields)]);
  }

  const result = await config.run(actor, parsed.data);
  if (!result.ok) return refuse(result, config.marks?.(result.reason) ?? []);

  for (const path of config.revalidate) deps.revalidate(path);
  return {
    result: toActionResult(result, await deps.successText(config.success), deps.errorText),
    values: {},
    invalidFields: [],
  };
}
