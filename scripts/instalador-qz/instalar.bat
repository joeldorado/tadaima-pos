@echo off
title Tadaima - Instalador de impresion silenciosa
:: Pide permisos de administrador si no los tiene
net session >nul 2>&1
if %errorlevel% neq 0 (
  echo Pidiendo permisos de administrador... acepta la ventana que aparece.
  powershell -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
  exit /b
)
setlocal
set "VER=2.2.6"
set "EXE=%TEMP%\qz-tray-%VER%-x86_64.exe"
set "URL=https://github.com/qzind/tray/releases/download/v%VER%/qz-tray-%VER%-x86_64.exe"
set "SHA=aeb93a601c27f5fa6bb464f63471e7acd43052ba384fef49dceec8290d4f7587"

echo.
echo ============================================
echo   TADAIMA - Impresion silenciosa de tickets
echo ============================================
echo.
if exist "%ProgramFiles%\QZ Tray\qz-tray.exe" (
  echo QZ Tray ya esta instalado - solo se actualizara el certificado.
  goto cert
)
echo [1/4] Descargando QZ Tray %VER% (100 MB, sitio oficial qz.io)...
powershell -Command "$ProgressPreference='SilentlyContinue';[Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12;Invoke-WebRequest -Uri '%URL%' -OutFile '%EXE%'"
if not exist "%EXE%" (
  echo ERROR: no se pudo descargar. Revisa el internet e intenta de nuevo.
  pause
  exit /b 1
)
echo [2/4] Verificando que el archivo sea el oficial...
certutil -hashfile "%EXE%" SHA256 | findstr /i "%SHA%" >nul
if %errorlevel% neq 0 (
  echo ERROR: el archivo descargado NO coincide con el oficial. No se instalara.
  del "%EXE%"
  pause
  exit /b 1
)
echo [3/4] Instalando QZ Tray (tarda 1-2 minutos, espera)...
start /wait "" "%EXE%" /S
if not exist "%ProgramFiles%\QZ Tray\qz-tray.exe" (
  echo ERROR: QZ Tray no se instalo. Corre "%EXE%" manualmente y vuelve a dar doble clic aqui.
  pause
  exit /b 1
)
:cert
echo [4/4] Copiando el certificado de Tadaima e iniciando QZ Tray...
if not exist "%~dp0override.crt" (
  echo ERROR: no se encontro override.crt junto a este archivo.
  echo Descomprime TODO el zip en una carpeta y vuelve a intentar.
  pause
  exit /b 1
)
copy /Y "%~dp0override.crt" "%ProgramFiles%\QZ Tray\override.crt" >nul
start "" "%ProgramFiles%\QZ Tray\qz-tray.exe"
echo.
echo ============================================
echo  LISTO. QZ Tray quedo instalado y se abre
echo  solo cada vez que prendas la computadora.
echo ============================================
echo.
echo Siguiente paso, en el sistema Tadaima:
echo   Caja ^> boton de la impresora (arriba a la derecha) ^> Buscar
echo   ^> elegir la impresora de tickets ^> prender "Impresion silenciosa"
echo   ^> Imprimir prueba ^> Guardar
echo.
pause
