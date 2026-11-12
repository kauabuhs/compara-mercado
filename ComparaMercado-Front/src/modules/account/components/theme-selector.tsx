"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";
import { SegmentedControl } from "@/components/ui/controls";

type Theme = "system" | "light" | "dark";

// Mesma chave lida pelo script inline de app/layout.tsx (evita piscar o tema errado no carregamento).
const THEME_STORAGE_KEY = "compara:theme";

const OPTIONS = [
  { value: "system", label: "Sistema", icon: <Monitor aria-hidden className="size-4" /> },
  { value: "light", label: "Claro", icon: <Sun aria-hidden className="size-4" /> },
  { value: "dark", label: "Escuro", icon: <Moon aria-hidden className="size-4" /> },
] as const;

function readStoredTheme(): Theme {
  try {
    const storedTheme = localStorage.getItem(THEME_STORAGE_KEY);
    return storedTheme === "light" || storedTheme === "dark" ? storedTheme : "system";
  } catch {
    return "system";
  }
}

/** Aparência do app: Sistema (padrão, acompanha o tema do aparelho, inclusive quando ele muda), Claro ou Escuro. */
export function ThemeSelector() {
  // Começa em "system" no servidor e no 1º render; o valor salvo entra logo em seguida (sem divergência de hidratação).
  const [theme, setTheme] = useState<Theme>("system");
  useEffect(() => setTheme(readStoredTheme()), []);

  function chooseTheme(nextTheme: Theme) {
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
      if (nextTheme !== "system") document.documentElement.setAttribute("data-theme", nextTheme);
    }
  }

  return (
    <SegmentedControl
      label="Aparência"
      value={theme}
      options={OPTIONS}
      onChange={chooseTheme}
      className="w-full"
    />
  );
}
