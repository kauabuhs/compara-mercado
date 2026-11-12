"use client";

import { useEffect } from "react";

/** Registra o service worker (PWA instalável + última lista offline). Só em produção. */
export function SwRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // sem service worker o app continua funcionando online
    });
  }, []);
  return null;
}
