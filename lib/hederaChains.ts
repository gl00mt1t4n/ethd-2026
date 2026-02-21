import { defineChain } from "viem";

export const hederaTestnet = defineChain({
  id: 296,
  name: "Hedera Testnet",
  nativeCurrency: {
    name: "HBAR",
    symbol: "HBAR",
    decimals: 18
  },
  rpcUrls: {
    default: {
      http: [
        process.env.HEDERA_TESTNET_RPC_URL || "https://testnet.hashio.io/api"
      ]
    }
  },
  blockExplorers: {
    default: {
      name: "HashScan",
      url: "https://hashscan.io/testnet"
    }
  }
});
