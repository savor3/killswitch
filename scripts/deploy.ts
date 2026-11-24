// Deploys the factory, mock tokens and mock DEX. Writes deployments/<chainId>.json.
// Local:   npm run deploy               (uses Anvil dev key)
// Testnet: KS_RPC=... KS_DEPLOYER_KEY=0x... npm run deploy
import { readFileSync, writeFileSync } from "node:fs";
import { createPublicClient, createWalletClient, http, parseEther, parseUnits, type Abi, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { KillswitchFactoryAbi, MockDEXAbi, MockERC20Abi } from "../shared/abi.js";
import { ANVIL_KEYS, type Deployment } from "../shared/protocol.js";

const rpc = process.env.KS_RPC ?? "http://127.0.0.1:8545";
const key = (process.env.KS_DEPLOYER_KEY ?? ANVIL_KEYS.owner) as Hex;
const bytecode = JSON.parse(readFileSync("shared/bytecode.json", "utf8")) as Record<string, Hex>;

const account = privateKeyToAccount(key);
const pub = createPublicClient({ transport: http(rpc) });
const chainId = await pub.getChainId();
const chain = { id: chainId, name: `chain-${chainId}`, nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 }, rpcUrls: { default: { http: [rpc] } } };
const wallet = createWalletClient({ account, chain, transport: http(rpc) });

async function deploy(name: string, abi: Abi, args: unknown[] = []): Promise<Address> {
  const hash = await wallet.deployContract({ abi, bytecode: bytecode[name], args });
  const r = await pub.waitForTransactionReceipt({ hash });
  console.log(`  ${name.padEnd(18)} ${r.contractAddress}`);
  return r.contractAddress!;
}

console.log(`Deploying to chain ${chainId} (${rpc}) as ${account.address}`);
const usdc = await deploy("MockERC20", MockERC20Abi, ["USD Coin (test)", "USDC", 6]);
const weth = await deploy("MockERC20", MockERC20Abi, ["Wrapped Ether (test)", "WETH", 18]);
const dex = await deploy("MockDEX", MockDEXAbi, [usdc, weth, parseUnits("3000", 6)]);
const factory = await deploy("KillswitchFactory", KillswitchFactoryAbi);

// seed DEX liquidity
for (const [token, amt] of [[weth, parseEther("10000")], [usdc, parseUnits("30000000", 6)]] as const) {
  const h = await wallet.writeContract({ address: token, abi: MockERC20Abi, functionName: "mint", args: [dex, amt] });
  await pub.waitForTransactionReceipt({ hash: h });
}

const dep: Deployment = {
  chainId,
  rpc,
  factory,
  dex,
  tokens: {
    USDC: { symbol: "USDC", address: usdc, decimals: 6 },
    WETH: { symbol: "WETH", address: weth, decimals: 18 },
  },
  deployedAt: Number(await pub.getBlockNumber()),
};
writeFileSync(`deployments/${chainId}.json`, JSON.stringify(dep, null, 2));
writeFileSync(`deployments/current.json`, JSON.stringify(dep, null, 2));
console.log(`Saved deployments/${chainId}.json`);
