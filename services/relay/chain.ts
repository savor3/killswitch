// Chain access for the relay: clients, reads, and the two signing roles (relayer pays gas, guardian pauses/co-signs).
import { readFileSync } from "node:fs";
import {
  BaseError,
  ContractFunctionRevertedError,
  createPublicClient,
  createWalletClient,
  http,
  type Address,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { KillswitchAccountAbi, MockERC20Abi } from "../../shared/abi.js";
import { ANVIL_KEYS, ETH, opTypedData, type Call, type Deployment } from "../../shared/protocol.js";

export const dep: Deployment = JSON.parse(readFileSync(process.env.KS_DEPLOYMENT ?? "deployments/current.json", "utf8"));
const rpc = process.env.KS_RPC ?? dep.rpc;
const isLocal = dep.chainId === 31337;

function key(name: string, fallback: Hex): Hex {
  const v = process.env[name] as Hex | undefined;
  if (v) return v;
  if (!isLocal) throw new Error(`${name} is required on chain ${dep.chainId}`);
  return fallback;
}

export const chain = {
  id: dep.chainId,
  name: `chain-${dep.chainId}`,
  nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: [rpc] } },
} as const;

export const pub = createPublicClient({ chain, transport: http(rpc), pollingInterval: 500 });
export const relayer = createWalletClient({ account: privateKeyToAccount(key("KS_RELAYER_KEY", ANVIL_KEYS.relayer)), chain, transport: http(rpc) });
// In production the guardian key lives in a KMS. Here it is an env var (Anvil dev key on local).
export const guardianAccount = privateKeyToAccount(key("KS_GUARDIAN_KEY", ANVIL_KEYS.guardian));
export const guardianWallet = createWalletClient({ account: guardianAccount, chain, transport: http(rpc) });

export type AgentView = {
  id: Hex;
  label: string;
  sessionKey: Address;
  validUntil: number;
  epoch: bigint;
  nonce: bigint;
  paused: boolean;
  exists: boolean;
  active: boolean;
  killed: boolean;
  rules: { target: Address; selector: Hex }[];
  limits: { token: Address; maxPerPeriod: bigint; cosignAbove: bigint; period: number; used: bigint; resetsAt: number }[];
};

export async function readAccount(account: Address) {
  const [owner, guardian, epoch, ids] = await Promise.all([
    pub.readContract({ address: account, abi: KillswitchAccountAbi, functionName: "owner" }),
    pub.readContract({ address: account, abi: KillswitchAccountAbi, functionName: "guardian" }),
    pub.readContract({ address: account, abi: KillswitchAccountAbi, functionName: "epoch" }),
    pub.readContract({ address: account, abi: KillswitchAccountAbi, functionName: "agentIds" }),
  ]);
  return { owner, guardian, epoch, ids: ids as Hex[] };
}

export async function readAgent(account: Address, id: Hex, epochNow?: bigint): Promise<AgentView> {
  const epoch = epochNow ?? (await pub.readContract({ address: account, abi: KillswitchAccountAbi, functionName: "epoch" }));
  const [[a, active], rules, limits] = await Promise.all([
    pub.readContract({ address: account, abi: KillswitchAccountAbi, functionName: "getAgent", args: [id] }),
    pub.readContract({ address: account, abi: KillswitchAccountAbi, functionName: "getRules", args: [id] }),
    pub.readContract({ address: account, abi: KillswitchAccountAbi, functionName: "getLimits", args: [id] }),
  ]);
  const spent = await Promise.all(
    limits.map((l) => pub.readContract({ address: account, abi: KillswitchAccountAbi, functionName: "spent", args: [id, l.token] })),
  );
  return {
    id,
    label: "",
    sessionKey: a.sessionKey,
    validUntil: Number(a.validUntil),
    epoch: a.epoch,
    nonce: a.nonce,
    paused: a.paused,
    exists: a.exists,
    active,
    killed: a.exists && a.epoch !== epoch,
    rules: rules.map((r) => ({ target: r.target, selector: r.selector })),
    limits: limits.map((l, i) => ({
      token: l.token,
      maxPerPeriod: l.maxPerPeriod,
      cosignAbove: l.cosignAbove,
      period: Number(l.period),
      used: spent[i][0],
      resetsAt: Number(spent[i][2]),
    })),
  };
}

export async function balances(account: Address) {
  const out: Record<string, bigint> = { ETH: await pub.getBalance({ address: account }) };
  for (const t of Object.values(dep.tokens)) {
    out[t.symbol] = await pub.readContract({ address: t.address, abi: MockERC20Abi, functionName: "balanceOf", args: [account] });
  }
  return out;
}

export const tokenBalance = (account: Address, token: Address) =>
  token.toLowerCase() === ETH.address
    ? pub.getBalance({ address: account })
    : pub.readContract({ address: token, abi: MockERC20Abi, functionName: "balanceOf", args: [account] });

/** Revert data from a viem error, if any. */
export function revertData(err: unknown): Hex | undefined {
  if (err instanceof BaseError) {
    const r = err.walk((e) => e instanceof ContractFunctionRevertedError) as ContractFunctionRevertedError | null;
    if (r?.raw) return r.raw;
    const d = err.walk((e: any) => typeof e?.data === "string" && e.data.startsWith("0x")) as any;
    if (d?.data) return d.data as Hex;
  }
  const m = String((err as any)?.message ?? "").match(/0x[0-9a-fA-F]{8,}/);
  return m?.[0] as Hex | undefined;
}

/** Dry-run through the contract's simulate(): returns outflows, or the revert data of the policy that would fire. */
export async function simulate(account: Address, agentId: Hex, calls: Call[]): Promise<{ ok: true; outflows: bigint[] } | { ok: false; data?: Hex }> {
  try {
    await pub.simulateContract({ address: account, abi: KillswitchAccountAbi, functionName: "simulate", args: [agentId, calls], account: relayer.account });
    return { ok: false, data: undefined }; // simulate always reverts; reaching here is unexpected
  } catch (e) {
    if (e instanceof BaseError) {
      const r = e.walk((x) => x instanceof ContractFunctionRevertedError) as ContractFunctionRevertedError | null;
      if (r?.data?.errorName === "SimulationResult") return { ok: true, outflows: [...(r.data.args![0] as readonly bigint[])] };
    }
    return { ok: false, data: revertData(e) };
  }
}

export async function guardianCosign(p: { account: Address; agentId: Hex; calls: Call[]; nonce: bigint; deadline: bigint }): Promise<Hex> {
  return guardianAccount.signTypedData(opTypedData({ chainId: dep.chainId, ...p }));
}

// serialize relayer + guardian txs so nonces never collide
let queue: Promise<unknown> = Promise.resolve();
function serial<T>(fn: () => Promise<T>): Promise<T> {
  const p = queue.then(fn, fn);
  queue = p.catch(() => {});
  return p;
}

export function submitAgentOp(p: { account: Address; agentId: Hex; calls: Call[]; deadline: bigint; agentSig: Hex; guardianSig: Hex }) {
  return serial(async () => {
    const hash = await relayer.writeContract({
      address: p.account,
      abi: KillswitchAccountAbi,
      functionName: "executeAsAgent",
      args: [p.agentId, p.calls, p.deadline, p.agentSig, p.guardianSig],
    });
    const receipt = await pub.waitForTransactionReceipt({ hash });
    return { hash, receipt };
  });
}

export function guardianPause(account: Address, agentId: Hex) {
  return serial(async () => {
    const hash = await guardianWallet.writeContract({ address: account, abi: KillswitchAccountAbi, functionName: "pause", args: [agentId] });
    await pub.waitForTransactionReceipt({ hash });
    return hash;
  });
}
