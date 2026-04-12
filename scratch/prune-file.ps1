
$path = 'f:\proyectos\Nostr explorer\src\features\graph\render\GraphSceneLayer.ts'
$lines = Get-Content -Path $path
$newLines = @()

# We want to keep lines until 1165
for ($i = 0; $i -lt 1165; $i++) {
    $newLines += $lines[$i]
}

# Now we skip the duplicated parts.
# The next correct line after the applyFocusFade logic should be around the original line 1178 (relative to previous state).
# Let's find the line "const edgeThickness = renderConfig.edgeThickness ?? 1"
$found = $false
for ($i = 1165; $i -lt $lines.Length; $i++) {
    if ($lines[$i] -like '*edgeThickness = renderConfig.edgeThickness ?? 1*') {
        $startingIndex = $i
        $found = $true
        break
    }
}

if ($found) {
    for ($i = $startingIndex; $i -lt $lines.Length; $i++) {
        $newLines += $lines[$i]
    }
} else {
    Write-Error "Could not find restoration point"
    exit 1
}

Set-Content -Path $path -Value $newLines -NoNewline
Write-Host "File pruned and restored"
