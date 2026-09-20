"use client";
import * as Menu from "@radix-ui/react-dropdown-menu";
import { useRef, type ReactNode } from "react";
import { useOverlayContainer } from "./overlay-container";

export type MenuAction = { id: string; label: string; icon?: ReactNode; onSelect: () => void; disabled?: boolean; danger?: boolean };
export function DropdownMenu({ trigger, items, label, open, onOpenChange }: {
  trigger: ReactNode; items: MenuAction[]; label: string; open?: boolean; onOpenChange?: (open: boolean) => void;
}) {
  const container = useOverlayContainer();
  const pending = useRef<(() => void) | null>(null);
  return <Menu.Root open={open} onOpenChange={onOpenChange} modal={false}>
    <Menu.Trigger asChild>{trigger}</Menu.Trigger>
    <Menu.Portal container={container}><Menu.Content className="ui-menu" align="end" sideOffset={8} collisionPadding={12} aria-label={label} onCloseAutoFocus={() => {
      // Return focus before an action opens a native modal above this menu.
      const action = pending.current; pending.current = null;
      if (action) requestAnimationFrame(action);
    }}>
      {items.map(item => <Menu.Item className={`ui-menu-item ${item.danger ? "is-danger" : ""}`} key={item.id} disabled={item.disabled} onSelect={() => { pending.current = item.onSelect; }}>{item.icon}<span>{item.label}</span></Menu.Item>)}
    </Menu.Content></Menu.Portal>
  </Menu.Root>;
}
