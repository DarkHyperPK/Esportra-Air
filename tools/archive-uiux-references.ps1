$ErrorActionPreference = 'Stop'
function Get-ReferenceHash([string]$LiteralPath) {
    $stream = [System.IO.File]::OpenRead($LiteralPath)
    $digest = [System.Security.Cryptography.SHA256]::Create()
    try { return [BitConverter]::ToString($digest.ComputeHash($stream)).Replace('-','') }
    finally { $digest.Dispose(); $stream.Dispose() }
}
$workspacePath = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
if ($workspacePath -ne 'D:\Esportra-Air') { throw 'Unexpected workspace; refusing reference retirement.' }
$designRoot = (Resolve-Path -LiteralPath (Join-Path $workspacePath 'design')).ProviderPath
$names = @('PROJ-061-control-room-v3','PROJ-061-esportra-air-uiux','PROJ-061-system-grounded','PROJ-061-control-room-v3.zip','PROJ-061-esportra-air-uiux.zip','esportra-air-screen-designs-2026-10-13.zip')
$targets = @()
$sourceFiles = @()
foreach ($name in $names) {
    $candidate = Join-Path $designRoot $name
    if (-not (Test-Path -LiteralPath $candidate)) { continue }
    $resolved = (Resolve-Path -LiteralPath $candidate).ProviderPath
    if (-not $resolved.StartsWith($designRoot + '\',[StringComparison]::OrdinalIgnoreCase) -or [System.IO.Path]::GetDirectoryName($resolved) -ne $designRoot) { throw 'Target escaped the explicitly named design directory.' }
    $item = Get-Item -LiteralPath $resolved -Force
    if (($item.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) { throw 'Reference contains a link; refusing recursive retirement.' }
    $targets += $resolved
    if ($item.PSIsContainer) {
        $children = @(Get-ChildItem -LiteralPath $resolved -Recurse -Force)
        if (@($children | Where-Object { ($_.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0 }).Count -gt 0) { throw 'Nested links are not allowed in the reference archive.' }
        $sourceFiles += @($children | Where-Object { -not $_.PSIsContainer })
    } else { $sourceFiles += $item }
}
if ($targets.Count -eq 0) { Write-Output 'Alternate UI references already retired.'; exit 0 }
$manifestPath = Join-Path $designRoot 'implemented\manifest.json'
$manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
if ($manifest.groups.Count -ne 26 -or $manifest.screenshots -lt 79) { throw 'The complete A-Z implemented reference must exist before retirement.' }
$indexHash = (Get-ReferenceHash (Join-Path $workspacePath 'index.html')).ToLowerInvariant()
if ($indexHash -ne 'c12b4442c8667aa7849833af6ef4b3d20f7e83af7be00f3ba3291132af05e0b3') { throw 'Original index changed; refusing to retire references.' }
$archiveDir = Join-Path $workspacePath 'docs\archive'
New-Item -ItemType Directory -Path $archiveDir -Force | Out-Null
$archivePath = Join-Path $archiveDir 'retired-uiux-2026-10-14.zip'
if (Test-Path -LiteralPath $archivePath) { throw 'Archive already exists; inspect it before reconciling.' }
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem
$writingZip = [System.IO.Compression.ZipFile]::Open($archivePath,[System.IO.Compression.ZipArchiveMode]::Create)
try {
    foreach ($sourceFile in $sourceFiles) {
        $relative = $sourceFile.FullName.Substring($designRoot.Length + 1).Replace('\','/')
        [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($writingZip,$sourceFile.FullName,$relative,[System.IO.Compression.CompressionLevel]::Optimal) | Out-Null
    }
} finally { $writingZip.Dispose() }
$zip = [System.IO.Compression.ZipFile]::OpenRead($archivePath)
try {
    $entries = @{}
    foreach ($entry in $zip.Entries) { $entries[$entry.FullName.Replace('\','/')] = $entry }
    foreach ($sourceFile in $sourceFiles) {
        $relative = $sourceFile.FullName.Substring($designRoot.Length + 1).Replace('\','/')
        $entry = $entries[$relative]
        if ($null -eq $entry -or $entry.Length -ne $sourceFile.Length) { throw ('Archive entry mismatch: ' + $relative) }
        $stream = $entry.Open()
        $digest = [System.Security.Cryptography.SHA256]::Create()
        try {
            $entryHash = [BitConverter]::ToString($digest.ComputeHash($stream)).Replace('-','')
            if ($entryHash -ne (Get-ReferenceHash $sourceFile.FullName)) { throw ('Archive hash mismatch: ' + $relative) }
        } finally { $digest.Dispose(); $stream.Dispose() }
    }
} finally { $zip.Dispose() }
$archiveHash = (Get-ReferenceHash $archivePath).ToLowerInvariant()
# Each absolute target was checked as a named direct child of D:\Esportra-Air\design;
# every archived file was read back and hash-verified before this removal.
foreach ($target in $targets) {
    if ([System.IO.Path]::GetDirectoryName($target) -ne $designRoot) { throw 'Final target check failed.' }
    Remove-Item -LiteralPath $target -Recurse -Force
}
$report = [ordered]@{date='2026-10-14';retiredNames=$names;verifiedFiles=$sourceFiles.Count;archive='docs/archive/retired-uiux-2026-10-14.zip';archiveSha256=$archiveHash;originalIndexSha256=$indexHash;activeReference='design/implemented';originalScreensRetained=$true}
$report | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath (Join-Path $archiveDir 'uiux-retirement-2026-10-14.json') -Encoding UTF8
$report | ConvertTo-Json -Depth 4 -Compress
