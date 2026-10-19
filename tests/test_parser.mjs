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

const fixture = {
  blocks: {
    children: [
      { id: "text-plan-name", config: { value: "Telcel Libre 4" } },
      { id: "plan-details-row-template-col-2-0-0", config: { value: "28 de octubre" } },
      {
        id: "tabs-plans-v2-limited-cutoff-message-0-0-0",
        config: { segments: [{ text: "Faltan " }, { text: "9" }, { text: " días" }] }
      },
      // Out-of-order promo bucket with KB used and GB total
      { id: "tabs-plans-v2-plan-name-0-1-0", config: { value: "PROMO 50% DE DATOS 24 MDP" } },
      { id: "tabs-plans-v2-total-data-value-0-1-0", config: { value: "5" } },
      { id: "tabs-plans-v2-total-data-unit-0-1-0", config: { value: "GB" } },
      { id: "tabs-plans-v2-used-data-value-0-1-0", config: { value: "512" } },
      { id: "tabs-plans-v2-used-data-unit-0-1-0", config: { value: "KB" } },
      { id: "tabs-plans-v2-available-data-value-0-1-0", config: { value: "5" } },
      { id: "tabs-plans-v2-available-data-unit-0-1-0", config: { value: "GB" } },
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

// 1. Test Scriptable JS parser
const jsRes = parseTelcelResponse(fixture);
assert.equal(jsRes.planName, "Telcel Libre 4");
assert.equal(jsRes.cutoffDate, "28 de octubre");
assert.equal(jsRes.daysLeft, 9);
assert.equal(jsRes.buckets.length, 2);
assert.equal(jsRes.buckets[0].id, "0-0-0");
assert.equal(jsRes.buckets[1].id, "0-1-0");
assert.equal(jsRes.totalMB, 15000);
assert.equal(jsRes.consumedMB, 9500.5); // 9500 MB + 512 KB (0.5 MB)
assert.equal(jsRes.availableMB, 5474);

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

// 2. Test Swift parser with the same fixture + shortCutoffDate & errorFallback check
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
assert(entry.buckets.count == 2)
assert(entry.buckets[0].id == "0-0-0")
assert(entry.buckets[1].id == "0-1-0")
assert(entry.totalMB == 15000)
assert(entry.consumedMB == 9500.5)
assert(entry.availableMB == 5474)
assert(TelcelUsageEntry.errorFallback.totalMB == 0)
assert(TelcelUsageEntry.errorFallback.cutoffDate == "Verificar cuenta")
print("✅ Swift & JS parser tests passed!")
`;

const out = execFileSync("swift", ["-"], { input: swiftTest, encoding: "utf8" });
console.log(out.trim());
