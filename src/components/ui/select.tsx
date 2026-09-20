"use client";
import * as SelectPrimitive from "@radix-ui/react-select";
import type { ReactNode } from "react";
import { Check, ChevronDown } from "../icons";
import { useOverlayContainer } from "./overlay-container";

export type SelectOption = { value: string; label: string; icon?: ReactNode; disabled?: boolean };
export function Select({ label, value, onChange, options, disabled, id }: {
  label: string; value: string; onChange: (value: string) => void; options: SelectOption[]; disabled?: boolean; id?: string;
}) {
  const container = useOverlayContainer();
  return <SelectPrimitive.Root value={value} onValueChange={onChange} disabled={disabled}>
    <SelectPrimitive.Trigger id={id} className="ui-select-trigger" aria-label={label}><SelectPrimitive.Value /><SelectPrimitive.Icon><ChevronDown size={16} /></SelectPrimitive.Icon></SelectPrimitive.Trigger>
    <SelectPrimitive.Portal container={container}><SelectPrimitive.Content className="ui-menu ui-select-content" position="popper" sideOffset={6} collisionPadding={12}>
      <SelectPrimitive.Viewport>{options.map(option => <SelectPrimitive.Item key={option.value} value={option.value} disabled={option.disabled} className="ui-menu-item">
        {option.icon}<SelectPrimitive.ItemText>{option.label}</SelectPrimitive.ItemText><SelectPrimitive.ItemIndicator className="ui-check"><Check size={15} /></SelectPrimitive.ItemIndicator>
      </SelectPrimitive.Item>)}</SelectPrimitive.Viewport>
    </SelectPrimitive.Content></SelectPrimitive.Portal>
  </SelectPrimitive.Root>;
}
