// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: red; icon-glyph: key;

/**
 * Resetear Credenciales de Mi Telcel en iOS Keychain (Scriptable)
 * Elimina TELCEL_PASS y TELCEL_PHONE guardados para permitir reingresarlos.
 */

if (Keychain.contains("TELCEL_PASS")) {
  Keychain.remove("TELCEL_PASS");
}

if (Keychain.contains("TELCEL_PHONE")) {
  Keychain.remove("TELCEL_PHONE");
}

const alert = new Alert();
alert.title = "Credenciales restablecidas";
alert.message = "Se eliminaron las credenciales de Mi Telcel guardadas en el Keychain. La próxima vez que abras el script MiTelcel podrás ingresar tus credenciales nuevamente.";
alert.addAction("Aceptar");
await alert.presentAlert();

Script.complete();
