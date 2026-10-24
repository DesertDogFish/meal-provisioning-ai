# =====================================================================
#  Поиск и лечение BOM + несогласованных переводов строк
#  Именно они ломают replace_in_file: old_text не совпадает побайтово.
#
#  Только диагностика:  .\fix-encoding.ps1
#  Диагностика + починка: .\fix-encoding.ps1 -Fix
#  Починить и переводы строк: .\fix-encoding.ps1 -Fix -NormalizeEol lf
#
#  Путь к проекту поправьте ниже.
# =====================================================================

param(
    [string]$Project = "C:\Users\Oleg\IdeaProjects\meal-provisioning-ai",
    [switch]$Fix,
    [ValidateSet("lf","crlf","")]
    [string]$NormalizeEol = ""
)

$ErrorActionPreference = "Stop"

# Что сканируем. target/node_modules не трогаем -- они огромные и генерируемые.
$Include = @('*.java','*.ts','*.tsx','*.js','*.jsx','*.json','*.xml','*.yml','*.yaml',
             '*.properties','*.sql','*.md','*.html','*.css','*.gradle','*.txt','*.env',
             'Dockerfile*','*.jinja','*.sh','*.bat','*.ps1')
$Exclude = '\\target\\|\\node_modules\\|\\build\\|\\dist\\|\\.git\\|\\.idea\\|\\out\\'

Write-Host ""
Write-Host "Проект: $Project" -ForegroundColor Cyan
if (-not (Test-Path $Project)) { Write-Host "ПАПКА НЕ НАЙДЕНА. Поправьте -Project." -ForegroundColor Red; exit 1 }

$Files = Get-ChildItem -Path $Project -Recurse -File -Include $Include -ErrorAction SilentlyContinue |
         Where-Object { $_.FullName -notmatch $Exclude }

Write-Host "Просканировано файлов: $($Files.Count)"
Write-Host ""

# ---------------------------------------------------------------------
# 1. BOM
# ---------------------------------------------------------------------
$BomUtf8   = [byte[]](0xEF,0xBB,0xBF)
$BomUtf16L = [byte[]](0xFF,0xFE)
$BomUtf16B = [byte[]](0xFE,0xFF)

function Get-BomType([string]$Path) {
    $fs = [System.IO.File]::OpenRead($Path)
    try {
        $b = New-Object byte[] 4
        $n = $fs.Read($b, 0, 4)
        if ($n -lt 2) { return $null }
        if ($n -ge 3 -and $b[0] -eq 0xEF -and $b[1] -eq 0xBB -and $b[2] -eq 0xBF) { return 'utf8' }
        if ($b[0] -eq 0xFF -and $b[1] -eq 0xFE) { return 'utf16le' }
        if ($b[0] -eq 0xFE -and $b[1] -eq 0xFF) { return 'utf16be' }
        return $null
    } finally { $fs.Close() }
}

$WithBom = @()
foreach ($f in $Files) {
    $t = Get-BomType $f.FullName
    if ($t) { $WithBom += [pscustomobject]@{ File = $f; Type = $t } }
}

Write-Host "=== 1. Файлы с BOM ===" -ForegroundColor Cyan
if ($WithBom.Count -eq 0) {
    Write-Host "  BOM не найден ни в одном файле." -ForegroundColor Green
} else {
    Write-Host "  НАЙДЕНО: $($WithBom.Count)" -ForegroundColor Red
    foreach ($e in $WithBom) {
        $rel = $e.File.FullName.Substring($Project.Length).TrimStart('\')
        Write-Host "    [$($e.Type)] $rel" -ForegroundColor Yellow
    }
    Write-Host ""
    Write-Host "  Почему это ломает replace_in_file:" -ForegroundColor White
    Write-Host "    Cline показывает модели содержимое БЕЗ BOM, а сравнивает old_text"
    Write-Host "    с файлом ПОБАЙТОВО, где BOM есть. Совпадение на первой строке"
    Write-Host "    невозможно в принципе -- невидимые 3 байта в начале всё портят."
}

# ---------------------------------------------------------------------
# 2. Переводы строк
# ---------------------------------------------------------------------
Write-Host ""
Write-Host "=== 2. Переводы строк ===" -ForegroundColor Cyan

$Stats = @{ lf = 0; crlf = 0; mixed = 0; none = 0 }
$Mixed = @()

foreach ($f in $Files) {
    if ($f.Length -gt 20MB) { continue }
    $bytes = [System.IO.File]::ReadAllBytes($f.FullName)
    $crlf = 0; $lf = 0
    for ($i = 0; $i -lt $bytes.Length; $i++) {
        if ($bytes[$i] -eq 0x0A) {
            if ($i -gt 0 -and $bytes[$i-1] -eq 0x0D) { $crlf++ } else { $lf++ }
        }
    }
    if ($crlf -gt 0 -and $lf -gt 0) {
        $Stats.mixed++
        $Mixed += [pscustomobject]@{
            Rel = $f.FullName.Substring($Project.Length).TrimStart('\')
            CRLF = $crlf; LF = $lf
        }
    } elseif ($crlf -gt 0) { $Stats.crlf++ }
    elseif ($lf -gt 0)     { $Stats.lf++ }
    else                   { $Stats.none++ }
}

Write-Host "  только LF        : $($Stats.lf)"
Write-Host "  только CRLF      : $($Stats.crlf)"
Write-Host "  СМЕШАННЫЕ в файле: $($Stats.mixed)" -ForegroundColor $(if ($Stats.mixed) { 'Red' } else { 'Green' })
Write-Host "  без переводов    : $($Stats.none)"

if ($Mixed.Count -gt 0) {
    Write-Host ""
    Write-Host "  Смешанные переводы строк -- вторая по частоте причина," -ForegroundColor Yellow
    Write-Host "  по которой old_text не совпадает:"
    foreach ($m in ($Mixed | Select-Object -First 15)) {
        Write-Host "    $($m.Rel)   CRLF=$($m.CRLF) LF=$($m.LF)" -ForegroundColor DarkYellow
    }
    if ($Mixed.Count -gt 15) { Write-Host "    ... и ещё $($Mixed.Count - 15)" -ForegroundColor DarkYellow }
}

# ---------------------------------------------------------------------
# 3. Проверка git (чтобы откат был возможен)
# ---------------------------------------------------------------------
Write-Host ""
Write-Host "=== 3. Состояние git ===" -ForegroundColor Cyan
Push-Location $Project
try {
    $Dirty = (git status --porcelain 2>$null)
    if ($LASTEXITCODE -ne 0) {
        Write-Host "  Это не git-репозиторий (или git не в PATH)." -ForegroundColor Yellow
        Write-Host "  БЕЗ git починка необратима. Сначала сделайте копию папки." -ForegroundColor Yellow
        $Safe = $false
    } elseif ($Dirty) {
        $n = ($Dirty | Measure-Object).Count
        Write-Host "  В рабочей копии $n незакоммиченных изменений." -ForegroundColor Yellow
        Write-Host "  Рекомендуется закоммитить ДО починки, чтобы был откат." -ForegroundColor Yellow
        $Safe = $false
    } else {
        Write-Host "  Рабочая копия чистая -- откат через git checkout доступен." -ForegroundColor Green
        $Safe = $true
    }
} finally { Pop-Location }

# ---------------------------------------------------------------------
# 4. Починка
# ---------------------------------------------------------------------
if (-not $Fix) {
    Write-Host ""
    Write-Host "=== Диагностика завершена ===" -ForegroundColor Cyan
    Write-Host "  Чтобы починить BOM:            .\fix-encoding.ps1 -Fix"
    Write-Host "  Чтобы ещё и переводы строк:    .\fix-encoding.ps1 -Fix -NormalizeEol lf"
    Write-Host ""
    Write-Host "  -NormalizeEol lf   -- для Maven/Java и React обычно lf" -ForegroundColor DarkGray
    Write-Host "  -NormalizeEol crlf -- если в команде все на Windows" -ForegroundColor DarkGray
    Write-Host "  Сначала закоммитьте изменения в git!" -ForegroundColor Yellow
    exit 0
}

Write-Host ""
Write-Host "=== ПОЧИНКА ===" -ForegroundColor Cyan
if (-not $Safe) {
    Write-Host "  git-рабочая копия не чистая. Прервано." -ForegroundColor Red
    Write-Host "  Закоммитьте или сделайте резервную копию, затем повторите." -ForegroundColor Yellow
    exit 1
}

$FixedBom = 0
foreach ($e in $WithBom) {
    $p = $e.File.FullName
    $bytes = [System.IO.File]::ReadAllBytes($p)
    $skip = switch ($e.Type) { 'utf8' { 3 } 'utf16le' { 2 } 'utf16be' { 2 } }

    if ($bytes.Length -le $skip) {
        Write-Host "    пропущен (в файле только BOM): $($e.File.Name)" -ForegroundColor DarkYellow
        continue
    }
    if ($e.Type -eq 'utf8') {
        # просто отрезаем 3 байта BOM, остальное не трогаем
        [System.IO.File]::WriteAllBytes($p, $bytes[$skip..($bytes.Length-1)])
    } else {
        # UTF-16 -> перекодируем в UTF-8 без BOM
        $enc = if ($e.Type -eq 'utf16le') { [Text.Encoding]::Unicode } else { [Text.Encoding]::BigEndianUnicode }
        $text = $enc.GetString($bytes, $skip, $bytes.Length - $skip)
        [System.IO.File]::WriteAllText($p, $text, (New-Object Text.UTF8Encoding($false)))
        Write-Host "    перекодирован из $($e.Type) в UTF-8: $($e.File.Name)" -ForegroundColor DarkYellow
    }
    $FixedBom++
}
Write-Host "  BOM снят с файлов: $FixedBom" -ForegroundColor Green

if ($NormalizeEol) {
    $FixedEol = 0
    foreach ($f in $Files) {
        if ($f.Length -gt 20MB) { continue }
        $p = $f.FullName
        $text = [System.IO.File]::ReadAllText($p)
        $orig = $text
        # нормализуем: сначала все в LF, потом при надобности в CRLF
        $text = $text -replace "`r`n", "`n"
        if ($NormalizeEol -eq 'crlf') { $text = $text -replace "`n", "`r`n" }
        if ($text -ne $orig) {
            [System.IO.File]::WriteAllText($p, $text, (New-Object Text.UTF8Encoding($false)))
            $FixedEol++
        }
    }
    Write-Host "  Переводы строк приведены к $NormalizeEol в файлах: $FixedEol" -ForegroundColor Green
}

Write-Host ""
Write-Host "Готово. Проверьте:  git diff --stat" -ForegroundColor Green
Write-Host "Если всё в порядке -- коммитьте. Если нет -- git checkout ." -ForegroundColor Green
