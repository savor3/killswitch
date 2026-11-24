// Small UI kit: icons, humanised text, prices, templates.
import type { ReactNode } from "react";
import { formatUnits, toFunctionSelector, type Address, type Hex } from "viem";
import { short, type Agent, type Config, type Op } from "./lib";

const P: Record<string, ReactNode> = {
  home: <><path d="M3 10.5 12 3l9 7.5" /><path d="M5 9v11a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1V9" /></>,
  bot: <><rect x="4" y="8" width="16" height="12" rx="3" /><path d="M12 8V4" /><circle cx="12" cy="3" r="1" /><path d="M9 13v1M15 13v1M2 14h2M20 14h2" /></>,
  activity: <path d="M3 12h4l3 8 4-16 3 8h4" />,
  settings: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></>,
  shield: <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />,
  shieldok: <><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /><path d="m9 12 2 2 4-4" /></>,
  power: <><path d="M18.4 6.6a9 9 0 1 1-12.8 0" /><path d="M12 2v10" /></>,
  check: <path d="M20 6 9 17l-5-5" />,
  x: <path d="M18 6 6 18M6 6l12 12" />,
  alert: <><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" /><path d="M12 9v4M12 17h.01" /></>,
  plus: <path d="M12 5v14M5 12h14" />,
  copy: <><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></>,
  eye: <><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></>,
  swap: <><path d="M16 3l4 4-4 4" /><path d="M20 7H4" /><path d="M8 21l-4-4 4-4" /><path d="M4 17h16" /></>,
  send: <><path d="M22 2 11 13" /><path d="M22 2 15 22l-4-9-9-4z" /></>,
  cart: <><circle cx="9" cy="21" r="1" /><circle cx="20" cy="21" r="1" /><path d="M1 1h4l2.7 13.4a2 2 0 0 0 2 1.6h9.7a2 2 0 0 0 2-1.6L23 6H6" /></>,
  zap: <path d="M13 2 3 14h9l-1 8 10-12h-9z" />,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  wallet: <><path d="M20 7V5a2 2 0 0 0-2-2H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-4a2 2 0 0 0 0 4h4v3a1 1 0 0 1-1 1H5a2 2 0 0 1-2-2V5" /></>,
  chevron: <path d="m9 18 6-6-6-6" />,
  down: <path d="m6 9 6 6 6-6" />,
  sun: <><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></>,
  moon: <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />,
  pause: <path d="M8 5v14M16 5v14" />,
  play: <path d="M6 4l14 8-14 8z" />,
  trash: <><path d="M3 6h18" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /><path d="M10 11v6M14 11v6" /><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" /></>,
  sparkle: <path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z" />,
  lock: <><rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></>,
  terminal: <><path d="m4 17 6-5-6-5" /><path d="M12 19h8" /></>,
  code: <><path d="m16 18 6-6-6-6" /><path d="m8 6-6 6 6 6" /></>,
  monitor: <><rect x="2" y="3" width="20" height="14" rx="2" /><path d="M8 21h8M12 17v4" /></>,
};

export function Icon({ name, size = 18, className = "" }: { name: string; size?: number; className?: string }) {
  return (
    <svg className={`ic ${className}`} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {P[name] ?? P.alert}
    </svg>
  );
}

export function Logo({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 26 26" aria-hidden="true">
      <circle cx="13" cy="14" r="9.5" fill="none" stroke="var(--accent)" strokeWidth="2.6" strokeDasharray="46 14" transform="rotate(-62 13 14)" />
      <line x1="13" y1="2.5" x2="13" y2="13" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" />
    </svg>
  );
}

// ---------- money
export type Prices = Record<string, number>; // USD per whole token
export const decOf = (cfg: Config, sym: string) => (sym === "ETH" ? 18 : cfg.tokens[sym]?.decimals ?? 18);
export const toNum = (raw: string | bigint, decimals: number) => Number(formatUnits(BigInt(raw), decimals));
export const usd = (n: number, digits = 2) =>
  "$" + n.toLocaleString("en-US", { minimumFractionDigits: n !== 0 && Math.abs(n) < 10 ? digits : 0, maximumFractionDigits: digits });
export const num = (n: number, max = 4) => n.toLocaleString("en-US", { maximumFractionDigits: max });

export function balanceUsd(cfg: Config, balances: Record<string, string>, prices: Prices) {
  return Object.entries(balances).reduce((s, [sym, raw]) => s + toNum(raw, decOf(cfg, sym)) * (prices[sym] ?? 0), 0);
}

/** Worst case: what all live agents together could still move today, never more than what the wallet holds. */
export function exposureUsd(cfg: Config, agents: Agent[], balances: Record<string, string>, prices: Prices) {
  const perToken: Record<string, number> = {};
  for (const a of agents) {
    if (!a.active) continue;
    for (const l of a.limits) {
      const left = Math.max(0, toNum(l.maxPerPeriod, l.decimals) - toNum(l.used, l.decimals));
      perToken[l.symbol] = (perToken[l.symbol] ?? 0) + left;
    }
  }
  return Object.entries(perToken).reduce((s, [sym, left]) => {
    const held = toNum(balances[sym] ?? "0", decOf(cfg, sym));
    return s + Math.min(left, held) * (prices[sym] ?? 0);
  }, 0);
}

// ---------- words
export function nameAddress(cfg: Config, a: string) {
  if (a.toLowerCase() === cfg.dex.toLowerCase()) return "the approved exchange";
  return a;
}

export function humanSummary(cfg: Config, s: string) {
  let parts = s.split(" + ");
  if (parts.some((p) => p.startsWith("swap"))) parts = parts.filter((p) => !p.startsWith("approve "));
  let out = parts.join(", then ");
  out = out.replaceAll(short(cfg.dex), "the exchange");
  return out.charAt(0).toUpperCase() + out.slice(1);
}

export function opKind(op: Op) {
  if (op.summary.includes("swap")) return "swap";
  if (op.summary.startsWith("send")) return "send";
  return "zap";
}

export const RULE_TEXT: Record<string, string> = {
  "USDC.transfer": "Send USDC",
  "WETH.transfer": "Send WETH",
  "USDC.approve": "Let the exchange use USDC",
  "WETH.approve": "Let the exchange use WETH",
  "DEX.swap": "Swap on the approved exchange",
};
export const ruleText = (n: string) => RULE_TEXT[n] ?? n;

export function agentKind(a: Agent) {
  const names = a.rules.map((r) => r.name);
  if (names.includes("DEX.swap")) return names.includes("WETH.approve") ? "trader" : "dca";
  return a.limits.some((l) => Number(l.maxPerPeriod) <= 10e6) ? "api" : "payments";
}

// ---------- templates
export type TemplateId = "trader" | "dca" | "payments" | "api";
export type Template = {
  id: TemplateId; title: string; blurb: string; icon: string; label: string;
  cap: string; cosign: string; wethCap?: string; caps: string[]; can: string[]; cant: string[];
};
export const TEMPLATES: Template[] = [
  {
    id: "trader", title: "Trading", icon: "swap", label: "Trading bot",
    blurb: "Swap between USDC and WETH on the approved exchange.",
    cap: "100", cosign: "50", wethCap: "0.05", caps: ["50", "100", "500", "1000"],
    can: ["Swap USDC ↔ WETH on the approved exchange"],
    cant: ["Send funds to any address", "Use any other exchange or app"],
  },
  {
    id: "dca", title: "Auto-buy", icon: "cart", label: "Auto-buy ETH",
    blurb: "Buy WETH with USDC on a schedule. It can never sell or withdraw.",
    cap: "20", cosign: "20", caps: ["10", "20", "50", "100"],
    can: ["Buy WETH with USDC on the approved exchange"],
    cant: ["Sell WETH", "Send funds to any address"],
  },
  {
    id: "payments", title: "Payments", icon: "send", label: "Payments bot",
    blurb: "Pay invoices, vendors and people in USDC.",
    cap: "50", cosign: "20", caps: ["25", "50", "100", "500"],
    can: ["Send USDC (new recipients are checked by the guardian)"],
    cant: ["Trade or swap", "Touch WETH or ETH"],
  },
  {
    id: "api", title: "Pay-per-use", icon: "zap", label: "Research agent",
    blurb: "Tiny payments for APIs, data and tools. A tight daily budget.",
    cap: "5", cosign: "2", caps: ["1", "5", "10"],
    can: ["Send small USDC payments"],
    cant: ["Trade or swap", "Spend more than the budget"],
  },
];
export const tpl = (id: TemplateId) => TEMPLATES.find((t) => t.id === id)!;

export function buildGrant(cfg: Config, t: TemplateId, cap: string, cosign: string, wethCap: string) {
  const T = cfg.tokens;
  const APPROVE = "0x095ea7b3" as Hex, TRANSFER = "0xa9059cbb" as Hex;
  const swap = toFunctionSelector("swapExactIn(address,uint256,uint256)");
  const day = 86400;
  const u = (v: string) => BigInt(Math.round(Number(v || "0") * 1e6));
  const w = (v: string) => BigInt(Math.round(Number(v || "0") * 1e6)) * 10n ** 12n;
  const usdcLimit = { token: T.USDC.address, maxPerPeriod: u(cap), cosignAbove: u(cosign), period: day };
  let rules: { target: Address; selector: Hex }[];
  const limits = [usdcLimit];
  if (t === "trader") {
    rules = [{ target: T.USDC.address, selector: APPROVE }, { target: T.WETH.address, selector: APPROVE }, { target: cfg.dex, selector: swap }];
    limits.push({ token: T.WETH.address, maxPerPeriod: w(wethCap), cosignAbove: w(wethCap), period: day });
  } else if (t === "dca") {
    rules = [{ target: T.USDC.address, selector: APPROVE }, { target: cfg.dex, selector: swap }];
  } else {
    rules = [{ target: T.USDC.address, selector: TRANSFER }];
  }
  return { rules, limits };
}

export const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;
export function until(ts: number) {
  const s = ts - Date.now() / 1000;
  if (s <= 0) return "now";
  if (s < 3600) return `${Math.ceil(s / 60)}m`;
  if (s < 86400) return `${Math.round(s / 3600)}h`;
  return `${Math.round(s / 86400)}d`;
}
