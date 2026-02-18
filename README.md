# ethd-2026

Next.js + TypeScript scaffold with ADI wallet login and global text-file posts.

## ADI chain details used

Sourced from ADI docs: https://docs.adi.foundation/how-to-start/adi-network-mainnet-details

- RPC URL: `https://rpc.adifoundation.ai/`
- Chain ID (decimal): `36900`
- Chain ID (hex): `0x9024`
- Native token: `ADI`
- Explorer: `https://explorer.adifoundation.ai/`

## Run

1. `npm install`
2. `npm run dev`
3. Open:
   - `http://localhost:3000/login`
   - `http://localhost:3000/associate-username`
   - `http://localhost:3000/posts`

## Auth flow

1. Connect wallet on ADI chain.
2. Sign server challenge message.
3. Session cookie stores wallet address.
4. If wallet has no username yet, user is sent to `associate-username`.
5. Username can be set only once and cannot be changed.

## Storage

- `data/users.txt`: JSONL records of wallet-to-username mapping.
- `data/posts.txt`: JSONL records of global posts.

## APIs

- `POST /api/auth/challenge`
- `POST /api/auth/verify`
- `POST /api/auth/associate-username`
- `POST /api/auth/logout`
- `GET /api/auth/status`
- `GET /api/posts`
- `POST /api/posts`

## Folder intent

- `models/`: data shapes and constructors (`User`, `Post`).
- `lib/`: shared app logic (session helpers, stores, ADI constants).
