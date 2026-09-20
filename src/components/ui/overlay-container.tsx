"use client";
import { createContext, useContext } from "react";
// Portals inside native dialogs must remain in that dialog's top-layer subtree.
export const OverlayContainerContext = createContext<HTMLElement | null>(null);
export const useOverlayContainer = () => useContext(OverlayContainerContext);
