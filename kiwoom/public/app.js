const rowsBody = document.getElementById("rows");
const rowTemplate = document.getElementById("rowTemplate");
const addRowBtn = document.getElementById("addRowBtn");
const reserveBtn = document.getElementById("reserveBtn");
const healthBtn = document.getElementById("healthBtn");
const resultText = document.getElementById("resultText");
const resultTableWrap = document.getElementById("resultTableWrap");
const APP_CONFIG = window.APP_CONFIG || {};
const GAS_WEB_APP_URL = String(APP_CONFIG.GAS_WEB_APP_URL || "").trim();
const ENABLE_LOCAL_FALLBACK = APP_CONFIG.ENABLE_LOCAL_FALLBACK !== false;

const LOCAL_STOCK_MASTER = [
  { code: "005930", name: "삼성전자" },
  { code: "000660", name: "SK하이닉스" },
  { code: "035420", name: "NAVER" },
  { code: "207940", name: "삼성바이오로직스" },
  { code: "051910", name: "LG화학" }
];

function numberWithComma(value) {
  const digits = String(value || "").replace(/[^\d]/g, "");
  if (!digits) {
    return "";
  }
  return Number(digits).toLocaleString("ko-KR");
}

function cleanNumber(value) {
  return String(value || "").replace(/[^\d]/g, "");
}

function setRowMarketMode(row, isMarket) {
  const priceInput = row.querySelector(".price");
  priceInput.disabled = isMarket;
  if (isMarket) {
    priceInput.value = "";
    priceInput.placeholder = "시장가";
  } else {
    priceInput.placeholder = "예: 72,500";
  }
}

function hasGasEndpoint() {
  return GAS_WEB_APP_URL.startsWith("https://script.google.com/");
}

async function requestGas(action, payload) {
  if (!hasGasEndpoint()) {
    return null;
  }

  const url = new URL(GAS_WEB_APP_URL);
  url.searchParams.set("action", action);

  const response = await fetch(url.toString(), {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify(payload || {})
  });

  if (!response.ok) {
    throw new Error(`GAS 요청 실패: ${response.status}`);
  }

  const json = await response.json();
  if (!json.ok) {
    throw new Error(json.message || "GAS 처리 실패");
  }

  return json;
}

async function requestLocal(method, path, body) {
  const response = await fetch(path, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined
  });

  const json = await response.json();
  if (!response.ok) {
    throw new Error(json.message || "로컬 서버 요청 실패");
  }
  return json;
}

async function apiLookupStock(params) {
  if (hasGasEndpoint()) {
    const json = await requestGas("lookup", params);
    return json.data || null;
  }

  const query = new URLSearchParams(params);
  const response = await fetch(`/api/stocks/lookup?${query.toString()}`);
  if (!response.ok) {
    return null;
  }
  return response.json();
}

async function apiReserve(items) {
  if (hasGasEndpoint()) {
    const json = await requestGas("reserve", { items });
    return json.data;
  }
  return requestLocal("POST", "/api/reservations", { items });
}

async function apiHealth() {
  if (hasGasEndpoint()) {
    const json = await requestGas("health", {});
    return json.data;
  }
  return requestLocal("GET", "/api/health");
}

async function lookupStock(params) {
  try {
    return await apiLookupStock(params);
  } catch (error) {
    return null;
  }
}

function lookupLocalByCode(code) {
  return LOCAL_STOCK_MASTER.find((item) => item.code === code) || null;
}

function lookupLocalByName(name) {
  const lowered = name.toLowerCase();
  return LOCAL_STOCK_MASTER.find((item) => item.name.toLowerCase().includes(lowered)) || null;
}

async function syncNameFromCode(codeInput, nameInput) {
  const code = cleanNumber(codeInput.value);
  codeInput.value = code;
  if (!code || code.length !== 6) {
    return;
  }

  let found = await lookupStock({ code });
  if (!found && ENABLE_LOCAL_FALLBACK) {
    found = lookupLocalByCode(code);
  }
  if (found && found.name) {
    nameInput.value = found.name;
  }
}

async function syncCodeFromName(codeInput, nameInput) {
  const name = nameInput.value.trim();
  if (!name) {
    return;
  }

  let found = await lookupStock({ name });
  if (!found && ENABLE_LOCAL_FALLBACK) {
    found = lookupLocalByName(name);
  }
  if (found && found.code) {
    codeInput.value = found.code;
    nameInput.value = found.name;
  }
}

function buildRow() {
  const fragment = rowTemplate.content.cloneNode(true);
  const row = fragment.querySelector("tr");

  const codeInput = row.querySelector(".code");
  const nameInput = row.querySelector(".name");
  const marketCheckbox = row.querySelector(".is-market");
  const priceInput = row.querySelector(".price");
  const removeBtn = row.querySelector(".remove");

  marketCheckbox.addEventListener("change", () => {
    setRowMarketMode(row, marketCheckbox.checked);
  });

  priceInput.addEventListener("input", () => {
    priceInput.value = numberWithComma(priceInput.value);
  });

  codeInput.addEventListener("blur", async () => {
    await syncNameFromCode(codeInput, nameInput);
  });

  codeInput.addEventListener("change", async () => {
    await syncNameFromCode(codeInput, nameInput);
  });

  codeInput.addEventListener("keydown", async (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      await syncNameFromCode(codeInput, nameInput);
    }
  });

  nameInput.addEventListener("blur", async () => {
    await syncCodeFromName(codeInput, nameInput);
  });

  nameInput.addEventListener("change", async () => {
    await syncCodeFromName(codeInput, nameInput);
  });

  nameInput.addEventListener("keydown", async (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      await syncCodeFromName(codeInput, nameInput);
    }
  });

  removeBtn.addEventListener("click", () => {
    row.remove();
  });

  setRowMarketMode(row, true);
  return row;
}

function addRow() {
  const row = buildRow();
  rowsBody.appendChild(row);
}

function collectRows() {
  const rows = Array.from(rowsBody.querySelectorAll("tr"));
  return rows.map((row) => {
    const code = cleanNumber(row.querySelector(".code").value);
    const name = row.querySelector(".name").value.trim();
    const isMarket = row.querySelector(".is-market").checked;
    const price = cleanNumber(row.querySelector(".price").value);
    const quantity = cleanNumber(row.querySelector(".qty").value);

    return {
      code,
      name,
      isMarket,
      price,
      quantity
    };
  });
}

function renderResultTable(rows) {
  if (!rows || !rows.length) {
    resultTableWrap.innerHTML = "";
    return;
  }

  const lines = rows
    .map((row) => {
      const cls = row.result === "SUCCESS" ? "result-success" : "result-failed";
      return `<tr>
        <td>${row.code}</td>
        <td>${row.name}</td>
        <td class="${cls}">${row.result}</td>
        <td>${row.orderNo || "-"}</td>
        <td>${row.message || ""}</td>
      </tr>`;
    })
    .join("");

  resultTableWrap.innerHTML = `<div class="table-wrap"><table>
    <thead>
      <tr>
        <th>종목코드</th>
        <th>종목명</th>
        <th>결과</th>
        <th>주문번호</th>
        <th>메시지</th>
      </tr>
    </thead>
    <tbody>${lines}</tbody>
  </table></div>`;
}

async function reservePurchase() {
  try {
    const items = collectRows();
    const json = await apiReserve(items);

    resultText.textContent = `예약번호: ${json.reservationNo} | 상태: ${json.result} | 스케줄: ${json.schedule}`;
    renderResultTable(json.rows || []);
  } catch (error) {
    resultText.textContent = `오류: ${error.message}`;
    resultTableWrap.innerHTML = "";
  }
}

async function checkHealth() {
  try {
    const json = await apiHealth();
    resultText.textContent = `연결 점검 성공 | DRY_RUN: ${json.dryRun} | Kiwoom: ${json.kiwoom}`;
  } catch (error) {
    if (hasGasEndpoint()) {
      resultText.textContent = `연결 점검 실패(GAS): ${error.message}`;
    } else {
      resultText.textContent = "연결 점검 실패: 백엔드 서버에 연결되지 않았습니다. Node 서버 실행 후 다시 시도하세요.";
    }
  }
}

addRowBtn.addEventListener("click", addRow);
reserveBtn.addEventListener("click", reservePurchase);
healthBtn.addEventListener("click", checkHealth);

addRow();
