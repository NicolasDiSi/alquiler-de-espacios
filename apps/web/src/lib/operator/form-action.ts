import { revalidatePath } from "next/cache";

import type { Messages } from "next-intl";
import { getTranslations } from "next-intl/server";
import type { z } from "zod";

import { getSession } from "@/lib/session/session";

import { type OperatorActionConfig, type OperatorFormState, runOperatorFlow } from "./operator-action";

export type { OperatorFormState } from "./operator-action";

type SuccessKey = keyof Messages["operator"]["success"];

/**
 * The operator Server Actions' adapter (spec 0005): the flow of `runOperatorFlow` wired to Next.js, the signed cookie
 * for the actor, the es-AR catalog for the texts, and `revalidatePath` for the pages under each path.
 */
export async function runOperatorAction<S extends z.ZodType>(
  formData: FormData,
  config: OperatorActionConfig<S, SuccessKey>,
): Promise<OperatorFormState> {
  const [success, errors] = await Promise.all([getTranslations("operator.success"), getTranslations("errors")]);
  return runOperatorFlow(formData, config, {
    actor: async () => (await getSession())?.actor ?? null,
    successText: (key) => success(key),
    errorText: (reason) => errors(reason),
    revalidate: (path) => revalidatePath(path, "layout"),
  });
}
