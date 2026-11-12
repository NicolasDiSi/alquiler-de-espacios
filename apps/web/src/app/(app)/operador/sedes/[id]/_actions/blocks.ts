"use server";

import { createBlock, getFacility, releaseBlock } from "@espacios/application";
import { fail } from "@espacios/domain";

import { operatorEdge } from "@/composition";
import { type OperatorFormState, runOperatorAction } from "@/lib/operator/form-action";
import { blockForm, idForm } from "@/lib/operator/form-input";
import { zonedPeriod } from "@/lib/operator/zoned-input";

const PAGES = ["/operador/sedes"];

export async function createBlockAction(_previous: OperatorFormState, formData: FormData) {
  return runOperatorAction(formData, {
    schema: blockForm,
    success: "blockCreated",
    revalidate: PAGES,
    marks: (reason) => (reason === "invalid_range" || reason === "past_date" ? ["endDate", "endTime"] : []),
    run: async (actor, input) => {
      const edge = operatorEdge();
      // The zone the typed days and times are read in is the sede's, read here and never taken from the form.
      const facility = await getFacility(edge, actor, input.facilityId);
      if (!facility.ok) return facility;
      const period = zonedPeriod(input, facility.value.timeZone);
      if (!period) return fail("invalid_input");
      return createBlock(edge, actor, {
        facilityId: input.facilityId,
        roomId: input.roomId,
        ...period,
        reason: input.reason,
      });
    },
  });
}

export async function releaseBlockAction(_previous: OperatorFormState, formData: FormData) {
  return runOperatorAction(formData, {
    schema: idForm,
    success: "blockReleased",
    revalidate: PAGES,
    run: (actor, { id }) => releaseBlock(operatorEdge(), actor, id),
  });
}
