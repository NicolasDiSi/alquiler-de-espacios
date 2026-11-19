"use server";

import { createRoom, deactivateRoom, getFacility, updateRoom } from "@espacios/application";
import { fail, type Reason } from "@espacios/domain";

import { operatorEdge } from "@/composition";
import { type OperatorFormState, runOperatorAction } from "@/lib/operator/form-action";
import { idForm, roomCreateForm, roomEditForm } from "@/lib/operator/form-input";
import { startOfZonedDay } from "@/lib/operator/zoned-input";

const PAGES = ["/operador/sedes"];

function marks(reason: Reason): readonly string[] {
  return reason === "already_exists" ? ["name"] : [];
}

export async function createRoomAction(_previous: OperatorFormState, formData: FormData) {
  return runOperatorAction(formData, {
    schema: roomCreateForm,
    success: "roomCreated",
    revalidate: PAGES,
    marks,
    run: async (actor, { activeFrom, ...input }) => {
      const edge = operatorEdge();
      // The typed day starts at midnight in the sede's zone, which only the server knows (spec 0005, Value sourcing).
      if (!activeFrom) return createRoom(edge, actor, input);
      const facility = await getFacility(edge, actor, input.facilityId);
      if (!facility.ok) return facility;
      const start = startOfZonedDay(activeFrom, facility.value.timeZone);
      if (!start) return fail("invalid_input");
      return createRoom(edge, actor, { ...input, activeFrom: start });
    },
  });
}

export async function updateRoomAction(_previous: OperatorFormState, formData: FormData) {
  return runOperatorAction(formData, {
    schema: roomEditForm,
    success: "roomUpdated",
    revalidate: PAGES,
    marks,
    run: (actor, { id, ...patch }) => updateRoom(operatorEdge(), actor, id, patch),
  });
}

export async function deactivateRoomAction(_previous: OperatorFormState, formData: FormData) {
  return runOperatorAction(formData, {
    schema: idForm,
    success: "roomDeactivated",
    revalidate: PAGES,
    run: (actor, { id }) => deactivateRoom(operatorEdge(), actor, id),
  });
}
