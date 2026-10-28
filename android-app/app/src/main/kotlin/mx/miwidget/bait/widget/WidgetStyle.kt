package mx.miwidget.bait.widget

import android.content.Context
import android.os.Build

enum class WidgetStyle(val label: String) {
    MATERIAL_YOU("Material You"),
    CLASSIC("Clásico");

    companion object {
        private const val PREFS = "widget_prefs"
        private const val KEY = "style"

        /** Material You por defecto donde hay colores dinámicos (Android 12+). */
        fun load(context: Context): WidgetStyle {
            val saved = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(KEY, null)
            return entries.firstOrNull { it.name == saved }
                ?: if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) MATERIAL_YOU else CLASSIC
        }

        fun save(context: Context, style: WidgetStyle) {
            context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString(KEY, style.name).apply()
        }
    }
}
