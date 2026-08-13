<#
 Kiwoom 자동 매수 - Windows 작업 스케줄러 실행용 PowerShell 스크립트
 GAS는 고정 IP를 제공하지 않아 키움 "지정단말기" 정책과 충돌하므로,
 고정 IP를 가진 이 PC(노트북)에서 직접 실행하기 위해 만들었습니다.

 사용법:
   .\AutoBuy.ps1              # 평일/중복 실행 체크 후 정상 실행 (스케줄러용)
   .\AutoBuy.ps1 -Action Test # 체크 없이 즉시 1회 실행 (수동 테스트용)
   .\AutoBuy.ps1 -Action ResetRunDate  # 오늘 실행 기록 초기화
   .\AutoBuy.ps1 -Action ClearToken    # 토큰 캐시 초기화
#>

param(
    [ValidateSet('Run', 'Test', 'ResetRunDate', 'ClearToken')]
    [string]$Action = 'Run'
)

$ErrorActionPreference = 'Stop'

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ConfigPath = Join-Path $ScriptDir 'config.json'
$StatePath = Join-Path $ScriptDir 'state.json'
$LogPath = Join-Path $ScriptDir 'autobuy.log'

function Write-Log {
    param([string]$Message)
    $timestamp = (Get-Date).ToString('yyyy-MM-dd HH:mm:ss')
    "$timestamp $Message" | Add-Content -Path $LogPath -Encoding UTF8
}

function Get-KoreaNow {
    $tz = [System.TimeZoneInfo]::FindSystemTimeZoneById('Korea Standard Time')
    return [System.TimeZoneInfo]::ConvertTime([DateTime]::UtcNow, $tz)
}

function Get-Config {
    if (-not (Test-Path $ConfigPath)) {
        throw "config.json 파일이 없습니다. config.example.json을 복사해서 만드세요: $ConfigPath"
    }
    return Get-Content -Path $ConfigPath -Raw -Encoding UTF8 | ConvertFrom-Json
}

function Get-State {
    if (Test-Path $StatePath) {
        return Get-Content -Path $StatePath -Raw -Encoding UTF8 | ConvertFrom-Json
    }
    return [PSCustomObject]@{ accessToken = ''; tokenExpireAt = 0; lastRunDate = '' }
}

function Save-State {
    param($State)
    $State | ConvertTo-Json -Depth 5 | Set-Content -Path $StatePath -Encoding UTF8
}

function Assert-Config {
    param($Config)
    if (-not $Config.KIWOOM_APP_KEY -or $Config.KIWOOM_APP_KEY -eq 'PUT_YOUR_APP_KEY_HERE') {
        throw 'config.json의 KIWOOM_APP_KEY 값을 입력하세요.'
    }
    if (-not $Config.KIWOOM_APP_SECRET -or $Config.KIWOOM_APP_SECRET -eq 'PUT_YOUR_APP_SECRET_HERE') {
        throw 'config.json의 KIWOOM_APP_SECRET 값을 입력하세요.'
    }
    if (-not $Config.KIWOOM_ACCOUNT_NO -or $Config.KIWOOM_ACCOUNT_NO -eq 'PUT_YOUR_ACCOUNT_NO_HERE') {
        throw 'config.json의 KIWOOM_ACCOUNT_NO 값을 입력하세요.'
    }
}

function Get-EnabledTargets {
    param($Config)
    $targets = @()

    foreach ($item in $Config.BUY_TARGETS) {
        if (-not $item.enabled) { continue }

        $code = ($item.code -replace '[^\d]', '')
        $name = ("$($item.name)").Trim()
        $orderType = ("$($item.orderType)").ToUpper()
        $quantity = [int]$item.quantity
        $price = $null
        if ($null -ne $item.price) { $price = [int]$item.price }

        if ($code -notmatch '^\d{6}$') {
            throw "종목코드는 6자리 숫자여야 합니다: $($item | ConvertTo-Json -Compress)"
        }
        if (-not $name) {
            throw "종목명은 비워둘 수 없습니다: $code"
        }
        if ($quantity -le 0) {
            throw "수량은 1 이상의 정수여야 합니다: $code"
        }
        if ($orderType -ne 'MARKET' -and $orderType -ne 'LIMIT') {
            throw "orderType은 MARKET 또는 LIMIT만 가능합니다: $code"
        }
        if ($orderType -eq 'LIMIT') {
            if (-not $price -or $price -le 0) {
                throw "지정가 주문은 price가 필요합니다: $code"
            }
        }
        else {
            $price = $null
        }

        $targets += [PSCustomObject]@{
            code = $code; name = $name; orderType = $orderType; quantity = $quantity; price = $price
        }
    }

    if ($targets.Count -eq 0) {
        throw 'enabled: true 인 종목이 하나도 없습니다.'
    }
    return $targets
}

function Get-AccessToken {
    param($Config, $State)

    $nowMs = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
    if ($State.accessToken -and $nowMs -lt $State.tokenExpireAt) {
        return $State.accessToken
    }

    $body = @{
        grant_type = 'client_credentials'
        appkey     = $Config.KIWOOM_APP_KEY
        secretkey  = $Config.KIWOOM_APP_SECRET
    } | ConvertTo-Json

    try {
        $response = Invoke-RestMethod -Uri "$($Config.KIWOOM_BASE_URL)/oauth2/token" -Method Post -ContentType 'application/json' -Body $body
    }
    catch {
        throw "토큰 발급 실패: $($_.Exception.Message)"
    }

    if (-not $response.token) {
        $msg = if ($response.return_msg) { $response.return_msg } else { $response.msg1 }
        if ($msg -match '8050|지정단말기') {
            throw "토큰 발급 실패: $msg (원인: 지정단말기 인증 실패. 키움 OpenAPI+ 관리 화면에서 이 PC의 공인 IP가 등록돼 있는지 확인하세요)"
        }
        throw "토큰 발급 실패: $msg"
    }

    $expiresIn = if ($response.expires_in) { [int]$response.expires_in } else { 3600 }
    $State.accessToken = $response.token
    $State.tokenExpireAt = $nowMs + ([Math]::Max($expiresIn - 60, 60) * 1000)
    Save-State -State $State

    return $State.accessToken
}

function Invoke-KiwoomOrder {
    param($Config, $State, $Target)

    $accessToken = Get-AccessToken -Config $Config -State $State

    $requestBody = @{
        dmst_stex_tp = $Config.KIWOOM_DOMESTIC_EXCHANGE
        stk_cd       = $Target.code
        ord_qty      = "$($Target.quantity)"
        trde_tp      = if ($Target.orderType -eq 'MARKET') { '3' } else { '0' }
        ord_uv       = if ($Target.orderType -eq 'MARKET') { '' } else { "$($Target.price)" }
        cond_uv      = ''
    } | ConvertTo-Json

    $headers = @{
        authorization = "Bearer $accessToken"
        appkey        = $Config.KIWOOM_APP_KEY
        appsecret     = $Config.KIWOOM_APP_SECRET
        'api-id'      = 'kt10000'
    }

    return Invoke-RestMethod -Uri "$($Config.KIWOOM_BASE_URL)/api/dostk/ordr" -Method Post -ContentType 'application/json' -Headers $headers -Body $requestBody
}

function Test-SuccessResponse {
    param($Response)
    return ($Response.return_code -eq 0 -or $Response.return_code -eq '0' -or $Response.returnCode -eq 0 -or $Response.returnCode -eq '0')
}

function Invoke-AutoBuy {
    param($Config, $State)

    Assert-Config -Config $Config
    $targets = Get-EnabledTargets -Config $Config
    $results = @()

    foreach ($target in $targets) {
        if ($Config.DRY_RUN) {
            $results += [PSCustomObject]@{
                code = $target.code; name = $target.name; quantity = $target.quantity
                orderType = $target.orderType; result = 'SUCCESS'
                orderNo = "MOCK-$([DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds())"
                message = 'DRY_RUN 모의주문 성공'
            }
            continue
        }

        try {
            $response = Invoke-KiwoomOrder -Config $Config -State $State -Target $target
            $results += [PSCustomObject]@{
                code = $target.code; name = $target.name; quantity = $target.quantity
                orderType = $target.orderType
                result = if (Test-SuccessResponse $response) { 'SUCCESS' } else { 'FAILED' }
                orderNo = if ($response.ord_no) { $response.ord_no } else { $response.order_no }
                message = if ($response.return_msg) { $response.return_msg } else { $response.msg1 }
            }
        }
        catch {
            $results += [PSCustomObject]@{
                code = $target.code; name = $target.name; quantity = $target.quantity
                orderType = $target.orderType; result = 'FAILED'; orderNo = ''
                message = $_.Exception.Message
            }
        }
    }

    return [PSCustomObject]@{
        dryRun = $Config.DRY_RUN
        executedAt = (Get-KoreaNow).ToString('yyyy-MM-dd HH:mm:ss')
        itemCount = $results.Count
        results = $results
    }
}

function Send-ResultEmail {
    param($Config, $Result, $Today)

    if (-not $Config.ENABLE_EMAIL_NOTICE -or -not $Config.ALERT_EMAIL -or -not $Config.SMTP_USER) {
        return
    }

    try {
        $securePassword = ConvertTo-SecureString $Config.SMTP_PASSWORD -AsPlainText -Force
        $credential = New-Object System.Management.Automation.PSCredential($Config.SMTP_USER, $securePassword)

        Send-MailMessage -To $Config.ALERT_EMAIL -From $Config.SMTP_USER `
            -Subject "[Kiwoom AutoBuy] 실행 결과 $Today" `
            -Body ($Result | ConvertTo-Json -Depth 5) `
            -SmtpServer $Config.SMTP_SERVER -Port $Config.SMTP_PORT -UseSsl `
            -Credential $credential
    }
    catch {
        Write-Log "메일 전송 실패: $($_.Exception.Message)"
    }
}

# ---- 실행 시작 ----
try {
    switch ($Action) {
        'ResetRunDate' {
            $state = Get-State
            $state.lastRunDate = ''
            Save-State -State $state
            Write-Log 'lastRunDate 초기화 완료'
            return
        }
        'ClearToken' {
            $state = Get-State
            $state.accessToken = ''
            $state.tokenExpireAt = 0
            Save-State -State $state
            Write-Log '토큰 캐시 초기화 완료'
            return
        }
        'Test' {
            $config = Get-Config
            $state = Get-State
            $result = Invoke-AutoBuy -Config $config -State $state
            Write-Log "수동 테스트 실행 완료`n$($result | ConvertTo-Json -Depth 5)"
            $result | ConvertTo-Json -Depth 5
            return
        }
        default {
            $config = Get-Config
            $state = Get-State
            $now = Get-KoreaNow
            $today = $now.ToString('yyyy-MM-dd')

            if ($now.DayOfWeek -eq 'Saturday' -or $now.DayOfWeek -eq 'Sunday') {
                Write-Log "주말이므로 실행하지 않음 ($today)"
                return
            }

            if ($state.lastRunDate -eq $today) {
                Write-Log "이미 오늘 실행됨 ($today)"
                return
            }

            $result = Invoke-AutoBuy -Config $config -State $state
            $state.lastRunDate = $today
            Save-State -State $state

            Write-Log "자동 매수 실행 완료`n$($result | ConvertTo-Json -Depth 5)"
            Send-ResultEmail -Config $config -Result $result -Today $today
        }
    }
}
catch {
    Write-Log "실행 중 오류: $($_.Exception.Message)"
    throw
}
