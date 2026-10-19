#!/data/data/com.termux/files/usr/bin/sh
# Script lanzador para Termux:Widget (copiar a ~/.shortcuts/MiTelcel)
cd "$HOME/telcel-widget-agy" || exit 1
node android/mitelcel_widget.mjs
echo ""
read -r -p "Presiona Enter para cerrar..." _
