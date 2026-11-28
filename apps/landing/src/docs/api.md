---
title: Relay API
description: The relay's HTTP routes for submitting signed operations, reading wallets, agents, operations and alerts, approving held operations, and following everything live.
---

The relay is a [Hono](https://hono.dev) service, on port 8787 when you run it yourself; the hosted test network answers on the web app's own address. Every route returns JSON. A bad request returns HTTP 400 with an `error` field.

The relay pays the gas, so agents need no ETH. It can't change a signed operation: any change breaks the agent's signature, and the contract rejects it.

## Routes

| Route | What it does |
|---|---|
| `GET /health` | Liveness check |
| `GET /v1/config` | The chain, RPC, factory, exchange, tokens, guardian and relayer addresses, and whether AI review is on |
| `POST /v1/gas` | Test networks only: a little gas for a new owner, once a day per address and per IP address |
| `GET /v1/accounts?owner=` | An owner's protected wallets |
| `GET /v1/accounts/:account` | A wallet's owner, guardian, epoch, balances and every agent |
| `GET /v1/accounts/:account/agents/:id` | One agent's grant, nonce and usage |
| `POST /v1/ops` | Submit a signed operation of one to eight calls; the guardian reviews it |
| `GET /v1/ops?account=` | A wallet's operation history |
| `GET /v1/ops/:id` | One operation, with its outflows, reasons and AI review |
| `POST /v1/ops/:id/decision` | The owner approves or denies a held operation, with a signed message |
| `GET /v1/alerts?account=` | The guardian's alerts for a wallet |
| `GET /v1/stream?account=` | Server-sent events: operations and alerts as they happen |

## Submit an operation

The SDK does this for you. By hand, sign the `AgentOp` typed data (see [an operation, start to finish](/docs/lifecycle)) and post:

```http
POST /v1/ops
Content-Type: application/json

{
  "account": "0xYourProtectedWallet",
  "agentId": "0xAgentId",
  "calls": [{ "target": "0xUSDC", "value": "0", "data": "0xa9059cbb…" }],
  "deadline": "1764775800",
  "signature": "0x…",
  "intent": "Pay invoice #1042 to Acme Hosting"
}
```

The answer is the operation's result:

```json
{
  "id": "5b0e6c6e-7d1f-4f2c-9a51-1c7d0f3e2a90",
  "status": "held",
  "verdict": "hold",
  "reasons": ["first payment to new address 0x9965…A4dc"]
}
```

A confirmed one adds `txHash` and `remaining`, what is left of each cap this period; a rejected one may add `paused: true`.

## Approve or deny

The owner signs the message `Killswitch: approve operation <id>` (or `deny`) with their wallet, and posts the signature:

```http
POST /v1/ops/:id/decision
Content-Type: application/json

{ "approve": true, "signature": "0x…" }
```

The relay accepts only the wallet's on-chain owner. It refuses if the agent was revoked, killed or paused, or the operation's deadline has passed; otherwise it simulates again and submits the agent's original signed operation.

## Follow it live

`GET /v1/stream?account=0x…` is a server-sent event stream. Each message carries `account`, `type` (`op` when an operation changes, `alert` for the guardian's alerts), `data` and `at`, a time in milliseconds; a `ping` event arrives every 15 seconds to keep the connection open.

```ts
const es = new EventSource(`${relay}/v1/stream?account=${wallet}`);
es.onmessage = (m) => {
  const e = JSON.parse(m.data);
  if (e.type === "alert") console.log(e.data.level, e.data.message);
};
```

Authenticated read routes are part of the mainnet launch plan; on the test network, reads are open.
