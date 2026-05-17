' SureEdge — Inicia daemon de odds em segundo plano (sem janela)
' Duplo-clique para iniciar. Nenhuma janela sera aberta.

Dim oShell, oWMI, oProcs, oProc
Dim nodePath, scriptPath, workDir
Dim jaRodando

nodePath   = "C:\nvm4w\nodejs\node.exe"
scriptPath = "C:\Users\rmmic\OneDrive\Documentos\suredge-app\scripts\process-queue.mjs"
workDir    = "C:\Users\rmmic\OneDrive\Documentos\suredge-app\scripts"

Set oShell = CreateObject("WScript.Shell")

' Verifica se o daemon ja esta rodando (procura node.exe com o script)
jaRodando = False
Set oWMI   = GetObject("winmgmts:\\.\root\cimv2")
Set oProcs = oWMI.ExecQuery("SELECT * FROM Win32_Process WHERE Name='node.exe'")
For Each oProc In oProcs
    If InStr(LCase(oProc.CommandLine), "process-queue") > 0 Then
        jaRodando = True
    End If
Next

If jaRodando Then
    MsgBox "SureEdge daemon ja esta rodando em segundo plano.", vbInformation, "SureEdge"
Else
    ' Inicia o daemon sem janela (0 = oculto, False = nao aguarda)
    oShell.Run """" & nodePath & """ """ & scriptPath & """", 0, False
    WScript.Sleep 1500
    MsgBox "SureEdge daemon iniciado!" & Chr(10) & "Odds serao processadas em segundo plano.", vbInformation, "SureEdge"
End If
