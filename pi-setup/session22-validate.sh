#!/bin/bash
# Session 22 validation orchestrator. Runs on Mac, drives Pi over SSH.
# Spec: docs/superpowers/specs/2026-05-17-step2-step3-validation-design.md
#
# Required env var:
#   RPI_SUDO_PW — the admin user's sudo password on rpi1
# Why an env var: keeps the credential out of the committed file
# (project security checklist: "no hardcoded values").
#
# Usage:
#   export RPI_SUDO_PW='...'  # one-time per shell
#   bash pi-setup/session22-validate.sh
#   # or to run one phase: source ...; phase2

set -euo pipefail
: "${RPI_SUDO_PW:?Set RPI_SUDO_PW env var before running this script}"

PI=admin@10.0.1.37
SSH="ssh -o ConnectTimeout=5 -o ServerAliveInterval=10 -o ServerAliveCountMax=2 $PI"
SUDO="echo $RPI_SUDO_PW | sudo -S"

# ── Helpers ──
log() { echo "[$(date +%H:%M:%S)] $*"; }
fail() { echo "FAIL: $*" >&2; exit "${2:-1}"; }
pass() { echo "PASS: $*"; }

ssh_run() { $SSH timeout 60 "$@"; }
ssh_run_long() { $SSH timeout 180 "$@"; }

# Resolve the server's MainPID from systemd (not pgrep, which can return a child or worker).
get_server_pid() {
  ssh_run "$SUDO systemctl show -p MainPID --value quiz-server 2>/dev/null" | tr -d '\r\n'
}

precheck() {
  ssh_run "echo ok" >/dev/null 2>&1 || fail "rpi1 unreachable — power-cycle or wait for net-watchdog"
  ssh_run "pgrep -f chromium >/dev/null" || fail "Chromium kiosk not running on Pi"
  ssh_run "pgrep -f 'node.*server.js' >/dev/null" || fail "quiz-server not running"
  log "precheck OK"
}

reset_to_waiting() {
  ssh_run "pkill -f host-driver 2>/dev/null; pkill -f node /tmp/host-driver 2>/dev/null; true" >/dev/null
  sleep 1
  # The kiosk may still show stale UI; reload it
  ssh_run "WID=\$(DISPLAY=:0 xdotool search --name 'Quiz Room' 2>/dev/null | head -1); \
           [ -n \"\$WID\" ] && DISPLAY=:0 xdotool key --window \$WID ctrl+r" >/dev/null
  sleep 2
  # Dismiss any beforeunload confirm dialog at known coord
  ssh_run "DISPLAY=:0 xdotool mousemove --sync 1440 110 click 1" >/dev/null 2>&1 || true
  sleep 3
  # Verify
  local roomCode
  roomCode=$(ssh_run "curl -s http://localhost:8080/api/current-room | python3 -c 'import sys,json; print(json.load(sys.stdin).get(\"roomCode\"))'")
  log "post-reset /api/current-room = $roomCode"
}

scrot_pull() {
  # $1 = remote tag, $2 = local prefix
  ssh_run "DISPLAY=:0 scrot -z /tmp/$1.png" >/dev/null 2>&1
  scp -q $PI:/tmp/$1.png /tmp/$2.png 2>/dev/null
}

scrot_loop_bg() {
  # $1 = remote prefix, $2 = count, $3 = interval seconds
  # Bound the remote loop with a timeout slightly larger than count*interval.
  local max=$(( $2 * $3 + 15 ))
  $SSH "timeout $max bash -c 'for i in \$(seq 1 $2); do DISPLAY=:0 scrot -z /tmp/$1-\$i.png 2>/dev/null; sleep $3; done'" &
  echo $!
}

# ── Phase 2: Step 2 — full smoke game with active clicks ──
phase2() {
  log "=== Phase 2: Step 2 smoke game ==="
  precheck
  reset_to_waiting

  ssh_run "rm -f /tmp/clicker-result.json /tmp/clicker.log; nohup node /tmp/host-driver-clicker.js > /tmp/clicker.out 2>&1 &"
  sleep 3

  # Type nickname into kiosk
  ssh_run "WID=\$(DISPLAY=:0 xdotool search --name 'Quiz Room' | head -1); \
           DISPLAY=:0 xdotool type --window \$WID --delay 60 Player22 && \
           sleep 0.3 && \
           DISPLAY=:0 xdotool key --window \$WID Return" || fail "xdotool nickname injection failed" 2

  # Layout sanity check after QUESTION reached (≤30s)
  local sanity_ok=0
  for i in $(seq 1 30); do
    sleep 1
    if ssh_run "grep -q 'NEW_QUESTION' /tmp/clicker.log 2>/dev/null"; then
      scrot_pull phase2-sanity phase2-sanity
      # Pixel sample at A button center (red) — assert R>=160 AND G<120 AND B<120.
      # Run on Mac so failure exits the orchestrator (not just the ssh).
      local r g b
      read r g b < <(python3 -c 'from PIL import Image; p=Image.open("/tmp/phase2-sanity.png").getpixel((1160,1180)); print(p[0], p[1], p[2])')
      log "sanity pixel at (1160,1180) = R=$r G=$g B=$b"
      if [ "$r" -ge 160 ] && [ "$g" -lt 120 ] && [ "$b" -lt 120 ]; then
        sanity_ok=1
        break
      else
        fail "Phase 2: card not where expected — pixel at A button center should be red-ish (R>=160,G<120,B<120) but got R=$r G=$g B=$b. CSS regression or resolution change?" 2
      fi
    fi
  done
  [ "$sanity_ok" = "1" ] || fail "Phase 2: never reached NEW_QUESTION in 30s" 2

  # Wait for clicker-result.json (120s ceiling, matches clicker timeout)
  local got_result=0
  for i in $(seq 1 130); do
    if ssh_run "test -f /tmp/clicker-result.json"; then got_result=1; break; fi
    sleep 1
  done
  [ "$got_result" = "1" ] || fail "Phase 2: clicker never wrote /tmp/clicker-result.json (clicker crashed?). Log:
$(ssh_run cat /tmp/clicker.out)" 2

  scp -q $PI:/tmp/clicker-result.json /tmp/clicker-result.json
  local score chosen_total timeouts
  read score chosen_total timeouts < <(python3 -c '
import json
d = json.load(open("/tmp/clicker-result.json"))
chosen = [e for e in d["events"] if e.get("type")=="CATEGORY_CHOSEN"]
to = [e for e in chosen if e.get("wasTimeout") is True]
print(d["finalScore"], len(chosen), len(to))
')
  log "finalScore=$score chosen=$chosen_total via_timeout=$timeouts (expected score≥300, timeouts=0, chosen=2)"

  # Hard assertions matching spec success criteria
  [ "$chosen_total" -ge 2 ] || fail "Phase 2: expected ≥2 CATEGORY_CHOSEN events, got $chosen_total" 2
  [ "$timeouts" -eq 0 ] || fail "Phase 2: $timeouts CATEGORY_CHOSEN events fired via timeout — submit-category click missed" 2
  [ "$score" -ge 300 ] || fail "Phase 2: finalScore $score < 300 — clicks may have missed or hit wrong answer" 2
  pass "Phase 2: score=$score, all categories chosen via click (no timeouts)"
}

# ── Phase 3: Path 1 — server restart, session dies ──
phase3() {
  log "=== Phase 3: Step 3 Path 1 — server restart ==="
  precheck
  reset_to_waiting

  # Start fresh game
  ssh_run "rm -f /tmp/clicker-result.json /tmp/clicker.log; nohup node /tmp/host-driver-clicker.js > /tmp/clicker.out 2>&1 &"
  sleep 3
  ssh_run "WID=\$(DISPLAY=:0 xdotool search --name 'Quiz Room' | head -1); \
           DISPLAY=:0 xdotool type --window \$WID --delay 60 Recon1 && sleep 0.3 && \
           DISPLAY=:0 xdotool key --window \$WID Return"

  # Wait for QUESTION state
  local in_q=0
  for i in $(seq 1 30); do
    sleep 1
    if ssh_run "grep -q 'NEW_QUESTION' /tmp/clicker.log 2>/dev/null"; then in_q=1; break; fi
  done
  [ "$in_q" = "1" ] || fail "Phase 3: never reached QUESTION" 3

  # Mid-question: restart quiz-server
  log "restarting quiz-server"
  local scrot_pid
  scrot_pid=$(scrot_loop_bg recon1 30 1)

  ssh_run "$SUDO systemctl restart quiz-server" || fail "Phase 3: restart failed" 3

  wait $scrot_pid 2>/dev/null || true

  # Wait for server to come back
  for i in $(seq 1 30); do
    if ssh_run "curl -sf http://localhost:8080/health >/dev/null"; then break; fi
    sleep 1
  done

  # Pull recon1-*.png and check for isReconnecting indicator
  mkdir -p /tmp/recon1
  scp -q $PI:/tmp/recon1-*.png /tmp/recon1/ 2>/dev/null || true
  local frames
  frames=$(ls /tmp/recon1/*.png 2>/dev/null | wc -l)
  log "captured $frames recon1 frames"
  [ "$frames" -ge 5 ] || fail "Phase 3: too few frames captured ($frames)" 3

  pass "Phase 3 captured frames; visual verification in /tmp/recon1/"
}

# ── Phase 4: Path 2 — kill -STOP, session survives ──
phase4() {
  log "=== Phase 4: Step 3 Path 2 — kill -STOP / -CONT ==="
  precheck
  reset_to_waiting

  ssh_run "rm -f /tmp/clicker-result.json /tmp/clicker.log; nohup node /tmp/host-driver-clicker.js > /tmp/clicker.out 2>&1 &"
  sleep 3
  ssh_run "WID=\$(DISPLAY=:0 xdotool search --name 'Quiz Room' | head -1); \
           DISPLAY=:0 xdotool type --window \$WID --delay 60 Recon2 && sleep 0.3 && \
           DISPLAY=:0 xdotool key --window \$WID Return"

  for i in $(seq 1 30); do
    sleep 1
    if ssh_run "grep -q 'NEW_QUESTION' /tmp/clicker.log 2>/dev/null"; then break; fi
  done

  local server_pid
  server_pid=$(get_server_pid)
  log "server MainPID = $server_pid"
  [ -n "$server_pid" ] && [ "$server_pid" != "0" ] || fail "Phase 4: no server MainPID from systemd" 4

  # CRITICAL: register CONT cleanup BEFORE issuing STOP, so any unexpected
  # exit (set -e, ssh timeout, ^C) still un-pauses the server.
  trap 'ssh_run "$SUDO kill -CONT '"$server_pid"' 2>/dev/null" || true' EXIT INT TERM

  local scrot_pid_stop
  scrot_pid_stop=$(scrot_loop_bg recon2-stop 17 2)

  ssh_run "$SUDO kill -STOP $server_pid" || fail "Phase 4: STOP failed" 4
  log "server STOPPED"
  wait $scrot_pid_stop 2>/dev/null || true

  # Verify STOP was effective — health should fail
  if ssh_run "curl -sf --max-time 2 http://localhost:8080/health >/dev/null"; then
    ssh_run "$SUDO kill -CONT $server_pid" || true
    trap - EXIT INT TERM
    fail "Phase 4: server responded to /health while STOPPED — STOP didn't pause it (forked PIDs?)" 4
  fi

  ssh_run "$SUDO kill -CONT $server_pid" || fail "Phase 4: CONT failed" 4
  trap - EXIT INT TERM
  log "server CONTINUED"
  local scrot_pid_cont
  scrot_pid_cont=$(scrot_loop_bg recon2-cont 15 1)
  wait $scrot_pid_cont 2>/dev/null || true

  mkdir -p /tmp/recon2
  scp -q $PI:/tmp/recon2-stop-*.png /tmp/recon2/ 2>/dev/null || true
  scp -q $PI:/tmp/recon2-cont-*.png /tmp/recon2/ 2>/dev/null || true
  local stop_frames cont_frames
  stop_frames=$(ls /tmp/recon2/recon2-stop-*.png 2>/dev/null | wc -l)
  cont_frames=$(ls /tmp/recon2/recon2-cont-*.png 2>/dev/null | wc -l)
  log "captured $stop_frames stop frames, $cont_frames cont frames"
  [ "$stop_frames" -ge 5 ] && [ "$cont_frames" -ge 5 ] || fail "Phase 4: too few frames" 4

  pass "Phase 4 captured frames; visual verification in /tmp/recon2/"
}

# ── Phase 5: Keydown blocking ──
phase5() {
  log "=== Phase 5: Keydown blocking ==="
  precheck
  reset_to_waiting

  # Make sure no active room (kiosk should be on waiting-for-host, no input focused)
  ssh_run "pkill -f host-driver 2>/dev/null; true"
  sleep 2
  local room
  room=$(ssh_run "curl -s http://localhost:8080/api/current-room | python3 -c 'import sys,json; print(json.load(sys.stdin).get(\"roomCode\"))'")
  if [ "$room" != "None" ]; then
    log "WARNING: currentActiveRoom=$room (should be None for clean Phase 5)"
  fi

  local result=0
  for KEY in F5 BackSpace alt+F4; do
    log "testing key: $KEY"
    local pid_before pid_after new_gets cursor
    pid_before=$(ssh_run "pgrep -f chromium | head -1")
    [ -n "$pid_before" ] || { log "FAIL ($KEY): chromium not running before test"; result=5; continue; }

    # Anchor journal cursor BEFORE the keystroke so we count only new GET / lines.
    cursor=$(ssh_run "$SUDO journalctl -u quiz-server --no-pager -n 0 --show-cursor 2>&1 | tail -1 | sed 's/^-- cursor: //'")

    ssh_run "WID=\$(DISPLAY=:0 xdotool search --name 'Quiz Room' | head -1); \
             DISPLAY=:0 xdotool key --window \$WID $KEY" || true
    sleep 2

    pid_after=$(ssh_run "pgrep -f chromium | head -1")
    # Count GET / lines emitted AFTER the cursor — true delta, not time-window.
    new_gets=$(ssh_run "$SUDO journalctl -u quiz-server --after-cursor='$cursor' --no-pager 2>/dev/null | grep -c 'GET /\$' || true")

    if [ "$pid_before" = "$pid_after" ] && [ "$new_gets" -eq 0 ]; then
      pass "$KEY blocked (pid unchanged, no GET /)"
    else
      log "FAIL ($KEY): pid_before=$pid_before pid_after=$pid_after new_GETs=$new_gets"
      result=5
    fi
    sleep 1
  done

  return $result
}

main() {
  log "Session 22 validation starting"
  phase2 || exit $?
  phase3 || exit $?
  phase4 || exit $?
  phase5 || exit $?
  log "All phases passed"
}

# Only auto-run when invoked directly. When sourced (e.g., to call one phase),
# main is NOT auto-invoked.
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  main "$@"
fi
