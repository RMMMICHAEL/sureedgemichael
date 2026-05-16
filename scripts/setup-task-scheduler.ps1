# setup-task-scheduler.ps1
# Registra a renovação automática de cookie no Agendador de Tarefas do Windows.
# Execute UMA VEZ como Administrador:
#   Right-click PowerShell → "Executar como administrador"
#   cd "C:\Users\rmmic\OneDrive\Documentos\suredge-app\scripts"
#   Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
#   .\setup-task-scheduler.ps1

$scriptDir  = Split-Path -Parent $MyInvocation.MyCommand.Path
$scriptPath = Join-Path $scriptDir "renew-cookie.mjs"
$envFile    = Join-Path $scriptDir ".env"
$taskName   = "SureEdge-RenewCookie"
$logFile    = Join-Path $scriptDir "renew-cookie.log"

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

# A cada 2 horas, começa em 10 minutos
$trigger = New-ScheduledTaskTrigger -RepetitionInterval (New-TimeSpan -Hours 2) `
    -Once -At (Get-Date).AddMinutes(10)

$settings = New-ScheduledTaskSettingsSet `
    -ExecutionTimeLimit (New-TimeSpan -Minutes 5) `
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
    -Description "Renova o cookie do SuperMonitor a cada 2 horas (SureEdge)" | Out-Null

Write-Host ""
Write-Host "✅  Tarefa '$taskName' registrada com sucesso!" -ForegroundColor Green
Write-Host ""
Write-Host "   Roda: a cada 2 horas enquanto o PC estiver ligado"
Write-Host "   Node: $nodePath"
Write-Host "   Script: $scriptPath"
Write-Host ""
Write-Host "🔍  Para verificar:" -ForegroundColor Cyan
Write-Host "   Abra 'Agendador de Tarefas' → Biblioteca → SureEdge-RenewCookie"
Write-Host ""
Write-Host "▶  Rodando agora para testar..." -ForegroundColor Cyan
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
    Write-Host "🎉  Teste bem-sucedido! Cookie renovado." -ForegroundColor Green
} else {
    Write-Host ""
    Write-Host "❌  Teste falhou com código $($result.ExitCode)." -ForegroundColor Red
    Write-Host "   Verifique as credenciais no arquivo .env"
}
