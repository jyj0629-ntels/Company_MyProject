const BASE_HEADERS = {
  "Content-Type": "application/json; charset=utf-8"
};

class KiwoomClient {
  constructor(config) {
    this.config = config;
    this.cachedToken = {
      value: config.KIWOOM_ACCESS_TOKEN || "",
      expireAt: 0
    };
  }

  async createAccessToken() {
    const { KIWOOM_BASE_URL, KIWOOM_APP_KEY, KIWOOM_APP_SECRET } = this.config;

    if (!KIWOOM_APP_KEY || !KIWOOM_APP_SECRET) {
      throw new Error("키움 앱키/시크릿이 없습니다. .env 값을 확인하세요.");
    }

    const url = `${KIWOOM_BASE_URL}/oauth2/token`;
    const body = {
      grant_type: "client_credentials",
      appkey: KIWOOM_APP_KEY,
      secretkey: KIWOOM_APP_SECRET
    };

    const response = await fetch(url, {
      method: "POST",
      headers: BASE_HEADERS,
      body: JSON.stringify(body)
    });

    const json = await response.json();
    if (!response.ok || !json.token) {
      throw new Error(`토큰 발급 실패: ${json.return_msg || response.statusText}`);
    }

    const expireSeconds = Number(json.expires_in || 60 * 60);
    this.cachedToken = {
      value: json.token,
      expireAt: Date.now() + expireSeconds * 1000 - 60 * 1000
    };

    return this.cachedToken.value;
  }

  async getAccessToken() {
    if (this.cachedToken.value && this.cachedToken.expireAt > Date.now()) {
      return this.cachedToken.value;
    }

    if (this.cachedToken.value && this.cachedToken.expireAt === 0) {
      return this.cachedToken.value;
    }

    return this.createAccessToken();
  }

  async callApi({ path, apiId, body }) {
    const token = await this.getAccessToken();
    const { KIWOOM_BASE_URL, KIWOOM_APP_KEY, KIWOOM_APP_SECRET } = this.config;

    const response = await fetch(`${KIWOOM_BASE_URL}${path}`, {
      method: "POST",
      headers: {
        ...BASE_HEADERS,
        authorization: `Bearer ${token}`,
        appkey: KIWOOM_APP_KEY,
        appsecret: KIWOOM_APP_SECRET,
        api_id: apiId
      },
      body: JSON.stringify(body)
    });

    const json = await response.json();
    if (!response.ok) {
      throw new Error(`키움 API 오류: ${json.return_msg || response.statusText}`);
    }

    return json;
  }

  async lookupStockByCode(code) {
    const body = { stk_cd: code };
    const json = await this.callApi({
      path: "/api/dostk/stkinfo",
      apiId: "ka10001",
      body
    });

    return {
      code,
      name: json.stk_nm || json.stk_kor_nm || ""
    };
  }

  async placeDomesticBuyOrder({ code, quantity, isMarket, price }) {
    const trdeType = isMarket ? "3" : "0";
    const body = {
      dmst_stex_tp: this.config.KIWOOM_DOMESTIC_EXCHANGE,
      stk_cd: code,
      ord_qty: String(quantity),
      trde_tp: trdeType,
      ord_uv: isMarket ? "" : String(price || ""),
      cond_uv: ""
    };

    const json = await this.callApi({
      path: "/api/dostk/ordr",
      apiId: "kt10000",
      body
    });

    return {
      orderNo: json.ord_no || "",
      returnCode: json.return_code,
      returnMessage: json.return_msg || ""
    };
  }

  async healthCheck() {
    const token = await this.getAccessToken();
    return { ok: Boolean(token) };
  }
}

module.exports = { KiwoomClient };
