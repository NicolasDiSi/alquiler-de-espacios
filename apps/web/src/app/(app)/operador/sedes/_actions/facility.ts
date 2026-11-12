"use server";

import { createFacility, deactivateFacility, updateFacility } from "@espacios/application";
import type { Reason } from "@espacios/domain";

import { operatorEdge } from "@/composition";
import { type OperatorFormState, runOperatorAction } from "@/lib/operator/form-action";
import { facilityEditForm, facilityForm, idForm } from "@/lib/operator/form-input";

const PAGES = ["/operador/sedes"];

/** A refusal marks these fields (spec 0005, "Field marks per reason"). */
function marks(reason: Reason): readonly string[] {
  if (reason === "already_exists") return ["name"];
  if (reason === "has_future_bookings") return ["timeZone", "opensAt", "closesAt", "openWeekdays"];
  return [];
}

export async function createFacilityAction(_previous: OperatorFormState, formData: FormData) {
  return runOperatorAction(formData, {
    schema: facilityForm,
    success: "facilityCreated",
    revalidate: PAGES,
    marks,
    run: (actor, input) => createFacility(operatorEdge(), actor, input),
  });
}

export async function updateFacilityAction(_previous: OperatorFormState, formData: FormData) {
  return runOperatorAction(formData, {
    schema: facilityEditForm,
    success: "facilityUpdated",
    revalidate: PAGES,
    marks,
    run: (actor, { id, ...patch }) => updateFacility(operatorEdge(), actor, id, patch),
  });
}

export async function deactivateFacilityAction(_previous: OperatorFormState, formData: FormData) {
  return runOperatorAction(formData, {
    schema: idForm,
    success: "facilityDeactivated",
    revalidate: PAGES,
    run: (actor, { id }) => deactivateFacility(operatorEdge(), actor, id),
  });
}
