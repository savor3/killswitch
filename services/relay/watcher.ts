// Indexer: follows factory + account events, feeds the live dashboard, and catches agent ops that bypassed the relay.
import { decodeFunctionData, parseAbiItem, type Address, type Hex } from "viem";
import { KillswitchAccountAbi } from "../../shared/abi.js";
import { short } from "../../shared/protocol.js";
import * as chain from "./chain.js";
import * as store from "./db.js";
import { emit, reviewBypass } from "./guardian.js";

const { pub, dep } = chain;
const ACCOUNT_CREATED = parseAbiItem("event AccountCreated(address indexed owner, address account, address guardian)");

const accountEvents = KillswitchAccountAbi.filter((x) => x.type === "event");

export async function startWatcher() {
  const key = `watch:${dep.chainId}:${dep.factory.toLowerCase()}`;
  let from = BigInt(store.kvGet(key) ?? dep.deployedAt);
  const relayer = chain.relayer.account.address.toLowerCase();

  const tick = async () => {
    const head = await pub.getBlockNumber();
    if (head < from) return;
    // Public RPCs cap eth_getLogs ranges (sepolia.base.org: 200 blocks, inclusive), so scan in small steps there.
    const span = BigInt(process.env.KS_LOG_RANGE ?? (dep.chainId === 31337 ? 2000 : 150));
    const to = head - from >= span ? from + span - 1n : head;

    // 1. new accounts
    const created = await pub.getLogs({ address: dep.factory, event: ACCOUNT_CREATED, fromBlock: from, toBlock: to });
    for (const l of created) {
      store.addAccount(l.args.account!, l.args.owner!);
      emit(l.args.account!, "account", { owner: l.args.owner });
    }

    // 2. events on every known account
    const accounts = store.allAccounts() as Address[];
    if (accounts.length) {
      const logs = await pub.getLogs({ address: accounts, events: accountEvents, fromBlock: from, toBlock: to });
      for (const l of logs) {
        const account = l.address;
        const a = l.args as any;
        switch (l.eventName) {
          case "AgentGranted":
            store.setLabel(account, a.agentId, a.label || "agent");
            emit(account, "agent", { agentId: a.agentId, change: "granted" });
            break;
          case "AgentRevoked":
            emit(account, "agent", { agentId: a.agentId, change: "revoked" });
            break;
          case "AgentPaused":
            emit(account, "agent", { agentId: a.agentId, change: "paused", by: a.by });
            break;
          case "AgentUnpaused":
            emit(account, "agent", { agentId: a.agentId, change: "unpaused" });
            break;
          case "KilledAll":
            store.addAlert(account, null, "critical", "Owner pressed KILL ALL: every agent permission is void");
            emit(account, "agent", { change: "killed" });
            emit(account, "alert", { level: "critical", message: "Owner pressed KILL ALL" });
            break;
          case "AgentExecuted": {
            emit(account, "executed", { agentId: a.agentId, nonce: Number(a.nonce) });
            if ((a.submitter as string).toLowerCase() === relayer) break; // ours
            // someone submitted directly with the agent's key: review after the fact
            const tx = await pub.getTransaction({ hash: l.transactionHash! });
            let calls: any[] = [];
            try {
              const d = decodeFunctionData({ abi: KillswitchAccountAbi, data: tx.input });
              if (d.functionName === "executeAsAgent") calls = [...(d.args![1] as any[])];
            } catch {}
            console.log(`[watcher] bypass detected on ${short(account)} agent ${short(a.agentId)} tx ${short(l.transactionHash!)}`);
            await reviewBypass({
              account, agentId: a.agentId as Hex, nonce: Number(a.nonce), txHash: l.transactionHash!, calls,
              outflows: [...(a.outflows as bigint[])], submitter: a.submitter,
            }).catch((e) => console.error("[watcher] bypass review failed", e));
            break;
          }
        }
      }
    }
    from = to + 1n;
    store.kvSet(key, from.toString());
  };

  const loop = async () => {
    let behind = false;
    try {
      await tick();
      behind = (await pub.getBlockNumber()) > from + 5n; // still catching up: go again right away
    } catch (e) {
      console.error("[watcher]", (e as Error).message.split("\n")[0]);
    }
    setTimeout(loop, behind ? 50 : 1000);
  };
  loop();
}
