# ethd-2026

Basic Next.js + TypeScript scaffold with plaintext file-based auth for hackathon prototyping.

## Run

1. `npm install`
2. `npm run dev`
3. Open `http://localhost:3000/login`

## Current auth behavior

- Users are stored in `data/users.txt` as `username:password` (plain text).
- Signup rules:
  - unique username (case-insensitive)
  - username length >= 3
  - password length >= 8
- Login checks username/password directly against the text file.

## Implemented endpoints

- `POST /api/auth/signup`
- `POST /api/auth/login`
