import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

globalThis.Color = class { constructor(hex) { this.hex = hex; } };
globalThis.Size = class { constructor(w, h) { this.width = w; this.height = h; } };
globalThis.Rect = class { constructor(x, y, w, h) { this.x = x; this.y = y; this.width = w; this.height = h; } };
globalThis.Point = class { constructor(x, y) { this.x = x; this.y = y; } };
globalThis.Font = {
  boldSystemFont: (s) => ({ size: s, weight: "bold" }),
  semiboldSystemFont: (s) => ({ size: s, weight: "semibold" }),
  mediumSystemFont: (s) => ({ size: s, weight: "medium" }),
  regularSystemFont: (s) => ({ size: s, weight: "regular" })
};
globalThis.Path = class {
  constructor() { this.pts = []; }
  move(p) { this.pts.push(p); }
  addLine(p) { this.pts.push(p); }
};
globalThis.DrawContext = class {
  constructor() { this.texts = []; this.arcs = 0; }
  addPath() { this.arcs++; }
  setStrokeColor() {}
  setLineWidth() {}
  strokePath() {}
  setFillColor() {}
  fillEllipse() {}
  setTextAlignedCenter() {}
  setFont() {}
  setTextColor() {}
  drawTextInRect(t) { this.texts.push(t); }
  getImage() { return { texts: this.texts, arcs: this.arcs }; }
};
const makeStack = (texts, images) => ({
  layoutHorizontally() {},
  layoutVertically() {},
  centerAlignContent() {},
  setPadding() {},
  addSpacer() {},
  addText(t) { texts.push(t); return {}; },
  addStack() { return makeStack(texts, images); },
  addImage(img) { images.push(img); return { centerAlignImage() {} }; }
});
globalThis.ListWidget = class {
  constructor() {
    this.texts = [];
    this.images = [];
    Object.assign(this, makeStack(this.texts, this.images));
  }
};
const require = createRequire(import.meta.url);
const { parseTelcelResponse, createWidget, loadCache } = require("../src/MiTelcelWidget.js");
const { parseBaitResponse, createWidget: createBaitWidget, loadCache: loadBaitCache, fetchServiceKey: fetchBaitServiceKey, CONFIG: baitConfig } = require("../src/MiBaitWidget.js");
const {
  fetchMovistarData,
  parseMovistarResponse,
  decryptMovistarContent,
  extractGuardKey,
  fetchGuardKey,
  createWidget: createMovistarWidget,
  loadCache: loadMovistarCache
} = require("../src/MiMovistarWidget.js");
const { formatSummary } = await import("../android/mitelcel_widget.mjs");

const fixture = {
  blocks: {
    children: [
      { id: "text-plan-name", config: { value: "Telcel Libre 4" } },
      { id: "plan-details-row-template-col-2-web-0-0", config: { value: "28 de octubre" } },
      // Chart-only bucket with suffix 0-10-0 to verify numeric sort and KB chart fallback
      { id: "tabs-plans-v2-plan-name-0-10-0", config: { value: "Bono Chart KB" } },
      {
        id: "tabs-plans-v2-usage-chart-0-10-0",
        config: { data: [{ key: "used", value: 512 }, { key: "available", value: 512 }] }
      },
      // Out-of-order promo bucket with KB used, GB total, and the only cutoff days message
      { id: "tabs-plans-v2-plan-name-0-1-0", config: { value: "PROMO 50% DE DATOS 24 MDP" } },
      { id: "tabs-plans-v2-total-data-value-0-1-0", config: { value: "5" } },
      { id: "tabs-plans-v2-total-data-unit-0-1-0", config: { value: "GB" } },
      { id: "tabs-plans-v2-used-data-value-0-1-0", config: { value: "512" } },
      { id: "tabs-plans-v2-used-data-unit-0-1-0", config: { value: "KB" } },
      { id: "tabs-plans-v2-available-data-value-0-1-0", config: { value: "5" } },
      { id: "tabs-plans-v2-available-data-unit-0-1-0", config: { value: "GB" } },
      {
        id: "tabs-plans-v2-limited-cutoff-message-0-1-0",
        config: { segments: [{ text: "Faltan " }, { text: "9" }, { text: " días" }] }
      },
      // Empty bucket that should be ignored
      { id: "tabs-plans-v2-plan-name-0-2-0", config: { value: "Bolsa vacía" } },
      { id: "tabs-plans-v2-total-data-value-0-2-0", config: { value: "0" } },
      { id: "tabs-plans-v2-total-data-unit-0-2-0", config: { value: "MB" } },
      // Base plan bucket
      { id: "tabs-plans-v2-plan-name-0-0-0", config: { value: "Datos de mi plan" } },
      { id: "tabs-plans-v2-total-data-value-0-0-0", config: { value: "10" } },
      { id: "tabs-plans-v2-total-data-unit-0-0-0", config: { value: "GB" } },
      { id: "tabs-plans-v2-used-data-value-0-0-0", config: { value: "9.5" } },
      { id: "tabs-plans-v2-used-data-unit-0-0-0", config: { value: "GB" } },
      { id: "tabs-plans-v2-available-data-value-0-0-0", config: { value: "474" } },
      { id: "tabs-plans-v2-available-data-unit-0-0-0", config: { value: "MB" } }
    ]
  }
};

// 1. Test Scriptable JS parser & Android summary
const errorScreen = { blocks: { children: [{ id: "alert-error", config: { value: "Mantenimiento" } }] } };
assert.throws(() => parseTelcelResponse(errorScreen), /sin bolsas de datos/);
const jsRes = parseTelcelResponse(fixture);
assert.equal(jsRes.planName, "Telcel Libre 4");
assert.equal(jsRes.cutoffDate, "28 de octubre");
assert.equal(jsRes.daysLeft, 9);
assert.equal(jsRes.promo, true);
assert.deepEqual(jsRes.buckets.map(b => b.id), ["0-0-0", "0-1-0", "0-10-0"]);
assert.equal(jsRes.totalMB, 15001);
assert.equal(jsRes.consumedMB, 9501); // 9500 MB + 0.5 MB + 0.5 MB
assert.equal(jsRes.availableMB, 5474.5);
assert(formatSummary(jsRes).includes("5.47 GB libres de 15.0 GB"));

const wMid = createWidget(jsRes);
assert(wMid.texts.includes("9 días"));
assert(wMid.texts.includes("Corte 28 oct"));
assert(wMid.texts.includes("● 9.50 GB (63%)"));
assert(wMid.texts.includes("● 608 MB/d"));
assert.deepEqual(wMid.images[0].texts, ["5.47 GB", "libres de 15.0 GB"]);
assert.equal(wMid.images[0].arcs, 3); // track + red spent + green left

const wZero = createWidget({ ...jsRes, consumedMB: 0, availableMB: 15000, daysLeft: 1 });
assert(wZero.texts.includes("1 día"));
assert.equal(wZero.images[0].arcs, 2); // track + green left only

const wEmpty = createWidget({ ...jsRes, totalMB: 0, consumedMB: 0, availableMB: 0 });
assert.equal(wEmpty.images[0].arcs, 1); // track only when totalMB == 0

// 1b. Test Mi Bait parser & widget
const baitNow = new Date(2026, 9, 20, 10, 9); // Oct 20, 2026 10:09 local
const baitFixture = {
  success: true,
  data: [
    {
      category: "Data",
      type: "BestEffort",
      unlimited: false,
      resume: { total: 10240, unused: 6144, expire_date: "2026-11-01T23:59:59.000Z" }
    },
    {
      category: "Data",
      type: "Benefits",
      offers_detail: [
        { total: 5120, unused: 5120, expire_date: "2026-11-01T23:59:59.000Z" },
        { total: 2048, unused: 2048, expire_date: "2026-09-01T00:00:00.000Z" } // expired offer ignored
      ]
    },
    {
      category: "Data",
      type: "SocialMedia",
      unlimited: true,
      resume: { total: 5120, unused: 4800, expire_date: "2026-12-31T23:59:59.000Z" } // non-base bucket date ignored
    },
    {
      category: "Minutes",
      type: "National",
      resume: { total: 100, unused: 50, expire_date: "2026-12-15T23:59:59.000Z" } // voice date ignored
    }
  ]
};
assert.throws(() => parseBaitResponse({ success: false, message: "No se encontró" }), /No se encontró/);
const baitRes = parseBaitResponse(baitFixture, baitNow);
assert.equal(baitRes.planName, "Mi Bait");
assert.equal(baitRes.cutoffDate, "1 de noviembre");
assert.equal(baitRes.cutoffISO, "2026-11-01");
assert.equal(baitRes.daysLeft, 12);
assert.equal(baitRes.promo, true);
assert.equal(baitRes.totalMB, 15360);
assert.equal(baitRes.consumedMB, 4096);
assert.equal(baitRes.availableMB, 11264);
const wBait = createBaitWidget(baitRes);
assert(wBait.texts.includes("Mi Bait"));
assert(wBait.texts.includes("Vigencia 1 nov"));
assert(wBait.texts.includes("12 días"));
assert.deepEqual(wBait.images[0].texts, ["11.00 GB", "libres de 15.0 GB"]);

// Verify null cutoffISO when no expire_date exists and loadCache daysLeft recalculation/clamping
const baitNoCutoff = parseBaitResponse({
  success: true,
  data: [{ category: "Data", type: "BestEffort", unlimited: false, resume: { total: 1024, unused: 512 } }]
}, baitNow);
assert.equal(baitNoCutoff.cutoffISO, null);
assert.equal(baitNoCutoff.cutoffDate, "");
assert.equal(baitNoCutoff.daysLeft, 0);

let currentCacheString = JSON.stringify(baitRes);
globalThis.FileManager = {
  local: () => ({
    documentsDirectory: () => "/tmp",
    joinPath: (a, b) => `${a}/${b}`,
    fileExists: () => true,
    readString: () => currentCacheString
  })
};
const cachedLater = loadBaitCache(new Date(2026, 9, 28, 8, 0)); // 4 days before Nov 1
assert.equal(cachedLater.fromCache, true);
assert.equal(cachedLater.daysLeft, 4);
const cachedExpired = loadBaitCache(new Date(2026, 10, 5, 8, 0)); // Past Nov 1 -> clamped to 0
assert.equal(cachedExpired.fromCache, true);
assert.equal(cachedExpired.daysLeft, 0);

// Test Mi Bait dynamic service key fetch fallback
const originalFetch = globalThis.fetch;
let consoleWarnCalled = false;
const originalConsoleWarn = console.warn;

console.warn = (msg) => {
  if (msg.includes("No se pudo obtener la llave dinámicamente de mibait.com")) {
    consoleWarnCalled = true;
  } else {
    originalConsoleWarn(msg);
  }
};

globalThis.fetch = async (url) => {
  if (url === "https://mibait.com") {
    throw new Error("Simulated network failure");
  }
  return originalFetch(url);
};

// Temporarily clear environment variable if it exists to test the fetch/fallback path
const originalEnvKey = process.env.BAIT_SERVICE_KEY;
delete process.env.BAIT_SERVICE_KEY;

try {
  const serviceKey = await fetchBaitServiceKey();
  assert.equal(serviceKey, baitConfig.ordServiceKey, "Should fallback to hardcoded ordServiceKey on fetch failure");
  assert.equal(consoleWarnCalled, true, "Should log a warning when fetch fails");
} finally {
  globalThis.fetch = originalFetch;
  console.warn = originalConsoleWarn;
  if (originalEnvKey !== undefined) {
    process.env.BAIT_SERVICE_KEY = originalEnvKey;
  }
}

// 1c. Test Mi Telcel loadCache failure scenarios
// Mock FileManager.local() to throw an exception
const originalFileManager = globalThis.FileManager;
globalThis.FileManager = {
  local: () => {
    throw new Error("Simulated FileManager exception");
  }
};
assert.equal(loadCache(), null);

// Mock FileManager.local() to return invalid JSON
globalThis.FileManager = {
  local: () => ({
    documentsDirectory: () => "/tmp",
    joinPath: (a, b) => `${a}/${b}`,
    fileExists: () => true,
    readString: () => "{ invalid json ]"
  })
};
assert.equal(loadCache(), null);

// Mock FileManager.local() to have fileExists return false
globalThis.FileManager = {
  local: () => ({
    documentsDirectory: () => "/tmp",
    joinPath: (a, b) => `${a}/${b}`,
    fileExists: () => false,
    readString: () => { throw new Error("Should not be called"); }
  })
};
assert.equal(loadCache(), null);

// Mock FileManager.local() to return empty string (JSON.parse will throw)
globalThis.FileManager = {
  local: () => ({
    documentsDirectory: () => "/tmp",
    joinPath: (a, b) => `${a}/${b}`,
    fileExists: () => true,
    readString: () => ""
  })
};
assert.equal(loadCache(), null);

// Mock FileManager.local() to return "null" (valid JSON, but setting fromCache on null throws)
globalThis.FileManager = {
  local: () => ({
    documentsDirectory: () => "/tmp",
    joinPath: (a, b) => `${a}/${b}`,
    fileExists: () => true,
    readString: () => "null"
  })
};
assert.equal(loadCache(), null);

// Mock FileManager.local() to return primitive number (valid JSON, but setting fromCache silently succeeds in non-strict mode without modifying the primitive type - loadCache should handle this and return null)
globalThis.FileManager = {
  local: () => ({
    documentsDirectory: () => "/tmp",
    joinPath: (a, b) => `${a}/${b}`,
    fileExists: () => true,
    readString: () => "42"
  })
};
assert.equal(loadCache(), null);

// Mock FileManager.local() to return valid JSON object (Happy path cache hit)
globalThis.FileManager = {
  local: () => ({
    documentsDirectory: () => "/tmp",
    joinPath: (a, b) => `${a}/${b}`,
    fileExists: () => true,
    readString: () => '{"cutoffISO": "2026-10-28", "totalMB": 100}'
  })
};
const happyCache = loadCache();
assert.equal(happyCache.totalMB, 100);
assert.equal(happyCache.cutoffISO, "2026-10-28");
assert.equal(happyCache.fromCache, true);

// Restore FileManager mock
globalThis.FileManager = originalFileManager;

// Standard 2-bucket Fair-Use (BestEffort + Throttling) unlimited plan with expired cutoff
const baitUnlimited = parseBaitResponse({
  success: true,
  data: [
    { category: "Data", type: "BestEffort", unlimited: true, resume: { total: 10240, unused: 0, expire_date: "2026-10-15T23:59:59.000Z" } },
    { category: "Data", type: "Throttling", unlimited: true, resume: { total: 10240, unused: 5120, expire_date: "2026-10-15T23:59:59.000Z" } }
  ]
}, baitNow);
assert.equal(baitUnlimited.promo, false);
assert.equal(baitUnlimited.planName, "Bait Ilimitado");
assert.equal(baitUnlimited.daysLeft, 0);
const wBaitUnl = createBaitWidget(baitUnlimited);
assert(wBaitUnl.texts.some(t => t.startsWith("Bait Ilimitado • ⏱")));

// 1d. Test Mi Movistar parser, AES-256-GCM decryptor & widget
const movNow = new Date(2026, 9, 21, 10, 0); // Oct 21, 2026 10:00 local
const movFixture = {
  offering: "Movistar Libre",
  userType: 2,
  bolton: [
    {
      name: "Navegación",
      vigencia: "28/10/2026",
      consumption: 65,
      consumptionLabel: "Llevas 6.50 GB de 10.00 GB",
      totalBenefit: "10.00 GB"
    },
    {
      name: "Bono Datos Extra",
      vigencia: "28/10/2026",
      consumption: 50,
      consumptionLabel: "Llevas 1.00 GB de 2.00 GB",
      totalBenefit: "2.00 GB"
    },
    {
      name: "Redes Sociales",
      vigencia: "28/10/2026",
      consumption: 0,
      consumptionLabel: "Ilimitado",
      totalBenefit: "Ilimitado"
    },
    {
      name: "Minutos",
      totalBenefit: "Ilimitado"
    }
  ],
  saldos: {
    totalBalance: "0.00",
    giftBalance: "0.00",
    topupsBalanceExpiration: "28/10/2026"
  }
};

// Test AES-256-GCM decryption with static guardKey
const keyBytes = Uint8Array.from("03818954072261267933921453028068", c => c.charCodeAt(0));
const iv = new Uint8Array(12);
iv.fill(42);
const cryptoKey = await globalThis.crypto.subtle.importKey("raw", keyBytes, { name: "AES-GCM" }, false, ["encrypt"]);
const encBuf = await globalThis.crypto.subtle.encrypt(
  { name: "AES-GCM", iv, tagLength: 128 },
  cryptoKey,
  new TextEncoder().encode(JSON.stringify(movFixture))
);
const toB64Url = (buf) => Buffer.from(buf).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const cipherPayload = `${toB64Url(encBuf)}:${toB64Url(iv)}`;

// Hermetic Keychain + fetch mocks: no live requests to mi.movistar.com.mx
const staticKey = "03818954072261267933921453028068";
const rotatedKey = "88888888888888888888888888888888";
const keychainStore = new Map([["MOVISTAR_GUARD_KEY", staticKey]]);
let pageGuardKey = staticKey;
let datosResponse = {};
const fetchCalls = [];
const origFetch = globalThis.fetch;
globalThis.Keychain = {
  contains: (k) => keychainStore.has(k),
  get: (k) => keychainStore.get(k),
  set: (k, v) => keychainStore.set(k, v)
};
globalThis.fetch = async (url, opts) => {
  fetchCalls.push({ url, opts });
  if (url.endsWith("/login")) {
    if (!pageGuardKey) throw new Error("offline");
    return { text: async () => `<script>const guardString = "${Buffer.from(pageGuardKey).toString("base64")}";</script>` };
  }
  if (url.endsWith("/consumptions-controller/datos-iniciales")) return { json: async () => datosResponse };
  throw new Error(`Unexpected fetch ${url}`);
};
try {
  // Cached key decrypts without touching the network; malformed payload fails before key lookup
  assert.deepEqual(JSON.parse(await decryptMovistarContent(cipherPayload)), movFixture);
  await assert.rejects(async () => decryptMovistarContent("invalid_format"), /inválido/);
  assert.equal(fetchCalls.length, 0);

  // Test dynamic guardKey extraction and resolution
  assert.equal(
    extractGuardKey("<script>\nconst guardString = 'MDM4MTg5NTQwNzIyNjEyNjc5MzM5MjE0NTMwMjgwNjg=';\n</script>"),
    staticKey
  );
  assert.equal(extractGuardKey("<html>sin llave</html>"), null);
  assert.deepEqual(JSON.parse(await decryptMovistarContent(cipherPayload, staticKey)), movFixture);

  // Test automatic key rotation self-healing: stale cached key -> decrypt fails -> /login -> retry
  const rotatedCryptoKey = await globalThis.crypto.subtle.importKey("raw", Buffer.from(rotatedKey), { name: "AES-GCM" }, false, ["encrypt"]);
  const rotatedEnc = await globalThis.crypto.subtle.encrypt({ name: "AES-GCM", iv, tagLength: 128 }, rotatedCryptoKey, new TextEncoder().encode(JSON.stringify(movFixture)));
  const rotatedPayload = `${toB64Url(rotatedEnc)}:${toB64Url(iv)}`;
  pageGuardKey = rotatedKey;
  assert.deepEqual(JSON.parse(await decryptMovistarContent(rotatedPayload)), movFixture);
  assert.equal(fetchCalls.length, 1);
  assert.equal(keychainStore.get("MOVISTAR_GUARD_KEY"), rotatedKey);

  // fetchGuardKey falls back to the static key when /login is unreachable
  pageGuardKey = null;
  assert.equal(await fetchGuardKey(), staticKey);

  // fetchMovistarData sends raw p_id (no Bearer), decrypts and parses; invalid session rejects
  datosResponse = { content: rotatedPayload };
  const movFetched = await fetchMovistarData({ pId: "test-pid" });
  assert.equal(movFetched.totalMB, 12288);
  assert.equal(fetchCalls.at(-1).opts.headers.Authorization, "test-pid");
  datosResponse = { response: "401" };
  await assert.rejects(() => fetchMovistarData({ pId: "test-pid" }), /expirada/);
} finally {
  globalThis.fetch = origFetch;
  delete globalThis.Keychain;
}

// Test parser
assert.throws(() => parseMovistarResponse({ bolton: [] }), /Sin bolsas de datos/);
assert.throws(() => parseMovistarResponse({ bolton: [{ name: "Redes Sociales" }] }), /Sin bolsas de navegación/);
assert.throws(() => parseMovistarResponse({ bolton: [{ name: "Redes Sociales Ilimitadas", consumptionLabel: "Ilimitado" }] }), /Sin bolsas de navegación/);

const movRes = parseMovistarResponse(movFixture, movNow);
assert.equal(movRes.planName, "Movistar Libre");
assert.equal(movRes.cutoffDate, "28 de octubre");
assert.equal(movRes.cutoffISO, "2026-10-28");
assert.equal(movRes.daysLeft, 7);
assert.equal(movRes.promo, true);
assert.equal(movRes.totalMB, 12288);
assert.equal(movRes.consumedMB, 7680);
assert.equal(movRes.availableMB, 4608);

const wMov = createMovistarWidget(movRes);
assert(wMov.texts.includes("Mi Movistar"));
assert(wMov.texts.includes("Vigencia 28 oct"));
assert(wMov.texts.includes("7 días"));
assert(wMov.texts.includes("● 7.50 GB (63%)"));
assert.deepEqual(wMov.images[0].texts, ["4.50 GB", "libres de 12.0 GB"]);

// Test cache loading for Movistar
currentCacheString = JSON.stringify(movRes);
const movCached = loadMovistarCache(new Date(2026, 9, 25, 10, 0)); // 3 days left
assert.equal(movCached.fromCache, true);
assert.equal(movCached.daysLeft, 3);

// Test single-bucket unlimited Movistar plan
const movUnlimited = parseMovistarResponse({
  offering: "Movistar Ilimitado",
  bolton: [
    { name: "Navegación", consumptionLabel: "Ilimitado", totalBenefit: "Ilimitado", vigencia: "28/10/2026" }
  ]
}, movNow);
assert.equal(movUnlimited.planName, "Movistar Ilimitado");
assert.equal(movUnlimited.promo, false);
assert.equal(movUnlimited.totalMB, 0);
assert.equal(movUnlimited.daysLeft, 7);
const wMovUnl = createMovistarWidget(movUnlimited);
assert.deepEqual(wMovUnl.images[0].texts, ["Ilimitado", "datos libres"]);
assert(wMovUnl.texts.includes("● Ilimitado"));
assert(wMovUnl.texts.includes("● Datos Ilimitado"));

// Test epoch timestamp fallback in saldos.topupsBalanceExpirationDate
const movEpoch = parseMovistarResponse({
  offering: "Movistar Prepago",
  bolton: [
    { name: "Navegación", consumptionLabel: "Llevas 1.00 GB de 2.00 GB" }
  ],
  saldos: {
    topupsBalanceExpirationDate: new Date(2026, 9, 28, 23, 59, 59).getTime()
  }
}, movNow);
assert.equal(movEpoch.daysLeft, 7);
assert.equal(movEpoch.cutoffISO, "2026-10-28");

// 1e. Test ResetearPassword: per-carrier, "Todos" (index 3) and Cancel (-1)
const resetSource = readFileSync("src/ResetearPassword.js", "utf8");
const AsyncFunction = (async () => {}).constructor;
const runReset = async (choice) => {
  const store = new Map(["TELCEL_PASS", "TELCEL_PHONE", "BAIT_PHONE", "MOVISTAR_PID", "MOVISTAR_GUARD_KEY"].map(k => [k, "x"]));
  let alerts = 0;
  const Alert = class {
    addAction() {} addDestructiveAction() {} addCancelAction() {}
    async presentAlert() { return alerts++ === 0 ? choice : 0; }
  };
  const Keychain = { contains: (k) => store.has(k), remove: (k) => store.delete(k) };
  await new AsyncFunction("Alert", "Keychain", "Script", resetSource)(Alert, Keychain, { complete() {} });
  return [...store.keys()];
};
assert.deepEqual(await runReset(0), ["BAIT_PHONE", "MOVISTAR_PID", "MOVISTAR_GUARD_KEY"]);
assert.deepEqual(await runReset(1), ["TELCEL_PASS", "TELCEL_PHONE", "MOVISTAR_PID", "MOVISTAR_GUARD_KEY"]);
assert.deepEqual(await runReset(2), ["TELCEL_PASS", "TELCEL_PHONE", "BAIT_PHONE", "MOVISTAR_GUARD_KEY"]);
assert.deepEqual(await runReset(3), ["MOVISTAR_GUARD_KEY"]);
assert.equal((await runReset(-1)).length, 5);

// 2. Test Swift parser with the same fixture, error rejection, phone normalization & footerText
const swiftSource = readFileSync("MiTelcelWidget/TelcelNetworkService.swift", "utf8");
const swiftTest = `${swiftSource}
let json = #"""
${JSON.stringify(fixture)}
"""#.data(using: .utf8)!
let entry = try TelcelNetworkService.parseHomeFlowJSON(json)
assert(entry.planName == "Telcel Libre 4")
assert(entry.cutoffDate == "28 de octubre")
assert(entry.shortCutoffDate == "28 oct")
assert(entry.daysLeft == 9)
assert(entry.buckets.map(\\.id) == ["0-0-0", "0-1-0", "0-10-0"])
assert(entry.totalMB == 15001)
assert(entry.consumedMB == 9501)
assert(entry.availableMB == 5474.5)
assert(entry.footerText.hasPrefix("Plan+Promo • ⏱️ "))
assert(TelcelNetworkService.normalizePhone("+52 (55) 1234-5678") == "5512345678")
let badJson = #"{"blocks":{"children":[{"id":"alert-error","config":{"value":"Mantenimiento"}}]}}"#.data(using: .utf8)!
assert((try? TelcelNetworkService.parseHomeFlowJSON(badJson)) == nil)
assert(TelcelUsageEntry.errorFallback.totalMB == 0)
assert(TelcelUsageEntry.errorFallback.cutoffDate == "Verificar cuenta")
print("✅ Swift & JS parser tests passed!")
`;

try {
  const out = execFileSync("swift", ["-"], { input: swiftTest, encoding: "utf8" });
  console.log(out.trim());
} catch (error) {
  if (error.code === 'ENOENT') {
    console.warn("⚠️ Swift binary not found. Skipping Swift parser tests.");
  } else {
    throw error;
  }
}
