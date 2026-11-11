"use client";

import { CircleHelp, EllipsisVertical, XIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

export function DialogDemo() {
  const t = useTranslations("designSystem.overlays.dialog");
  const tCommon = useTranslations("common");

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline">{t("open")}</Button>
      </DialogTrigger>
      {/* The built in close button is announced in English, so a translated one replaces it. */}
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-2">
          <Label htmlFor="dialog-assignee">{t("assignee")}</Label>
          <Input id="dialog-assignee" placeholder={t("assigneePlaceholder")} />
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">{tCommon("cancel")}</Button>
          </DialogClose>
          <DialogClose asChild>
            <Button>{t("confirm")}</Button>
          </DialogClose>
        </DialogFooter>
        <DialogClose asChild>
          <Button variant="ghost" size="icon-sm" className="absolute top-2 right-2" aria-label={tCommon("close")}>
            <XIcon aria-hidden />
          </Button>
        </DialogClose>
      </DialogContent>
    </Dialog>
  );
}

export function ToastDemo() {
  const t = useTranslations("designSystem.overlays.toast");

  return (
    <>
      <Button variant="outline" onClick={() => toast(t("default"))}>
        {t("showDefault")}
      </Button>
      <Button variant="outline" onClick={() => toast.success(t("success"))}>
        {t("showSuccess")}
      </Button>
      <Button variant="outline" onClick={() => toast.info(t("info"))}>
        {t("showInfo")}
      </Button>
      <Button variant="outline" onClick={() => toast.warning(t("warning"))}>
        {t("showWarning")}
      </Button>
      <Button variant="outline" onClick={() => toast.error(t("error"))}>
        {t("showError")}
      </Button>
    </>
  );
}

export function DropdownDemo() {
  const t = useTranslations("designSystem.overlays.menu");

  return (
    // Not modal: a modal menu hides the page with aria-hidden while its controls stay focusable.
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button variant="outline">
          {t("open")}
          <EllipsisVertical aria-hidden data-icon="inline-end" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-48">
        <DropdownMenuGroup>
          <DropdownMenuItem>{t("assign")}</DropdownMenuItem>
          <DropdownMenuItem>{t("escalate")}</DropdownMenuItem>
          <DropdownMenuItem disabled>{t("merge")}</DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive">{t("close")}</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function TooltipDemo() {
  const t = useTranslations("designSystem.overlays.tooltip");

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={t("trigger")}>
          <CircleHelp aria-hidden />
        </Button>
      </TooltipTrigger>
      <TooltipContent>{t("content")}</TooltipContent>
    </Tooltip>
  );
}
