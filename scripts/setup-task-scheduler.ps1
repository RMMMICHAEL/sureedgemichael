# setup-task-scheduler.ps1
# Registra a renovacao automatica de cookie + cache no Agendador de Tarefas.
# Execute UMA VEZ como Administrador:
#   Right-click PowerShell -> "Executar como administrador"
#   cd "C:\Users\rmmic\OneDrive\Documentos\suredge-app\scripts"
#   Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
#   .\setup-task-scheduler.ps1

$scriptDir  = Split-Path -Parent $MyInvocation.MyCommand.Path
$scriptPath = Join-Path $scriptDir "renew-cookie.mjs"
$envFile    = Join-Path $scriptDir ".env"
$taskName   = "SureEdge-RenewCookie"

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

# -- Monta o agendamento ------------------------------------------------------

$action = New-ScheduledTaskAction `
    -Execute $nodePath `
    -Argument "`"$scriptPath`"" `
    -WorkingDirectory $scriptDir

# Dois triggers: roda ao ligar/reiniciar o PC E a cada 30 minutos
$triggerLogon  = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
$triggerRepeat = New-ScheduledTaskTrigger `
    -RepetitionInterval (New-TimeSpan -Minutes 30) `
    -Once -At (Get-Date).AddMinutes(2)
$trigger = @($triggerLogon, $triggerRepeat)

$settings = New-ScheduledTaskSettingsSet `
    -ExecutionTimeLimit (New-TimeSpan -Minutes 10) `
    -StartWhenAvailable `
    -RunOnlyIfNetworkAvailable `
    -MultipleInstances IgnoreNew

$principal = New-ScheduledTaskPrincipal `
    -UserId $env:USERNAME `
    -LogonType Interactive `
    -RunLevel Limited

# -- Remove tarefa antiga se existir ------------------------------------------

if (Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue) {
    Unregister-ScheduledTask -TaskName $taskName -Confirm:$false
    Write-Host "Tarefa antiga removida." -ForegroundColor Gray
}

# -- Registra nova tarefa -----------------------------------------------------

try {
    Register-ScheduledTask `
        -TaskName   $taskName `
        -Action     $action `
        -Trigger    $trigger `
        -Settings   $settings `
        -Principal  $principal `
        -Description "Renova cookie + cache eventos/odds (SureEdge) a cada 30 min" | Out-Null

    Write-Host ""
    Write-Host "OK: Tarefa '$taskName' registrada!" -ForegroundColor Green
    Write-Host ""
    Write-Host "   Roda: ao ligar o PC + a cada 30 minutos"
    Write-Host "   Node: $nodePath"
    Write-Host "   Script: $scriptPath"
    Write-Host ""
} catch {
    Write-Host "ERRO ao registrar tarefa: $_" -ForegroundColor Red
    exit 1
}

# -- Roda agora para testar ---------------------------------------------------

Write-Host "Rodando agora para popular o cache..." -ForegroundColor Cyan
Write-Host ""

$result = Start-Process `
    -FilePath $nodePath `
    -ArgumentList "`"$scriptPath`"" `
    -WorkingDirectory $scriptDir `
    -Wait -PassThru -NoNewWindow

if ($result.ExitCode -eq 0) {
    Write-Host ""
    Write-Host "SUCESSO! Cache populado. Acesse o site para ver os eventos." -ForegroundColor Green
} else {
    Write-Host ""
    Write-Host "ERRO: codigo $($result.ExitCode). Verifique o arquivo .env" -ForegroundColor Red
}
