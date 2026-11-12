"use client";

import { type MouseEvent, type RefObject, useEffect, useRef } from "react";

interface ModalDialogProps {
  ref: RefObject<HTMLDialogElement | null>;
  onClose: () => void;
  onClick: (event: MouseEvent<HTMLDialogElement>) => void;
}

/**
 * Liga o estado `open` ao <dialog> nativo (`showModal`/`close`): foco preso, Esc fecha, fundo
 * inerte e leitores de tela anunciam como modal. Devolve as props para espalhar no <dialog>:
 * o clique no fundo (fora dos painéis) cancela, como no iOS; o teclado já cancela com Esc.
 */
export function useModalDialog(open: boolean, onOpenChange: (open: boolean) => void) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  const dialogProps: ModalDialogProps = {
    ref,
    onClose: () => onOpenChange(false),
    onClick: (event) => {
      if (event.target === event.currentTarget) onOpenChange(false);
    },
  };

  return { ref, dialogProps };
}
