$siteDirectory = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location -LiteralPath $siteDirectory
node server.mjs
