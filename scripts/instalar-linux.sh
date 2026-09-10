#!/usr/bin/env bash
# Deja el mini PC listo como TutorBox: arranca solo, sirve en el puerto 80 y
# abre la pantalla del aula en el proyector. Correr UNA vez, con:
#   bash scripts/instalar-linux.sh
set -euo pipefail

APP="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
USUARIO="${SUDO_USER:-$USER}"
NODE="$(readlink -f "$(command -v node)")"

echo "TutorBox en: $APP"
echo "Usuario:     $USUARIO"
echo "Node:        $NODE"
echo

# --- dependencias y preguntas ------------------------------------------
cd "$APP"
npm install --omit=dev --no-audit --no-fund

# --- puerto 80 sin correr como root ------------------------------------
# Así la dirección es http://192.168.x.x, sin ":3000" que nadie recuerda.
sudo setcap 'cap_net_bind_service=+ep' "$NODE"

# --- el servidor arranca solo al encender -------------------------------
sudo tee /etc/systemd/system/tutorbox.service >/dev/null <<UNIT
[Unit]
Description=TutorBox
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=$USUARIO
WorkingDirectory=$APP
ExecStart=$NODE --disable-warning=ExperimentalWarning $APP/server.js
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
UNIT

sudo systemctl daemon-reload
sudo systemctl enable --now tutorbox.service

# --- la pantalla del aula, en pantalla completa --------------------------
# Va en el autostart del escritorio (no en systemd) porque necesita la sesión
# gráfica que maneja el HDMI.
AUTO="/home/$USUARIO/.config/autostart"
mkdir -p "$AUTO"
cat > "$AUTO/tutorbox-pantalla.desktop" <<DESK
[Desktop Entry]
Type=Application
Name=TutorBox - pantalla del aula
Exec=bash -c 'sleep 8; xset s off; xset -dpms; xset s noblank; chromium-browser --kiosk --noerrdialogs --disable-infobars --incognito http://localhost/pantalla || chromium --kiosk --noerrdialogs --disable-infobars --incognito http://localhost/pantalla'
X-GNOME-Autostart-enabled=true
DESK
chown -R "$USUARIO":"$USUARIO" "$AUTO"

# --- nombre en la red (regalo para iPhone y Android nuevos) --------------
if command -v avahi-daemon >/dev/null 2>&1; then
  sudo hostnamectl set-hostname tutorbox || true
  sudo systemctl enable --now avahi-daemon || true
fi

IP="$(hostname -I | awk '{print $1}')"
cat <<FIN

====================================================
  TutorBox instalado.

  Alumnos:  http://$IP
  Maestra:  http://$IP/maestra
  Pantalla: http://$IP/pantalla   (se abre sola al encender)

  FALTA UN PASO IMPORTANTE:
  entrá al router y reservale a esta máquina la IP $IP
  (buscá "DHCP reservation" o "IP fija"). Si la IP cambia,
  el código QR deja de servir.

  Reiniciá para probar que todo arranca solo:  sudo reboot
====================================================
FIN
