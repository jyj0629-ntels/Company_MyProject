# 식재료 최저가 트래커 (PriceTracking)

자주 사는 식재료를 등록해 두고, 네이버 쇼핑 **낮은가격순**으로 최저가를 매일 자동 수집하는 간단한 도구입니다.
DB 없이 **JSON 파일**로 데이터를 관리합니다.

## 구성 파일

- `index.html` : 화면 UI (식재료 등록/삭제/검색, 네이버 최저가 바로가기, 수집된 최저가 표시)
- `items.json` : 식재료 목록 (JSON "DB")
- `prices.json` : 수집된 최저가 결과 (PowerShell이 기록, 화면이 읽음)
- `FetchPrices.ps1` : 가격 자동 수집 스크립트 (작업 스케줄러가 실행)
- `config.example.json` : 수집 설정 템플릿 (복사해서 `config.json` 생성)

## 동작 방식

```
[화면 index.html] --등록/삭제--> items.json (내보내기)
        ▲                               │
        │ 읽기                           ▼ 읽기
   prices.json <----기록---- [FetchPrices.ps1] --조회--> 네이버 쇼핑
        ▲
   작업 스케줄러가 매일 FetchPrices.ps1 실행
```

> ⚠️ 네이버 쇼핑은 브라우저에서 직접 가격을 읽어올 수 없습니다(CORS/동적 렌더링).
> 그래서 **가격 수집은 PowerShell이 담당**하고, 화면은 저장된 `prices.json`만 표시합니다.

## 1) 식재료 등록

1. `index.html`을 브라우저로 엽니다.
2. 식재료명(예: `깐멍게 500g`)과 메모를 입력하고 **+ 추가**.
3. 목록은 브라우저(localStorage)에 저장됩니다.
4. **items.json 내보내기** 버튼으로 `items.json`을 받아 이 폴더에 덮어씁니다.
   (PowerShell이 이 파일을 읽어 수집합니다.)

## 2) 가격 수집 설정 (권장: 네이버 오픈API)

네이버 쇼핑 검색 API는 안정적이라 권장합니다.

1. 네이버 개발자센터(https://developers.naver.com)에서 애플리케이션 등록 → **검색 API** 사용 설정.
2. 발급받은 `Client ID` / `Client Secret`를 확인합니다.
3. `config.example.json`을 복사해 `config.json`을 만들고 값을 입력합니다.

```json
{
  "MODE": "naver_openapi",
  "NAVER_CLIENT_ID": "발급받은_ID",
  "NAVER_CLIENT_SECRET": "발급받은_SECRET"
}
```

- 키 없이 쓰려면 `"MODE": "html"` 로 두면 됩니다. (검색 HTML에서 가격을 추정하는 비공식 방식이라 깨질 수 있음)

## 3) 수동 테스트

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
.\FetchPrices.ps1 -Action Test
```

- 즉시 1회 수집하고 `prices.json`을 출력합니다. 로그는 `fetch.log`.

## 4) Windows 작업 스케줄러 등록 (매일 09:00 예시)

```powershell
schtasks /Create /TN "PriceTrackingFetch" /TR "powershell.exe -NoProfile -ExecutionPolicy Bypass -File `"C:\00.DEV_SRC\Company_MyProject\PriceTracking\FetchPrices.ps1`"" /SC DAILY /ST 09:00 /RL HIGHEST
```

확인/삭제:

```powershell
schtasks /Query /TN "PriceTrackingFetch"
schtasks /Delete /TN "PriceTrackingFetch" /F
```

## 5) 화면에서 결과 보기

- 수집 후 `index.html`에서 **prices.json 불러오기** 버튼으로 최신 가격을 반영합니다.
  (로컬 서버로 열면 자동으로 읽어오고, `file://`로 열면 수동 불러오기 필요)

## 파일 관리(git)

- `config.json`(키 포함), `prices.json`, `fetch.log`는 비밀/생성 파일이라 `.gitignore`로 제외됩니다.
- `items.json`은 공유해도 되는 목록이라 커밋 대상입니다. (비워서 커밋해도 됨)
