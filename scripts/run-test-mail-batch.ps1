param([Parameter(Mandatory=$true)][string]$Targets, [switch]$Execute)
$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot
Set-Location $repo
if (-not (Test-Path -LiteralPath $Targets)) { throw '対象IDファイルが見つかりません' }
$args = @('run','graph:test','--','--targets=' + $Targets)
if ($Execute) { $args += '--execute' }
& npm.cmd @args
exit $LASTEXITCODE
