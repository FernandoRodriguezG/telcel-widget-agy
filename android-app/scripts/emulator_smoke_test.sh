#!/usr/bin/env bash
# Prueba de humo en emulador (CI): instala el APK, abre la app y verifica que no truene.
set -euo pipefail
APK="${1:-MiBaitWidget.apk}"
PKG="mx.miwidget.bait"
OUT="${2:-smoke}"
mkdir -p "$OUT"

adb install -r "$APK"
adb logcat -c
adb shell am start -W -n "$PKG/.MainActivity"
sleep 8
adb exec-out screencap -p > "$OUT/app.png"
adb logcat -d > "$OUT/logcat.txt"

if ! adb shell pidof "$PKG" > /dev/null; then
  echo "La app no sigue en ejecución" >&2
  grep -A30 "FATAL EXCEPTION" "$OUT/logcat.txt" >&2 || true
  exit 1
fi
if grep -q "FATAL EXCEPTION" "$OUT/logcat.txt"; then
  grep -A30 "FATAL EXCEPTION" "$OUT/logcat.txt" >&2
  exit 1
fi
# El proveedor del widget debe estar registrado para poder agregarlo
adb shell dumpsys appwidget | grep -q "$PKG.widget.BaitWidgetReceiver" || {
  echo "BaitWidgetReceiver no aparece como proveedor de widgets" >&2
  exit 1
}
echo "Prueba de humo OK"
