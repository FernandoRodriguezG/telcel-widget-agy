// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: blue; icon-glyph: signal;

/**
 * Widget de Consumo de Datos Mi Movistar para iOS (Scriptable)
 * Captura el token de sesión (p_id / ec_auth) vía WebView interactivo por reCAPTCHA v3
 * y desencripta /consumptions-controller/datos-iniciales con AES-256-GCM (guardString).
 */

const CONFIG = {
  pId: "", // Token de sesión ec_auth (p_id); se guarda en el Keychain de iOS
  useMockData: false,
  cacheFileName: "mimovistar_usage_cache.json",
  // Respaldo estático en caso de no poder consultar https://mi.movistar.com.mx/login
  // shortcut: guardKey público del bundle de mi.movistar.com.mx, actualizar si Movistar lo rota y /login deja de exponerlo
  fallbackGuardKey: "03818954072261267933921453028068"
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

async function loginWithWebView() {
  if (typeof WebView === "undefined" || (typeof config !== "undefined" && config.runsInWidget)) {
    return "";
  }
  let capturedPid = "";
  const wv = new WebView();
  wv.shouldAllowRequest = (req) => {
    const m = String(req?.url || "").match(/[?&]p_id=([^&#]+)/);
    if (m) capturedPid = decodeURIComponent(m[1]);
    return true;
  };
  await wv.loadURL("https://mi.movistar.com.mx/login");
  await wv.present(false);
  try {
    const guardFromPage = await wv.evaluateJavaScript(
      "typeof guardString !== 'undefined' ? String(guardString) : ''",
      false
    );
    const extracted = guardFromPage ? decodeGuardString(guardFromPage) : null;
    if (extracted && typeof Keychain !== "undefined") Keychain.set("MOVISTAR_GUARD_KEY", extracted);
  } catch (_) {}
  if (!capturedPid) {
    try {
      const fromPage = await wv.evaluateJavaScript(
        "typeof p_id !== 'undefined' ? String(p_id) : (new URLSearchParams(location.search).get('p_id') || '')",
        false
      );
      capturedPid = String(fromPage || "").trim();
    } catch (_) {}
  }
  if (!capturedPid && typeof Alert !== "undefined" && typeof config !== "undefined" && !config.runsInWidget) {
    const alert = new Alert();
    alert.title = "Configurar Mi Movistar";
    alert.message = "Pega tu token p_id (ec_auth) si ya iniciaste sesión en el portal:";
    alert.addSecureTextField("Token p_id", "");
    alert.addAction("Guardar");
    alert.addCancelAction("Cancelar");
    if ((await alert.presentAlert()) === 0) {
      capturedPid = alert.textFieldValue(0).trim();
    }
  }
  if (capturedPid && typeof Keychain !== "undefined") Keychain.set("MOVISTAR_PID", capturedPid);
  return capturedPid;
}

async function getSessionToken(forceInteractive = false) {
  // forceInteractive ignora el token guardado (Keychain/CONFIG) porque ya fue rechazado
  const stored = forceInteractive
    ? ""
    : (typeof Keychain !== "undefined" && Keychain.contains("MOVISTAR_PID")) ? Keychain.get("MOVISTAR_PID") : CONFIG.pId;
  let pId = String(stored || "").trim();
  if (!pId && typeof config !== "undefined" && !config.runsInWidget) {
    pId = await loginWithWebView();
  }
  return pId;
}

async function main() {
  let usageData = null;

  if (CONFIG.useMockData) {
    usageData = {
      consumedMB: 6656,
      totalMB: 10240,
      availableMB: 3584,
      daysLeft: 7,
      cutoffDate: "28 de octubre",
      planName: "Movistar Libre",
      promo: false,
      updatedAt: "10:09",
      fromCache: false
    };
  } else {
    try {
      usageData = await fetchMovistarData();
      saveCache(usageData);
    } catch (error) {
      console.warn("Fallo en red o sesión Mi Movistar, usando caché local: " + error.message);
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

async function requestMovistar(url, headers, parseJson = true) {
  if (typeof Script !== "undefined" && typeof Request !== "undefined") {
    const req = new Request(url);
    req.method = "GET";
    req.headers = headers;
    req.timeoutInterval = 5;
    return parseJson ? req.loadJSON() : req.loadString();
  }
  const signal = typeof AbortSignal !== "undefined" && AbortSignal.timeout ? AbortSignal.timeout(5000) : undefined;
  const res = await fetch(url, { method: "GET", headers, signal });
  return parseJson ? res.json() : res.text();
}

function decodeBase64Url(input) {
  const b64 = String(input).replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (input.length % 4)) % 4);
  if (typeof Buffer !== "undefined") return new Uint8Array(Buffer.from(b64, "base64"));
  if (typeof Data !== "undefined") return new Uint8Array(Data.fromBase64String(b64).getBytes());
  const bin = atob(b64);
  return Uint8Array.from(bin, c => c.charCodeAt(0));
}

function decodeGuardString(b64) {
  const key = typeof Buffer !== "undefined"
    ? Buffer.from(b64, "base64").toString("utf8")
    : typeof Data !== "undefined"
      ? Data.fromBase64String(b64).toRawString()
      : atob(b64);
  return (key && key.length === 32) ? key : null;
}

function extractGuardKey(html) {
  const m = String(html || "").match(/guardString\s*=\s*["']([^"']+)["']/);
  return m ? decodeGuardString(m[1]) : null;
}

async function fetchGuardKey() {
  try {
    const html = await requestMovistar("https://mi.movistar.com.mx/login", {}, false);
    const key = extractGuardKey(html);
    if (key) {
      if (typeof Keychain !== "undefined") Keychain.set("MOVISTAR_GUARD_KEY", key);
      return key;
    }
  } catch (_) {}
  return CONFIG.fallbackGuardKey;
}

async function getGuardKey() {
  if (typeof Keychain !== "undefined" && Keychain.contains("MOVISTAR_GUARD_KEY")) {
    const cached = Keychain.get("MOVISTAR_GUARD_KEY");
    if (cached && cached.length === 32) return cached;
  }
  return fetchGuardKey();
}

async function decryptAESGCM(encryptedB64, ivB64, guardKey) {
  if (globalThis.crypto?.subtle) {
    const keyBytes = Uint8Array.from(guardKey, c => c.charCodeAt(0));
    const iv = decodeBase64Url(ivB64);
    const encrypted = decodeBase64Url(encryptedB64);
    const cryptoKey = await globalThis.crypto.subtle.importKey("raw", keyBytes, { name: "AES-GCM" }, false, ["decrypt"]);
    const decrypted = await globalThis.crypto.subtle.decrypt({ name: "AES-GCM", iv, tagLength: 128 }, cryptoKey, encrypted);
    return new TextDecoder().decode(decrypted);
  }

  if (typeof WebView !== "undefined") {
    const wv = new WebView();
    // baseURL https para que WKWebView sea un contexto seguro y exponga crypto.subtle
    await wv.loadHTML("<!doctype html><html><body></body></html>", "https://mi.movistar.com.mx");
    const res = await wv.evaluateJavaScript(`
      (async () => {
        const b64 = s => {
          const p = s.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (s.length % 4)) % 4);
          return Uint8Array.from(atob(p), c => c.charCodeAt(0));
        };
        const rawKey = new TextEncoder().encode(${JSON.stringify(guardKey)});
        const key = await crypto.subtle.importKey("raw", rawKey, { name: "AES-GCM" }, false, ["decrypt"]);
        const buf = await crypto.subtle.decrypt({ name: "AES-GCM", iv: b64(${JSON.stringify(ivB64)}), tagLength: 128 }, key, b64(${JSON.stringify(encryptedB64)}));
        return { ok: new TextDecoder().decode(buf) };
      })().then(r => completion(r), e => completion({ err: String(e) }));
    `, true);
    if (res?.ok) return res.ok;
    throw new Error(res?.err || "Error al desencriptar AES-GCM en WebView");
  }

  throw new Error("WebCrypto AES-GCM no disponible en este entorno");
}

/**
 * Desencripta el campo `content` (<base64url_cipher>:<base64url_12B_iv>) usando AES-256-GCM (dxyz).
 * Obtiene dinámicamente la llave de cifrado desde la web de Movistar con caché en Keychain.
 */
async function decryptMovistarContent(cipherText, guardKey) {
  // Validar antes de resolver la llave para no consultar /login con payloads corruptos
  const parts = String(cipherText || "").split(":");
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    throw new Error("Payload cifrado de Mi Movistar inválido");
  }
  const key = guardKey || await getGuardKey();
  try {
    return await decryptAESGCM(parts[0], parts[1], key);
  } catch (err) {
    if (!guardKey) {
      const refreshed = await fetchGuardKey();
      if (refreshed && refreshed !== key) {
        return await decryptAESGCM(parts[0], parts[1], refreshed);
      }
    }
    throw err;
  }
}

async function fetchMovistarData(creds) {
  const pId = String(creds?.pId || await getSessionToken(false)).trim();
  if (!pId) {
    throw new Error("Inicia sesión en Mi Movistar abriendo el script en Scriptable.");
  }

  const fetchContent = async (token) => {
    const res = await requestMovistar(
      "https://mi.movistar.com.mx/consumptions-controller/datos-iniciales",
      {
        "Accept": "application/json",
        "Content-Type": "application/json",
        "Authorization": token
      }
    );
    if (!res?.content || typeof res.content !== "string" || !res.content.includes(":")) {
      throw new Error("Sesión de Mi Movistar expirada o respuesta inválida");
    }
    return res.content;
  };

  // Solo los fallos de sesión/red piden un nuevo login; errores de descifrado o parseo se propagan
  let content;
  try {
    content = await fetchContent(pId);
  } catch (err) {
    const canRelogin = !creds?.pId && typeof config !== "undefined" && !config.runsInWidget;
    const refreshedPid = canRelogin ? await getSessionToken(true) : "";
    if (!refreshedPid || refreshedPid === pId) throw err;
    content = await fetchContent(refreshedPid);
  }
  return parseMovistarResponse(await decryptMovistarContent(content));
}

function parseDate(raw) {
  if (typeof raw === "number" && !Number.isNaN(raw)) {
    const d = new Date(raw);
    return Number.isNaN(d.getTime()) ? null : new Date(d.getFullYear(), d.getMonth(), d.getDate());
  }
  const s = String(raw || "").trim();
  if (/^\d{11,13}$/.test(s)) {
    const d = new Date(Number(s));
    return Number.isNaN(d.getTime()) ? null : new Date(d.getFullYear(), d.getMonth(), d.getDate());
  }
  const dmy = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (dmy) {
    const dt = new Date(Number(dmy[3]), Number(dmy[2]) - 1, Number(dmy[1]));
    return Number.isNaN(dt.getTime()) ? null : dt;
  }
  const iso = s.split("T")[0].match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) {
    const dt = new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
    return Number.isNaN(dt.getTime()) ? null : dt;
  }
  return null;
}

function toMB(text) {
  const m = String(text || "").replace(/,/g, "").match(/(\d+(?:\.\d+)?)\s*(KB|MB|GB|TB)/i);
  if (!m) return 0;
  const val = Number(m[1]);
  const unit = m[2].toUpperCase();
  if (unit === "TB") return val * 1024 * 1024;
  if (unit === "GB") return val * 1024;
  if (unit === "KB") return val / 1024;
  return val;
}

function daysUntil(date, now) {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.max(0, Math.round((date.getTime() - today.getTime()) / 86400000));
}

/**
 * Normaliza el JSON desencriptado de /consumptions-controller/datos-iniciales.
 * Extrae bolsas de navegación de `bolton[]`, ignorando Redes Sociales, Minutos y SMS.
 */
function parseMovistarResponse(payload, now = new Date()) {
  const data = typeof payload === "string" ? JSON.parse(payload) : payload;
  if (!Array.isArray(data?.bolton) || data.bolton.length === 0) {
    throw new Error("Sin bolsas de datos activas en la línea Movistar");
  }

  const buckets = [];
  let maxExpire = null;
  let isUnlimited = false;

  const trackExpire = (dt) => {
    if (dt && (!maxExpire || dt > maxExpire)) maxExpire = dt;
  };

  for (const item of data.bolton) {
    const name = String(item?.name || "").trim();
    // Prefijo para cubrir variantes como "Redes Sociales Ilimitadas" o "SMS ilimitados"
    if (/^(redes sociales|minutos|sms|voz|mensajes)\b/i.test(name)) continue;

    const label = String(item?.consumptionLabel || "").trim();
    const benefit = String(item?.totalBenefit || "").trim();
    if (/ilimitado/i.test(label) || /ilimitado/i.test(benefit)) {
      isUnlimited = true;
      trackExpire(parseDate(item?.vigencia));
      continue;
    }

    let consumedMB = 0;
    let totalMB = 0;
    const pair = label.replace(/^llevas\s+/i, "").split(/\s+de\s+/i);
    if (pair.length === 2) {
      consumedMB = toMB(pair[0]);
      totalMB = toMB(pair[1]);
    } else {
      totalMB = toMB(benefit || label);
      const pct = Number(item?.consumption);
      if (totalMB > 0 && Number.isFinite(pct)) {
        consumedMB = totalMB * Math.min(100, Math.max(0, pct)) / 100;
      }
    }

    const availableMB = Math.max(0, totalMB - consumedMB);
    if (totalMB > 0 || availableMB > 0) {
      trackExpire(parseDate(item?.vigencia));
      buckets.push({
        id: name || `bolton-${buckets.length}`,
        name: name || "Navegación",
        consumedMB,
        totalMB,
        availableMB
      });
    }
  }

  if (!maxExpire && data?.saldos?.topupsBalanceExpiration) {
    trackExpire(parseDate(data.saldos.topupsBalanceExpiration));
  }
  if (!maxExpire && data?.saldos?.topupsBalanceExpirationDate) {
    trackExpire(parseDate(data.saldos.topupsBalanceExpirationDate));
  }

  if (!buckets.length && !isUnlimited) {
    throw new Error("Sin bolsas de navegación activas en la línea Movistar");
  }

  const totalMB = buckets.reduce((sum, b) => sum + b.totalMB, 0);
  const consumedMB = buckets.reduce((sum, b) => sum + b.consumedMB, 0);
  const availableMB = buckets.reduce((sum, b) => sum + b.availableMB, 0);

  const daysLeft = maxExpire ? daysUntil(maxExpire, now) : 0;
  const cutoffDate = maxExpire
    ? `${maxExpire.getDate()} de ${MONTHS_ES[maxExpire.getMonth()]}`
    : "";
  const cutoffISO = maxExpire
    ? `${maxExpire.getFullYear()}-${String(maxExpire.getMonth() + 1).padStart(2, "0")}-${String(maxExpire.getDate()).padStart(2, "0")}`
    : null;

  const hh = String(now.getHours()).padStart(2, "0");
  const mm = String(now.getMinutes()).padStart(2, "0");
  const offering = String(data?.offering || "").trim();

  return {
    consumedMB,
    totalMB,
    availableMB,
    daysLeft,
    cutoffDate,
    cutoffISO,
    planName: offering || (isUnlimited ? "Movistar Ilimitado" : "Mi Movistar"),
    promo: buckets.length > 1,
    unlimited: isUnlimited,
    buckets,
    updatedAt: `${hh}:${mm}`,
    fromCache: false
  };
}

function createWidget(data) {
  const w = new ListWidget();
  w.backgroundColor = COLORS.bg;
  w.setPadding(11, 13, 10, 13);
  w.url = "https://mi.movistar.com.mx/consumptions";

  if (!data) {
    const errTxt = w.addText("Sin datos de Mi Movistar. Abre el script para iniciar sesión.");
    errTxt.textColor = COLORS.white;
    errTxt.font = Font.mediumSystemFont(12);
    return w;
  }

  const isUnlimitedPlan = data.totalMB === 0 && (String(data.planName || "").toLowerCase().includes("ilimitado") || data.unlimited);
  const remainingMB = Math.max(0, data.availableMB ?? (data.totalMB - data.consumedMB));
  const remainingGB = (remainingMB / 1024).toFixed(2);
  const totalGB = (data.totalMB / 1024).toFixed(1);
  const ratio = data.totalMB > 0 ? Math.min(1, Math.max(0, data.consumedMB / data.totalMB)) : 0;
  const percentUsed = Math.round(ratio * 100);
  const days = Math.max(1, data.daysLeft ?? 1);
  const dailyMB = remainingMB / days;
  const dailyAllowance = isUnlimitedPlan
    ? "Ilimitado"
    : dailyMB >= 1024
      ? `${(dailyMB / 1024).toFixed(2)} GB/d`
      : `${Math.round(dailyMB)} MB/d`;
  const spentShort = isUnlimitedPlan
    ? "Ilimitado"
    : data.consumedMB < 1024
      ? `${Math.round(data.consumedMB)} MB`
      : `${(data.consumedMB / 1024).toFixed(2)} GB`;
  const shortCutoff = String(data.cutoffDate || "").replace(/\s+de\s+([a-záéíóú]{3})[a-záéíóú]*/i, " $1");

  const headerStack = w.addStack();
  headerStack.layoutHorizontally();
  headerStack.centerAlignContent();

  const titleCol = headerStack.addStack();
  titleCol.layoutVertically();
  const brandTxt = titleCol.addText("Mi Movistar");
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
  const mainGaugeLabel = isUnlimitedPlan ? "Ilimitado" : `${remainingGB} GB`;
  const subGaugeLabel = isUnlimitedPlan ? "datos libres" : `libres de ${totalGB} GB`;
  const gaugeImg = w.addImage(drawSemicircleGauge(gaugeRatio, mainGaugeLabel, subGaugeLabel));
  gaugeImg.resizable = true;
  gaugeImg.imageSize = new Size(134, 68);
  gaugeImg.centerAlignImage();

  w.addSpacer(4);

  const statsRow = w.addStack();
  statsRow.layoutHorizontally();
  statsRow.centerAlignContent();

  const spentLabel = isUnlimitedPlan ? `● Datos ${spentShort}` : `● ${spentShort} (${percentUsed}%)`;
  const spentTxt = statsRow.addText(spentLabel);
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

  const promoLabel = data.promo ? "Plan+Bono" : (data.planName || "Mi Movistar");
  const cacheIndicator = data.fromCache ? " ☁️" : "";
  const footerTxt = footerStack.addText(`${promoLabel} • ⏱ ${data.updatedAt}${cacheIndicator}`);
  footerTxt.font = Font.regularSystemFont(9.5);
  footerTxt.textColor = COLORS.subtitleGray;
  footerTxt.lineLimit = 1;
  footerTxt.minimumScaleFactor = 0.8;

  return w;
}

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

  drawArc(ctx, cx, cy, r, Math.PI, 2 * Math.PI, thickness, COLORS.trackGray);

  if (spentRatio !== null && Number.isFinite(spentRatio)) {
    const clamped = Math.max(0, Math.min(1, spentRatio));
    const splitAngle = Math.PI + clamped * Math.PI;
    const gap = clamped > 0.04 && clamped < 0.96 ? 0.11 : 0;

    if (clamped > 0.005) {
      drawArc(ctx, cx, cy, r, Math.PI, Math.max(Math.PI + 0.01, splitAngle - gap), thickness, COLORS.spentRed);
    }
    if (clamped < 0.995) {
      drawArc(ctx, cx, cy, r, Math.min(2 * Math.PI - 0.01, splitAngle + gap), 2 * Math.PI, thickness, COLORS.brandGreen);
    }
  }

  ctx.setTextAlignedCenter();
  ctx.setFont(Font.boldSystemFont(50));
  ctx.setTextColor(COLORS.white);
  ctx.drawTextInRect(mainLabel, new Rect(30, 68, width - 60, 58));

  ctx.setFont(Font.mediumSystemFont(22));
  ctx.setTextColor(COLORS.subtitleGray);
  ctx.drawTextInRect(subLabel, new Rect(30, 126, width - 60, 30));

  return ctx.getImage();
}

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
      const exp = parseDate(parsed.cutoffISO);
      if (exp) parsed.daysLeft = daysUntil(exp, now);
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
  module.exports = {
    fetchMovistarData,
    parseMovistarResponse,
    decryptMovistarContent,
    extractGuardKey,
    fetchGuardKey,
    getGuardKey,
    createWidget,
    loadCache
  };
}
