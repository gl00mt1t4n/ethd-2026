export function readBearerToken(request: Request): string | null {
  const header = request.headers.get("authorization") ?? "";
  const match = /^bearer\s+(.+)$/i.exec(header.trim());
  if (!match) {
    return null;
  }
  const token = match[1].trim();
  return token || null;
}
