# setup-task-scheduler.ps1
# Registra a renovação automática de cookie + cache no Agendador de Tarefas.
# Execute UMA VEZ como Administrador:
#   Right-click PowerShell → "Executar como administrador"
#   cd "C:\Users\rmmic\OneDrive\Documentos\suredge-app\scripts"
#   Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
#   .\setup-task-scheduler.ps1

$scriptDir  = Split-Path -Parent $MyInvocation.MyCommand.Path
$scriptPath = Join-Path $scriptDir "renew-cookie.mjs"
$envFile    = Join-Path $scriptDir ".env"
$taskName   = "SureEdge-RenewCookie"

# ── Valida pré-requisitos ────────────────────────────────────────────────────

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Error "Node.js não encontrado. Instale em https://nodejs.org"
    exit 1
}

if (-not (Test-Path $envFile)) {
    Write-Host ""
    Write-Host "⚠  Arquivo .env não encontrado em: $envFile" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Crie o arquivo copiando o exemplo:" -ForegroundColor Cyan
    Write-Host "   copy `"$scriptDir\.env.example`" `"$envFile`"" -ForegroundColor White
    Write-Host ""
    Write-Host "Depois edite o .env com suas credenciais e rode este script novamente."
    exit 1
}

# ── Instala dependências npm ─────────────────────────────────────────────────

Write-Host "📦  Instalando dependências npm..." -ForegroundColor Cyan
Push-Location $scriptDir
npm install --silent
Pop-Location

# ── Monta o comando ──────────────────────────────────────────────────────────

$nodePath = (Get-Command node).Source
$action   = New-ScheduledTaskAction `
    -Execute $nodePath `
    -Argument "`"$scriptPath`"" `
    -WorkingDirectory $scriptDir

# A cada 30 minutos — atualiza eventos + odds para o site
$trigger = New-ScheduledTaskTrigger `
    -RepetitionInterval (New-TimeSpan -Minutes 30) `
    -Once -At (Get-Date).AddMinutes(2)

$settings = New-ScheduledTaskSettingsSet `
    -ExecutionTimeLimit (New-TimeSpan -Minutes 10) `
    -StartWhenAvailable `
    -RunOnlyIfNetworkAvailable `
    -MultipleInstances IgnoreNew

$principal = New-ScheduledTaskPrincipal `
    -UserId $env:USERNAME `
    -LogonType Interactive `
    -RunLevel Limited

# ── Remove tarefa antiga se existir ─────────────────────────────────────────

if (Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue) {
    Unregister-ScheduledTask -TaskName $taskName -Confirm:$false
    Write-Host "🗑  Tarefa antiga removida." -ForegroundColor Gray
}

# ── Registra nova tarefa ─────────────────────────────────────────────────────

Register-ScheduledTask `
    -TaskName  $taskName `
    -Action    $action `
    -Trigger   $trigger `
    -Settings  $settings `
    -Principal $principal `
    -Description "Renova cookie + cache de eventos/odds (SureEdge) a cada 30 min" | Out-Null

Write-Host ""
Write-Host "✅  Tarefa '$taskName' registrada!" -ForegroundColor Green
Write-Host ""
Write-Host "   Roda: a cada 30 minutos enquanto o PC estiver ligado"
Write-Host "   Node: $nodePath"
Write-Host "   Script: $scriptPath"
Write-Host ""
Write-Host "   O script agora faz 3 coisas em sequência:"
Write-Host "   1. Valida/renova o cookie de login"
Write-Host "   2. Busca a lista de eventos do dia"
Write-Host "   3. Busca as odds de cada evento"
Write-Host ""
Write-Host "▶  Rodando agora para popular o cache inicial..." -ForegroundColor Cyan
Write-Host ""

# Roda imediatamente para testar
$result = Start-Process -FilePath $nodePath `
    -ArgumentList "`"$scriptPath`"" `
    -WorkingDirectory $scriptDir `
    -Wait `
    -PassThru `
    -NoNewWindow

if ($result.ExitCode -eq 0) {
    Write-Host ""
    Write-Host "🎉  Cache populado com sucesso! Acesse o site para ver os eventos." -ForegroundColor Green
} else {
    Write-Host ""
    Write-Host "❌  Falhou com código $($result.ExitCode)." -ForegroundColor Red
    Write-Host "   Verifique as credenciais no arquivo .env"
}
