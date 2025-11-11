import { config } from "dotenv";

config();

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function parseKeypairSecret(raw: string): Uint8Array {
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      throw new Error("expected a JSON array");
    }

    const bytes = parsed.map((value) => {
      if (typeof value !== "number" || !Number.isInteger(value)) {
        throw new Error("secret array must contain integers");
      }
      if (value < 0 || value > 255) {
        throw new Error("secret array values must be in [0, 255]");
      }
      return value;
    });

    return Uint8Array.from(bytes);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`Invalid SOLANA_KEYPAIR_SECRET: ${reason}`);
  }
}

function parseTokenMints(raw: string): string[] {
  const mints = raw
    .split(",")
    .map((mint) => mint.trim())
    .filter(Boolean);

  if (mints.length === 0) {
    throw new Error("TOKEN_MINTS must list at least one mint address");
  }

  return mints;
}

function parseThreshold(raw: string | undefined): number {
  if (!raw) {
    return 1.7;
  }

  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(
      "REBALANCE_THRESHOLD_PERCENT must be a non-negative number"
    );
  }

  return parsed;
}

export const SOLANA_RPC_URL = requireEnv("SOLANA_RPC_URL");
export const SOLANA_KEYPAIR_SECRET = parseKeypairSecret(
  requireEnv("SOLANA_KEYPAIR_SECRET")
);
export const TOKEN_MINTS = parseTokenMints(requireEnv("TOKEN_MINTS"));
export const REBALANCE_THRESHOLD_PERCENT = parseThreshold(
  process.env.REBALANCE_THRESHOLD_PERCENT
);
