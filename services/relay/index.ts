// Killswitch relay API: the single door for agents (SDK/MCP) and the owner dashboard.
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { existsSync } from "node:fs";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { streamSSE } from "hono/streaming";
import { formatEther, isAddress, isHex, parseEther, type Address, type Hex } from "viem";
import { KillswitchFactoryAbi } from "../../shared/abi.js";
import { fmt, fromWire, json, tokenByAddress, type WireCall } from "../../shared/protocol.js";
import * as chain from "./chain.js";
import * as store from "./db.js";
import { bus, ClientError, decide, submit } from "./guardian.js";
import { llmEnabled } from "./llm.js";
import { startWatcher } from "./watcher.js";

const { dep } = chain;
const app = new Hono();
app.use("*", cors());

const send = (c: any, v: unknown, status = 200) => c.body(json(v), status, { "content-type": "application/json" });

app.onError((err, c) => {
  if (err instanceof ClientError) return send(c, { error: err.message }, 400);
  console.error(err);
  return send(c, { error: "internal error", detail: err.message }, 500);
});

const addr = (v: string) => {
  if (!isAddress(v)) throw new ClientError("bad address");
  return v as Address;
};
const id32 = (v: string) => {
  if (!isHex(v) || v.length !== 66) throw new ClientError("bad agent id");
  return v as Hex;
};

app.get("/health", (c) => send(c, { ok: true }));

// Testnet only: give a new owner a little gas so they can create a wallet and sign grants without a faucet.
const GAS_DRIP = dep.chainId === 84532 ? parseEther(process.env.KS_GAS_DRIP ?? "0.0005") : 0n;
const dripped = new Map<string, number>();
app.post("/v1/gas", async (c) => {
  if (GAS_DRIP === 0n) throw new ClientError("gas drip is only available on testnet");
  const body = await c.req.json().catch(() => ({}));
  const to = addr(String(body.address ?? ""));
  const ip = c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  const day = 86_400_000, now = Date.now();
  for (const k of [to.toLowerCase(), `ip:${ip}`]) if ((dripped.get(k) ?? 0) > now - day) throw new ClientError("already sent test gas in the last 24 hours");
  const bal = await chain.pub.getBalance({ address: to });
  if (bal >= GAS_DRIP) return send(c, { sent: false, balance: formatEther(bal) });
  const hash = await chain.relayer.sendTransaction({ to, value: GAS_DRIP });
  await chain.pub.waitForTransactionReceipt({ hash });
  dripped.set(to.toLowerCase(), now); dripped.set(`ip:${ip}`, now);
  return send(c, { sent: true, amount: formatEther(GAS_DRIP), txHash: hash });
});

app.get("/v1/config", (c) =>
  send(c, {
    chainId: dep.chainId,
    rpc: dep.rpc,
    factory: dep.factory,
    dex: dep.dex,
    tokens: dep.tokens,
    guardian: chain.guardianAccount.address,
    relayer: chain.relayer.account.address,
    llm: llmEnabled(),
    root: process.env.KS_PUBLIC_ROOT ?? process.cwd(),
    hosted: !!process.env.KS_PUBLIC_ROOT,
    gasDrip: GAS_DRIP > 0n,
  }),
);

app.get("/v1/accounts", async (c) => {
  const owner = addr(c.req.query("owner") ?? "");
  const list = await chain.pub.readContract({ address: dep.factory, abi: KillswitchFactoryAbi, functionName: "accountsOf", args: [owner] });
  for (const a of list) store.addAccount(a, owner);
  return send(c, { accounts: list });
});

const SELECTOR_NAMES: Record<string, string> = { "0xa9059cbb": "transfer", "0x095ea7b3": "approve", "0x23b872dd": "transferFrom" };
function ruleName(target: Address, selector: Hex) {
  const isDex = target.toLowerCase() === dep.dex.toLowerCase();
  const contract = tokenByAddress(dep, target)?.symbol ?? (isDex ? "DEX" : target);
  const fn = SELECTOR_NAMES[selector.toLowerCase()] ?? (isDex ? "swap" : selector);
  return `${contract}.${fn}`;
}

async function agentJson(account: Address, id: Hex, epoch: bigint) {
  const a = await chain.readAgent(account, id, epoch);
  return {
    id,
    label: store.getLabel(account, id) ?? "agent",
    sessionKey: a.sessionKey,
    validUntil: a.validUntil,
    nonce: a.nonce,
    paused: a.paused,
    exists: a.exists,
    active: a.active,
    killed: a.killed,
    expired: a.exists && Date.now() / 1000 > a.validUntil,
    rules: a.rules.map((r) => ({ ...r, name: ruleName(r.target, r.selector) })),
    limits: a.limits.map((l) => ({
      ...l,
      symbol: tokenByAddress(dep, l.token)?.symbol ?? "?",
      decimals: tokenByAddress(dep, l.token)?.decimals ?? 18,
      text: `${fmt(dep, l.token, l.used)} of ${fmt(dep, l.token, l.maxPerPeriod)}`,
    })),
  };
}

app.get("/v1/accounts/:account", async (c) => {
  const account = addr(c.req.param("account"));
  const info = await chain.readAccount(account).catch(() => {
    throw new ClientError("not a Killswitch account");
  });
  store.addAccount(account, info.owner);
  const agents = await Promise.all(info.ids.map((id) => agentJson(account, id, info.epoch)));
  return send(c, { address: account, owner: info.owner, guardian: info.guardian, epoch: info.epoch, balances: await chain.balances(account), agents });
});

app.get("/v1/accounts/:account/agents/:id", async (c) => {
  const account = addr(c.req.param("account"));
  const info = await chain.readAccount(account);
  return send(c, await agentJson(account, id32(c.req.param("id")), info.epoch));
});

app.post("/v1/ops", async (c) => {
  const b = await c.req.json<{ account: string; agentId: string; calls: WireCall[]; deadline: string; signature: string; intent?: string }>();
  if (!Array.isArray(b.calls) || b.calls.length === 0 || b.calls.length > 8) throw new ClientError("calls must be 1..8 items");
  const result = await submit({
    account: addr(b.account),
    agentId: id32(b.agentId),
    calls: fromWire(b.calls),
    deadline: BigInt(b.deadline),
    signature: b.signature as Hex,
    intent: b.intent ?? null,
  });
  return send(c, result);
});

const opJson = (o: store.OpRow) => ({
  ...o,
  calls: JSON.parse(o.calls),
  reasons: JSON.parse(o.reasons),
  outflows: o.outflows ? JSON.parse(o.outflows) : null,
  llm: o.llm ? JSON.parse(o.llm) : null,
  label: store.getLabel(o.account, o.agent_id) ?? "agent",
});

app.get("/v1/ops", (c) => {
  const account = addr(c.req.query("account") ?? "");
  return send(c, { ops: store.listOps(account, Number(c.req.query("limit") ?? 100)).map(opJson) });
});

app.get("/v1/ops/:id", (c) => {
  const o = store.getOp(c.req.param("id"));
  return o ? send(c, opJson(o)) : send(c, { error: "not found" }, 404);
});

app.post("/v1/ops/:id/decision", async (c) => {
  const b = await c.req.json<{ approve: boolean; signature: string }>();
  return send(c, await decide(c.req.param("id"), !!b.approve, b.signature as Hex));
});

app.get("/v1/alerts", (c) => send(c, { alerts: store.listAlerts(addr(c.req.query("account") ?? "")) }));

app.get("/v1/stream", (c) => {
  const account = (c.req.query("account") ?? "").toLowerCase();
  return streamSSE(c, async (stream) => {
    const onEvent = (e: { account: string }) => {
      if (!account || e.account === account) stream.writeSSE({ data: json(e) }).catch(() => {});
    };
    bus.on("event", onEvent);
    stream.onAbort(() => {
      bus.off("event", onEvent);
    });
    while (!stream.aborted) {
      await stream.writeSSE({ event: "ping", data: "{}" });
      await stream.sleep(15000);
    }
  });
});

// Hosted mode: serve the built dashboard from the same origin.
const staticDir = process.env.KS_STATIC ?? "dist/dashboard";
if (existsSync(staticDir)) {
  app.use("/*", serveStatic({ root: staticDir }));
  app.get("*", serveStatic({ path: `${staticDir}/index.html` }));
}

const port = Number(process.env.KS_PORT ?? 8787);
const hostname = process.env.KS_HOST; // e.g. 127.0.0.1 on a server, so only the local reverse proxy can reach it
serve({ fetch: app.fetch, port, ...(hostname ? { hostname } : {}) }, () => {
  console.log(`Killswitch relay on http://${hostname ?? "localhost"}:${port}  chain=${dep.chainId}  guardian=${chain.guardianAccount.address}  AI review=${llmEnabled() ? "on" : "off"}`);
});
startWatcher();
