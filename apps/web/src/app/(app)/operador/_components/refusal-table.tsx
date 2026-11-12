"use client";

import type { RefusalDetails } from "@espacios/domain";
import { useTranslations } from "next-intl";

import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useZonedDates } from "@/hooks/use-zoned-dates";

/** The bookings in the way of a change, exactly as the use case returned them (spec 0005, AC-4). */
export function RefusalTable({ details, timeZone }: { readonly details: RefusalDetails; readonly timeZone: string }) {
  const t = useTranslations("operator.refusal");
  const dates = useZonedDates(timeZone);

  return (
    <div className="mt-1 w-full space-y-1">
      <p className="text-xs">{t("shown", { shown: details.bookings.length, total: details.total })}</p>
      <div className="bg-background text-foreground max-h-56 overflow-auto rounded-md border">
        <Table className="text-xs">
          <TableCaption className="sr-only">{t("caption")}</TableCaption>
          <TableHeader>
            <TableRow>
              <TableHead scope="col">{t("room")}</TableHead>
              <TableHead scope="col">{t("company")}</TableHead>
              <TableHead scope="col">{t("start")}</TableHead>
              <TableHead scope="col">{t("end")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {details.bookings.map((booking) => (
              <TableRow key={booking.id}>
                <TableCell>{booking.roomName}</TableCell>
                <TableCell>{booking.companyName}</TableCell>
                <TableCell>{dates.moment(booking.startsAt)}</TableCell>
                <TableCell>{dates.moment(booking.endsAt)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
