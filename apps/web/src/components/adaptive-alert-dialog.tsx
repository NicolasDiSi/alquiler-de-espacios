"use client";

import { type ComponentProps, createContext, type ReactNode, use } from "react";

import { cn } from "cn";

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { useIsMobile } from "@/hooks/use-mobile";

/**
 * A notice that stops an action and asks for an answer, adaptive as in `nextjs-templates`: an alert dialog from 768px
 * up (its confirmations, the IoT view picker) and a drawer from the bottom on a phone (its mail reader), where the
 * thumb reaches the buttons. An alert dialog never closes on a click outside, so the answer is always a button or
 * Escape. One API for both, so a screen writes it once: a refusal with bookings in the way today, a sede's retirement
 * with its clients to contact next.
 */
const Mobile = createContext(false);

export function AdaptiveAlertDialog({
  children,
  ...props
}: { readonly children: ReactNode } & Pick<ComponentProps<typeof AlertDialog>, "open" | "onOpenChange">) {
  const mobile = useIsMobile();
  return (
    <Mobile value={mobile}>
      {mobile ? <Drawer {...props}>{children}</Drawer> : <AlertDialog {...props}>{children}</AlertDialog>}
    </Mobile>
  );
}

/**
 * Never taller than the screen: a column whose header and footer keep their size while the body takes what is left and
 * scrolls. The alert dialog is a grid with no rows set, so each row would grow with its content past the cap; as a
 * column, the body's `min-h-0` lets it shrink.
 */
export function AdaptiveAlertDialogContent({ className, ...props }: ComponentProps<typeof AlertDialogContent>) {
  return use(Mobile) ? (
    <DrawerContent className={cn("max-h-[90dvh]", className)} {...props} />
  ) : (
    <AlertDialogContent
      className={cn("flex max-h-[90dvh] flex-col overflow-hidden data-[size=default]:sm:max-w-lg", className)}
      {...props}
    />
  );
}

export function AdaptiveAlertDialogHeader({ className, ...props }: ComponentProps<"div">) {
  return use(Mobile) ? (
    <DrawerHeader className={className} {...props} />
  ) : (
    <AlertDialogHeader className={className} {...props} />
  );
}

export function AdaptiveAlertDialogTitle(props: ComponentProps<typeof AlertDialogTitle>) {
  return use(Mobile) ? <DrawerTitle {...props} /> : <AlertDialogTitle {...props} />;
}

export function AdaptiveAlertDialogDescription(props: ComponentProps<typeof AlertDialogDescription>) {
  return use(Mobile) ? <DrawerDescription {...props} /> : <AlertDialogDescription {...props} />;
}

/** The scrolling middle: the drawer pads it like its header and footer, the alert dialog already pads everything. */
export function AdaptiveAlertDialogBody({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("min-h-0 flex-1 overflow-y-auto", use(Mobile) && "px-4", className)} {...props} />;
}

export function AdaptiveAlertDialogFooter({ className, ...props }: ComponentProps<"div">) {
  return use(Mobile) ? (
    <DrawerFooter className={cn("border-t", className)} {...props} />
  ) : (
    <AlertDialogFooter className={className} {...props} />
  );
}

/** Closes it without acting: the answer that is always there. */
export function AdaptiveAlertDialogCancel({
  variant = "outline",
  ...props
}: Pick<ComponentProps<typeof Button>, "variant" | "children">) {
  return use(Mobile) ? (
    <DrawerClose asChild>
      <Button variant={variant} {...props} />
    </DrawerClose>
  ) : (
    <AlertDialogCancel variant={variant} {...props} />
  );
}
