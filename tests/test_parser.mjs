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
const { parseTelcelResponse, createWidget } = require("../src/MiTelcelWidget.js");
const { parseBaitResponse, createWidget: createBaitWidget, loadCache: loadBaitCache } = require("../src/MiBaitWidget.js");
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

globalThis.FileManager = {
  local: () => ({
    documentsDirectory: () => "/tmp",
    joinPath: (a, b) => `${a}/${b}`,
    fileExists: () => true,
    readString: () => JSON.stringify(baitRes)
  })
};
const cachedLater = loadBaitCache(new Date(2026, 9, 28, 8, 0)); // 4 days before Nov 1
assert.equal(cachedLater.fromCache, true);
assert.equal(cachedLater.daysLeft, 4);
const cachedExpired = loadBaitCache(new Date(2026, 10, 5, 8, 0)); // Past Nov 1 -> clamped to 0
assert.equal(cachedExpired.fromCache, true);
assert.equal(cachedExpired.daysLeft, 0);

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

const out = execFileSync("swift", ["-"], { input: swiftTest, encoding: "utf8" });
console.log(out.trim());
