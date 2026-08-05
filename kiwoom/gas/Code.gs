var KIWOOM_BASE_URL = "https://api.kiwoom.com";

function doGet(e) {
  return jsonResponse_({ ok: true, message: "Use POST" });
}

function doPost(e) {
  try {
    var action = (e && e.parameter && e.parameter.action) ? String(e.parameter.action) : "";
    var payload = parsePayload_(e);

    if (action === "health") {
      return jsonResponse_({ ok: true, data: handleHealth_() });
    }

    if (action === "lookup") {
      return jsonResponse_({ ok: true, data: handleLookup_(payload) });
    }

    if (action === "reserve") {
      return jsonResponse_({ ok: true, data: handleReserve_(payload) });
    }

    return jsonResponse_({ ok: false, message: "Unknown action" });
  } catch (error) {
    return jsonResponse_({ ok: false, message: String(error && error.message ? error.message : error) });
  }
}

function parsePayload_(e) {
  if (!e || !e.postData || !e.postData.contents) {
    return {};
  }

  try {
    return JSON.parse(e.postData.contents);
  } catch (error) {
    return {};
  }
}

function jsonResponse_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function getConfig_() {
  var p = PropertiesService.getScriptProperties();
  return {
    appKey: p.getProperty("KIWOOM_APP_KEY") || "",
    appSecret: p.getProperty("KIWOOM_APP_SECRET") || "",
    accountNo: p.getProperty("KIWOOM_ACCOUNT_NO") || "",
    exchange: p.getProperty("KIWOOM_DOMESTIC_EXCHANGE") || "KRX",
    dryRun: (p.getProperty("DRY_RUN") || "true").toLowerCase() === "true"
  };
}

function getAccessToken_() {
  var p = PropertiesService.getScriptProperties();
  var token = p.getProperty("KIWOOM_ACCESS_TOKEN") || "";
  var expireAt = Number(p.getProperty("KIWOOM_ACCESS_TOKEN_EXPIRE_AT") || "0");

  if (token && Date.now() < expireAt) {
    return token;
  }

  var cfg = getConfig_();
  if (!cfg.appKey || !cfg.appSecret) {
    throw new Error("스크립트 속성에 KIWOOM_APP_KEY / KIWOOM_APP_SECRET를 설정하세요.");
  }

  var res = UrlFetchApp.fetch(KIWOOM_BASE_URL + "/oauth2/token", {
    method: "post",
    contentType: "application/json",
    payload: JSON.stringify({
      grant_type: "client_credentials",
      appkey: cfg.appKey,
      secretkey: cfg.appSecret
    }),
    muteHttpExceptions: true
  });

  var body = JSON.parse(res.getContentText());
  if (res.getResponseCode() < 200 || res.getResponseCode() >= 300 || !body.token) {
    throw new Error("토큰 발급 실패: " + (body.return_msg || res.getContentText()));
  }

  var expiresIn = Number(body.expires_in || 3600);
  var nextExpire = Date.now() + (expiresIn - 60) * 1000;
  p.setProperty("KIWOOM_ACCESS_TOKEN", body.token);
  p.setProperty("KIWOOM_ACCESS_TOKEN_EXPIRE_AT", String(nextExpire));

  return body.token;
}

function kiwoomPost_(path, apiId, reqBody) {
  var cfg = getConfig_();
  var token = getAccessToken_();

  var res = UrlFetchApp.fetch(KIWOOM_BASE_URL + path, {
    method: "post",
    contentType: "application/json",
    headers: {
      authorization: "Bearer " + token,
      appkey: cfg.appKey,
      appsecret: cfg.appSecret,
      api_id: apiId
    },
    payload: JSON.stringify(reqBody || {}),
    muteHttpExceptions: true
  });

  var text = res.getContentText();
  var body;
  try {
    body = JSON.parse(text);
  } catch (error) {
    throw new Error("키움 응답 파싱 실패: " + text);
  }

  if (res.getResponseCode() < 200 || res.getResponseCode() >= 300) {
    throw new Error(body.return_msg || "키움 API 오류");
  }

  return body;
}

function handleHealth_() {
  var cfg = getConfig_();

  if (cfg.dryRun) {
    return {
      ok: true,
      dryRun: true,
      kiwoom: "SKIPPED (DRY_RUN)",
      now: new Date().toISOString()
    };
  }

  var token = getAccessToken_();
  return {
    ok: !!token,
    dryRun: false,
    kiwoom: "CONNECTED",
    now: new Date().toISOString()
  };
}

function handleLookup_(payload) {
  var code = String(payload.code || "").replace(/[^\d]/g, "");
  var name = String(payload.name || "").trim();

  var master = getStockMaster_();
  if (code) {
    var localByCode = master.filter(function (row) { return row.code === code; });
    if (localByCode.length > 0) {
      return localByCode[0];
    }

    var cfg = getConfig_();
    if (cfg.dryRun) {
      throw new Error("DRY_RUN에서 해당 종목 코드를 찾지 못했습니다.");
    }

    var stockInfo = kiwoomPost_("/api/dostk/stkinfo", "ka10001", { stk_cd: code });
    return { code: code, name: stockInfo.stk_nm || stockInfo.stk_kor_nm || "" };
  }

  if (name) {
    var lowered = name.toLowerCase();
    var matched = master.filter(function (row) {
      return row.name.toLowerCase().indexOf(lowered) >= 0;
    });
    if (matched.length > 0) {
      return matched[0];
    }
  }

  throw new Error("종목을 찾지 못했습니다.");
}

function handleReserve_(payload) {
  var cfg = getConfig_();
  var items = (payload && payload.items && payload.items.length) ? payload.items : [];
  if (!items.length) {
    throw new Error("최소 1개 종목이 필요합니다.");
  }

  var normalized = items.map(function (item, idx) {
    var code = String(item.code || "").replace(/[^\d]/g, "");
    var name = String(item.name || "").trim();
    var qty = Number(String(item.quantity || "").replace(/[^\d]/g, ""));
    var isMarket = !!item.isMarket;
    var price = Number(String(item.price || "").replace(/[^\d]/g, ""));

    if (!/^\d{6}$/.test(code)) {
      throw new Error((idx + 1) + "행 종목코드는 6자리 숫자여야 합니다.");
    }
    if (!name) {
      throw new Error((idx + 1) + "행 종목명이 필요합니다.");
    }
    if (!qty || qty <= 0) {
      throw new Error((idx + 1) + "행 주식수는 1 이상이어야 합니다.");
    }
    if (!isMarket && (!price || price <= 0)) {
      throw new Error((idx + 1) + "행 고정가 금액이 필요합니다.");
    }

    return {
      code: code,
      name: name,
      quantity: qty,
      isMarket: isMarket,
      price: isMarket ? null : price
    };
  });

  var reservationNo = "GAS-" + Utilities.formatDate(new Date(), "Asia/Seoul", "yyyyMMddHHmmss") + "-" + Math.floor(Math.random() * 9000 + 1000);
  var rows = [];

  for (var i = 0; i < normalized.length; i += 1) {
    var row = normalized[i];

    if (cfg.dryRun) {
      rows.push({
        code: row.code,
        name: row.name,
        result: "SUCCESS",
        orderNo: "MOCK-" + new Date().getTime() + "-" + i,
        message: "DRY_RUN 모의주문 성공"
      });
      continue;
    }

    try {
      var response = kiwoomPost_("/api/dostk/ordr", "kt10000", {
        dmst_stex_tp: cfg.exchange,
        stk_cd: row.code,
        ord_qty: String(row.quantity),
        trde_tp: row.isMarket ? "3" : "0",
        ord_uv: row.isMarket ? "" : String(row.price),
        cond_uv: ""
      });

      rows.push({
        code: row.code,
        name: row.name,
        result: (response.return_code === 0 || response.return_code === "0") ? "SUCCESS" : "FAILED",
        orderNo: response.ord_no || "",
        message: response.return_msg || ""
      });
    } catch (error) {
      rows.push({
        code: row.code,
        name: row.name,
        result: "FAILED",
        orderNo: "",
        message: String(error && error.message ? error.message : error)
      });
    }
  }

  saveReservationLog_(reservationNo, normalized, rows);

  return {
    reservationNo: reservationNo,
    result: "EXECUTED_NOW",
    schedule: "WEEKDAYS_09:00",
    rows: rows
  };
}

function getStockMaster_() {
  var p = PropertiesService.getScriptProperties();
  var raw = p.getProperty("STOCK_MASTER_JSON") || "[]";
  try {
    var parsed = JSON.parse(raw);
    if (!parsed || !parsed.length) {
      return [];
    }
    return parsed.map(function (item) {
      return {
        code: String(item.code || "").trim(),
        name: String(item.name || "").trim()
      };
    }).filter(function (item) {
      return item.code && item.name;
    });
  } catch (error) {
    return [];
  }
}

function saveReservationLog_(reservationNo, items, rows) {
  var p = PropertiesService.getScriptProperties();
  var raw = p.getProperty("RESERVATION_LOG_JSON") || "[]";
  var list;
  try {
    list = JSON.parse(raw);
    if (!Array.isArray(list)) {
      list = [];
    }
  } catch (error) {
    list = [];
  }

  list.push({
    reservationNo: reservationNo,
    createdAt: new Date().toISOString(),
    items: items,
    rows: rows
  });

  if (list.length > 200) {
    list = list.slice(list.length - 200);
  }

  p.setProperty("RESERVATION_LOG_JSON", JSON.stringify(list));
}
