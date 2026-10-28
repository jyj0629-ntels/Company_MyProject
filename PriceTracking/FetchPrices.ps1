<#
 식재료 최저가 자동 수집 - Windows 작업 스케줄러 실행용 PowerShell 스크립트

 동작:
   1) items.json 을 읽어 등록된 식재료 목록을 가져옵니다.
   2) 각 식재료를 네이버 쇼핑에서 "낮은가격순"으로 조회해 최저가를 구합니다.
   3) 결과를 prices.json 에 저장합니다. (화면 index.html 이 이 파일을 읽어 표시)

 수집 방식: 네이버 개발자센터 쇼핑 검색 오픈API (sort=asc, 낮은가격순)
            config.json 에 NAVER_CLIENT_ID / NAVER_CLIENT_SECRET 필요

 사용법:
   .\FetchPrices.ps1              # 평일/주말 구분 없이 1회 수집 (스케줄러용)
   .\FetchPrices.ps1 -Action Test # 즉시 1회 수집 + 상세 로그
#>

param(
    [ValidateSet('Run', 'Test')]
    [string]$Action = 'Run'
)

$ErrorActionPreference = 'Stop'

$ScriptDir   = Split-Path -Parent $MyInvocation.MyCommand.Path
$ItemsPath   = Join-Path $ScriptDir 'items.json'
$PricesPath  = Join-Path $ScriptDir 'prices.json'
$ConfigPath  = Join-Path $ScriptDir 'config.json'
$LogPath     = Join-Path $ScriptDir 'fetch.log'

function Write-Log {
    param([string]$Message)
    $ts = (Get-Date).ToString('yyyy-MM-dd HH:mm:ss')
    "$ts $Message" | Add-Content -Path $LogPath -Encoding UTF8
    if ($Action -eq 'Test') { Write-Host "$ts $Message" }
}

function Get-KoreaNow {
    $tz = [System.TimeZoneInfo]::FindSystemTimeZoneById('Korea Standard Time')
    return [System.TimeZoneInfo]::ConvertTime([DateTime]::UtcNow, $tz)
}

function Get-Config {
    if (-not (Test-Path $ConfigPath)) {
        throw "config.json 이 없습니다. config.example.json 을 복사해 만들고 네이버 Client ID/Secret 을 입력하세요: $ConfigPath"
    }
    return Get-Content -Path $ConfigPath -Raw -Encoding UTF8 | ConvertFrom-Json
}

function Assert-Config {
    param($Config)
    if (-not $Config.NAVER_CLIENT_ID -or $Config.NAVER_CLIENT_ID -eq 'PUT_YOUR_CLIENT_ID_HERE') {
        throw 'config.json 의 NAVER_CLIENT_ID 값을 입력하세요. (네이버 개발자센터에서 발급)'
    }
    if (-not $Config.NAVER_CLIENT_SECRET -or $Config.NAVER_CLIENT_SECRET -eq 'PUT_YOUR_CLIENT_SECRET_HERE') {
        throw 'config.json 의 NAVER_CLIENT_SECRET 값을 입력하세요. (네이버 개발자센터에서 발급)'
    }
}

function Get-Items {
    if (-not (Test-Path $ItemsPath)) {
        throw "items.json 이 없습니다: $ItemsPath (화면에서 '내보내기'로 생성하세요)"
    }
    $json = Get-Content -Path $ItemsPath -Raw -Encoding UTF8 | ConvertFrom-Json
    return $json.items
}

# 네이버 쇼핑 검색 오픈API (낮은가격순 sort=asc)
function Get-LowestPrice-OpenApi {
    param($Config, [string]$Query)

    $headers = @{
        'X-Naver-Client-Id'     = $Config.NAVER_CLIENT_ID
        'X-Naver-Client-Secret' = $Config.NAVER_CLIENT_SECRET
    }
    $uri = "https://openapi.naver.com/v1/search/shop.json?query=$([uri]::EscapeDataString($Query))&display=10&sort=asc"
    $res = Invoke-RestMethod -Uri $uri -Headers $headers -Method Get -TimeoutSec 20

    if (-not $res.items -or $res.items.Count -eq 0) { return $null }

    $lowest = $null
    foreach ($it in $res.items) {
        $p = 0
        [int]::TryParse(("$($it.lprice)"), [ref]$p) | Out-Null
        if ($p -gt 0 -and ($null -eq $lowest -or $p -lt $lowest.price)) {
            $title = ($it.title -replace '<[^>]+>', '')
            $lowest = [PSCustomObject]@{ price = $p; title = $title; link = $it.link }
        }
    }
    return $lowest
}

# ---- 실행 ----
try {
    $config = Get-Config
    Assert-Config -Config $config
    $items  = Get-Items
    $now    = Get-KoreaNow
    $stamp  = $now.ToString('yyyy-MM-dd HH:mm')

    Write-Log "수집 시작: $($items.Count)개 종목 (네이버 오픈API)"

    # 기존 가격 로드 (이력 누적용)
    $priceMap = @{}
    if (Test-Path $PricesPath) {
        $prev = Get-Content -Path $PricesPath -Raw -Encoding UTF8 | ConvertFrom-Json
        if ($prev.prices) {
            foreach ($prop in $prev.prices.PSObject.Properties) {
                $priceMap[$prop.Name] = $prop.Value
            }
        }
    }

    foreach ($it in $items) {
        $name = "$($it.name)".Trim()
        if (-not $name) { continue }

        $result = $null
        try {
            $result = Get-LowestPrice-OpenApi -Config $config -Query $name
        } catch {
            Write-Log "[$name] 조회 오류: $($_.Exception.Message)"
        }

        if ($result -and $result.price -gt 0) {
            # 이력(history) 누적: 최근 8개 유지
            $history = @()
            if ($priceMap.ContainsKey($name) -and $priceMap[$name].history) {
                $history = @($priceMap[$name].history)
            }
            $history += [PSCustomObject]@{ date = $now.ToString('yyyy-MM-dd'); price = $result.price }
            if ($history.Count -gt 8) { $history = $history[($history.Count - 8)..($history.Count - 1)] }

            $priceMap[$name] = [PSCustomObject]@{
                price     = $result.price
                title     = $result.title
                link      = $result.link
                updatedAt = $stamp
                history   = $history
            }
            Write-Log "[$name] 최저가 $($result.price)원"
        } else {
            Write-Log "[$name] 가격을 찾지 못했습니다."
        }

        Start-Sleep -Milliseconds 400  # 과도한 요청 방지
    }

    # prices.json 저장
    $out = [ordered]@{ updatedAt = $stamp; prices = [ordered]@{} }
    foreach ($k in $priceMap.Keys) { $out.prices[$k] = $priceMap[$k] }
    ($out | ConvertTo-Json -Depth 8) | Set-Content -Path $PricesPath -Encoding UTF8

    Write-Log "수집 완료 -> prices.json 저장 ($stamp)"
    if ($Action -eq 'Test') { Get-Content -Path $PricesPath -Raw -Encoding UTF8 }
}
catch {
    Write-Log "실행 중 오류: $($_.Exception.Message)"
    throw
}
