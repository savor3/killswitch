#!/usr/bin/env bash
# Stop everything started by start.sh. Chain state is kept in data/chain-state.json.
cd "$(dirname "$0")"
for name in dashboard relay anvil; do
  f="data/pids/$name.pid"
  [ -f "$f" ] || continue
  pgid=$(cat "$f")
  if kill -TERM -- "-$pgid" 2>/dev/null; then
    for i in $(seq 1 20); do kill -0 -- "-$pgid" 2>/dev/null || break; sleep 0.2; done
    kill -KILL -- "-$pgid" 2>/dev/null
    echo "stopped $name"
  fi
  rm -f "$f"
done
