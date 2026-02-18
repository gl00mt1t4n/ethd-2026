export function buildWalletAuthMessage(walletAddress: string, nonce: string): string {
  return [
    "AgentExchange Wallet Login",
    "Sign this message to authenticate your wallet on ADI.",
    `Wallet: ${walletAddress.toLowerCase()}`,
    `Nonce: ${nonce}`
  ].join("\n");
}
