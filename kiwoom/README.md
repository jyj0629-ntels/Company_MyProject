# Kiwoom 예약 매수 웹앱 (GAS 연동 버전)

이 프로젝트는 키움 API 비밀값을 로컬 파일이 아닌 **Google Apps Script(GAS)**에 저장하고,
웹 화면은 GAS만 호출하는 방식으로 동작합니다.

## 1) 목표 구조

- 브라우저 UI: `public/index.html`
- API 키/시크릿/주문 처리: `gas/Code.gs`
- 키움 민감정보는 GAS Script Properties에 저장

이 구조를 쓰면 휴대폰/회사 노트북에서도 동일 URL로 사용 가능합니다.

## 2) 빠른 설정 순서

1. Google Apps Script 새 프로젝트 생성
2. `gas/Code.gs` 내용 붙여넣기
3. Script Properties 설정
4. 웹앱 배포(Deploy as web app)
5. 발급된 `/exec` URL을 `public/config.js`에 입력

## 3) Script Properties 예시

- `KIWOOM_APP_KEY`: 키움 앱키
- `KIWOOM_APP_SECRET`: 키움 시크릿
- `KIWOOM_ACCOUNT_NO`: 계좌번호
- `KIWOOM_DOMESTIC_EXCHANGE`: `KRX` (또는 NXT/SOR)
- `DRY_RUN`: `true` 권장 (초기 테스트)
- `STOCK_MASTER_JSON`: 종목 매핑 JSON 문자열

`STOCK_MASTER_JSON` 예시:

```json
[
	{ "code": "005930", "name": "삼성전자" },
	{ "code": "000660", "name": "SK하이닉스" }
]
```

## 4) 프론트 설정

`public/config.js`에서 아래만 입력하면 됩니다.

```js
window.APP_CONFIG = {
	GAS_WEB_APP_URL: "https://script.google.com/macros/s/발급값/exec",
	ENABLE_LOCAL_FALLBACK: true
};
```

## 5) 현재 구현된 기능

- 종목코드 입력 -> 종목명 자동 조회
- 종목명 입력 -> 종목코드 자동 조회
- 시장가 체크 시 구매가 비활성
- 고정가 시 구매가 활성
- 여러 종목 동시 예약/주문
- 결과 화면에 예약번호, 주문번호, 결과 표시

## 6) 현재 구현된 키움 주문 매핑

- 국내주식 매수주문: `api_id=kt10000`
- 주문 경로: `/api/dostk/ordr`
- 시장가: `trde_tp=3`
- 지정가: `trde_tp=0`

## 7) 안전 가이드

- 초기엔 반드시 `DRY_RUN=true`
- 소액/최소 수량으로 단계 검증
- 키움 포털 사용신청/허용IP/실전 권한 확인

## 8) 참고

기존 Node 서버 방식(`src/server.js`)도 남아 있지만,
GAS URL이 `public/config.js`에 설정되면 프론트는 GAS를 우선 사용합니다.
