"use client";

import { Menu, X } from "lucide-react";
import { useRef } from "react";
import { Logo } from "@/components/ui/logo";
import { AppNav } from "./app-nav";

/**
 * Native <dialog> drawer: modal focus containment, Escape to close, inert
 * background and focus restoration come from the browser (D-015).
 */
export function MobileNav() {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const close = () => dialogRef.current?.close();

  return (
    <>
      <button
        type="button"
        onClick={() => dialogRef.current?.showModal()}
        className="grid size-10 place-items-center rounded-md text-fg-muted hover:bg-surface-2 hover:text-fg lg:hidden"
        aria-haspopup="dialog"
      >
        <Menu aria-hidden className="size-5" />
        <span className="sr-only">Open navigation</span>
      </button>
      <dialog
        ref={dialogRef}
        aria-label="Navigation"
        className="m-0 h-dvh max-h-none w-72 max-w-[85vw] border-r border-line bg-surface-1 p-0 text-fg backdrop:bg-black/60"
        onClick={(event) => {
          // A click on the backdrop targets the dialog element itself.
          if (event.target === event.currentTarget) close();
        }}
      >
        <div className="flex h-16 items-center justify-between border-b border-line px-4">
          <Logo />
          <button
            type="button"
            onClick={close}
            className="grid size-10 place-items-center rounded-md text-fg-muted hover:bg-surface-2 hover:text-fg"
          >
            <X aria-hidden className="size-5" />
            <span className="sr-only">Close navigation</span>
          </button>
        </div>
        <nav aria-label="App" className="p-3">
          <AppNav onNavigate={close} />
        </nav>
      </dialog>
    </>
  );
}
