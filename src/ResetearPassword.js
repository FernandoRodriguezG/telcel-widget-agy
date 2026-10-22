// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: red; icon-glyph: key;

/**
 * Resetear Credenciales en iOS Keychain (Scriptable)
 * Elimina todas las credenciales guardadas de los operadores soportados (Telcel, Bait, Movistar).
 */

const KEYS = ["TELCEL_PASS", "TELCEL_PHONE", "BAIT_PHONE", "MOVISTAR_PID", "MOVISTAR_GUARD_KEY"];

for (const key of KEYS) {
  try {
    if (Keychain.contains(key)) Keychain.remove(key);
  } catch {}
}

const alert = new Alert();
alert.title = "Credenciales restablecidas";
alert.message = "Se eliminaron las credenciales guardadas del Keychain. La próxima vez que abras el widget podrás ingresarlas nuevamente.";
alert.addAction("Aceptar");
await alert.presentAlert();

Script.complete();
