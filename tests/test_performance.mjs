import { performance } from 'node:perf_hooks';
import { createRequire } from 'node:module';

// Polyfill missing globals
globalThis.Color = class { constructor() {} };
globalThis.Font = {
  boldSystemFont: (s) => ({ size: s, weight: "bold" }),
  semiboldSystemFont: (s) => ({ size: s, weight: "semibold" }),
  mediumSystemFont: (s) => ({ size: s, weight: "medium" }),
  regularSystemFont: (s) => ({ size: s, weight: "regular" })
};
globalThis.LinearGradient = class { constructor() {} };
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
globalThis.FileManager = {
  local: () => ({
    documentsDirectory: () => "/tmp",
    joinPath: (a, b) => `${a}/${b}`,
    fileExists: () => true,
    readString: () => "{}"
  })
};

const require = createRequire(import.meta.url);
const { parseTelcelResponse } = require("../src/MiTelcelWidget.js");

// Generate a large synthetic payload
function generatePayload(depth, breadth) {
    let currentId = 0;
    function createNode(d) {
        if (d === 0) {
            const idStr = `tabs-plans-v2-plan-name-0-${currentId++}-0`;
            const dataValId = `tabs-plans-v2-total-data-value-0-${currentId-1}-0`;
            const dataUnitId = `tabs-plans-v2-total-data-unit-0-${currentId-1}-0`;
            return {
                id: `wrapper-${currentId-1}`,
                children: [
                    { id: idStr, config: { value: `Plan ${idStr}` } },
                    { id: dataValId, config: { value: "10" } },
                    { id: dataUnitId, config: { value: "GB" } }
                ]
            };
        }
        const children = [];
        for (let i = 0; i < breadth; i++) {
            children.push(createNode(d - 1));
        }
        return { id: `node-${d}`, config: {}, children };
    }
    // Need a base node for parseTelcelResponse to not throw error
    const baseNode = {
      children: [
        { id: "tabs-plans-v2-plan-name-0-0-0", config: { value: "Base" } },
        { id: "tabs-plans-v2-total-data-value-0-0-0", config: { value: "10" } },
        { id: "tabs-plans-v2-total-data-unit-0-0-0", config: { value: "GB" } }
      ]
    };
    return { blocks: { children: [baseNode, createNode(depth)] } };
}

const payload = generatePayload(6, 4); // 4^6 = 4096 nodes at the leaf level

console.log("Warming up...");
for (let i = 0; i < 10; i++) parseTelcelResponse(payload);

console.log("Running benchmark...");
const iterations = 100;
let totalTime = 0;

for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    parseTelcelResponse(payload);
    const end = performance.now();
    totalTime += (end - start);
}

const avgTime = totalTime / iterations;
console.log(`Average time over ${iterations} iterations: ${avgTime.toFixed(4)} ms`);
