/*******************************************************
 * 키움증권 자동 매수 Script
 * API Key 정보 설정
 *******************************************************/
var APP_CONFIG = {
  TIMEZONE: "Asia/Seoul",
  RUN_HOUR: 8,
  RUN_MINUTE: 40,
  DRY_RUN: true,
  KIWOOM_BASE_URL: "https://api.kiwoom.com",
  KIWOOM_APP_KEY: "PUT_YOUR_APP_KEY_HERE",
  KIWOOM_APP_SECRET: "PUT_YOUR_APP_SECRET_HERE",
  KIWOOM_ACCOUNT_NO: "PUT_YOUR_ACCOUNT_NO_HERE",
  KIWOOM_PRODUCT_CODE: "01",
  KIWOOM_DOMESTIC_EXCHANGE: "KRX",
  ENABLE_EMAIL_NOTICE: false,
  ALERT_EMAIL: ""
};

/*******************************************************
 * 매수 종목 설정 변수
 *
 * 이 배열에 있는 종목을 자동 매수 대상으로 사용합니다.
 * 실제 자동 실행은 note 값과 무관하며, 월요일~금요일만 동작합니다.
 * 실행 시간은 APP_CONFIG.RUN_HOUR / RUN_MINUTE 값을 따릅니다.
 *
 * 각 컬럼 설명
 * enabled   : true 이면 주문 대상 포함, false 이면 제외
 * code      : 6자리 종목코드 문자열
 * name      : 종목명
 * orderType : "MARKET" 또는 "LIMIT"
 * quantity  : 주문 수량
 * price     : 지정가일 때만 숫자 입력, 시장가면 null
 *******************************************************/
var BUY_TARGETS = [
  {
    enabled: true,
    code: "379800 ",
    name: "KODEX 미국S&P500",
    orderType: "MARKET",
    quantity: 2,
    price: null
  },
  {
    enabled: true,
    code: "368590",
    name: "RISE 미국나스닥100",
    orderType: "MARKET",
    quantity: 1,
    price: null
  },
  {
    enabled: true,
    code: "402970",
    name: "ACE 미국배당다우존스",
    orderType: "MARKET",
    quantity: 1,
    price: null
  },
  {
    enabled: true,
    code: "449450",
    name: "PLUS K방산",
    orderType: "MARKET",
    quantity: 1,
    price: null
  }
];

var TOKEN_CACHE_KEY = "KIWOOM_ACCESS_TOKEN";
var TOKEN_EXPIRE_KEY = "KIWOOM_ACCESS_TOKEN_EXPIRE_AT";
var LAST_RUN_DATE_KEY = "LAST_AUTO_BUY_RUN_DATE";

function installWeekdayBuyTrigger() {
  deleteAutoBuyTriggers_();

  ScriptApp.newTrigger("runScheduledAutoBuy")
    .timeBased()
    .everyDays(1)
    .atHour(APP_CONFIG.RUN_HOUR)
    .nearMinute(APP_CONFIG.RUN_MINUTE)
    .create();
}

function deleteAutoBuyTriggers_() {
  var triggers = ScriptApp.getProjectTriggers();

  for (var i = 0; i < triggers.length; i += 1) {
    if (triggers[i].getHandlerFunction() === "runScheduledAutoBuy") {
      ScriptApp.deleteTrigger(triggers[i]);
    }
  }
}

function runScheduledAutoBuy() {
  var now = new Date();
  var today = Utilities.formatDate(now, APP_CONFIG.TIMEZONE, "yyyy-MM-dd");

  if (!isWeekdayInSeoul_(now)) {
    logMessage_("주말이므로 실행하지 않음", { today: today });
    return;
  }

  if (alreadyRanToday_(today)) {
    logMessage_("이미 오늘 실행됨", { today: today });
    return;
  }

  var result = executeAutoBuy_();
  PropertiesService.getScriptProperties().setProperty(LAST_RUN_DATE_KEY, today);
  logMessage_("자동 매수 실행 완료", result);

  if (APP_CONFIG.ENABLE_EMAIL_NOTICE && APP_CONFIG.ALERT_EMAIL) {
    MailApp.sendEmail({
      to: APP_CONFIG.ALERT_EMAIL,
      subject: "[Kiwoom GAS] 자동 매수 실행 결과 " + today,
      body: JSON.stringify(result, null, 2)
    });
  }
}

function executeNowForTest() {
  var result = executeAutoBuy_();
  logMessage_("수동 테스트 실행 완료", result);
  return result;
}

function executeAutoBuy_() {
  validateConfig_();
  var targets = getEnabledTargets_();
  var results = [];

  for (var i = 0; i < targets.length; i += 1) {
    var target = targets[i];

    if (APP_CONFIG.DRY_RUN) {
      results.push({
        code: target.code,
        name: target.name,
        quantity: target.quantity,
        orderType: target.orderType,
        result: "SUCCESS",
        orderNo: "MOCK-" + new Date().getTime() + "-" + i,
        message: "DRY_RUN 모의주문 성공"
      });
      continue;
    }

    try {
      var response = placeDomesticBuyOrder_(target);
      results.push({
        code: target.code,
        name: target.name,
        quantity: target.quantity,
        orderType: target.orderType,
        result: isSuccessResponse_(response) ? "SUCCESS" : "FAILED",
        orderNo: response.ord_no || response.order_no || "",
        message: response.return_msg || response.msg1 || ""
      });
    } catch (error) {
      results.push({
        code: target.code,
        name: target.name,
        quantity: target.quantity,
        orderType: target.orderType,
        result: "FAILED",
        orderNo: "",
        message: String(error && error.message ? error.message : error)
      });
    }
  }

  return {
    dryRun: APP_CONFIG.DRY_RUN,
    executedAt: Utilities.formatDate(new Date(), APP_CONFIG.TIMEZONE, "yyyy-MM-dd HH:mm:ss"),
    itemCount: results.length,
    results: results
  };
}

function placeDomesticBuyOrder_(target) {
  var requestBody = {
    dmst_stex_tp: APP_CONFIG.KIWOOM_DOMESTIC_EXCHANGE,
    stk_cd: target.code,
    ord_qty: String(target.quantity),
    trde_tp: target.orderType === "MARKET" ? "3" : "0",
    ord_uv: target.orderType === "MARKET" ? "" : String(target.price),
    cond_uv: ""
  };

  return kiwoomPost_("/api/dostk/ordr", "kt10000", requestBody);
}

function kiwoomPost_(path, apiId, requestBody) {
  var accessToken = getAccessToken_();

  var response = UrlFetchApp.fetch(APP_CONFIG.KIWOOM_BASE_URL + path, {
    method: "post",
    contentType: "application/json",
    headers: {
      authorization: "Bearer " + accessToken,
      appkey: APP_CONFIG.KIWOOM_APP_KEY,
      appsecret: APP_CONFIG.KIWOOM_APP_SECRET,
      api_id: apiId
    },
    payload: JSON.stringify(requestBody || {}),
    muteHttpExceptions: true
  });

  var responseText = response.getContentText();
  var responseBody;

  try {
    responseBody = JSON.parse(responseText);
  } catch (error) {
    throw new Error("키움 응답 파싱 실패: " + responseText);
  }

  if (response.getResponseCode() < 200 || response.getResponseCode() >= 300) {
    throw new Error(responseBody.return_msg || responseBody.msg1 || responseText);
  }

  return responseBody;
}

function getAccessToken_() {
  var scriptProperties = PropertiesService.getScriptProperties();
  var token = scriptProperties.getProperty(TOKEN_CACHE_KEY) || "";
  var expireAt = Number(scriptProperties.getProperty(TOKEN_EXPIRE_KEY) || "0");

  if (token && Date.now() < expireAt) {
    return token;
  }

  var response = UrlFetchApp.fetch(APP_CONFIG.KIWOOM_BASE_URL + "/oauth2/token", {
    method: "post",
    contentType: "application/json",
    payload: JSON.stringify({
      grant_type: "client_credentials",
      appkey: APP_CONFIG.KIWOOM_APP_KEY,
      secretkey: APP_CONFIG.KIWOOM_APP_SECRET
    }),
    muteHttpExceptions: true
  });

  var responseText = response.getContentText();
  var responseBody;

  try {
    responseBody = JSON.parse(responseText);
  } catch (error) {
    throw new Error("토큰 응답 파싱 실패: " + responseText);
  }

  if (response.getResponseCode() < 200 || response.getResponseCode() >= 300 || !responseBody.token) {
    throw new Error("토큰 발급 실패: " + (responseBody.return_msg || responseBody.msg1 || responseText));
  }

  var expiresIn = Number(responseBody.expires_in || 3600);
  var nextExpireAt = Date.now() + Math.max(expiresIn - 60, 60) * 1000;

  scriptProperties.setProperty(TOKEN_CACHE_KEY, responseBody.token);
  scriptProperties.setProperty(TOKEN_EXPIRE_KEY, String(nextExpireAt));

  return responseBody.token;
}

function validateConfig_() {
  if (!APP_CONFIG.KIWOOM_APP_KEY || APP_CONFIG.KIWOOM_APP_KEY === "PUT_YOUR_APP_KEY_HERE") {
    throw new Error("APP_CONFIG.KIWOOM_APP_KEY 값을 입력하세요.");
  }

  if (!APP_CONFIG.KIWOOM_APP_SECRET || APP_CONFIG.KIWOOM_APP_SECRET === "PUT_YOUR_APP_SECRET_HERE") {
    throw new Error("APP_CONFIG.KIWOOM_APP_SECRET 값을 입력하세요.");
  }

  if (!APP_CONFIG.KIWOOM_ACCOUNT_NO || APP_CONFIG.KIWOOM_ACCOUNT_NO === "PUT_YOUR_ACCOUNT_NO_HERE") {
    throw new Error("APP_CONFIG.KIWOOM_ACCOUNT_NO 값을 입력하세요.");
  }
}

function getEnabledTargets_() {
  var enabledTargets = [];

  for (var i = 0; i < BUY_TARGETS.length; i += 1) {
    var item = BUY_TARGETS[i];

    if (!item.enabled) {
      continue;
    }

    var target = {
      code: String(item.code || "").replace(/[^\d]/g, ""),
      name: String(item.name || "").trim(),
      orderType: String(item.orderType || "MARKET").toUpperCase(),
      quantity: Number(item.quantity || 0),
      price: item.price === null || item.price === undefined ? null : Number(item.price)
    };

    if (!/^\d{6}$/.test(target.code)) {
      throw new Error("종목코드는 6자리 숫자여야 합니다: " + JSON.stringify(item));
    }

    if (!target.name) {
      throw new Error("종목명은 비워둘 수 없습니다: " + target.code);
    }

    if (!Number.isInteger(target.quantity) || target.quantity <= 0) {
      throw new Error("수량은 1 이상의 정수여야 합니다: " + target.code);
    }

    if (target.orderType !== "MARKET" && target.orderType !== "LIMIT") {
      throw new Error("orderType은 MARKET 또는 LIMIT만 가능합니다: " + target.code);
    }

    if (target.orderType === "LIMIT") {
      if (!Number.isInteger(target.price) || target.price <= 0) {
        throw new Error("지정가 주문은 price가 필요합니다: " + target.code);
      }
    } else {
      target.price = null;
    }

    enabledTargets.push(target);
  }

  if (!enabledTargets.length) {
    throw new Error("enabled: true 인 종목이 하나도 없습니다.");
  }

  return enabledTargets;
}

function isSuccessResponse_(response) {
  return response && (
    response.return_code === 0 ||
    response.return_code === "0" ||
    response.returnCode === 0 ||
    response.returnCode === "0"
  );
}

function isWeekdayInSeoul_(date) {
  var dayOfWeek = Number(Utilities.formatDate(date, APP_CONFIG.TIMEZONE, "u"));
  return dayOfWeek >= 1 && dayOfWeek <= 5;
}

function alreadyRanToday_(today) {
  return PropertiesService.getScriptProperties().getProperty(LAST_RUN_DATE_KEY) === today;
}

function resetLastRunDate() {
  PropertiesService.getScriptProperties().deleteProperty(LAST_RUN_DATE_KEY);
}

function clearTokenCache() {
  PropertiesService.getScriptProperties().deleteProperty(TOKEN_CACHE_KEY);
  PropertiesService.getScriptProperties().deleteProperty(TOKEN_EXPIRE_KEY);
}

function logMessage_(message, payload) {
  if (payload === undefined) {
    Logger.log(message);
    return;
  }

  Logger.log(message + "\n" + JSON.stringify(payload, null, 2));
}