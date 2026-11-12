<#
.SYNOPSIS
  Abre o Windows Terminal com uma aba por processo de desenvolvimento (Back e Front).

.DESCRIPTION
  Cada aba roda um script independente do monorepo: fechar uma aba para só aquele processo.
    Back   -> pnpm dev:back    (API Hono em http://127.0.0.1:4000)
    Front  -> pnpm dev:front   (Next em http://localhost:3000)
    Worker -> pnpm dev:worker  (opcional; use -Worker)

  Pré-requisitos: Supabase local no ar (pnpm db:start) e os arquivos
  ComparaMercado-Back/.env e ComparaMercado-Front/.env.local (veja .env.example).

.EXAMPLE
  pnpm dev:abas
  pnpm dev:abas -- -Worker
  powershell -File scripts/dev-abas.ps1 -DryRun   # só mostra o comando, não abre nada
#>
param(
  [switch]$Worker,
  [switch]$DryRun
)

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent $PSScriptRoot

$tabs = @(
  @{ Title = "Back (API :4000)"; Command = "pnpm dev:back" },
  @{ Title = "Front (Next :3000)"; Command = "pnpm dev:front" }
)
if ($Worker) { $tabs += @{ Title = "Worker"; Command = "pnpm dev:worker" } }

# Argumentos do wt: cada aba é um "new-tab", separadas por ";" (um argumento próprio).
$wtArguments = @("-w", "0")
for ($index = 0; $index -lt $tabs.Count; $index++) {
  if ($index -gt 0) { $wtArguments += ";" }
  $tab = $tabs[$index]
  $wtArguments += @(
    "new-tab", "--title", "`"$($tab.Title)`"", "-d", "`"$repoRoot`"",
    "powershell", "-NoExit", "-Command", "`"$($tab.Command)`""
  )
}

if ($DryRun) {
  Write-Output "wt.exe $($wtArguments -join ' ')"
  exit 0
}

if (-not (Get-Command wt.exe -ErrorAction SilentlyContinue)) {
  Write-Error "Windows Terminal (wt.exe) não encontrado. Abra um terminal por processo e rode: pnpm dev:back / pnpm dev:front"
  exit 1
}

Start-Process -FilePath "wt.exe" -ArgumentList $wtArguments
