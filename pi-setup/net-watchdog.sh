#!/bin/bash
# Interface-aware network watchdog with escalation. See KI-011 (Sessions 21–22).
# Detects the default-route interface (eth0 OR wlan0), pings gateway via it,
# and escalates recovery actions on consecutive failures.
#
# Escalation ladder (state in /run/net-watchdog.fails):
#   1–3: NetworkManager reconnect (works for both wired and wireless)
#   4:   wlan0 → `nmcli radio wifi off/on` (full WiFi stack reset)
#        eth0  → modprobe -r/+ macb (Pi 5 Ethernet driver — Cadence GEM)
#   5+:  trigger reboot via /proc/sysrq-trigger

STATE_FILE=/run/net-watchdog.fails

# Find the interface that holds the default route. Works whether the Pi is
# on Ethernet, WiFi, or anything else.
read -r GW IFACE < <(ip route | awk '/^default/ {print $3, $5; exit}')

if [ -z "$GW" ] || [ -z "$IFACE" ]; then
  # No default route at all — nothing for us to ping. Reset counter and exit.
  [ -f "$STATE_FILE" ] && rm -f "$STATE_FILE"
  exit 0
fi

# Reachability check (3 pings via the actual default interface, 2s timeout each)
reachable=0
for i in 1 2 3; do
  if ping -c 1 -W 2 -I "$IFACE" "$GW" >/dev/null 2>&1; then
    reachable=1
    break
  fi
  sleep 2
done

if [ "$reachable" = "1" ]; then
  [ -f "$STATE_FILE" ] && rm -f "$STATE_FILE"
  exit 0
fi

fails=$(( $(cat "$STATE_FILE" 2>/dev/null || echo 0) + 1 ))
echo "$fails" > "$STATE_FILE"

# NetworkManager owns both eth0 and wlan0 on this Pi (Trixie + nmcli).
# Find the active connection for the interface and bounce it.
nm_reconnect() {
  local conn
  conn=$(nmcli -t -f NAME,DEVICE connection show --active 2>/dev/null \
         | awk -F: -v d="$IFACE" '$2==d {print $1; exit}')
  if [ -n "$conn" ]; then
    nmcli connection down "$conn" >/dev/null 2>&1
    sleep 2
    nmcli connection up "$conn" >/dev/null 2>&1
  else
    # No active connection registered (e.g., link went away entirely) — try by device.
    nmcli device disconnect "$IFACE" >/dev/null 2>&1
    sleep 2
    nmcli device connect "$IFACE" >/dev/null 2>&1
  fi
}

case "$fails" in
  1|2|3)
    logger -t net-watchdog "Gateway $GW via $IFACE unreachable (fail #$fails) — nmcli reconnect"
    nm_reconnect
    sleep 5
    logger -t net-watchdog "after reconnect: $(ip -br addr show $IFACE 2>/dev/null | head -1)"
    ;;
  4)
    if [ "$IFACE" = "wlan0" ]; then
      logger -t net-watchdog "Persistent failure (fail #$fails) on wlan0 — cycling wifi radio"
      nmcli radio wifi off 2>&1 | logger -t net-watchdog
      sleep 3
      nmcli radio wifi on 2>&1 | logger -t net-watchdog
      sleep 8
      nm_reconnect
    else
      logger -t net-watchdog "Persistent failure (fail #$fails) on $IFACE — reloading macb driver"
      ip link set "$IFACE" down 2>/dev/null
      modprobe -r macb 2>&1 | logger -t net-watchdog
      sleep 2
      modprobe macb 2>&1 | logger -t net-watchdog
      sleep 5
      ip link set "$IFACE" up 2>/dev/null
      sleep 5
      nm_reconnect
    fi
    logger -t net-watchdog "after recovery: $(ip -br addr show $IFACE 2>/dev/null || echo "$IFACE missing")"
    ;;
  *)
    # 5+ consecutive failures — nuclear option, trigger reboot.
    logger -t net-watchdog "CRITICAL: $fails consecutive failures on $IFACE — triggering sysrq reboot"
    sync
    sleep 1
    echo b > /proc/sysrq-trigger
    ;;
esac
