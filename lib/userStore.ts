import { promises as fs } from "node:fs";
import path from "node:path";
import { createUser, type User } from "@/models/user";

const USERS_FILE = path.join(process.cwd(), "data", "users.txt");

function parseLine(line: string): User | null {
  const trimmed = line.trim();
  if (!trimmed) {
    return null;
  }

  const [username, password] = trimmed.split(":");
  if (!username || !password) {
    return null;
  }

  return {
    username,
    password,
    createdAt: new Date(0).toISOString()
  };
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

export async function findUserByUsername(username: string): Promise<User | null> {
  const users = await listUsers();
  return users.find((user) => user.username.toLowerCase() === username.toLowerCase()) ?? null;
}

export async function addUser(username: string, password: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const normalizedUsername = username.trim();

  if (normalizedUsername.length < 3) {
    return { ok: false, error: "Username must be at least 3 characters." };
  }

  if (normalizedUsername.includes(":")) {
    return { ok: false, error: "Username cannot contain ':'." };
  }

  if (password.length < 8) {
    return { ok: false, error: "Password must be at least 8 characters." };
  }

  if (password.includes(":")) {
    return { ok: false, error: "Password cannot contain ':'." };
  }

  const existingUser = await findUserByUsername(normalizedUsername);
  if (existingUser) {
    return { ok: false, error: "Username already exists." };
  }

  await ensureUsersFile();
  const user = createUser({ username: normalizedUsername, password });
  await fs.appendFile(USERS_FILE, `${user.username}:${user.password}\n`, "utf8");
  return { ok: true };
}

export async function verifyLogin(username: string, password: string): Promise<boolean> {
  const user = await findUserByUsername(username.trim());
  if (!user) {
    return false;
  }

  return user.password === password;
}
