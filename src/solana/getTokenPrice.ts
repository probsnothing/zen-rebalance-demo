import axios from "axios";

const JUPITER_PRICE_ENDPOINT = "https://lite-api.jup.ag/price/v3";

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

type JupiterPriceRaw = Record<
  string,
  {
    usdPrice: number;
    blockId: number | null;
    decimals: number;
    priceChange24h: number | null;
  }
>;

export type TokenPriceEntry = {
  price: number;
  usdPrice: number;
  blockId: number | null;
  decimals: number;
  priceChange24h: number | null;
};

export async function getTokenPrice(
  tokens: string[],
  retries = 3,
  delay = 3000
): Promise<Record<string, TokenPriceEntry> | null> {
  const params = { ids: tokens.join(",") };

  try {
    const response = await axios.get<JupiterPriceRaw>(JUPITER_PRICE_ENDPOINT, {
      timeout: 5000,
      headers: {
        Accept: "application/json",
        "User-Agent": "SmartRebalanceBot/1.0",
      },
      params,
    });

    const priceData = response.data;

    if (!priceData || Object.keys(priceData).length === 0) {
      throw new Error("Empty token price data");
    }

    const normalized: Record<string, TokenPriceEntry> = {};

    for (const [mint, info] of Object.entries(priceData)) {
      if (typeof info?.usdPrice !== "number") {
        continue;
      }

      normalized[mint] = {
        price: info.usdPrice,
        usdPrice: info.usdPrice,
        blockId: info.blockId,
        decimals: info.decimals,
        priceChange24h: info.priceChange24h,
      };
    }

    if (Object.keys(normalized).length === 0) {
      throw new Error("No valid token price entries");
    }

    return normalized;
  } catch (error: any) {
    console.error(
      `❌ Failed to fetch prices (attempts left: ${retries}):`,
      error.message
    );

    if (retries > 0) {
      await sleep(delay);
      return await getTokenPrice(tokens, retries - 1, delay);
    }

    console.error("🚫 Max retries reached. Returning null.");
    return null;
  }
}
