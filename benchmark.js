const { performance } = require('perf_hooks');

const buckets = Array.from({ length: 100 }, (_, i) => ({
  consumedMB: Math.random() * 1000,
  totalMB: Math.random() * 2000,
  availableMB: Math.random() * 1000,
  daysLeft: i % 10 === 0 ? Math.floor(Math.random() * 30) : null
}));

function baseline() {
  const totalMB = buckets.reduce((sum, b) => sum + b.totalMB, 0);
  const consumedMB = buckets.reduce((sum, b) => sum + b.consumedMB, 0);
  const availableMB = buckets.reduce((sum, b) => sum + b.availableMB, 0);
  return { totalMB, consumedMB, availableMB };
}

function optimized() {
  let consumedMB = 0;
  let totalMB = 0;
  let availableMB = 0;

  for (let i = 0; i < buckets.length; i++) {
    const b = buckets[i];
    consumedMB += b.consumedMB;
    totalMB += b.totalMB;
    availableMB += b.availableMB;
  }
  return { totalMB, consumedMB, availableMB };
}

// Warmup
for (let i = 0; i < 10000; i++) {
  baseline();
  optimized();
}

const ITERATIONS = 1000000;

const startBaseline = performance.now();
for (let i = 0; i < ITERATIONS; i++) {
  baseline();
}
const endBaseline = performance.now();

const startOptimized = performance.now();
for (let i = 0; i < ITERATIONS; i++) {
  optimized();
}
const endOptimized = performance.now();

console.log(`Baseline (3x reduce): ${(endBaseline - startBaseline).toFixed(2)} ms`);
console.log(`Optimized (1x for loop): ${(endOptimized - startOptimized).toFixed(2)} ms`);
console.log(`Improvement: ${(((endBaseline - startBaseline) - (endOptimized - startOptimized)) / (endBaseline - startBaseline) * 100).toFixed(2)}%`);
