주) 화시 노트북의 "작업스케쥴러" > KiwoomBuy 작업 확인.

# Kiwoom 자동 매수 - Windows 작업 스케줄러 버전

항상 켜져 있는 **회사 노트북(고정 IP 환경)** 에서 PowerShell로 직접 실행하는 버전입니다.
(Google Apps Script는 고정 IP를 제공하지 않아 키움 "지정단말기(8050)" 정책과 충돌하여 이 방식으로 전환했습니다.)

## 1) 준비

1. `config.example.json`을 복사해서 같은 폴더에 `config.json`으로 저장합니다.
2. `config.json`을 열어 아래 값을 입력합니다.
   - `KIWOOM_APP_KEY`
   - `KIWOOM_APP_SECRET`
   - `KIWOOM_ACCOUNT_NO`
3. `DRY_RUN: true` 상태를 유지한 채 먼저 테스트합니다.
4. `config.json`은 비밀 값이 들어있으므로 git에 커밋하지 않습니다(레포 `.gitignore`에 이미 등록됨).

## 2) 종목 목록 수정 방법

`config.json`의 `BUY_TARGETS` 배열에 종목을 추가하거나 삭제하면 됩니다.

```json
{
  "enabled": true,
  "code": "005930",
  "name": "삼성전자",
  "orderType": "MARKET",
  "quantity": 1,
  "price": null
}
```

### 규칙

- `enabled: true` 인 항목만 주문됨
- `orderType` 은 `MARKET` 또는 `LIMIT`
- `MARKET` 이면 `price: null`
- `LIMIT` 이면 `price` 에 숫자 입력

## 3) 수동 테스트

PowerShell을 열고 이 폴더로 이동한 뒤:

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
.\AutoBuy.ps1 -Action Test
```

- 요일/중복 실행 체크 없이 즉시 1회 실행됩니다.
- 결과는 `autobuy.log`와 화면에 함께 출력됩니다.

## 4) 키움 관리 화면에 이 PC의 공인 IP 등록

1. 아래 명령으로 이 PC의 공인(외부) IP를 확인합니다.

   ```powershell
   (Invoke-RestMethod -Uri 'https://api.ipify.org?format=json').ip
   ```

2. 회사 네트워크가 고정 IP인지 통신망 담당자/ISP에 확인합니다(유동 IP면 IP가 바뀔 때마다 재등록 필요).
3. 키움 OpenAPI+ 관리 화면 > 지정단말기(고정 IP) 등록 메뉴에서 위 IP를 등록합니다(최대 10개).

## 5) Windows 작업 스케줄러 등록

작업 스케줄러(GUI) 또는 아래 `schtasks` 명령으로 등록할 수 있습니다. 매일 08:40에 실행하는 예시입니다.

```powershell
schtasks /Create /TN "KiwoomAutoBuy" /TR "powershell.exe -NoProfile -ExecutionPolicy Bypass -File `"C:\00.DEV_SRC\Company_MyProject\Kiwoom\AutoBuy.ps1`"" /SC WEEKLY /D MON,TUE,WED,THU,FRI /ST 08:40 /RL HIGHEST
```

- `/SC WEEKLY /D MON,TUE,WED,THU,FRI`: 평일에만 트리거 (스크립트 내부에도 주말 방어 로직이 있어 이중 안전장치)
- `/RL HIGHEST`: 관리자 권한으로 실행(선택 사항, 필요 없으면 제거 가능)
- 로그인 여부와 무관하게 실행하려면 작업 스케줄러 GUI에서 "사용자가 로그온했는지 여부에 관계없이 실행" 옵션과 자격 증명 저장이 필요합니다.

등록 확인/삭제:

```powershell
schtasks /Query /TN "KiwoomAutoBuy"
schtasks /Delete /TN "KiwoomAutoBuy" /F
```

## 6) 관리용 명령

```powershell
.\AutoBuy.ps1                      # 스케줄러가 호출하는 정식 실행(평일/중복 체크 포함)
.\AutoBuy.ps1 -Action Test          # 체크 없이 즉시 1회 테스트 실행
.\AutoBuy.ps1 -Action ResetRunDate  # 오늘 실행 기록 초기화 (같은 날 재테스트 시)
.\AutoBuy.ps1 -Action ClearToken    # 캐시된 토큰 강제 초기화
```

## 7) 파일 설명

- `AutoBuy.ps1`: 실제 실행 스크립트
- `config.example.json`: 설정 템플릿 (git에 커밋됨, 비밀값 없음)
- `config.json`: 실제 설정 + 비밀값 (git에 커밋되지 않음, 최초 1회 직접 생성)
- `state.json`: 토큰 캐시 및 마지막 실행일 저장 (자동 생성, git에 커밋되지 않음)
- `autobuy.log`: 실행 로그 (자동 생성, git에 커밋되지 않음)

## 8) 메일 알림 (선택)

`config.json`에서 아래 값을 채우면 실행 결과를 메일로 받을 수 있습니다.

```json
"ENABLE_EMAIL_NOTICE": true,
"ALERT_EMAIL": "받을주소@example.com",
"SMTP_SERVER": "smtp.gmail.com",
"SMTP_PORT": 587,
"SMTP_USER": "보내는계정@gmail.com",
"SMTP_PASSWORD": "앱 비밀번호"
```

- Gmail은 일반 계정 비밀번호 대신 `2단계 인증` 후 발급받은 `앱 비밀번호`를 넣어야 합니다.
- 앱 비밀번호를 넣지 않으면 `Authentication Required` 오류가 발생합니다.
- 이 오류는 매수 실패 원인이 아니고, 메일 알림만 실패한 상태입니다.

## 9) 실전 전환 순서
'DRY_RUN = false 이면 실 매매, true 이면 가상 매매
1. `DRY_RUN: true` 상태로 며칠간 스케줄러 실행 확인 (`autobuy.log` 확인)
2. 문제 없으면 `config.json`에서 `DRY_RUN: false`로 변경
3. 소액/소수량으로 먼저 실거래 확인
