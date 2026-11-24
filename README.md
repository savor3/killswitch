# Killswitch

**Humans set the limits. Machines obey.**

> On-chain spending limits and an emergency stop for AI agents that handle money.
> Read the [whitepaper](docs/Killswitch_Whitepaper.pdf) · [technical architecture](docs/Killswitch_Technical_Architecture.pdf)

**Status:** MVP, unaudited, test networks only. Do not use with real funds.

Killswitch lets a wallet owner give an AI agent a narrow, capped, expiring permission instead of their keys.
The wallet contract enforces the limits, a guardian watches every operation, and one button kills every agent.

Everything runs locally on a test chain (Anvil) with test tokens. No real money is involved.

## Run it

```bash
./start.sh          # chain + contracts + relay/guardian + dashboard
npm run demo        # honest work + 4 attacks, prints what the attacker got
./stop.sh
```

- Dashboard: http://localhost:5175 (uses the local dev wallet automatically)
- Relay API: http://localhost:8787
- `npm run traffic -- <wallet address>` makes a payments bot do a normal, a first-time and a suspicious payment, so you can watch the dashboard react
- `npm test` runs the contract tests (21, including a fuzz test that the cap can never be exceeded)

AI review of grey-zone operations needs `ANTHROPIC_API_KEY` in `.env` (see `.env.example`). Without it, those operations are held for the owner.

## What's inside

| Part | Path | What it does |
|---|---|---|
| Wallet contract | `contracts/src/KillswitchAccount.sol` | Owner has full control. Agents get session keys with a target/function allowlist, per-token caps per period (measured by real balance change), expiry, a guardian co-sign threshold, pause, revoke, and kill-all. Guardian can pause and co-sign only, never spend or widen limits. Agents can't leave open token approvals. |
| Factory + test tokens | `contracts/src/KillswitchFactory.sol`, `contracts/src/mocks/` | Creates wallets; test USDC/WETH with a faucet; a fixed-price test DEX |
| Relay + guardian | `services/relay/` | Checks the agent's signature, simulates the op against the contract, scores it (new recipient, cap-hugging, velocity, blocklist, slippage), asks Claude in the grey zone, then allows, co-signs, holds for the owner, or rejects and pauses the agent on-chain. The indexer catches ops that bypass the relay and pauses the agent. |
| Agent SDK | `packages/sdk/` | `createKillswitchAgent({...}).swap() / .transfer() / .send() / .status()` |
| MCP server | `packages/mcp/server.ts` | Gives Claude Code (or any MCP agent) `wallet_status`, `wallet_send`, `wallet_swap`. The dashboard prints the exact `claude mcp add …` command when you create an agent. |
| Dashboard | `apps/dashboard/` | Create a wallet, add test USDC, grant agents from templates, see caps live, approve/deny held ops, pause/resume/revoke, KILL ALL |
| Demo + tests | `scripts/demo.ts`, `scripts/mcp-smoke.ts`, `contracts/test/` | End-to-end attack demo; MCP client smoke test; contract tests |
| Architecture | `docs/Killswitch_Technical_Architecture.pdf` | The plan this MVP implements |

## Use Claude as the agent

1. In the dashboard, click **+ New agent** and sign.
2. Copy the `claude mcp add killswitch-wallet …` command it shows and run it.
3. Ask Claude to check its wallet, pay something, or try to drain it, and watch the dashboard.

## Differences from the architecture plan (deliberate, for the MVP)

- **Own wallet contract instead of ERC-4337/7579 modules.** Same rules, no bundler infrastructure. The policy logic in `_run()` ports directly to a 7579 validator + hook later.
- **Caps are per token**, not in USD (needs a price oracle).
- **TypeScript + SQLite** backend instead of Go + MongoDB: one language across relay, SDK, MCP and dashboard, and no database to run.
- **Guardian keys are env vars** (Anvil dev keys locally). Production would use a KMS.

## Testnet

Deploy to Base Sepolia with real (testnet) keys:

```bash
KS_RPC=https://sepolia.base.org KS_DEPLOYER_KEY=0x… npx tsx scripts/deploy.ts
KS_RELAYER_KEY=0x… KS_GUARDIAN_KEY=0x… npm run relay
```

The relayer and guardian addresses need a little Base Sepolia ETH for gas.

## License

MIT, see [LICENSE](LICENSE).
