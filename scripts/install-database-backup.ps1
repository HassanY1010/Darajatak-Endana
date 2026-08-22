[CmdletBinding()]
param (
    [string]$TaskName = "Darajatak-Endana Database Backup Agent",
    [string]$ProjectDir = "D:\Darajatak-Endana",
    [string]$BackupDir = "D:\دراجتك عندنا Backup\Database"
)

Write-Host "====================================================" -ForegroundColor Cyan
Write-Host "  INSTALLING DARAJATAK-ENDANA DB BACKUP AGENT TASK" -ForegroundColor Cyan
Write-Host "====================================================" -ForegroundColor Cyan

# 1. Check Node.js executable
$nodePath = (Get-Command node -ErrorAction SilentlyContinue).Source
if (-not $nodePath) {
    if (Test-Path "C:\Program Files\nodejs\node.exe") {
        $nodePath = "C:\Program Files\nodejs\node.exe"
    } elseif (Test-Path "$env:LOCALAPPDATA\Programs\node\node.exe") {
        $nodePath = "$env:LOCALAPPDATA\Programs\node\node.exe"
    } else {
        Write-Error "Node.js executable was not found."
        exit 1
    }
}
Write-Host "[1/6] Node.js Executable found: $nodePath" -ForegroundColor Green

# 2. Check Project Directory & Entry Script
$agentScript = Join-Path $ProjectDir "src\database-backup\scheduler.js"
if (-not (Test-Path $agentScript)) {
    Write-Error "Database agent script not found at: $agentScript"
    exit 1
}
Write-Host "[2/6] Project Directory verified: $ProjectDir" -ForegroundColor Green

# 3. Ensure Backup Directories
$dirs = @(
    $BackupDir,
    (Join-Path $BackupDir "full"),
    (Join-Path $BackupDir "daily"),
    (Join-Path $BackupDir "weekly"),
    (Join-Path $BackupDir "monthly"),
    (Join-Path $BackupDir "manifests"),
    (Join-Path $BackupDir "logs"),
    (Join-Path $BackupDir "failures"),
    (Join-Path $BackupDir "temp")
)
foreach ($d in $dirs) {
    if (-not (Test-Path $d)) { New-Item -ItemType Directory -Path $d -Force | Out-Null }
}
Write-Host "[3/6] Database Backup Target Directories ready: $BackupDir" -ForegroundColor Green

# 4. Remove any existing task with same name
$existing = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
if ($existing) {
    Write-Host "[4/6] Removing existing Task '$TaskName' for clean reinstall..." -ForegroundColor Yellow
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
} else {
    Write-Host "[4/6] No previous task conflict found." -ForegroundColor Green
}

# 5. Define Task Action, Trigger, Principal, and Settings
$action = New-ScheduledTaskAction -Execute $nodePath -Argument "`"$agentScript`"" -WorkingDirectory $ProjectDir

# Trigger at System Startup with 45s delay (so network & image backup are initialized)
$trigger = New-ScheduledTaskTrigger -AtStartup
$trigger.Delay = "PT45S"

# Principal for current user / system
$currentUser = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
$principal = New-ScheduledTaskPrincipal -UserId $currentUser -LogonType Interactive -RunLevel Highest

# Settings: Allow restart on failure every 1 minute up to 5 times
$settings = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -StartWhenAvailable `
    -RestartCount 5 `
    -RestartInterval (New-TimeSpan -Minutes 1) `
    -ExecutionTimeLimit (New-TimeSpan -Days 0)

# 6. Register Task
Write-Host "[5/6] Registering Scheduled Task '$TaskName' in Windows Task Scheduler..." -ForegroundColor Cyan
Register-ScheduledTask `
    -TaskName $TaskName `
    -Action $action `
    -Trigger $trigger `
    -Principal $principal `
    -Settings $settings `
    -Description "Production-Grade PostgreSQL Database Backup & Disaster Recovery Agent for Darajatak-Endana." `
    -Force | Out-Null

# 7. Verification
$installedTask = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
if ($installedTask) {
    Write-Host "[6/6] Scheduled Task successfully registered and verified!" -ForegroundColor Green
    Write-Host "====================================================" -ForegroundColor Cyan
    Write-Host "Task Name:        $($installedTask.TaskName)"
    Write-Host "State:            $($installedTask.State)"
    Write-Host "Trigger:          At Startup (Delay: 45s)"
    Write-Host "Executable:       $nodePath"
    Write-Host "Script:           $agentScript"
    Write-Host "Working Directory:$ProjectDir"
    Write-Host "Principal:        $currentUser"
    Write-Host "Restart Policy:   5 attempts every 1 minute"
    Write-Host "====================================================" -ForegroundColor Cyan
} else {
    Write-Error "Failed to verify Scheduled Task registration."
    exit 1
}
