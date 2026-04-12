
$path = 'f:\proyectos\Nostr explorer\src\features\graph\render\GraphSceneLayer.ts'
$lines = Get-Content -Path $path
$newLines = @()

# Part 1: Good lines until the end of the matching logic
for ($i = 0; $i -lt 1165; $i++) {
    $newLines += $lines[$i]
}

# Part 2: Insert the correct ending of applyFocusFade
$newLines += "      }"
$newLines += ""
$newLines += "      if (matched) {"
$newLines += "        return [color[0], color[1], color[2], alpha]"
$newLines += "      }"
$newLines += ""
$newLines += "      if (!renderConfig.showFocusFade) {"
$newLines += "        return [color[0], color[1], color[2], alpha]"
$newLines += "      }"
$newLines += ""
$newLines += "      // El factor original de escritorio era 0.05 (5% opacidad)."
$newLines += "      // En móviles subimos a 0.25 para que no desaparezca el contexto."
$newLines += "      const isMobile = isMobileDevicePerformanceProfile(devicePerformanceProfile as DevicePerformanceProfile)"
$newLines += "      const fadeFactor = isMobile ? 0.25 : 0.05"
$newLines += ""
$newLines += "      return [color[0], color[1], color[2], Math.round(alpha * fadeFactor)]"
$newLines += "    }"
$newLines += "    const edgeThickness = renderConfig.edgeThickness ?? 1"
$newLines += "    const arrowType = renderConfig.arrowType ?? 'none'"
$newLines += "    const baseReadyImagesByPubkey ="
$newLines += "      imageFrame.baseReadyImagesByPubkey ?? imageFrame.readyImagesByPubkey"

# Part 3: Skip bad lines and find where to resume
# Resume point: const hdReadyImagesByPubkey = imageFrame.hdReadyImagesByPubkey ?? {}
$resumeIndex = -1
for ($i = 1165; $i -lt $lines.Length; $i++) {
    if ($lines[$i] -like '*hdReadyImagesByPubkey = imageFrame.hdReadyImagesByPubkey ?? {}*') {
        $resumeIndex = $i
        break
    }
}

if ($resumeIndex -ne -1) {
    for ($i = $resumeIndex; $i -lt $lines.Length; $i++) {
        $newLines += $lines[$i]
    }
} else {
    Write-Error "Could not find resume point"
    exit 1
}

Set-Content -Path $path -Value $newLines -NoNewline
Write-Host "File successfully repaired"
