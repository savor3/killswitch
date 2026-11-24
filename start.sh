#!/usr/bin/env bash
# Start the whole Killswitch MVP locally: chain → contracts → relay/guardian → dashboard.
set -euo pipefail
cd "$(dirname "$0")"
export PATH="$HOME/.foundry/bin:$PATH"
mkdir -p data/pids
[ -f .env ] && set -a && . ./.env && set +a

running() { [ -f "data/pids/$1.pid" ] && kill -0 "$(cat "data/pids/$1.pid")" 2>/dev/null; }
start() { # name, cmd...
  local name=$1; shift
  if running "$name"; then echo "  $name already running"; return; fi
  setsid nohup "$@" > "data/$name.log" 2>&1 < /dev/null &
  echo $! > "data/pids/$name.pid"   # setsid: pid == process-group id, so stop.sh can kill the whole tree
  echo "  started $name (log: data/$name.log)"
}

[ -d node_modules ] || npm install
if [ ! -f contracts/out/KillswitchAccount.sol/KillswitchAccount.json ]; then
  (cd contracts && forge build --quiet) && npx tsx scripts/export-abi.ts
fi

echo "Chain"
start anvil anvil --block-time 1 --silent --state data/chain-state.json --state-interval 10
for i in $(seq 1 30); do cast block-number --rpc-url http://127.0.0.1:8545 >/dev/null 2>&1 && break; sleep 0.3; done

FACTORY=$(node -e "try{console.log(require('./deployments/current.json').factory)}catch{}" 2>/dev/null || true)
if [ -z "$FACTORY" ] || [ "$(cast code "$FACTORY" --rpc-url http://127.0.0.1:8545 2>/dev/null)" = "0x" ]; then
  echo "Deploying contracts"
  rm -f data/killswitch.db*
  npx tsx scripts/deploy.ts
fi

echo "Services"
start relay npx tsx services/relay/index.ts
start dashboard npx vite --config apps/dashboard/vite.config.ts
for i in $(seq 1 40); do curl -sf localhost:8787/health >/dev/null && break; sleep 0.3; done
grep -m1 "Killswitch relay" data/relay.log || true
echo
echo "Dashboard:  http://localhost:5175"
echo "Relay API:  http://localhost:8787"
echo "Demo:       npm run demo"
echo "Stop:       ./stop.sh"
