"use client";

import { Download, Share } from "lucide-react";
import { useEffect, useState } from "react";
import { RowContent, rowClass, Section } from "@/components/ui/controls";
import { Group, GroupRow, IconTile } from "@/components/ui/primitives";

// Evento não padronizado (Chromium): permite abrir o convite de instalação do app (PWA).
interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
}

function isStandalone(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function isIosSafari(): boolean {
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

/**
 * Convite para instalar o app. Aparece só quando faz sentido: no Android/desktop quando o navegador
 * oferece a instalação; no iPhone/iPad com a instrução (lá é pelo menu Compartilhar). Já instalado: some.
 */
export function InstallAppRow() {
  const [installEvent, setInstallEvent] = useState<InstallPromptEvent | null>(null);
  const [showIosHint, setShowIosHint] = useState(false);

  useEffect(() => {
    if (isStandalone()) return;
    setShowIosHint(isIosSafari());
    const onBeforeInstall = (event: Event) => {
      event.preventDefault();
      setInstallEvent(event as InstallPromptEvent);
    };
    const onInstalled = () => setInstallEvent(null);
    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (installEvent) {
    return (
      <Section title="Aplicativo">
        <Group>
          <GroupRow>
            <button
              type="button"
              onClick={() => {
                void installEvent.prompt();
                setInstallEvent(null);
              }}
              className={rowClass}
            >
              <RowContent
                icon={<IconTile icon={Download} tone="info" />}
                title="Instalar o app"
                description="Abre direto da tela inicial, em tela cheia"
                chevron
              />
            </button>
          </GroupRow>
        </Group>
      </Section>
    );
  }

  if (showIosHint) {
    return (
      <Section title="Aplicativo">
        <Group>
          <GroupRow className="flex items-center gap-3 px-4 py-3">
            <IconTile icon={Share} tone="info" />
            <p className="type-caption">
              Para instalar: toque em <strong className="text-foreground">Compartilhar</strong> e
              depois em <strong className="text-foreground">Adicionar à Tela de Início</strong>.
            </p>
          </GroupRow>
        </Group>
      </Section>
    );
  }

  return null;
}
