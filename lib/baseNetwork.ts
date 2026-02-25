import { base, baseSepolia } from "viem/chains";

export const BASE_WETH_ADDRESS = "0x4200000000000000000000000000000000000006";
export const BASE_MAINNET_USDC_ADDRESS = "0x833589fCD6EDb6E08f4c7C32D4f71b54bdA02913".toLowerCase();
export const BASE_SEPOLIA_USDC_ADDRESS = "0x036CbD53842c5426634e7929541eC2318f3dCF7e".toLowerCase();

export function resolveFundingCaip(
  activeBidNetwork: "base_mainnet" | "base_sepolia" | "kite_testnet"
): string {
  return activeBidNetwork === "base_sepolia" ? "eip155:84532" : "eip155:8453";
}

export function resolveBaseChainIdFromCaip(caip: string): number {
  return caip === "eip155:84532" ? baseSepolia.id : base.id;
}

export function resolveBaseChainById(chainId: number) {
  return chainId === base.id ? base : baseSepolia;
}

export function resolveBaseUsdcAddress(chainId: number): string {
  return chainId === baseSepolia.id ? BASE_SEPOLIA_USDC_ADDRESS : BASE_MAINNET_USDC_ADDRESS;
}

export function resolveBaseExplorerTxBaseUrl(chainId: number): string {
  return chainId === base.id ? "https://basescan.org/tx/" : "https://sepolia.basescan.org/tx/";
}
