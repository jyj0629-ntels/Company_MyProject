const rowsBody = document.getElementById("rows");
const rowTemplate = document.getElementById("rowTemplate");
const addRowBtn = document.getElementById("addRowBtn");
const reserveBtn = document.getElementById("reserveBtn");
const healthBtn = document.getElementById("healthBtn");
const resultText = document.getElementById("resultText");
const resultTableWrap = document.getElementById("resultTableWrap");

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

async function lookupStock(params) {
  const query = new URLSearchParams(params);
  const response = await fetch(`/api/stocks/lookup?${query.toString()}`);
  if (!response.ok) {
    return null;
  }
  return response.json();
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
    const code = cleanNumber(codeInput.value);
    codeInput.value = code;
    if (!code || code.length !== 6) {
      return;
    }

    const found = await lookupStock({ code });
    if (found && found.name) {
      nameInput.value = found.name;
    }
  });

  nameInput.addEventListener("blur", async () => {
    const name = nameInput.value.trim();
    if (!name) {
      return;
    }

    const found = await lookupStock({ name });
    if (found && found.code) {
      codeInput.value = found.code;
      nameInput.value = found.name;
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
    const response = await fetch("/api/reservations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items })
    });

    const json = await response.json();
    if (!response.ok) {
      throw new Error(json.message || "예약 실패");
    }

    resultText.textContent = `예약번호: ${json.reservationNo} | 상태: ${json.result} | 스케줄: ${json.schedule}`;
    renderResultTable(json.rows || []);
  } catch (error) {
    resultText.textContent = `오류: ${error.message}`;
    resultTableWrap.innerHTML = "";
  }
}

async function checkHealth() {
  try {
    const response = await fetch("/api/health");
    const json = await response.json();
    if (!response.ok || !json.ok) {
      throw new Error(json.message || "연결 실패");
    }
    resultText.textContent = `연결 점검 성공 | DRY_RUN: ${json.dryRun} | Kiwoom: ${json.kiwoom}`;
  } catch (error) {
    resultText.textContent = `연결 점검 실패: ${error.message}`;
  }
}

addRowBtn.addEventListener("click", addRow);
reserveBtn.addEventListener("click", reservePurchase);
healthBtn.addEventListener("click", checkHealth);

addRow();
