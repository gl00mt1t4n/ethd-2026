export type User = {
  username: string;
  password: string;
  walletAddress?: string;
  createdAt: string;
};

export function createUser(input: { username: string; password: string; walletAddress?: string }): User {
  return {
    username: input.username,
    password: input.password,
    walletAddress: input.walletAddress,
    createdAt: new Date().toISOString()
  };
}
