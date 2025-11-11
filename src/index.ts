import { Wallet } from "@project-serum/anchor";
import { Keypair } from "@solana/web3.js";
import fs from "fs";
import { getTokenBalances } from "./solana/getTokenBalance";
import { getTokenPrice } from "./solana/getTokenPrice";
import { flowQuoteAndSwap } from "./swapExecutor";
import {
  TOKEN_MINTS,
  SOLANA_KEYPAIR_SECRET,
  REBALANCE_THRESHOLD_PERCENT,
} from "./env";

const valueFile = "./portfolio_value.json";
const snapshotFile = "./portfolio_initial_snapshot.json";

type TokenSnapshot = {
  balance: number;
  price: number;
  decimals: number;
};

type PortfolioSnapshot = {
  timestamp: string;
  tokens: Record<string, TokenSnapshot>;
};

function loadInitialValue(): number | null {
  if (fs.existsSync(valueFile)) {
    const data = fs.readFileSync(valueFile, "utf-8").trim();
    if (!data) {
      return null;
    }
    const parsed = Number(data);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function saveInitialValue(value: number): void {
  fs.writeFileSync(valueFile, value.toString());
}

function loadInitialSnapshot(): PortfolioSnapshot | null {
  if (!fs.existsSync(snapshotFile)) {
    return null;
  }
  const raw = fs.readFileSync(snapshotFile, "utf-8").trim();
  if (!raw) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as PortfolioSnapshot;
    return parsed && parsed.tokens ? parsed : null;
  } catch (error) {
    console.warn(`${snapshotFile} is invalid JSON. Ignoring snapshot.`);
    return null;
  }
}

function saveInitialSnapshot(snapshot: PortfolioSnapshot): void {
  fs.writeFileSync(snapshotFile, JSON.stringify(snapshot, null, 2));
}

let initialPortfolioValue: number | null = loadInitialValue();
let initialSnapshot: PortfolioSnapshot | null = loadInitialSnapshot();

if (TOKEN_MINTS.length !== 2) {
  throw new Error(
    "TOKEN_MINTS must specify exactly two mint addresses for this strategy"
  );
}

const [TOKEN_A, TOKEN_B] = TOKEN_MINTS;

async function checkPortfolio() {
  const wallet = new Wallet(Keypair.fromSecretKey(SOLANA_KEYPAIR_SECRET));

  const walletPublicKey = wallet.publicKey.toBase58();
  console.log(walletPublicKey);
  const tokenPriceMap = await getTokenPrice(TOKEN_MINTS);
  const tokenBalanceMap = await getTokenBalances(walletPublicKey, TOKEN_MINTS);

  const balanceA = tokenBalanceMap[TOKEN_A]?.balance ?? 0;
  const decimalsA = tokenBalanceMap[TOKEN_A]?.decimals ?? 0;
  const balanceB = tokenBalanceMap[TOKEN_B]?.balance ?? 0;
  const decimalsB = tokenBalanceMap[TOKEN_B]?.decimals ?? 0;

  const priceA = tokenPriceMap?.[TOKEN_A]?.price;
  const priceB = tokenPriceMap?.[TOKEN_B]?.price;

  if (!priceA || !priceB) {
    console.error("Error: One or both token prices not found.");
    return;
  }

  const valueA = balanceA * priceA;
  const valueB = balanceB * priceB;
  const totalValue = valueA + valueB;

  console.log(`$${valueA.toFixed(2)} (Token A)`);
  console.log(`$${valueB.toFixed(2)} (Token B)`);
  console.log(`Total portfolio value: $${totalValue.toFixed(2)}`);

  const timestamp = new Date().toISOString();

  if (!initialSnapshot) {
    initialSnapshot = {
      timestamp,
      tokens: {
        [TOKEN_A]: {
          balance: balanceA,
          price: priceA,
          decimals: decimalsA,
        },
        [TOKEN_B]: {
          balance: balanceB,
          price: priceB,
          decimals: decimalsB,
        },
      },
    };
    saveInitialSnapshot(initialSnapshot);
    console.log("Initial token snapshot recorded.");
  }

  const initialTokenA = initialSnapshot?.tokens?.[TOKEN_A];
  const initialTokenB = initialSnapshot?.tokens?.[TOKEN_B];
  const tokenDeltaA = initialTokenA ? balanceA - initialTokenA.balance : 0;
  const tokenDeltaB = initialTokenB ? balanceB - initialTokenB.balance : 0;
  const deltaValueA = tokenDeltaA * priceA;
  const deltaValueB = tokenDeltaB * priceB;
  const rebalanceValueImpact = deltaValueA + deltaValueB;

  let valueAtInitialPrices: number | null = null;
  let rebalanceOnlyProfitUSD: number | null = null;
  let rebalanceOnlyProfitPercent: number | null = null;

  if (initialTokenA && initialTokenB) {
    const initialValA = balanceA * initialTokenA.price;
    const initialValB = balanceB * initialTokenB.price;
    valueAtInitialPrices = initialValA + initialValB;

    const baselineValue =
      initialTokenA.balance * initialTokenA.price +
      initialTokenB.balance * initialTokenB.price;

    rebalanceOnlyProfitUSD = valueAtInitialPrices - baselineValue;
    rebalanceOnlyProfitPercent =
      baselineValue !== 0 ? (rebalanceOnlyProfitUSD / baselineValue) * 100 : 0;
  }

  console.log(`Token deltas — A: ${tokenDeltaA}, B: ${tokenDeltaB}`);
  console.log(
    `Rebalance value impact: $${rebalanceValueImpact.toFixed(
      2
    )} (A: $${deltaValueA.toFixed(2)}, B: $${deltaValueB.toFixed(2)})`
  );

  if (
    valueAtInitialPrices !== null &&
    rebalanceOnlyProfitUSD !== null &&
    rebalanceOnlyProfitPercent !== null
  ) {
    console.log(
      `Rebalance-only PnL at initial prices: $${rebalanceOnlyProfitUSD.toFixed(
        2
      )} (${rebalanceOnlyProfitPercent.toFixed(
        2
      )}%), portfolio value at initial prices $${valueAtInitialPrices.toFixed(
        2
      )}`
    );
  }

  if (initialPortfolioValue === null) {
    initialPortfolioValue = totalValue;
    saveInitialValue(initialPortfolioValue);
    console.log(
      `Initial portfolio value recorded: $${initialPortfolioValue.toFixed(2)}`
    );
  }

  const profit = totalValue - initialPortfolioValue;
  const profitPercent = (profit / initialPortfolioValue) * 100;
  const profitStatus = profit >= 0 ? "Profit" : "Loss";

  console.log(
    `${profitStatus}: $${profit.toFixed(2)} (${profitPercent.toFixed(2)}%)`
  );

  // Rebalancing logic
  const targetValue = totalValue / 2;
  const allocationA = (valueA / totalValue) * 100;
  const allocationB = (valueB / totalValue) * 100;
  const threshold = REBALANCE_THRESHOLD_PERCENT;
  const currentDeviation = Math.max(allocationA, allocationB) - 50;

  console.log(
    `Allocations — Token A: ${allocationA.toFixed(
      2
    )}%, Token B: ${allocationB.toFixed(2)}%`
  );
  console.log(
    `Current threshold deviation: ${currentDeviation.toFixed(
      2
    )}% (limit: ${threshold}%)`
  );

  if (allocationA > 50 + threshold) {
    const excessValue = valueA - targetValue;
    const tokensToSwap = Math.floor(excessValue / priceA);
    const amountToSwap = tokensToSwap * 10 ** decimalsA;

    console.log(
      `Swapping ${tokensToSwap} tokens (${amountToSwap} base units) from A → B`
    );
    await flowQuoteAndSwap(wallet, amountToSwap, TOKEN_A, TOKEN_B);
  } else if (allocationB > 50 + threshold) {
    const excessValue = valueB - targetValue;
    const tokensToSwap = Math.floor(excessValue / priceB);
    const amountToSwap = tokensToSwap * 10 ** decimalsB;

    console.log(
      `Swapping ${tokensToSwap} tokens (${amountToSwap} base units) from B → A`
    );
    await flowQuoteAndSwap(wallet, amountToSwap, TOKEN_B, TOKEN_A);
  } else {
    console.log("Portfolio is balanced. No swap needed.");
  }
}

// Run the checkPortfolio function every 10 seconds
console.log("🚀 Starting Smart Rebalance Bot...");
checkPortfolio().catch(console.error); // Run once immediately
setInterval(() => {
  checkPortfolio().catch(console.error);
}, 10000);
