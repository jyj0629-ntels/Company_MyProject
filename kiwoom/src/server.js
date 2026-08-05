const path = require("path");
const express = require("express");
const dotenv = require("dotenv");
const {
  ensureDataFiles,
  readReservations,
  writeReservations,
  readStockMaster
} = require("./store");
const { KiwoomClient } = require("./kiwoomClient");

dotenv.config({ path: path.join(__dirname, "..", ".env") });

const config = {
  PORT: Number(process.env.PORT || 4100),
  TZ: process.env.TZ || "Asia/Seoul",
  DRY_RUN: String(process.env.DRY_RUN || "true").toLowerCase() === "true",
  KIWOOM_BASE_URL: process.env.KIWOOM_BASE_URL || "https://api.kiwoom.com",
  KIWOOM_APP_KEY: process.env.KIWOOM_APP_KEY || "",
  KIWOOM_APP_SECRET: process.env.KIWOOM_APP_SECRET || "",
  KIWOOM_ACCESS_TOKEN: process.env.KIWOOM_ACCESS_TOKEN || "",
  KIWOOM_ACCOUNT_NO: process.env.KIWOOM_ACCOUNT_NO || "",
  KIWOOM_PRODUCT_CODE: process.env.KIWOOM_PRODUCT_CODE || "01",
  KIWOOM_DOMESTIC_EXCHANGE: process.env.KIWOOM_DOMESTIC_EXCHANGE || "KRX"
};

process.env.TZ = config.TZ;

ensureDataFiles();

const app = express();
const kiwoomClient = new KiwoomClient(config);

app.use(express.json());
app.use(express.static(path.join(__dirname, "..", "public")));

function generateReservationNo() {
  const now = new Date();
  const stamp = now.toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
  const random = Math.floor(Math.random() * 9000 + 1000);
  return `RSV-${stamp}-${random}`;
}

function parseNumber(value) {
  if (value === null || value === undefined) {
    return null;
  }
  const digits = String(value).replace(/,/g, "").trim();
  if (!digits) {
    return null;
  }
  const num = Number(digits);
  return Number.isFinite(num) ? num : null;
}

function normalizeItem(item, index) {
  const code = String(item.code || "").trim();
  const name = String(item.name || "").trim();
  const quantity = parseNumber(item.quantity);
  const isMarket = Boolean(item.isMarket);
  const price = parseNumber(item.price);

  if (!/^\d{6}$/.test(code)) {
    throw new Error(`${index + 1}행 종목코드는 6자리 숫자여야 합니다.`);
  }
  if (!name) {
    throw new Error(`${index + 1}행 종목명이 비어 있습니다.`);
  }
  if (!quantity || quantity <= 0 || !Number.isInteger(quantity)) {
    throw new Error(`${index + 1}행 구매 주식수는 1 이상의 정수여야 합니다.`);
  }
  if (!isMarket && (!price || price <= 0 || !Number.isInteger(price))) {
    throw new Error(`${index + 1}행 고정가 사용 시 구매가를 입력해야 합니다.`);
  }

  return {
    code,
    name,
    quantity,
    isMarket,
    price: isMarket ? null : price
  };
}

function isWeekdayMarketOpenNow() {
  const now = new Date();
  const day = now.getDay();
  if (day === 0 || day === 6) {
    return false;
  }

  const hour = now.getHours();
  const minute = now.getMinutes();
  const currentMinutes = hour * 60 + minute;
  const marketOpenMinutes = 9 * 60;
  return currentMinutes >= marketOpenMinutes && currentMinutes <= marketOpenMinutes + 5;
}

async function executeReservation(reservation) {
  const results = [];

  for (const item of reservation.items) {
    if (config.DRY_RUN) {
      results.push({
        code: item.code,
        name: item.name,
        result: "SUCCESS",
        orderNo: `MOCK-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        message: "DRY_RUN 모의주문 성공"
      });
      continue;
    }

    try {
      const order = await kiwoomClient.placeDomesticBuyOrder({
        code: item.code,
        quantity: item.quantity,
        isMarket: item.isMarket,
        price: item.price
      });

      results.push({
        code: item.code,
        name: item.name,
        result: order.returnCode === 0 || order.returnCode === "0" ? "SUCCESS" : "FAILED",
        orderNo: order.orderNo,
        message: order.returnMessage || ""
      });
    } catch (error) {
      results.push({
        code: item.code,
        name: item.name,
        result: "FAILED",
        orderNo: "",
        message: error.message
      });
    }
  }

  return results;
}

async function runSchedulerTick() {
  const reservations = readReservations();
  const today = new Date().toISOString().slice(0, 10);

  if (!isWeekdayMarketOpenNow()) {
    return;
  }

  let changed = false;

  for (const reservation of reservations) {
    if (!reservation.active) {
      continue;
    }

    if (reservation.lastExecutedDate === today) {
      continue;
    }

    const resultRows = await executeReservation(reservation);
    reservation.lastExecutedDate = today;
    reservation.lastResults = resultRows;
    reservation.updatedAt = new Date().toISOString();
    changed = true;
  }

  if (changed) {
    writeReservations(reservations);
  }
}

setInterval(() => {
  runSchedulerTick().catch((error) => {
    console.error("Scheduler error:", error.message);
  });
}, 30 * 1000);

app.get("/api/health", async (req, res) => {
  const base = {
    ok: true,
    dryRun: config.DRY_RUN,
    now: new Date().toISOString()
  };

  if (config.DRY_RUN) {
    return res.json({ ...base, kiwoom: "SKIPPED (DRY_RUN)" });
  }

  try {
    await kiwoomClient.healthCheck();
    return res.json({ ...base, kiwoom: "CONNECTED" });
  } catch (error) {
    return res.status(500).json({
      ...base,
      ok: false,
      kiwoom: "FAILED",
      message: error.message
    });
  }
});

app.get("/api/stocks/lookup", async (req, res) => {
  const code = String(req.query.code || "").trim();
  const name = String(req.query.name || "").trim();
  const master = readStockMaster();

  if (!code && !name) {
    return res.status(400).json({ message: "code 또는 name 중 하나는 필요합니다." });
  }

  if (code) {
    let found = master.find((item) => item.code === code) || null;

    if (!found && !config.DRY_RUN) {
      try {
        const apiFound = await kiwoomClient.lookupStockByCode(code);
        if (apiFound && apiFound.name) {
          found = apiFound;
        }
      } catch (error) {
        return res.status(500).json({ message: `종목 조회 실패: ${error.message}` });
      }
    }

    if (!found) {
      return res.status(404).json({ message: "종목을 찾지 못했습니다." });
    }

    return res.json(found);
  }

  const lowerName = name.toLowerCase();
  const candidates = master.filter((item) => item.name.toLowerCase().includes(lowerName));
  if (!candidates.length) {
    return res.status(404).json({ message: "종목을 찾지 못했습니다." });
  }

  return res.json(candidates[0]);
});

app.get("/api/reservations/latest", (req, res) => {
  const reservations = readReservations();
  if (!reservations.length) {
    return res.json({ reservation: null });
  }

  const latest = reservations.slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  return res.json({ reservation: latest });
});

app.post("/api/reservations", async (req, res) => {
  try {
    const inputItems = Array.isArray(req.body.items) ? req.body.items : [];
    if (!inputItems.length) {
      return res.status(400).json({ message: "최소 1개 종목이 필요합니다." });
    }

    const items = inputItems.map((item, index) => normalizeItem(item, index));

    const reservation = {
      reservationNo: generateReservationNo(),
      active: true,
      schedule: "WEEKDAYS_09:00",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      lastExecutedDate: "",
      items,
      lastResults: []
    };

    if (isWeekdayMarketOpenNow()) {
      reservation.lastResults = await executeReservation(reservation);
      reservation.lastExecutedDate = new Date().toISOString().slice(0, 10);
      reservation.updatedAt = new Date().toISOString();
    }

    const reservations = readReservations();
    reservations.push(reservation);
    writeReservations(reservations);

    return res.json({
      reservationNo: reservation.reservationNo,
      result: reservation.lastResults.length ? "EXECUTED_NOW" : "RESERVED",
      schedule: reservation.schedule,
      rows: reservation.lastResults
    });
  } catch (error) {
    return res.status(400).json({ message: error.message || "예약 처리 실패" });
  }
});

app.listen(config.PORT, () => {
  console.log(`Kiwoom reservation app started: http://localhost:${config.PORT}`);
  console.log(`DRY_RUN: ${config.DRY_RUN}`);
});
