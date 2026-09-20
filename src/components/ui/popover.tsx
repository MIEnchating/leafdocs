"use client";
import * as Primitive from "@radix-ui/react-popover";
import type { ReactNode } from "react";
import { useOverlayContainer } from "./overlay-container";

export function Popover({ trigger, children, label, open, onOpenChange }: {
  trigger: ReactNode; children: ReactNode; label: string; open?: boolean; onOpenChange?: (open: boolean) => void;
}) {
  const container = useOverlayContainer();
  return <Primitive.Root open={open} onOpenChange={onOpenChange}><Primitive.Trigger asChild>{trigger}</Primitive.Trigger>
    <Primitive.Portal container={container}><Primitive.Content className="ui-popover" sideOffset={8} collisionPadding={12} align="start" aria-label={label}>{children}</Primitive.Content></Primitive.Portal>
  </Primitive.Root>;
}
