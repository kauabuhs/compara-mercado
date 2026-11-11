"use client";

import { Button } from "@compara/ui";
import { Moon, Sun, SunMoon } from "lucide-react";
import { useState } from "react";

type Theme = "system" | "light" | "dark";
const THEME_CYCLE_ORDER: Theme[] = ["system", "light", "dark"];
const THEME_LABELS: Record<Theme, string> = {
  system: "Automático",
  light: "Claro",
  dark: "Escuro",
};
// Mesma chave lida pelo script inline de app/layout.tsx (evita piscar o tema errado no carregamento).
const THEME_STORAGE_KEY = "compara:theme";

function readStoredTheme(): Theme {
  try {
    const storedTheme = localStorage.getItem(THEME_STORAGE_KEY);
    return storedTheme === "light" || storedTheme === "dark" ? storedTheme : "system";
  } catch {
    return "system";
  }
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(readStoredTheme);
  const Icon = theme === "light" ? Sun : theme === "dark" ? Moon : SunMoon;

  function cycleTheme() {
    const nextTheme =
      THEME_CYCLE_ORDER[(THEME_CYCLE_ORDER.indexOf(theme) + 1) % THEME_CYCLE_ORDER.length] ??
      "system";
    setTheme(nextTheme);
    try {
      if (nextTheme === "system") {
        localStorage.removeItem(THEME_STORAGE_KEY);
        document.documentElement.removeAttribute("data-theme");
      } else {
        localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
        document.documentElement.setAttribute("data-theme", nextTheme);
      }
    } catch {
      // preferência não persiste em modo privado; o tema vale nesta sessão
    }
  }

  return (
    <Button
      variant="outline"
      onClick={cycleTheme}
      aria-label={`Tema: ${THEME_LABELS[theme]}. Alterar tema`}
    >
      <Icon aria-hidden className="size-4" />
      Tema: {THEME_LABELS[theme]}
    </Button>
  );
}
