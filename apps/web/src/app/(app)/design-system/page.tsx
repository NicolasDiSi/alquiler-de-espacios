import { CalendarPlus, CircleAlert, CircleCheck, Info, Loader2, Plus, TriangleAlert } from "lucide-react";
import type { Metadata } from "next";
import { useFormatter, useTranslations } from "next-intl";
import { getTranslations } from "next-intl/server";

import { EmptyState } from "@/components/empty-state";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";

import { GalleryRow, GallerySection } from "./_components/gallery-section";
import { DialogDemo, DropdownDemo, ToastDemo, TooltipDemo } from "./_components/overlay-demos";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("designSystem");
  // Reachable by URL only: not in the sidebar and not indexed.
  return { title: t("title"), robots: { index: false, follow: false } };
}

/**
 * shadcn/ui renders inactive tabs in foreground at 60%, which is under 4.5:1 on muted in light mode. Muted foreground
 * is the matrix pair that passes, so it is applied where tabs are used.
 */
const TAB_TRIGGER = "text-muted-foreground";

/** Tab panels take focus (Radix sets tabIndex 0), and shadcn/ui removes their outline, so they get the app ring back. */
const TAB_PANEL =
  "focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

const BUTTON_VARIANTS = ["default", "secondary", "outline", "ghost", "destructive", "link"] as const;
const BADGE_VARIANTS = ["default", "secondary", "outline", "destructive"] as const;
const PRIORITIES = ["low", "medium", "high", "urgent"] as const;
const CHANNELS = ["meeting", "training", "event"] as const;

/** Status colors are used the way shadcn/ui uses destructive: the token as text on its own tint. */
const STATUS_BADGE = {
  new: "border-transparent bg-info/10 text-info dark:bg-info/20",
  inProgress: "border-transparent bg-warning/10 text-warning dark:bg-warning/20",
  resolved: "border-transparent bg-success/10 text-success dark:bg-success/20",
} as const;

const STATUS_ALERTS = [
  { key: "success", icon: CircleCheck, className: "text-success", descriptionClassName: "text-success/90" },
  { key: "warning", icon: TriangleAlert, className: "text-warning", descriptionClassName: "text-warning/90" },
  { key: "info", icon: Info, className: "text-info", descriptionClassName: "text-info/90" },
] as const;

/** Sample bookings with fixed dates, so server and client render the same text. */
const SAMPLE_BOOKINGS = [
  { key: "RES-104", subject: "checkout", status: "new", receivedAt: "2026-11-03T13:05:00Z", minutes: 0 },
  { key: "RES-103", subject: "login", status: "inProgress", receivedAt: "2026-11-02T18:40:00Z", minutes: 1250 },
  { key: "RES-101", subject: "invoice", status: "resolved", receivedAt: "2026-10-30T11:15:00Z", minutes: 42.5 },
] as const;

const COLOR_SWATCHES = [
  { name: "primary", className: "bg-primary" },
  { name: "secondary", className: "bg-secondary" },
  { name: "muted", className: "bg-muted" },
  { name: "destructive", className: "bg-destructive" },
  { name: "success", className: "bg-success" },
  { name: "warning", className: "bg-warning" },
  { name: "info", className: "bg-info" },
  { name: "chart-1", className: "bg-chart-1" },
  { name: "chart-2", className: "bg-chart-2" },
  { name: "chart-3", className: "bg-chart-3" },
  { name: "chart-4", className: "bg-chart-4" },
  { name: "chart-5", className: "bg-chart-5" },
] as const;

export default function DesignSystemPage() {
  const t = useTranslations("designSystem");
  const format = useFormatter();

  return (
    <div className="flex flex-col gap-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="text-muted-foreground max-w-prose">{t("description")}</p>
      </div>

      <GallerySection id="buttons" title={t("buttons.title")} description={t("buttons.description")}>
        <GalleryRow label={t("buttons.variants")}>
          {BUTTON_VARIANTS.map((variant) => (
            <Button key={variant} variant={variant}>
              {t(`buttons.variant.${variant}`)}
            </Button>
          ))}
        </GalleryRow>
        <GalleryRow label={t("buttons.sizes")}>
          <Button size="sm">{t("buttons.size.sm")}</Button>
          <Button>{t("buttons.size.default")}</Button>
          <Button size="lg">{t("buttons.size.lg")}</Button>
          <Button size="icon" aria-label={t("buttons.iconLabel")}>
            <Plus aria-hidden />
          </Button>
        </GalleryRow>
        <GalleryRow label={t("buttons.states")}>
          <Button disabled>{t("buttons.disabled")}</Button>
          <Button variant="outline" disabled>
            {t("buttons.disabled")}
          </Button>
          <Button disabled aria-busy="true">
            <Loader2 aria-hidden className="animate-spin" data-icon="inline-start" />
            {t("buttons.loading")}
          </Button>
        </GalleryRow>
      </GallerySection>

      <GallerySection id="forms" title={t("forms.title")} description={t("forms.description")}>
        <div className="grid gap-6 md:grid-cols-2">
          <div className="flex flex-col gap-2">
            <Label htmlFor="ds-subject">{t("forms.subject")}</Label>
            <Input id="ds-subject" placeholder={t("forms.subjectPlaceholder")} />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="ds-email">{t("forms.email")}</Label>
            <Input
              id="ds-email"
              type="email"
              defaultValue="cliente@"
              aria-invalid="true"
              aria-describedby="ds-email-error"
            />
            <p id="ds-email-error" className="text-destructive">
              {t("forms.emailError")}
            </p>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="ds-disabled">{t("forms.reference")}</Label>
            <Input id="ds-disabled" disabled defaultValue="RES-104" />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="ds-priority">{t("forms.priority")}</Label>
            <Select defaultValue="medium">
              <SelectTrigger id="ds-priority" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PRIORITIES.map((priority) => (
                  <SelectItem key={priority} value={priority}>
                    {t(`forms.priorities.${priority}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-2 md:col-span-2">
            <Label htmlFor="ds-description">{t("forms.descriptionLabel")}</Label>
            <Textarea id="ds-description" placeholder={t("forms.descriptionPlaceholder")} />
          </div>
          <fieldset className="flex flex-col gap-3">
            <legend className="mb-2 font-medium">{t("forms.channel")}</legend>
            <RadioGroup defaultValue="training">
              {CHANNELS.map((channel) => (
                <div key={channel} className="flex items-center gap-2">
                  <RadioGroupItem id={`ds-channel-${channel}`} value={channel} />
                  <Label htmlFor={`ds-channel-${channel}`}>{t(`forms.channels.${channel}`)}</Label>
                </div>
              ))}
            </RadioGroup>
          </fieldset>
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <Checkbox id="ds-notify" defaultChecked />
              <Label htmlFor="ds-notify">{t("forms.notify")}</Label>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox id="ds-notify-disabled" disabled />
              <Label htmlFor="ds-notify-disabled">{t("forms.notifyDisabled")}</Label>
            </div>
            <div className="flex items-center gap-2">
              <Switch id="ds-auto-assign" defaultChecked />
              <Label htmlFor="ds-auto-assign">{t("forms.autoAssign")}</Label>
            </div>
            <div className="flex items-center gap-2">
              <Switch id="ds-auto-assign-disabled" disabled />
              <Label htmlFor="ds-auto-assign-disabled">{t("forms.autoAssignDisabled")}</Label>
            </div>
          </div>
        </div>
      </GallerySection>

      <GallerySection id="feedback" title={t("feedback.title")} description={t("feedback.description")}>
        <GalleryRow label={t("feedback.badges")}>
          {BADGE_VARIANTS.map((variant) => (
            <Badge key={variant} variant={variant}>
              {t(`feedback.badge.${variant}`)}
            </Badge>
          ))}
          {Object.entries(STATUS_BADGE).map(([status, className]) => (
            <Badge key={status} variant="outline" className={className}>
              {t(`bookings.status.${status as keyof typeof STATUS_BADGE}`)}
            </Badge>
          ))}
        </GalleryRow>
        <div className="grid gap-3 md:grid-cols-2">
          <Alert>
            <Info aria-hidden />
            <AlertTitle>{t("feedback.alert.default.title")}</AlertTitle>
            <AlertDescription>{t("feedback.alert.default.description")}</AlertDescription>
          </Alert>
          <Alert variant="destructive">
            <CircleAlert aria-hidden />
            <AlertTitle>{t("feedback.alert.destructive.title")}</AlertTitle>
            <AlertDescription>{t("feedback.alert.destructive.description")}</AlertDescription>
          </Alert>
          {STATUS_ALERTS.map(({ key, icon: Icon, className, descriptionClassName }) => (
            <Alert key={key} className={className}>
              <Icon aria-hidden />
              <AlertTitle>{t(`feedback.alert.${key}.title`)}</AlertTitle>
              <AlertDescription className={descriptionClassName}>
                {t(`feedback.alert.${key}.description`)}
              </AlertDescription>
            </Alert>
          ))}
        </div>
      </GallerySection>

      <GallerySection id="overlays" title={t("overlays.title")} description={t("overlays.description")}>
        <GalleryRow label={t("overlays.dialogAndMenu")}>
          <DialogDemo />
          <DropdownDemo />
          <TooltipDemo />
        </GalleryRow>
        <GalleryRow label={t("overlays.toasts")}>
          <ToastDemo />
        </GalleryRow>
      </GallerySection>

      <GallerySection id="data" title={t("bookings.title")} description={t("bookings.description")}>
        <Tabs defaultValue="list">
          <TabsList variant="line">
            <TabsTrigger value="list" className={TAB_TRIGGER}>
              {t("bookings.tabs.list")}
            </TabsTrigger>
            <TabsTrigger value="activity" className={TAB_TRIGGER}>
              {t("bookings.tabs.activity")}
            </TabsTrigger>
            <TabsTrigger value="archived" className={TAB_TRIGGER} disabled>
              {t("bookings.tabs.archived")}
            </TabsTrigger>
          </TabsList>
          <TabsContent value="list" className={TAB_PANEL}>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("bookings.columns.key")}</TableHead>
                  <TableHead>{t("bookings.columns.subject")}</TableHead>
                  <TableHead>{t("bookings.columns.status")}</TableHead>
                  <TableHead>{t("bookings.columns.receivedAt")}</TableHead>
                  <TableHead className="text-right">{t("bookings.columns.minutes")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {SAMPLE_BOOKINGS.map((booking) => (
                  <TableRow key={booking.key}>
                    <TableCell>
                      <code>{booking.key}</code>
                    </TableCell>
                    <TableCell>{t(`bookings.subjects.${booking.subject}`)}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={STATUS_BADGE[booking.status]}>
                        {t(`bookings.status.${booking.status}`)}
                      </Badge>
                    </TableCell>
                    <TableCell>{format.dateTime(new Date(booking.receivedAt), "dateTime")}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {format.number(booking.minutes, "decimal")}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TabsContent>
          <TabsContent value="activity" className={TAB_PANEL}>
            <p className="text-muted-foreground py-4">
              {t("bookings.activity", { date: format.dateTime(new Date("2026-11-03T13:05:00Z"), "long") })}
            </p>
          </TabsContent>
        </Tabs>
      </GallerySection>

      <GallerySection id="states" title={t("states.title")} description={t("states.description")}>
        <div className="grid gap-6 md:grid-cols-2">
          <div role="status" aria-label={t("states.loading")} className="flex flex-col gap-3">
            <Skeleton className="h-5 w-1/3" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-5/6" />
            <Skeleton className="h-8 w-24" />
          </div>
          <EmptyState
            icon={CalendarPlus}
            title={t("states.empty.title")}
            description={t("states.empty.description")}
            action={<Button variant="outline">{t("states.empty.action")}</Button>}
            className="py-8 shadow-none"
          />
        </div>
      </GallerySection>

      <GallerySection id="colors" title={t("colors.title")} description={t("colors.description")}>
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {COLOR_SWATCHES.map((swatch) => (
            <li key={swatch.name} className="flex flex-col gap-1.5">
              <span aria-hidden className={`h-10 rounded-md border ${swatch.className}`} />
              <code className="text-xs">{swatch.name}</code>
            </li>
          ))}
        </ul>
      </GallerySection>
    </div>
  );
}
