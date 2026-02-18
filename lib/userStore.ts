import { promises as fs } from "node:fs";
import path from "node:path";
import { createUser, type User } from "@/models/user";

const USERS_FILE = path.join(process.cwd(), "data", "users.txt");
const USERNAME_REGEX = /^[a-zA-Z0-9_]{3,24}$/;

function isWalletAddress(value: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(value);
}

function parseLine(line: string): User | null {
  const trimmed = line.trim();
  if (!trimmed) {
    return null;
  }

  try {
    const parsed = JSON.parse(trimmed) as User;
    if (!isWalletAddress(parsed.walletAddress) || !parsed.username || !parsed.createdAt) {
      return null;
    }
    return {
      walletAddress: parsed.walletAddress.toLowerCase(),
      username: parsed.username,
      createdAt: parsed.createdAt
    };
  } catch {
    return null;
  }
}

async function ensureUsersFile(): Promise<void> {
  await fs.mkdir(path.dirname(USERS_FILE), { recursive: true });
  try {
    await fs.access(USERS_FILE);
  } catch {
    await fs.writeFile(USERS_FILE, "", "utf8");
  }
}

export async function listUsers(): Promise<User[]> {
  await ensureUsersFile();
  const content = await fs.readFile(USERS_FILE, "utf8");
  return content
    .split("\n")
    .map(parseLine)
    .filter((user): user is User => user !== null);
}

export async function findUserByWallet(walletAddress: string): Promise<User | null> {
  const normalized = walletAddress.toLowerCase();
  const users = await listUsers();
  return users.find((user) => user.walletAddress === normalized) ?? null;
}

export async function findUserByUsername(username: string): Promise<User | null> {
  const normalized = username.toLowerCase();
  const users = await listUsers();
  return users.find((user) => user.username.toLowerCase() === normalized) ?? null;
}

export async function associateUsername(
  walletAddress: string,
  username: string
): Promise<{ ok: true; user: User } | { ok: false; error: string }> {
  const normalizedWallet = walletAddress.toLowerCase().trim();
  const normalizedUsername = username.trim();

  if (!isWalletAddress(normalizedWallet)) {
    return { ok: false, error: "Invalid wallet address." };
  }

  if (!USERNAME_REGEX.test(normalizedUsername)) {
    return {
      ok: false,
      error: "Username must be 3-24 chars and only contain letters, numbers, and underscore."
    };
  }

  const existingWalletOwner = await findUserByWallet(normalizedWallet);
  if (existingWalletOwner) {
    return { ok: false, error: "This wallet already has a username and cannot be changed." };
  }

  const existingUsername = await findUserByUsername(normalizedUsername);
  if (existingUsername) {
    return { ok: false, error: "Username already exists." };
  }

  const user = createUser({ walletAddress: normalizedWallet, username: normalizedUsername });
  await ensureUsersFile();
  await fs.appendFile(USERS_FILE, `${JSON.stringify(user)}\n`, "utf8");

  return { ok: true, user };
}
