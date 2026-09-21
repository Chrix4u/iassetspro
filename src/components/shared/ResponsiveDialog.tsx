"use client";

import * as React from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetClose,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { X } from "lucide-react";

function useIsMobile(breakpoint = 768) {
  const [isMobile, setIsMobile] = React.useState(false);

  React.useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${breakpoint - 1}px)`);
    const onChange = (e: MediaQueryListEvent | MediaQueryList) =>
      setIsMobile(e.matches);

    onChange(mql);
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, [breakpoint]);

  return isMobile;
}

export { useIsMobile };

export interface ResponsiveDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: React.ReactNode;
  description?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
  desktopMaxWidth?: string;
  large?: boolean;
  extraLarge?: boolean;
  showCloseButton?: boolean;
}

type PointerDownOutsideHandler = NonNullable<React.ComponentProps<typeof DialogContent>["onPointerDownOutside"]>;

export function ResponsiveDialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  className,
  desktopMaxWidth,
  large = false,
  extraLarge = false,
  showCloseButton = true,
}: ResponsiveDialogProps) {
  const isMobile = useIsMobile();

  const resolvedMaxWidth = desktopMaxWidth
    ?? (extraLarge ? "sm:max-w-4xl" : large ? "sm:max-w-2xl" : "sm:max-w-lg");

  // Radix passes a PointerDownOutsideEvent (CustomEvent), not a React
  // PointerEvent. Inspect the original browser event so popover interaction
  // inside a responsive dialog does not dismiss the dialog/sheet.
  const handlePointerDownOutside = React.useCallback<PointerDownOutsideHandler>((event) => {
    const target = event.detail.originalEvent.target;
    if (target instanceof HTMLElement && target.closest('[data-slot="popover-content"]')) {
      event.preventDefault();
    }
  }, []);

  if (isMobile) {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent
          side="bottom"
          hideClose
          className={cn(
            "max-h-[92vh] rounded-t-2xl",
            "flex flex-col overflow-hidden",
            className,
          )}
          style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
          onPointerDownOutside={handlePointerDownOutside}
        >
          <div className="mx-auto mt-3 h-1.5 w-10 shrink-0 rounded-full bg-muted-foreground/30" />

          <div className={cn("flex items-center gap-3 px-4 pt-2 pb-1", !title && !description && !showCloseButton && "sr-only")}>
            <div className="flex-1 min-w-0">
              <SheetTitle className={cn("text-base leading-tight", !title && "sr-only")}>{title || "Dialog"}</SheetTitle>
              {description && (
                <SheetDescription className="text-sm mt-1">{description}</SheetDescription>
              )}
            </div>
            {showCloseButton && title && (
              <SheetClose asChild>
                <button
                  className="flex items-center justify-center h-8 w-8 rounded-full bg-muted hover:bg-muted-foreground/10 transition-colors shrink-0"
                  aria-label="Close"
                >
                  <X className="h-4 w-4 text-muted-foreground" />
                </button>
              </SheetClose>
            )}
          </div>

          <div className="responsive-dialog-body flex-1 overflow-y-auto overscroll-contain px-4 pb-4">
            {children}
          </div>

          {footer && (
            <div
              className={cn(
                "border-t bg-background px-4 pt-3",
                "sticky bottom-0 z-10",
              )}
              style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
            >
              {footer}
            </div>
          )}
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={cn(resolvedMaxWidth, "max-h-[85vh] overflow-y-auto", className)} onPointerDownOutside={handlePointerDownOutside}>
        <DialogHeader className={!(title || description) ? "sr-only" : undefined}>
          <DialogTitle className={!title ? "sr-only" : undefined}>{title || "Dialog"}</DialogTitle>
          {description ? (
            <DialogDescription>{description}</DialogDescription>
          ) : (
            <DialogDescription className="sr-only">Dialog</DialogDescription>
          )}
        </DialogHeader>

        <div className={cn("responsive-dialog-body", !footer && "pb-2")}>
          {children}
        </div>

        {footer && <DialogFooter>{footer}</DialogFooter>}
      </DialogContent>
    </Dialog>
  );
}
