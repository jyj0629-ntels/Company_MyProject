# Kiwoom GAS 자동 매수

이 폴더는 이제 **Google Apps Script 단일 파일 방식**으로만 사용합니다.

웹 화면, Node 서버, 로컬 JSON 저장은 모두 제거했고, 아래 두 파일만 보면 됩니다.

- `Code.gs`: 실제 자동 매수 스크립트
- `README.md`: 설정 및 실행 방법

## 1) 수정해야 하는 위치

`Code.gs` 맨 위에 아래 두 덩어리만 수정하면 됩니다.

1. `APP_CONFIG`
2. `BUY_TARGETS`

### APP_CONFIG에서 꼭 넣을 값

```javascript
KIWOOM_APP_KEY
KIWOOM_APP_SECRET
KIWOOM_ACCOUNT_NO
```

초기 테스트 때는 아래 값을 유지하세요.

```javascript
DRY_RUN: true
```

실주문 전환 시에만 아래로 바꾸세요.

```javascript
DRY_RUN: false
```

## 2) 종목 목록 수정 방법

`BUY_TARGETS` 배열에 종목을 추가하거나 삭제하면 됩니다.

예시:

```javascript
{
	enabled: true,
	code: "005930",
	name: "삼성전자",
	orderType: "MARKET",
	quantity: 1,
	price: null,
	note: "매일 실행"
}
```

### 규칙

- `enabled: true` 인 항목만 주문됨
- `orderType` 은 `MARKET` 또는 `LIMIT`
- `MARKET` 이면 `price: null`
- `LIMIT` 이면 `price` 에 숫자 입력

## 3) 실행 스케줄

- 매일 오전 `8:40` 기준 트리거 실행
- 코드 내부에서 `월요일~금요일`만 주문 수행
- 같은 날 두 번 실행되지 않도록 중복 방지 포함

주의:
Google Apps Script 시간 트리거는 정확히 `08:40:00` 고정이 아니라, 약간의 시간 오차가 있을 수 있습니다.

## 4) Google Apps Script 설정 순서

1. Google Apps Script 새 프로젝트 생성
2. 이 폴더의 `Code.gs` 내용을 붙여넣기
3. 상단 `APP_CONFIG` 값 입력
4. 상단 `BUY_TARGETS` 값 수정
5. 수동으로 `executeNowForTest()` 1회 실행
6. 로그 확인
7. 이상 없으면 `installWeekdayBuyTrigger()` 1회 실행
8. 마지막에 `DRY_RUN` 을 `false` 로 변경

## 5) 직접 실행하는 함수

- `executeNowForTest()`
	- 즉시 한 번 실행
	- 테스트용

- `installWeekdayBuyTrigger()`
	- 자동 실행 트리거 생성

- `resetLastRunDate()`
	- 같은 날 재테스트가 필요할 때 실행 기록 초기화

- `clearTokenCache()`
	- 토큰을 강제로 다시 받게 할 때 사용

## 6) 메일 알림

원하면 `APP_CONFIG` 에서 아래를 수정하세요.

```javascript
ENABLE_EMAIL_NOTICE: true
ALERT_EMAIL: "your_email@example.com"
```

## 7) 키 값 입력 위치

키움 키 값은 `Code.gs` 상단 `APP_CONFIG` 안에 넣게 되어 있습니다.

```javascript
KIWOOM_APP_KEY: "PUT_YOUR_APP_KEY_HERE"
KIWOOM_APP_SECRET: "PUT_YOUR_APP_SECRET_HERE"
KIWOOM_ACCOUNT_NO: "PUT_YOUR_ACCOUNT_NO_HERE"
```

즉, 중간 코드 안을 찾을 필요 없이 파일 맨 위만 수정하면 됩니다.

## 8) 권장 테스트 순서

1. `DRY_RUN: true` 유지
2. 종목 1개만 남기고 `executeNowForTest()` 실행
3. 로그 결과 확인
4. 트리거 설치
5. 다음 영업일 동작 확인
6. 그 후에만 `DRY_RUN: false` 전환
