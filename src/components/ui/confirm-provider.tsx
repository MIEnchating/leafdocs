"use client";
import { createContext, useContext, useEffect, useRef, useState } from "react";
import { SurfaceDialog } from "../surface-dialog";

type Options = { title: string; description: string; confirmLabel?: string; danger?: boolean };
const Context = createContext<(options: Options) => Promise<boolean>>(() => Promise.resolve(false));
export const useConfirm = () => useContext(Context);
export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [options, setOptions] = useState<Options | null>(null);
  const resolver = useRef<((confirmed: boolean) => void) | null>(null);
  useEffect(() => () => { resolver.current?.(false); }, []);
  function finish(value: boolean) { resolver.current?.(value); resolver.current = null; setOptions(null); }
  return <Context.Provider value={options => new Promise(resolve => { resolver.current?.(false); resolver.current = resolve; setOptions(options); })}>
    {children}<SurfaceDialog open={!!options} onClose={() => finish(false)} label={options?.title || "确认操作"} className="ui-confirm-dialog" role="alertdialog">
      <h2>{options?.title}</h2><p>{options?.description}</p><div className="ui-dialog-actions"><button type="button" className="ui-button" onClick={() => finish(false)} autoFocus>取消</button><button type="button" className={`ui-button ${options?.danger ? "ui-button-danger" : "ui-button-primary"}`} onClick={() => finish(true)}>{options?.confirmLabel || "确认"}</button></div>
    </SurfaceDialog>
  </Context.Provider>;
}
