# Mi Telcel Widget — Prototipo Android (Termux + Termux:Widget / KWGT)

> [!WARNING]
> **No probado en hardware físico:** Este prototipo de Android fue construido reutilizando la lógica validada de iOS (`src/MiTelcelWidget.js`), pero **no ha sido probado en un teléfono Android real** por no contar con un dispositivo físico disponible.

---

## Cómo funciona

En lugar de reescribir un cliente desde cero o cambiar encabezados HTTP que Telcel podría bloquear, [`android/mitelcel_widget.mjs`](mitelcel_widget.mjs):
1. Reutiliza directamente `parseTelcelResponse` de [`src/MiTelcelWidget.js`](../src/MiTelcelWidget.js).
2. Conserva el mismo `User-Agent` móvil y flujo de 4 pasos (**WebLogin SSO -> JWT -> Wave B2F -> Revoke SSO**).
3. Guarda el JSON normalizado en `/sdcard/Download/mitelcel_widget.json` (listo para **KWGT**) e imprime el resumen en consola (listo para **Termux:Widget**).

---

## Instalación Paso a Paso en Android

### 1. Instalar Termux y Termux:Widget
1. Instala **Termux** y **Termux:Widget** desde **F-Droid** (las versiones de Google Play están desactualizadas).
2. Abre Termux y ejecuta:
   ```sh
   pkg update && pkg install -y nodejs git
   termux-setup-storage
   ```

### 2. Clonar el repositorio y configurar credenciales
```sh
cd ~
git clone <URL_DEL_REPO> telcel-widget-agy
cd telcel-widget-agy
cp .env.example .env
nano .env
```
Coloca tu número a 10 dígitos (`TELCEL_PHONE`) y contraseña (`TELCEL_PASS`), guarda con `Ctrl+O` y sal con `Ctrl+X`.

---

## Opción A: Usar con Termux:Widget (Más rápido)

1. Crea la carpeta de atajos de Termux y copia el lanzador:
   ```sh
   mkdir -p ~/.shortcuts
   cp ~/telcel-widget-agy/android/shortcuts_mitelcel.sh ~/.shortcuts/MiTelcel
   chmod +x ~/.shortcuts/MiTelcel
   ```
2. En la pantalla de inicio de Android, mantén presionado un espacio vacío > **Widgets** > **Termux:Widget**.
3. Elige el atajo **MiTelcel**. Al tocarlo, consultará tu saldo en vivo y cerrará la sesión SSO de forma segura.

---

## Opción B: Widget Visual con KWGT (Kustom Widget Maker)

Cuando [`android/mitelcel_widget.mjs`](mitelcel_widget.mjs) se ejecuta, guarda automáticamente `/sdcard/Download/mitelcel_widget.json`.

En **KWGT**, añade elementos de texto con las siguientes fórmulas:
- **GB Disponibles:** `$mu(round, wg("file:///sdcard/Download/mitelcel_widget.json", json, .availableMB) / 1000, 2)$ GB`
- **GB Totales:** `$mu(round, wg("file:///sdcard/Download/mitelcel_widget.json", json, .totalMB) / 1000, 1)$ GB`
- **Días Restantes:** `$wg("file:///sdcard/Download/mitelcel_widget.json", json, .daysLeft)$ días`
- **Fecha de Corte:** `$wg("file:///sdcard/Download/mitelcel_widget.json", json, .cutoffDate)$`
- **Última actualización:** `$wg("file:///sdcard/Download/mitelcel_widget.json", json, .updatedAt)$`
