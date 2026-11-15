"use client";

import { X } from "lucide-react";
import { type PointerEvent, type ReactNode, useId, useRef } from "react";
import { useModalDialog } from "./use-modal-dialog";

export interface DetailSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  children: ReactNode;
}

/** Quanto arrastar (px) ou com que velocidade (px/ms) o sheet fecha ao soltar. */
const DISMISS_DISTANCE_PX = 110;
const DISMISS_VELOCITY = 0.6;

/** Mesmo breakpoint `lg` do app: a partir dele o sheet vira um modal centralizado. */
const DESKTOP_QUERY = "(min-width: 64rem)";

/**
 * Sheet de detalhes. No mobile sobe de baixo para cima, como os do iOS: alça, título, botão de
 * fechar e corpo rolável; fecha com Esc, toque no fundo, botão ou arrastando a alça/cabeçalho para
 * baixo. No desktop abre como modal centralizado, sem alça nem arraste.
 * Usa o <dialog> nativo (foco preso, fundo inerte, anunciado como modal).
 */
export function DetailSheet({ open, onOpenChange, title, children }: DetailSheetProps) {
  const { ref, dialogProps } = useModalDialog(open, onOpenChange);
  const titleId = useId();
  const drag = useRef<{ startY: number; startTime: number; offset: number } | null>(null);

  function onPointerDown(event: PointerEvent<HTMLDivElement>) {
    if (event.button !== 0 || (event.target as HTMLElement).closest("button")) return;
    if (window.matchMedia(DESKTOP_QUERY).matches) return; // centralizado: sem arrastar
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { startY: event.clientY, startTime: event.timeStamp, offset: 0 };
    const dialog = ref.current;
    if (dialog) dialog.style.transition = "none"; // o painel acompanha o dedo, sem atraso
  }

  function onPointerMove(event: PointerEvent<HTMLDivElement>) {
    const current = drag.current;
    const dialog = ref.current;
    if (!current || !dialog) return;
    current.offset = Math.max(0, event.clientY - current.startY); // só para baixo
    dialog.style.transform = `translateY(${current.offset}px)`;
  }

  function endDrag(event: PointerEvent<HTMLDivElement>) {
    const current = drag.current;
    const dialog = ref.current;
    drag.current = null;
    if (!current || !dialog) return;
    const elapsed = Math.max(1, event.timeStamp - current.startTime);
    const shouldDismiss =
      current.offset > DISMISS_DISTANCE_PX || current.offset / elapsed > DISMISS_VELOCITY;
    // Devolve o controle da animação à folha de estilo; fechar na mesma tarefa faz a saída
    // partir de onde o dedo parou (e não "pular" de volta para cima antes de descer).
    dialog.style.transition = "";
    dialog.style.transform = "";
    if (shouldDismiss) {
      dialog.close();
      onOpenChange(false);
    }
  }

  return (
    <dialog {...dialogProps} aria-labelledby={titleId} className="dialog dialog-detail">
      <div className="glass-float flex max-h-[85dvh] flex-col overflow-hidden rounded-t-[1.75rem] lg:max-h-[80dvh] lg:rounded-[1.75rem]">
        {/* Alça + título: toda esta faixa é a área de arrastar. */}
        <div
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          className="shrink-0 cursor-grab touch-none select-none active:cursor-grabbing lg:cursor-default lg:touch-auto lg:select-text lg:active:cursor-default"
        >
          <div
            aria-hidden
            className="mx-auto mt-2.5 h-1.5 w-10 rounded-full bg-fill-strong lg:hidden"
          />
          <div className="flex items-center justify-between gap-2 pr-2 pl-5 lg:pt-2">
            <h2 id={titleId} className="py-3 text-lg font-semibold">
              {title}
            </h2>
            <button
              type="button"
              aria-label="Fechar"
              onClick={() => onOpenChange(false)}
              className="flex size-11 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-fill hover:text-foreground"
            >
              <X aria-hidden className="size-5" />
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pt-1 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
          {children}
        </div>
      </div>
    </dialog>
  );
}
