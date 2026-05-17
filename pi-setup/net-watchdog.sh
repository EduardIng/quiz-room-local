#!/bin/bash
# Bounces eth0 if it can't reach the default gateway 3 times in a row.
# Runs every 60s via net-watchdog.timer. See KI-011 (Session 21).
# Сценарій перевіряє зв'язок з gateway і відновлює eth0 у разі залипання NIC.

GW=$(ip route | awk '/^default/ {print $3; exit}')
[ -z "$GW" ] && exit 0

for i in 1 2 3; do
  if ping -c 1 -W 2 -I eth0 "$GW" >/dev/null 2>&1; then
    exit 0
  fi
  sleep 2
done

logger -t net-watchdog "Gateway $GW unreachable — bouncing eth0"
ip link set eth0 down
sleep 2
ip link set eth0 up
sleep 5
if command -v dhclient >/dev/null 2>&1; then
  dhclient -r eth0 2>/dev/null
  dhclient eth0 2>/dev/null
elif command -v networkctl >/dev/null 2>&1; then
  networkctl renew eth0 2>/dev/null
fi
logger -t net-watchdog "eth0 bounced; state: $(ip -br link show eth0)"
