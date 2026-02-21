import { Attribution } from "ox/erc8021";

let cachedBuilderCode;
let cachedDataSuffix;

function resolveBuilderCode() {
  const value = String(process.env.BASE_BUILDER_CODE ?? "").trim();
  if (!value) {
    return null;
  }
  if (value.includes(",")) {
    throw new Error("BASE_BUILDER_CODE must not contain commas.");
  }
  return value;
}

export function getBuilderCode() {
  if (cachedBuilderCode === undefined) {
    cachedBuilderCode = resolveBuilderCode();
  }
  return cachedBuilderCode;
}

export function getBuilderCodeDataSuffix() {
  if (cachedDataSuffix !== undefined) {
    return cachedDataSuffix ?? undefined;
  }

  const code = getBuilderCode();
  if (!code) {
    cachedDataSuffix = null;
    return undefined;
  }

  cachedDataSuffix = Attribution.toDataSuffix({ codes: [code] });
  return cachedDataSuffix;
}
