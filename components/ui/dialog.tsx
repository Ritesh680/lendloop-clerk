"use client";

import { X } from "lucide-react";
import { type ReactNode, useEffect, useRef } from "react";

/** Native <dialog>: focus trapping, Esc and the top layer come from the browser. */
export function Dialog({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      aria-labelledby="dialog-title"
      className="m-auto w-[calc(100%-2rem)] max-w-lg rounded-lg border border-zinc-line bg-enamel-900 p-0 text-chalk"
    >
      <div className="flex items-center justify-between gap-4 border-b border-enamel-700 px-5 py-3">
        <h2
          id="dialog-title"
          className="font-display text-lg font-semibold tracking-tight"
        >
          {title}
        </h2>
        <button
          type="button"
          onClick={() => ref.current?.close()}
          aria-label="Close"
          className="cursor-pointer rounded-md p-1 text-steel hover:bg-enamel-800 hover:text-chalk"
        >
          <X className="size-4" aria-hidden />
        </button>
      </div>
      <div className="p-5">{children}</div>
    </dialog>
  );
}
