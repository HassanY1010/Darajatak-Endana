# Ensure Running with Elevated Privileges (Administrator)
$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)

if (-not $isAdmin) {
    Write-Host "Elevating privileges to remove Database Scheduled Task..." -ForegroundColor Yellow
    $scriptPath = $MyInvocation.MyCommand.Path
    Start-Process powershell.exe -ArgumentList "-NoProfile -ExecutionPolicy Bypass -File `"$scriptPath`"" -Verb RunAs -Wait
    exit $LASTEXITCODE
}

[CmdletBinding()]
param (
    [string]$TaskName = "Darajatak-Endana Database Backup Agent"
)

Write-Host "====================================================" -ForegroundColor Yellow
Write-Host "  UNINSTALLING DARAJATAK-ENDANA DB BACKUP AGENT TASK" -ForegroundColor Yellow
Write-Host "====================================================" -ForegroundColor Yellow

$task = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue

if ($task) {
    if ($task.State -eq 'Running') {
        Write-Host "Stopping running task '$TaskName'..." -ForegroundColor Cyan
        Stop-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
        Start-Sleep -Seconds 2
    }

    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
    Write-Host "Scheduled Task '$TaskName' removed successfully." -ForegroundColor Green
} else {
    Write-Host "Task '$TaskName' is not registered in Windows Task Scheduler." -ForegroundColor Gray
}

Write-Host "====================================================" -ForegroundColor Yellow
