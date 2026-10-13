$ErrorActionPreference = 'Stop'
$taskRoot = Split-Path $PSScriptRoot -Parent
$providerRoot = Join-Path $taskRoot '.local/providers'
$version = '26.8.0'
$zip = Join-Path $providerRoot "keycloak-$version.zip"
$install = Join-Path $providerRoot "keycloak-$version"
New-Item -ItemType Directory -Force $providerRoot | Out-Null
if (-not (Test-Path -LiteralPath (Join-Path $install 'bin/kc.bat'))) {
  Invoke-WebRequest -Uri "https://github.com/keycloak/keycloak/releases/download/$version/keycloak-$version.zip" -OutFile $zip
  Expand-Archive -LiteralPath $zip -DestinationPath $providerRoot
}
$configPath = Join-Path $taskRoot '.local/auth-config.json'
if (-not (Test-Path -LiteralPath $configPath)) {
  $secret = [Convert]::ToHexString([Security.Cryptography.RandomNumberGenerator]::GetBytes(32)).ToLowerInvariant()
  @{ baseUrl='http://127.0.0.1:8181'; realm='mhistree-local'; clientId='mhistree-server'; clientSecret=$secret } | ConvertTo-Json | Set-Content -LiteralPath $configPath
}
$settings = Get-Content -Raw -LiteralPath $configPath | ConvertFrom-Json
$realm = @{
  realm=$settings.realm; enabled=$true; sslRequired='none'; registrationAllowed=$false; loginWithEmailAllowed=$true; duplicateEmailsAllowed=$false; resetPasswordAllowed=$false; bruteForceProtected=$true
  clients=@(@{ clientId=$settings.clientId; secret=$settings.clientSecret; enabled=$true; publicClient=$false; serviceAccountsEnabled=$true; directAccessGrantsEnabled=$true; standardFlowEnabled=$false })
  users=@(@{ username='service-account-mhistree-server'; enabled=$true; serviceAccountClientId=$settings.clientId; clientRoles=@{ 'realm-management'=@('manage-users','view-users') } })
  components=@{ 'org.keycloak.userprofile.UserProfileProvider'=@(@{ providerId='declarative-user-profile'; config=@{ 'kc.user.profile.config'=@('{"attributes":[{"name":"username","required":{"roles":["user"]},"permissions":{"view":["admin","user"],"edit":["admin","user"]}},{"name":"email","validations":{"email":{}},"permissions":{"view":["admin","user"],"edit":["admin","user"]}}]}') } }) }
}
$imports=Join-Path $install 'data/import'
New-Item -ItemType Directory -Force $imports | Out-Null
$realm | ConvertTo-Json -Depth 15 | Set-Content -LiteralPath (Join-Path $imports 'mhistree-local-realm.json')
Write-Output 'Starting isolated synthetic Keycloak at loopback port8181. Secrets remain in ignored .local files. Ctrl+C stops this server.'
& (Join-Path $install 'bin/kc.bat') start-dev --http-host=127.0.0.1 --http-port=8181 --hostname=http://127.0.0.1:8181 --import-realm
