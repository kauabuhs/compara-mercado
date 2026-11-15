"use client";

import { type RefObject, useCallback, useEffect, useState } from "react";

/**
 * Tela cheia de um elemento, com dois caminhos e um só estado (`expanded`):
 *  - **nativo** (Fullscreen API): desktop e Android. Esconde até a barra do navegador e o Esc
 *    sai sozinho;
 *  - **alternativo em CSS**: onde a API não existe (principalmente o iPhone, cujo Safari não
 *    aceita `requestFullscreen` em elementos). Quem usa o hook aplica `fixed inset-0` quando
 *    `fallback` é verdadeiro; aqui só travamos a rolagem da página e tratamos o Esc.
 */
export function useFullscreen(ref: RefObject<HTMLElement | null>) {
  const [native, setNative] = useState(false);
  const [fallback, setFallback] = useState(false);

  // O navegador é a fonte da verdade do modo nativo (o Esc sai sem passar por nós).
  useEffect(() => {
    const sync = () => setNative(document.fullscreenElement === ref.current);
    document.addEventListener("fullscreenchange", sync);
    return () => document.removeEventListener("fullscreenchange", sync);
  }, [ref]);

  // Modo alternativo: sem rolagem de fundo e com Esc para sair.
  useEffect(() => {
    if (!fallback) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setFallback(false);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [fallback]);

  const expanded = native || fallback;

  const toggle = useCallback(() => {
    if (document.fullscreenElement === ref.current) {
      void document.exitFullscreen();
      return;
    }
    if (fallback) {
      setFallback(false);
      return;
    }
    const element = ref.current;
    if (element && document.fullscreenEnabled && element.requestFullscreen) {
      // Recusado (permissão, política da página): cai para o modo alternativo.
      element.requestFullscreen().catch(() => setFallback(true));
    } else {
      setFallback(true);
    }
  }, [ref, fallback]);

  return { expanded, fallback, toggle };
}
