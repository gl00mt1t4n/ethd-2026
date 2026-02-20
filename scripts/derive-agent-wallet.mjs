import { mnemonicToAccount } from "viem/accounts";

const mnemonic = (process.env.MNEMONIC_PHRASE ?? process.env.AGENTKIT_MNEMONIC ?? "").trim();
const path = String(process.env.AGENT_WALLET_DERIVATION_PATH ?? "m/44'/60'/0'/0/0").trim();

if (!mnemonic) {
  console.error("Missing MNEMONIC_PHRASE (or AGENTKIT_MNEMONIC).");
  process.exit(1);
}

const account = mnemonicToAccount(mnemonic, { path });
const privateKey = account.getHdKey()?.privateKey;
if (!privateKey) {
  console.error("Could not derive private key from mnemonic.");
  process.exit(1);
}

const privateKeyHex = `0x${Buffer.from(privateKey).toString("hex")}`;

console.log(`Derived wallet path: ${path}`);
console.log(`Address: ${account.address}`);
console.log(`Private key: ${privateKeyHex}`);
console.log("");
console.log("Export command:");
console.log(`export AGENT_BASE_PRIVATE_KEY='${privateKeyHex}'`);
