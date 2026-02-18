export type User = {
  walletAddress: string;
  username: string;
  createdAt: string;
};

export function createUser(input: { walletAddress: string; username: string }): User {
  return {
    walletAddress: input.walletAddress.toLowerCase(),
    username: input.username,
    createdAt: new Date().toISOString()
  };
}
