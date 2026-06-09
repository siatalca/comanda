$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectRoot = Split-Path -Parent $scriptDir
$configPath = Join-Path $projectRoot "desktop.config.json"
$templatePath = Join-Path $projectRoot "desktop.config.caja.example.json"

if (-not (Test-Path -LiteralPath $configPath)) {
    Copy-Item -LiteralPath $templatePath -Destination $configPath
    Write-Host "Se creo desktop.config.json desde desktop.config.caja.example.json."
    Write-Host "Edita usuario, clave, nombre de base e impresora si corresponde; luego vuelve a ejecutar este script."
    exit 1
}

Set-Location $projectRoot

if (-not (Test-Path -LiteralPath (Join-Path $projectRoot "node_modules"))) {
    Write-Warning "No existe node_modules. Ejecuta primero: npm install"
}

npm run desktop
