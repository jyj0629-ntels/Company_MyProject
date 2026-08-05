const fs = require("fs");
const path = require("path");

const dataDir = path.join(__dirname, "..", "data");
const reservationFile = path.join(dataDir, "reservations.json");
const stockMasterFile = path.join(dataDir, "stock-master.json");
const stockMasterSampleFile = path.join(dataDir, "stock-master.sample.json");

function ensureDataFiles() {
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  if (!fs.existsSync(reservationFile)) {
    fs.writeFileSync(reservationFile, JSON.stringify({ reservations: [] }, null, 2));
  }

  if (!fs.existsSync(stockMasterFile)) {
    const source = fs.existsSync(stockMasterSampleFile)
      ? fs.readFileSync(stockMasterSampleFile, "utf-8")
      : "[]";
    fs.writeFileSync(stockMasterFile, source);
  }
}

function readReservations() {
  ensureDataFiles();
  const raw = fs.readFileSync(reservationFile, "utf-8");
  const parsed = JSON.parse(raw);
  return Array.isArray(parsed.reservations) ? parsed.reservations : [];
}

function writeReservations(reservations) {
  ensureDataFiles();
  fs.writeFileSync(reservationFile, JSON.stringify({ reservations }, null, 2));
}

function readStockMaster() {
  ensureDataFiles();
  const raw = fs.readFileSync(stockMasterFile, "utf-8");
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed)) {
    return [];
  }
  return parsed
    .map((item) => ({
      code: String(item.code || "").trim(),
      name: String(item.name || "").trim()
    }))
    .filter((item) => item.code && item.name);
}

function writeStockMaster(stocks) {
  ensureDataFiles();
  fs.writeFileSync(stockMasterFile, JSON.stringify(stocks, null, 2));
}

module.exports = {
  ensureDataFiles,
  readReservations,
  writeReservations,
  readStockMaster,
  writeStockMaster
};
