#!/bin/bash
# Regenera el zip del instalador de impresión silenciosa que se sirve desde
# la app (landing/public/descargas/). Correr tras cambiar instalar.bat,
# LEEME.txt o el certificado. El .exe de QZ NO va en el zip: instalar.bat lo
# descarga del GitHub oficial y verifica su SHA256 (pineado en el .bat).
set -euo pipefail
cd "$(dirname "$0")"
OUT="../../landing/public/descargas/tadaima-impresion-silenciosa.zip"
rm -f "$OUT"
zip -q -X "$OUT" LEEME.txt instalar.bat override.crt
unzip -l "$OUT"
