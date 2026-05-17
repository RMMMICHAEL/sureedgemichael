# setup-task-scheduler.ps1
# Registra as tarefas automaticas do SureEdge no Agendador de Tarefas:
#   SureEdge-Events  — renew-cookie.mjs (lista de eventos) 1x ao dia as 07:00 + ao ligar
#   SureEdge-Queue   — process-queue.mjs (fila de odds on-demand) a cada 2 minutos
#
# Execute UMA VEZ como Administrador:
#   Right-click PowerShell -> "Executar como administrador"
#   cd "C:\Users\rmmic\OneDrive\Documentos\suredge-app\scripts"
#   Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
#   .\setup-task-scheduler.ps1

$scriptDir       = Split-Path -Parent $MyInvocation.MyCommand.Path
$eventsScript    = Join-Path $scriptDir "renew-cookie.mjs"
$queueScript     = Join-Path $scriptDir "process-queue.mjs"
$envFile         = Join-Path $scriptDir ".env"
$eventsTaskName  = "SureEdge-Events"
$queueTaskName   = "SureEdge-Queue"
$oldTaskName     = "SureEdge-RenewCookie"  # tarefa legada a remover

# -- Encontra o Node.js (funciona mesmo em sessao de Admin) -------------------

$nodePath = $null

# 1. Tenta PATH normal
$nodeCmd = Get-Command node -ErrorAction SilentlyContinue
if ($nodeCmd) { $nodePath = $nodeCmd.Source }

# 2. Busca nos caminhos mais comuns
if (-not $nodePath) {
    $candidates = @(
        "$env:ProgramFiles\nodejs\node.exe",
        "${env:ProgramFiles(x86)}\nodejs\node.exe",
        "$env:LOCALAPPDATA\Programs\nodejs\node.exe",
        "C:\Program Files\nodejs\node.exe",
        "C:\Program Files (x86)\nodejs\node.exe"
    )
    foreach ($c in $candidates) {
        if (Test-Path $c) { $nodePath = $c; break }
    }
}

# 3. where.exe como ultimo recurso
if (-not $nodePath) {
    $whereResult = & where.exe node 2>$null
    if ($whereResult) { $nodePath = ($whereResult | Select-Object -First 1).Trim() }
}

if (-not $nodePath) {
    Write-Host "ERRO: Node.js nao encontrado." -ForegroundColor Red
    Write-Host "Instale em https://nodejs.org e tente novamente."
    exit 1
}

Write-Host "Node.js: $nodePath" -ForegroundColor Gray

# -- Valida pre-requisitos ----------------------------------------------------

if (-not (Test-Path $envFile)) {
    Write-Host ""
    Write-Host "AVISO: Arquivo .env nao encontrado em: $envFile" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Crie o arquivo copiando o exemplo:" -ForegroundColor Cyan
    Write-Host "   copy `"$scriptDir\.env.example`" `"$envFile`"" -ForegroundColor White
    Write-Host ""
    Write-Host "Depois edite o .env com suas credenciais e rode este script novamente."
    exit 1
}

# -- Instala dependencias npm -------------------------------------------------

Write-Host "Instalando dependencias npm..." -ForegroundColor Cyan
Push-Location $scriptDir
& $nodePath (Join-Path (Split-Path $nodePath) "npm.cmd") install --silent 2>$null
if (-not $?) {
    # tenta npm direto no PATH
    npm install --silent 2>$null
}
Pop-Location

# -- Configuracoes comuns -----------------------------------------------------

$commonSettings = New-ScheduledTaskSettingsSet `
    -ExecutionTimeLimit (New-TimeSpan -Minutes 10) `
    -StartWhenAvailable `
    -RunOnlyIfNetworkAvailable `
    -MultipleInstances IgnoreNew

$principal = New-ScheduledTaskPrincipal `
    -UserId $env:USERNAME `
    -LogonType Interactive `
    -RunLevel Limited

# -- Remove tarefas antigas se existirem --------------------------------------

foreach ($oldName in @($oldTaskName, $eventsTaskName, $queueTaskName)) {
    if (Get-ScheduledTask -TaskName $oldName -ErrorAction SilentlyContinue) {
        Unregister-ScheduledTask -TaskName $oldName -Confirm:$false
        Write-Host "Tarefa '$oldName' removida." -ForegroundColor Gray
    }
}

# -- Tarefa 1: SureEdge-Events (renew-cookie.mjs) — 1x ao dia ----------------
# Roda as 07:00 + ao ligar o PC

$eventsAction = New-ScheduledTaskAction `
    -Execute $nodePath `
    -Argument "`"$eventsScript`"" `
    -WorkingDirectory $scriptDir

$eventsTriggerDaily  = New-ScheduledTaskTrigger -Daily -At "07:00"
$eventsTriggerLogon  = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
$eventsTrigger = @($eventsTriggerDaily, $eventsTriggerLogon)

try {
    Register-ScheduledTask `
        -TaskName   $eventsTaskName `
        -Action     $eventsAction `
        -Trigger    $eventsTrigger `
        -Settings   $commonSettings `
        -Principal  $principal `
        -Description "SureEdge: busca lista de eventos do dia (1x ao dia as 07:00 + logon)" | Out-Null

    Write-Host ""
    Write-Host "OK: Tarefa '$eventsTaskName' registrada!" -ForegroundColor Green
    Write-Host "   Roda: diariamente as 07:00 + ao ligar o PC"
    Write-Host "   Script: $eventsScript"
} catch {
    Write-Host "ERRO ao registrar '$eventsTaskName': $_" -ForegroundColor Red
    exit 1
}

# -- Tarefa 2: SureEdge-Queue (process-queue.mjs) — daemon no logon -----------
# O script agora e um daemon (loop infinito, verifica a cada 20s).
# Task Scheduler so precisa inicia-lo no logon — ele fica rodando sozinho.

$queueAction = New-ScheduledTaskAction `
    -Execute $nodePath `
    -Argument "`"$queueScript`"" `
    -WorkingDirectory $scriptDir

$queueTrigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME

$queueSettings = New-ScheduledTaskSettingsSet `
    -ExecutionTimeLimit (New-TimeSpan -Hours 23) `
    -StartWhenAvailable `
    -RunOnlyIfNetworkAvailable `
    -MultipleInstances IgnoreNew

try {
    Register-ScheduledTask `
        -TaskName   $queueTaskName `
        -Action     $queueAction `
        -Trigger    $queueTrigger `
        -Settings   $queueSettings `
        -Principal  $principal `
        -Description "SureEdge: daemon de odds on-demand (verifica fila a cada 20s)" | Out-Null

    Write-Host ""
    Write-Host "OK: Tarefa '$queueTaskName' registrada!" -ForegroundColor Green
    Write-Host "   Roda: ao ligar o PC (daemon — verifica fila a cada 20s)"
    Write-Host "   Script: $queueScript"
} catch {
    Write-Host "ERRO ao registrar '$queueTaskName': $_" -ForegroundColor Red
    exit 1
}

# -- Resumo -------------------------------------------------------------------

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host " SureEdge Task Scheduler configurado!  " -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "  $eventsTaskName  — lista de eventos (1x ao dia)" -ForegroundColor White
Write-Host "  $queueTaskName   — odds on-demand (daemon, verifica a cada 20s)" -ForegroundColor White
Write-Host ""
Write-Host "Node: $nodePath" -ForegroundColor Gray
Write-Host ""

# -- Roda renew-cookie.mjs agora para popular eventos ------------------------

Write-Host "Rodando $eventsTaskName agora para popular os eventos..." -ForegroundColor Cyan
Write-Host ""

$result = Start-Process `
    -FilePath $nodePath `
    -ArgumentList "`"$eventsScript`"" `
    -WorkingDirectory $scriptDir `
    -Wait -PassThru -NoNewWindow

if ($result.ExitCode -eq 0) {
    Write-Host ""
    Write-Host "SUCESSO! Eventos carregados. Acesse o site para ver." -ForegroundColor Green
    Write-Host ""
    Write-Host "O process-queue.mjs sera iniciado agora como daemon..." -ForegroundColor Gray
    Write-Host "Odds serao buscadas em ate 20s quando voce abrir um evento no site." -ForegroundColor Gray
} else {
    Write-Host ""
    Write-Host "ERRO: codigo $($result.ExitCode). Verifique o arquivo .env" -ForegroundColor Red
}
