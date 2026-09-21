주) 회사 노트북의 "작업 스케줄러" > **JYJ_TrueFriendAutoBuy** 작업 확인.

# 한국투자증권(KIS) 자동 매수 - Windows 작업 스케줄러 버전

`kiwoom` 폴더의 자동 매수 스크립트와 **동일한 구조**이며, API 호출부만 한국투자증권 KIS OpenAPI 규격으로 교체한 버전입니다.

- 대상: **퇴직연금 DC 계좌의 국내 ETF 자동 매수**
- 실행 방식: 항상 켜져 있는 회사 노트북에서 PowerShell로 직접 실행 (작업 스케줄러가 호출)

> ⚠️ **먼저 읽어주세요 (퇴직연금 DC 관련 확인 필요)**
> KIS OpenAPI의 국내주식 현금주문 API(`order-cash`)는 기본적으로 일반 위탁계좌 기준으로 설계돼 있습니다.
> 퇴직연금(DC) 계좌의 주문 지원 여부와 **주문 TR_ID**는 계좌 유형에 따라 다를 수 있습니다.
> 그래서 이 스크립트는 매수 TR_ID를 `config.json`의 `KIS_BUY_TR_ID`로 **직접 설정**할 수 있게 만들었습니다.
> **실거래 전에 반드시 `DRY_RUN: true`로 검증**하고, KIS Developers(개발자센터)에서 DC 계좌 주문 지원 여부와 정확한 TR_ID를 확인하세요.

## 1) 준비

1. `config.example.json`을 복사해서 같은 폴더에 `config.json`으로 저장합니다.
2. `config.json`을 열어 아래 값을 입력합니다.
   - `KIS_APP_KEY`
   - `KIS_APP_SECRET`
   - `KIS_CANO` (계좌번호 앞 8자리)
   - `KIS_ACNT_PRDT_CD` (계좌상품코드 2자리, 퇴직연금 DC는 보통 `22`)
   - `KIS_BUY_TR_ID` (매수 거래 TR_ID)
3. `DRY_RUN: true` 상태를 유지한 채 먼저 테스트합니다.
4. `config.json`은 비밀 값이 들어있으므로 git에 커밋하지 않습니다(레포 `.gitignore`에 이미 등록됨).

### config 필드 설명

| 필드 | 설명 |
|------|------|
| `KIS_BASE_URL` | 실전 `https://openapi.koreainvestment.com:9443`, 모의 `https://openapi.koreainvestment.com:29443` |
| `KIS_APP_KEY` / `KIS_APP_SECRET` | KIS Developers에서 발급한 앱 키/시크릿 |
| `KIS_CANO` | 계좌번호 앞 8자리 |
| `KIS_ACNT_PRDT_CD` | 계좌상품코드 2자리 (DC는 보통 `22`, 실제 값은 본인 계좌 기준으로 확인) |
| `KIS_CUST_TYPE` | 개인 `P`, 법인 `B` |
| `KIS_BUY_TR_ID` | 매수 주문 TR_ID. 국내주식 현금매수 실전 기본값 `TTTC0802U`, 모의 `VTTC0802U`. **DC 전용 TR_ID가 다르면 이 값을 변경** |
| `KIS_EXCG_ID_DVSN_CD` | 거래소 구분 (`KRX` 등). 필요 없으면 빈 값으로 두면 요청에서 제외됨 |

## 2) 종목 목록 수정 방법

`config.json`의 `BUY_TARGETS` 배열에 종목을 추가하거나 삭제하면 됩니다. (kiwoom 버전과 동일)

```json
{
  "enabled": true,
  "code": "402970",
  "name": "ACE 미국배당다우존스",
  "orderType": "MARKET",
  "quantity": 1,
  "price": null
}
```

### 규칙

- `enabled: true` 인 항목만 주문됨
- `orderType` 은 `MARKET`(시장가) 또는 `LIMIT`(지정가)
- `MARKET` 이면 `price: null` (내부적으로 `ORD_DVSN=01`, `ORD_UNPR=0`)
- `LIMIT` 이면 `price` 에 숫자 입력 (내부적으로 `ORD_DVSN=00`, `ORD_UNPR=price`)

## 3) 수동 테스트

PowerShell을 열고 이 폴더로 이동한 뒤:

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
.\AutoBuy.ps1 -Action Test
```

- 요일/중복 실행 체크 없이 즉시 1회 실행됩니다.
- `DRY_RUN: true`면 실제 주문 없이 로직만 점검합니다.
- 결과는 `autobuy.log`와 화면에 함께 출력됩니다.

## 4) Windows 작업 스케줄러 등록

이미 이 노트북 작업 스케줄러에 **`JYJ_TrueFriendAutoBuy`** 작업이 등록돼 있습니다(평일 09:00:30 실행, `AutoBuy.ps1` 호출).
새로 등록하거나 재생성하려면 아래 `schtasks` 명령을 사용할 수 있습니다.

```powershell
schtasks /Create /TN "JYJ_TrueFriendAutoBuy" /TR "powershell.exe -NoProfile -ExecutionPolicy Bypass -File `"C:\00.DEV_SRC\Company_MyProject\TrueFriend\AutoBuy.ps1`"" /SC WEEKLY /D MON,TUE,WED,THU,FRI /ST 09:00 /RL HIGHEST
```

- `/SC WEEKLY /D MON,TUE,WED,THU,FRI`: 평일에만 트리거 (스크립트 내부에도 주말 방어 로직이 있어 이중 안전장치)
- `/RL HIGHEST`: 관리자 권한으로 실행
- 로그인 여부와 무관하게 실행하려면 작업 스케줄러 GUI에서 "사용자가 로그온했는지 여부에 관계없이 실행" 옵션과 자격 증명 저장이 필요합니다.

등록 확인/삭제:

```powershell
schtasks /Query /TN "JYJ_TrueFriendAutoBuy"
schtasks /Delete /TN "JYJ_TrueFriendAutoBuy" /F
```

## 5) 관리용 명령

```powershell
.\AutoBuy.ps1                      # 스케줄러가 호출하는 정식 실행(평일/중복 체크 포함)
.\AutoBuy.ps1 -Action Test          # 체크 없이 즉시 1회 테스트 실행
.\AutoBuy.ps1 -Action ResetRunDate  # 오늘 실행 기록 초기화 (같은 날 재테스트 시)
.\AutoBuy.ps1 -Action ClearToken    # 캐시된 토큰 강제 초기화
```

## 6) 파일 설명

- `AutoBuy.ps1`: 실제 실행 스크립트 (KIS 토큰발급 + hashkey + 현금주문)
- `config.example.json`: 설정 템플릿 (git에 커밋됨, 비밀값 없음)
- `config.json`: 실제 설정 + 비밀값 (git에 커밋되지 않음, 최초 1회 직접 생성)
- `state.json`: 토큰 캐시 및 마지막 실행일 저장 (자동 생성, git에 커밋되지 않음)
- `autobuy.log`: 실행 로그 (자동 생성, git에 커밋되지 않음)
- `JYJ_TrueFriendAutoBuy.xml`: 작업 스케줄러 등록 내보내기 파일 (참고용)

## 7) 메일 알림 (선택)

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

## 8) 실전 전환 순서

1. `DRY_RUN: true` 상태로 `.\AutoBuy.ps1 -Action Test` 를 실행해 로직/설정 확인 (`autobuy.log` 확인)
2. KIS Developers에서 **퇴직연금 DC 계좌 주문 지원 여부와 정확한 `KIS_BUY_TR_ID`** 확인 후 `config.json`에 반영
3. 모의투자(`:29443` + `VTTC0802U`)로 먼저 검증 (모의에서 DC 주문이 지원되지 않으면 실전 소액으로 검증)
4. 문제 없으면 `config.json`에서 `DRY_RUN: false`로 변경
5. 소액/소수량으로 먼저 실거래 확인
