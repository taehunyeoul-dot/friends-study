# Friends 표현 추출 배치 스크립트 (headless claude -p)
#
# 사용법:
#   .\extract.ps1 -Ids s01e01,s01e02          # 특정 에피소드만
#   .\extract.ps1 -Limit 5                     # 미처리분 중 앞에서 5개
#   .\extract.ps1                              # 미처리분 전체 (227개)
#   .\extract.ps1 -Ids s01e01 -Force           # 이미 있어도 다시 추출
#   .\extract.ps1 -Model opus -Limit 1         # 모델 변경 (기본: sonnet)
#
# 결과: data\vocab\<id>.json  (이미 존재하는 에피소드는 자동 스킵 → 중단 후 재실행 가능)

param(
    [string[]]$Ids = @(),
    [int]$Limit = 0,
    [string]$Model = "sonnet",
    [switch]$Force
)

$ErrorActionPreference = "Stop"
$OutputEncoding = New-Object System.Text.UTF8Encoding($false)
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$Root = Split-Path $PSScriptRoot -Parent
$EpisodesDir = Join-Path $Root "data\episodes"
$VocabDir = Join-Path $Root "data\vocab"
$PromptTemplate = [System.IO.File]::ReadAllText((Join-Path $PSScriptRoot "extract_prompt.md"))

$Schema = @'
{"type":"object","properties":{"expressions":{"type":"array","items":{"type":"object","properties":{"expression":{"type":"string"},"dialogue":{"type":"string"},"speaker":{"type":"string"},"meaning":{"type":"string"},"nuance":{"type":"string"},"example":{"type":"string"}},"required":["expression","dialogue","speaker","meaning","nuance","example"]}}},"required":["expressions"]}
'@
# PowerShell이 네이티브 인자로 넘길 때 큰따옴표가 벗겨지므로 이스케이프 필요
$SchemaArg = $Schema -replace '"', '\"'

$manifest = Get-Content (Join-Path $EpisodesDir "manifest.json") -Raw -Encoding UTF8 | ConvertFrom-Json
$targets = $manifest
if ($Ids.Count -gt 0) { $targets = $manifest | Where-Object { $Ids -contains $_.id } }
if (-not $Force) { $targets = $targets | Where-Object { -not (Test-Path (Join-Path $VocabDir "$($_.id).json")) } }
if ($Limit -gt 0) { $targets = $targets | Select-Object -First $Limit }
$targets = @($targets)

if ($targets.Count -eq 0) { Write-Host "처리할 에피소드가 없습니다."; exit 0 }
Write-Host "대상: $($targets.Count)개 에피소드 / 모델: $Model"

$totalCost = 0.0
$done = 0
$failed = @()

foreach ($ep in $targets) {
    $epPath = Join-Path $EpisodesDir "$($ep.id).json"
    $epData = Get-Content $epPath -Raw -Encoding UTF8 | ConvertFrom-Json

    # 대본 렌더링: 장면 표시 + 대사만 (지문 제외)
    $sb = New-Object System.Text.StringBuilder
    foreach ($line in $epData.lines) {
        if ($line.t -eq "scene") { [void]$sb.AppendLine("[장면: $($line.text)]") }
        elseif ($line.t -eq "dialogue") { [void]$sb.AppendLine("$($line.speaker): $($line.text)") }
    }
    $prompt = $PromptTemplate + "`n에피소드: $($ep.code) - $($ep.title)`n`n" + $sb.ToString()

    $ok = $false
    for ($attempt = 1; $attempt -le 3 -and -not $ok; $attempt++) {
        Write-Host -NoNewline "[$($ep.id)] $($ep.title) (시도 $attempt) ... "
        try {
            $rawLines = $prompt | claude -p --model $Model --output-format json --json-schema $SchemaArg
            if ($LASTEXITCODE -ne 0) { throw "claude 종료 코드 $LASTEXITCODE" }
            $resp = ($rawLines -join "`n") | ConvertFrom-Json

            # structured_output 우선, 없으면 result 텍스트에서 JSON 파싱
            $data = $null
            if ($resp.PSObject.Properties['structured_output'] -and $resp.structured_output) {
                $data = $resp.structured_output
            } else {
                $text = $resp.result -replace '(?s)^.*?```(json)?\s*', '' -replace '(?s)```.*$', ''
                $data = $text | ConvertFrom-Json
            }

            # 검증
            if (-not $data.expressions -or $data.expressions.Count -lt 15) {
                throw "표현 수 부족: $($data.expressions.Count)"
            }
            foreach ($x in $data.expressions) {
                foreach ($f in 'expression','dialogue','speaker','meaning','nuance','example') {
                    if ([string]::IsNullOrWhiteSpace($x.$f)) { throw "빈 필드: $f" }
                }
            }

            $cost = 0.0
            if ($resp.PSObject.Properties['total_cost_usd']) { $cost = [double]$resp.total_cost_usd }
            $totalCost += $cost

            $out = [ordered]@{
                id          = $ep.id
                code        = $ep.code
                title       = $ep.title
                model       = $Model
                cost_usd    = [math]::Round($cost, 4)
                expressions = $data.expressions
            }
            $outPath = Join-Path $VocabDir "$($ep.id).json"
            [System.IO.File]::WriteAllText($outPath, ($out | ConvertTo-Json -Depth 5), (New-Object System.Text.UTF8Encoding($false)))
            Write-Host ("OK  {0}개 표현, `${1:N4}" -f $data.expressions.Count, $cost)
            $ok = $true
            $done++
        } catch {
            Write-Host "실패: $($_.Exception.Message)"
        }
    }
    if (-not $ok) { $failed += $ep.id }
}

Write-Host ""
Write-Host ("완료 {0}개 / 실패 {1}개 / 총 비용 `${2:N4}" -f $done, $failed.Count, $totalCost)
if ($failed.Count -gt 0) { Write-Host "실패 목록: $($failed -join ', ')" }
