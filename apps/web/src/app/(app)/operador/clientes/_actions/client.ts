"use server";

import { addMember, createClient, deactivateClient, reactivateClient, updateClient } from "@espacios/application";
import type { Reason } from "@espacios/domain";

import { operatorEdge } from "@/composition";
import { type OperatorFormState, runOperatorAction } from "@/lib/operator/form-action";
import { clientCreateForm, clientEditForm, idForm, memberForm } from "@/lib/operator/form-input";

const PAGES = ["/operador/clientes"];

/** The code is the only unique field; a company without its first member is refused as `invalid_input`. */
const CREATE_MARKS: Partial<Record<Reason, readonly string[]>> = {
  already_exists: ["slug"],
  invalid_input: ["memberName"],
};
const createMarks = (reason: Reason) => CREATE_MARKS[reason] ?? [];

export async function createClientAction(_previous: OperatorFormState, formData: FormData) {
  return runOperatorAction(formData, {
    schema: clientCreateForm,
    success: "clientCreated",
    revalidate: PAGES,
    marks: createMarks,
    run: (actor, { memberName, ...input }) =>
      createClient(operatorEdge(), actor, memberName === undefined ? input : { ...input, memberName }),
  });
}

export async function updateClientAction(_previous: OperatorFormState, formData: FormData) {
  return runOperatorAction(formData, {
    schema: clientEditForm,
    success: "clientUpdated",
    revalidate: PAGES,
    run: (actor, { id, ...patch }) => updateClient(operatorEdge(), actor, id, patch),
  });
}

export async function deactivateClientAction(_previous: OperatorFormState, formData: FormData) {
  return runOperatorAction(formData, {
    schema: idForm,
    success: "clientDeactivated",
    revalidate: PAGES,
    run: (actor, { id }) => deactivateClient(operatorEdge(), actor, id),
  });
}

export async function reactivateClientAction(_previous: OperatorFormState, formData: FormData) {
  return runOperatorAction(formData, {
    schema: idForm,
    success: "clientReactivated",
    revalidate: PAGES,
    run: (actor, { id }) => reactivateClient(operatorEdge(), actor, id),
  });
}

export async function addMemberAction(_previous: OperatorFormState, formData: FormData) {
  return runOperatorAction(formData, {
    schema: memberForm,
    success: "memberAdded",
    revalidate: PAGES,
    run: (actor, { clientId, name }) => addMember(operatorEdge(), actor, clientId, name),
  });
}
