param(
  [int]$Port = 5050
)

$ErrorActionPreference = "Continue"

$Workspace = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path

function Write-Step($Message) {
  Write-Output "==> $Message"
}

function Stop-WorkspaceProcess($Name, $CommandPattern) {
  try {
    Get-CimInstance Win32_Process -Filter "name = '$Name'" |
      Where-Object { $_.CommandLine -like $CommandPattern } |
      ForEach-Object {
        Write-Step "Parando processo $($_.ProcessId)"
        Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
      }
  } catch {
    Write-Warning "Nao consegui consultar processos via CIM: $($_.Exception.Message)"
  }
}

function Stop-WorkspaceNodeApps() {
  try {
    Get-CimInstance Win32_Process -Filter "name = 'node.exe'" |
      Where-Object {
        $_.CommandLine -like "*$Workspace*" -and
        (
          $_.CommandLine -match "vite" -or
          $_.CommandLine -match "production-server\.mjs" -or
          $_.CommandLine -match "@tanstack"
        )
      } |
      ForEach-Object {
        Write-Step "Fechando painel antigo do projeto no PID $($_.ProcessId)"
        Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
      }
  } catch {
    Write-Warning "Nao consegui consultar processos Node via CIM: $($_.Exception.Message)"
  }
}

function Stop-PortListener($Port) {
  $pattern = "^\s*TCP\s+\S+:$Port\s+\S+\s+LISTENING\s+(\d+)\s*$"
  $pids = @()
  foreach ($line in netstat -ano) {
    if ($line -match $pattern) {
      $pids += [int]$Matches[1]
    }
  }
  $pids | Select-Object -Unique | ForEach-Object {
    Write-Step "Liberando porta $Port no PID $_"
    Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue
  }
}

Write-Step "Parando painel local e tunel do projeto"
Stop-WorkspaceProcess "cloudflared.exe" "*$Workspace*cloudflared.exe*"
Stop-WorkspaceNodeApps
Stop-PortListener $Port
Write-Output "Pronto."
