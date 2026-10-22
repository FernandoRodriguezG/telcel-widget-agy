// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: red; icon-glyph: key;

/**
 * Resetear Credenciales de Mi Telcel, Mi Bait y Mi Movistar en iOS Keychain (Scriptable)
 * Elimina los datos guardados del operador elegido para permitir reingresarlos.
 */

const KEYCHAIN_KEYS = {
  "Mi Telcel": ["TELCEL_PASS", "TELCEL_PHONE"],
  "Mi Bait": ["BAIT_PHONE"],
  "Mi Movistar": ["MOVISTAR_PID"]
};
const carriers = Object.keys(KEYCHAIN_KEYS);

const picker = new Alert();
picker.title = "Resetear credenciales";
picker.message = "¿De qué operador quieres borrar los datos guardados en el Keychain?";
carriers.forEach(name => picker.addAction(name));
picker.addDestructiveAction("Todos");
picker.addCancelAction("Cancelar");
const choice = await picker.presentAlert();

if (choice !== -1) {
  const selected = choice < carriers.length ? [carriers[choice]] : carriers;
  for (const name of selected) {
    for (const key of KEYCHAIN_KEYS[name]) {
      if (Keychain.contains(key)) Keychain.remove(key);
    }
  }

  const alert = new Alert();
  alert.title = "Credenciales restablecidas";
  alert.message = `Se eliminaron los datos guardados de ${selected.join(", ")}. La próxima vez que abras el script del operador podrás ingresarlos nuevamente.`;
  alert.addAction("Aceptar");
  await alert.presentAlert();
}

Script.complete();
