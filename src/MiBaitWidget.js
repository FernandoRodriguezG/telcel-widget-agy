// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: yellow; icon-glyph: signal;

/**
 * Widget de Consumo de Datos Mi Bait para iOS (Scriptable)
 * Consulta directa por MSISDN vía Ordenaris/Altán (/api/core/q/dn/{phone}/get/consumption).
 */

const CONFIG = {
  phone: "", // Se guarda en el Keychain de iOS al ejecutar el script en la app
  useMockData: false,
  cacheFileName: "mibait_usage_cache.json",
  // SECURITY NOTE: This ordServiceKey is intentionally hardcoded.
  // It is a public API key extracted from the client-side JavaScript of mibait.com
  // and is NOT a sensitive secret. It is kept here as a necessary fallback for the
  // Scriptable iOS widget environment which lacks a dedicated secrets manager,
  // in case the dynamic fetch fails.
  // shortcut: static Ordenaris service key from mibait.com bundle, rotate or switch to /conn/page/api/app/consumoV3 if revoked
  ordServiceKey: "57bfb26735aa4ec3a1baafa864006d7d"
};

const COLORS = {
  bg: new Color("#111111"),
  pillBg: new Color("#242428"),
  brandGreen: new Color("#32D74B"),
  spentRed: new Color("#FF453A"),
  white: new Color("#FFFFFF"),
  subtitleGray: new Color("#98989F"),
  trackGray: new Color("#2C2C2E"),
  warnYellow: new Color("#FFD60A"),
  alertRed: new Color("#FF453A")
};

const MONTHS_ES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"
];

async function getCredentials() {
  let phone = String(Keychain.contains("BAIT_PHONE") ? Keychain.get("BAIT_PHONE") : CONFIG.phone || "").replace(/\D/g, "").slice(-10);
  if ((phone.length !== 10 || phone === "5512345678") && !config.runsInWidget) {
    const alert = new Alert();
    alert.title = "Configurar Mi Bait";
    alert.message = "Ingresa tu número Bait a 10 dígitos (no requiere contraseña).";
    alert.addTextField("Número a 10 dígitos", phone);
    alert.addAction("Guardar");
    alert.addCancelAction("Cancelar");
    if ((await alert.presentAlert()) === 0) {
      phone = alert.textFieldValue(0).replace(/\D/g, "").slice(-10);
      if (phone.length === 10) Keychain.set("BAIT_PHONE", phone);
    }
  }
  return { phone };
}

async function main() {
  let usageData = null;

  if (CONFIG.useMockData) {
    usageData = {
      consumedMB: 4096,
      totalMB: 15360,
      availableMB: 11264,
      daysLeft: 12,
      cutoffDate: "15 de noviembre",
      planName: "Mi Bait",
      promo: true,
      updatedAt: "10:09",
      fromCache: false
    };
  } else {
    try {
      usageData = await fetchBaitData();
      saveCache(usageData);
    } catch (error) {
      console.warn("Fallo en red Mi Bait, usando caché local: " + error.message);
      usageData = loadCache();
    }
  }

  const widget = createWidget(usageData);

  if (config.runsInWidget) {
    Script.setWidget(widget);
  } else {
    await widget.presentSmall();
  }
  Script.complete();
}

async function requestBait(url, headers) {
  if (typeof Request !== "undefined") {
    const req = new Request(url);
    req.method = "GET";
    req.headers = headers;
    return req.loadJSON();
  }
  const res = await fetch(url, { method: "GET", headers });
  return res.json();
}

async function requestText(url, headers = {}) {
  if (typeof Request !== "undefined") {
    const req = new Request(url);
    req.method = "GET";
    req.headers = headers;
    return req.loadString();
  }
  const res = await fetch(url, { method: "GET", headers });
  return res.text();
}

async function fetchServiceKey() {
  if (typeof process !== "undefined" && process.env.BAIT_SERVICE_KEY) {
    return process.env.BAIT_SERVICE_KEY;
  }

  try {
    const html = await requestText("https://mibait.com");
    const mainJsMatch = html.match(/src="(main\.[a-f0-9]+\.js)"/);
    if (mainJsMatch) {
      const jsContent = await requestText(`https://mibait.com/${mainJsMatch[1]}`);
      const keyMatch = jsContent.match(/xOrdService:"([a-f0-9]{32})"/);
      if (keyMatch) {
        return keyMatch[1];
      }
    }
  } catch (error) {
    console.warn("No se pudo obtener la llave dinámicamente de mibait.com: " + error.message);
  }

  return CONFIG.ordServiceKey;
}

async function fetchBaitData(creds) {
  const raw = creds || await getCredentials();
  const phone = String(raw?.phone || "").replace(/\D/g, "").slice(-10);
  if (phone.length !== 10) {
    throw new Error("Configura un número Bait válido a 10 dígitos en Scriptable.");
  }

  const ordServiceKey = await fetchServiceKey();

  const json = await requestBait(
    `https://mibait.com/api/core/q/dn/${encodeURIComponent(phone)}/get/consumption`,
    {
      "Accept": "application/json",
      "x-ord-service": ordServiceKey
    }
  );
  return parseBaitResponse(json);
}

function parseExpire(iso) {
  const m = String(iso || "").split("T")[0].match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const dt = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(dt.getTime()) ? null : dt;
}

/**
 * Normaliza la respuesta de /api/core/q/dn/{phone}/get/consumption (esquema Altán/Ordenaris).
 * Suma bolsas BestEffort + Throttling (Plan Base) y Benefits vigentes (Datos Promocionales).
 */
function parseBaitResponse(payload, now = new Date()) {
  if (!payload?.success || !Array.isArray(payload?.data)) {
    throw new Error(payload?.message || "Respuesta de Mi Bait sin datos de consumo");
  }

  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const buckets = [];
  let maxExpire = null;

  let isUnlimited = false;
  let promo = false;
  let totalMB = 0;
  let consumedMB = 0;
  let availableMB = 0;

  const trackExpire = (dt) => {
    if (dt && (!maxExpire || dt > maxExpire)) maxExpire = dt;
  };

  for (const item of payload.data) {
    if (!isUnlimited && item && item.category === "Data" && item.type !== "Unkown" && item.type !== "SocialMedia" && item.unlimited) {
      isUnlimited = true;
    }

    if (item?.type === "BestEffort" || item?.type === "Throttling") {
      const bTotalMB = Number(item?.resume?.total) || 0;
      const bAvailableMB = Number(item?.resume?.unused) || 0;
      const bConsumedMB = Math.max(0, bTotalMB - bAvailableMB);
      if (bTotalMB > 0 || bAvailableMB > 0) {
        trackExpire(parseExpire(item?.resume?.expire_date));
        buckets.push({
          id: item.type,
          name: item.type === "BestEffort" ? "Velocidad normal" : "Velocidad reducida",
          consumedMB: bConsumedMB,
          totalMB: bTotalMB,
          availableMB: bAvailableMB
        });
        totalMB += bTotalMB;
        consumedMB += bConsumedMB;
        availableMB += bAvailableMB;
      }
    } else if (item?.type === "Benefits" && Array.isArray(item.offers_detail)) {
      let promoTotal = 0;
      let promoAvail = 0;
      for (const offer of item.offers_detail) {
        const exp = parseExpire(offer?.expire_date);
        if (!exp || exp >= today) {
          promoTotal += Number(offer?.total) || 0;
          promoAvail += Number(offer?.unused) || 0;
          trackExpire(exp);
        }
      }
      if (promoTotal > 0 || promoAvail > 0) {
        promo = true;
        const bConsumedMB = Math.max(0, promoTotal - promoAvail);
        buckets.push({
          id: "Benefits",
          name: "Beneficios",
          consumedMB: bConsumedMB,
          totalMB: promoTotal,
          availableMB: promoAvail
        });
        totalMB += promoTotal;
        consumedMB += bConsumedMB;
        availableMB += promoAvail;
      }
    }
  }

  if (!buckets.length) {
    throw new Error("Sin bolsas de datos activas en la línea Bait");
  }

  const daysLeft = maxExpire
    ? Math.max(0, Math.round((maxExpire.getTime() - today.getTime()) / 86400000))
    : 0;
  const cutoffDate = maxExpire
    ? `${maxExpire.getDate()} de ${MONTHS_ES[maxExpire.getMonth()]}`
    : "";
  const cutoffISO = maxExpire
    ? `${maxExpire.getFullYear()}-${String(maxExpire.getMonth() + 1).padStart(2, "0")}-${String(maxExpire.getDate()).padStart(2, "0")}`
    : null;

  const hh = String(now.getHours()).padStart(2, "0");
  const mm = String(now.getMinutes()).padStart(2, "0");

  return {
    consumedMB,
    totalMB,
    availableMB,
    daysLeft,
    cutoffDate,
    cutoffISO,
    planName: isUnlimited ? "Bait Ilimitado" : "Mi Bait",
    promo,
    buckets,
    updatedAt: `${hh}:${mm}`,
    fromCache: false
  };
}

function createWidget(data) {
  const w = new ListWidget();
  w.backgroundColor = COLORS.bg;
  w.setPadding(11, 13, 10, 13);
  w.url = "https://mibait.com/home";

  if (!data) {
    const errTxt = w.addText("Sin datos de Mi Bait. Verificar número o red.");
    errTxt.textColor = COLORS.white;
    errTxt.font = Font.mediumSystemFont(12);
    return w;
  }

  const remainingMB = Math.max(0, data.availableMB ?? (data.totalMB - data.consumedMB));
  const remainingGB = (remainingMB / 1024).toFixed(2);
  const totalGB = (data.totalMB / 1024).toFixed(1);
  const ratio = data.totalMB > 0 ? Math.min(1, Math.max(0, data.consumedMB / data.totalMB)) : 0;
  const percentUsed = Math.round(ratio * 100);
  const days = Math.max(1, data.daysLeft ?? 1);
  const dailyMB = remainingMB / days;
  const dailyAllowance = dailyMB >= 1024
    ? `${(dailyMB / 1024).toFixed(2)} GB/d`
    : `${Math.round(dailyMB)} MB/d`;
  const spentShort = data.consumedMB < 1024
    ? `${Math.round(data.consumedMB)} MB`
    : `${(data.consumedMB / 1024).toFixed(2)} GB`;
  const shortCutoff = String(data.cutoffDate || "").replace(/\s+de\s+([a-záéíóú]{3})[a-záéíóú]*/i, " $1");

  const headerStack = w.addStack();
  headerStack.layoutHorizontally();
  headerStack.centerAlignContent();

  const titleCol = headerStack.addStack();
  titleCol.layoutVertically();
  const brandTxt = titleCol.addText("Mi Bait");
  brandTxt.font = Font.boldSystemFont(11);
  brandTxt.textColor = COLORS.white;
  if (shortCutoff) {
    const cutoffTxt = titleCol.addText(`Vigencia ${shortCutoff}`);
    cutoffTxt.font = Font.regularSystemFont(9.5);
    cutoffTxt.textColor = COLORS.subtitleGray;
  }

  headerStack.addSpacer();

  const daysPill = headerStack.addStack();
  daysPill.backgroundColor = COLORS.pillBg;
  daysPill.cornerRadius = 7;
  daysPill.setPadding(3, 7, 3, 7);
  daysPill.centerAlignContent();
  const daysColor = data.daysLeft <= 2 ? COLORS.alertRed : data.daysLeft <= 5 ? COLORS.warnYellow : COLORS.white;
  const daysTxt = daysPill.addText(`${data.daysLeft} ${data.daysLeft === 1 ? "día" : "días"}`);
  daysTxt.font = Font.boldSystemFont(13);
  daysTxt.textColor = daysColor;

  w.addSpacer(4);

  const gaugeRatio = data.totalMB > 0 ? ratio : null;
  const gaugeImg = w.addImage(drawSemicircleGauge(gaugeRatio, `${remainingGB} GB`, `libres de ${totalGB} GB`));
  gaugeImg.resizable = true;
  gaugeImg.imageSize = new Size(134, 68);
  gaugeImg.centerAlignImage();

  w.addSpacer(4);

  const statsRow = w.addStack();
  statsRow.layoutHorizontally();
  statsRow.centerAlignContent();

  const spentTxt = statsRow.addText(`● ${spentShort} (${percentUsed}%)`);
  spentTxt.font = Font.semiboldSystemFont(10);
  spentTxt.textColor = COLORS.spentRed;
  spentTxt.lineLimit = 1;
  spentTxt.minimumScaleFactor = 0.75;

  statsRow.addSpacer();

  const paceTxt = statsRow.addText(`● ${dailyAllowance}`);
  paceTxt.font = Font.semiboldSystemFont(10);
  paceTxt.textColor = COLORS.brandGreen;
  paceTxt.lineLimit = 1;
  paceTxt.minimumScaleFactor = 0.75;

  w.addSpacer(3);

  const footerStack = w.addStack();
  footerStack.layoutHorizontally();
  footerStack.centerAlignContent();

  const promoLabel = data.promo ? "Plan+Bono" : (data.planName || "Mi Bait");
  const cacheIndicator = data.fromCache ? " ☁️" : "";
  const footerTxt = footerStack.addText(`${promoLabel} • ⏱ ${data.updatedAt}${cacheIndicator}`);
  footerTxt.font = Font.regularSystemFont(9.5);
  footerTxt.textColor = COLORS.subtitleGray;
  footerTxt.lineLimit = 1;
  footerTxt.minimumScaleFactor = 0.8;

  return w;
}

// Note: Drawing logic (drawArc, drawSemicircleGauge) is intentionally duplicated
// across standalone widget scripts (MiTelcelWidget.js, MiBaitWidget.js, MiMovistarWidget.js)
// so each file can be copied directly into the iOS Scriptable app without external module dependencies.
function drawArc(ctx, cx, cy, r, startAngle, endAngle, thickness, color) {
  if (endAngle - startAngle <= 0.005) return;
  const path = new Path();
  const steps = Math.max(12, Math.ceil((endAngle - startAngle) * 40));
  for (let i = 0; i <= steps; i++) {
    const a = startAngle + ((endAngle - startAngle) * i) / steps;
    const pt = new Point(cx + r * Math.cos(a), cy + r * Math.sin(a));
    if (i === 0) path.move(pt);
    else path.addLine(pt);
  }
  ctx.addPath(path);
  ctx.setStrokeColor(color);
  ctx.setLineWidth(thickness);
  ctx.strokePath();

  ctx.setFillColor(color);
  const half = thickness / 2;
  for (const a of [startAngle, endAngle]) {
    ctx.fillEllipse(new Rect(cx + r * Math.cos(a) - half, cy + r * Math.sin(a) - half, thickness, thickness));
  }
}

/**
 * Dibuja el medidor semicircular con lo gastado en rojo (izquierda) y lo disponible en verde (derecha)
 */
function drawSemicircleGauge(spentRatio, mainLabel, subLabel) {
  const width = 360;
  const height = 182;
  const cx = width / 2;
  const cy = 152;
  const r = 124;
  const thickness = 24;

  const ctx = new DrawContext();
  ctx.size = new Size(width, height);
  ctx.opaque = false;
  ctx.respectScreenScale = true;

  // Riel completo semicircular (de PI a 2*PI)
  drawArc(ctx, cx, cy, r, Math.PI, 2 * Math.PI, thickness, COLORS.trackGray);

  if (spentRatio !== null && Number.isFinite(spentRatio)) {
    const clamped = Math.max(0, Math.min(1, spentRatio));
    const splitAngle = Math.PI + clamped * Math.PI;
    const gap = clamped > 0.04 && clamped < 0.96 ? 0.11 : 0;

    // Segmento izquierdo: Gastado en Rojo
    if (clamped > 0.005) {
      drawArc(ctx, cx, cy, r, Math.PI, Math.max(Math.PI + 0.01, splitAngle - gap), thickness, COLORS.spentRed);
    }
    // Segmento derecho: Disponible en Verde
    if (clamped < 0.995) {
      drawArc(ctx, cx, cy, r, Math.min(2 * Math.PI - 0.01, splitAngle + gap), 2 * Math.PI, thickness, COLORS.brandGreen);
    }
  }

  // Texto principal centrado dentro del arco ("5.47 GB")
  ctx.setTextAlignedCenter();
  ctx.setFont(Font.boldSystemFont(50));
  ctx.setTextColor(COLORS.white);
  ctx.drawTextInRect(mainLabel, new Rect(30, 68, width - 60, 58));

  // Subtítulo centrado debajo ("libres de 15.0 GB")
  ctx.setFont(Font.mediumSystemFont(22));
  ctx.setTextColor(COLORS.subtitleGray);
  ctx.drawTextInRect(subLabel, new Rect(30, 126, width - 60, 30));

  return ctx.getImage();
}

// Note: Cache logic (getCachePath, saveCache, loadCache) is intentionally duplicated
// across standalone widget scripts (MiTelcelWidget.js, MiBaitWidget.js, MiMovistarWidget.js)
// so each file can be copied directly into the iOS Scriptable app without external module dependencies.
function getCachePath() {
  const fm = FileManager.local();
  return fm.joinPath(fm.documentsDirectory(), CONFIG.cacheFileName);
}

function saveCache(data) {
  const fm = FileManager.local();
  fm.writeString(getCachePath(), JSON.stringify(data));
}

function loadCache(now = new Date()) {
  try {
    const fm = FileManager.local();
    const path = getCachePath();
    if (fm.fileExists(path)) {
      const parsed = JSON.parse(fm.readString(path));
      const exp = parseExpire(parsed.cutoffISO);
      if (exp) {
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        parsed.daysLeft = Math.max(0, Math.round((exp.getTime() - today.getTime()) / 86400000));
      }
      parsed.fromCache = true;
      return parsed;
    }
  } catch (_) {}
  return null;
}

if (typeof Script !== "undefined") {
  main();
}
if (typeof module !== "undefined") {
  module.exports = { fetchBaitData, parseBaitResponse, createWidget, loadCache, fetchServiceKey, CONFIG, getCredentials };
}
