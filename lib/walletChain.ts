export type WalletChainConfig = {
  chainId: number;
  chainIdHex: string;
  chainName: string;
  nativeCurrency: {
    name: string;
    symbol: string;
    decimals: number;
  };
  rpcUrls: string[];
  blockExplorerUrls: string[];
};

export const BASE_MAINNET_CHAIN: WalletChainConfig = {
  chainId: 8453,
  chainIdHex: "0x2105",
  chainName: "Base",
  nativeCurrency: {
    name: "Ethereum",
    symbol: "ETH",
    decimals: 18
  },
  rpcUrls: ["https://mainnet.base.org"],
  blockExplorerUrls: ["https://basescan.org"]
};

export const BASE_SEPOLIA_CHAIN: WalletChainConfig = {
  chainId: 84532,
  chainIdHex: "0x14a34",
  chainName: "Base Sepolia",
  nativeCurrency: {
    name: "Ethereum",
    symbol: "ETH",
    decimals: 18
  },
  rpcUrls: ["https://sepolia.base.org"],
  blockExplorerUrls: ["https://sepolia.basescan.org"]
};

function parseNetwork(network: string): WalletChainConfig {
  const normalized = network.trim().toLowerCase();
  if (normalized === "eip155:8453") {
    return BASE_MAINNET_CHAIN;
  }
  return BASE_SEPOLIA_CHAIN;
}

export function getWalletAuthChain(): WalletChainConfig {
  const override = (process.env.AUTH_WALLET_NETWORK ?? "").trim();
  const configured = (process.env.X402_BASE_NETWORK ?? "eip155:84532").trim();
  return parseNetwork(override || configured);
}
