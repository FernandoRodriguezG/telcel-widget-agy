## 2024-05-14 - Mejoras en Estados de Error y Configuración en Widgets de Consumo

**Learning:** When users encounter an unconfigured or disconnected widget, plain textual errors ("Sin datos. Verificar credenciales o red.") can feel jarring and unhelpful. Including actionable verbs (e.g., "Toca el widget para...") and a familiar warning icon (⚠️) instantly transforms an error screen into a helpful prompt, reducing perceived friction. Similarly, during initial setup, explicitly stating *why* permissions/credentials are needed ("Para mostrar tu consumo en vivo...") provides reassuring context compared to solely focusing on the mechanism ("Tus credenciales se guardarán en el Keychain").

**Action:** Always ensure empty or error states have visual weight (icons, layout adjustments) and actionable, user-centric copy rather than purely technical explanations, across both JS Scriptable and Native SwiftUI widget targets.
