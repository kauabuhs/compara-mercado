"use client";

import { type ReactNode, useEffect, useId, useRef } from "react";
import { cn } from "@/lib/utils";

export type DialogStyle = "alert" | "sheet";

export interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** `alert`: painel central compacto. `sheet`: action sheet ancorada embaixo. */
  variant?: DialogStyle;
  title: string;
  description?: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  /** Ação que apaga/remove: o botão de confirmação fica vermelho. */
  destructive?: boolean;
  onConfirm: () => void;
}

/**
 * Confirmação em dois estilos, no padrão dos diálogos da Apple.
 * Usa o <dialog> nativo (foco preso, Esc fecha, fundo inerte, leitores de tela anunciam como modal).
 * Cancelar é sempre o foco inicial e a opção em negrito: o caminho seguro.
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  variant = "alert",
  title,
  description,
  confirmLabel,
  cancelLabel = "Cancelar",
  destructive = false,
  onConfirm,
}: ConfirmDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  const close = () => onOpenChange(false);
  const confirm = () => {
    onConfirm();
    close();
  };

  const confirmTone = destructive ? "text-danger" : "text-brand";

  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: o equivalente por teclado é a tecla Esc do <dialog> nativo
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      onClose={close}
      // Clique no fundo (fora dos painéis) cancela, como no iOS. O teclado já cancela com Esc (nativo).
      onClick={(event) => {
        if (event.target === event.currentTarget) close();
      }}
      className={cn("dialog", variant === "alert" ? "dialog-alert" : "dialog-sheet")}
    >
      {variant === "alert" ? (
        <div className="glass-float overflow-hidden rounded-[1.75rem] text-center">
          <div className="space-y-1 px-5 pt-5 pb-4">
            <h2 id={titleId} className="text-[1.0625rem] leading-snug font-semibold">
              {title}
            </h2>
            {description ? (
              <p id={descriptionId} className="text-[0.8125rem] leading-snug text-muted-foreground">
                {description}
              </p>
            ) : null}
          </div>
          <div className="grid grid-cols-2 divide-x divide-separator border-t border-separator">
            <button
              type="button"
              // biome-ignore lint/a11y/noAutofocus: foco inicial no botão seguro (Cancelar) é o padrão de diálogos de confirmação
              autoFocus
              onClick={close}
              className="min-h-12 text-[1.0625rem] font-semibold text-brand transition-colors hover:bg-fill active:bg-fill-strong"
            >
              {cancelLabel}
            </button>
            <button
              type="button"
              onClick={confirm}
              className={cn(
                "min-h-12 text-[1.0625rem] transition-colors hover:bg-fill active:bg-fill-strong",
                confirmTone,
              )}
            >
              {confirmLabel}
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          <div className="glass-float overflow-hidden rounded-3xl text-center">
            <div className="space-y-0.5 px-5 py-4">
              <h2 id={titleId} className="text-[0.8125rem] font-semibold text-muted-foreground">
                {title}
              </h2>
              {description ? (
                <p
                  id={descriptionId}
                  className="text-[0.8125rem] leading-snug text-muted-foreground"
                >
                  {description}
                </p>
              ) : null}
            </div>
            <button
              type="button"
              onClick={confirm}
              className={cn(
                "min-h-14 w-full border-t border-separator text-[1.0625rem] transition-colors hover:bg-fill active:bg-fill-strong",
                confirmTone,
              )}
            >
              {confirmLabel}
            </button>
          </div>
          <button
            type="button"
            // biome-ignore lint/a11y/noAutofocus: foco inicial no botão seguro (Cancelar) é o padrão de diálogos de confirmação
            autoFocus
            onClick={close}
            className="glass-float min-h-14 w-full rounded-3xl text-[1.0625rem] font-semibold text-brand transition-colors hover:bg-glass active:bg-glass"
          >
            {cancelLabel}
          </button>
        </div>
      )}
    </dialog>
  );
}
