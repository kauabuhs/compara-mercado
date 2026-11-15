"use client";

import Link from "next/link";
import { useEffect } from "react";
import { scheduleListSync, syncListNow } from "@/modules/shopping-list/list-sync";
import { getListSyncState, onLocalListEdit, useListSyncState } from "@/stores/shopping-list.store";

/**
 * Mantém a lista da conta em dia sem aparecer na tela: sincroniza (com espera) depois de cada
 * edição, ao voltar a conexão e ao reabrir a aba. Fica no layout porque a lista é editada em
 * várias páginas (produto, lista). Quem não tem conta só gera uma checagem por minuto.
 */
export function ListSync() {
  useEffect(() => {
    const offEdit = onLocalListEdit(() => scheduleListSync());
    const onOnline = () => scheduleListSync(0);
    const onVisible = () => {
      // Voltou para a aba: traz o que foi mudado em outro aparelho.
      if (document.visibilityState === "visible" && getListSyncState().signedIn)
        scheduleListSync(0);
    };
    window.addEventListener("online", onOnline);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      offEdit();
      window.removeEventListener("online", onOnline);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);
  return null;
}

/** Sincroniza ao abrir a página (a lista e a conta são onde a pessoa espera ver a lista em dia). */
export function ListSyncNow() {
  useEffect(() => {
    void syncListNow();
  }, []);
  return null;
}

/** Diz onde a lista está guardada. Some até sabermos (evita piscar "só neste aparelho" a quem tem conta). */
export function ListSyncNote() {
  const { signedIn, phase } = useListSyncState();
  if (signedIn === null) return null;
  if (!signedIn) {
    return (
      // O link fica em linha própria de 44 px (alvo de toque): inline no texto teria ~19 px de altura.
      <div className="type-caption flex flex-wrap items-center gap-x-1">
        <span>Salva só neste aparelho.</span>
        <Link
          href="/entrar?next=/lista"
          className="inline-flex min-h-11 items-center font-medium text-brand underline-offset-2 hover:underline"
        >
          Entre na sua conta
        </Link>
        <span>para ter a lista em todos os seus aparelhos.</span>
      </div>
    );
  }
  return (
    <p className="type-caption" role="status">
      {phase === "syncing"
        ? "Sincronizando com a sua conta…"
        : phase === "error"
          ? "Sem conexão com a conta. Sua lista está salva e sincroniza quando a internet voltar."
          : "Salva na sua conta: aparece em todos os seus aparelhos."}
    </p>
  );
}
