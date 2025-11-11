import { Wallet } from "@project-serum/anchor";
import { Connection, VersionedTransaction } from "@solana/web3.js";
import fetch from "cross-fetch";
import { SOLANA_RPC_URL } from "./env";
import { getSignature } from "./utils/getSignature";

const connection = new Connection(SOLANA_RPC_URL);

const ULTRA_BASE_URL = "https://lite-api.jup.ag/ultra/v1";

type UltraRouter = "aggregator" | "jupiterz" | "dflow" | "okx";

type UltraOrderResponse = {
  mode: string;
  inputMint: string;
  outputMint: string;
  inAmount: string;
  outAmount: string;
  otherAmountThreshold: string;
  swapMode: string;
  slippageBps: number;
  priceImpact?: number;
  priceImpactPct?: string;
  feeMint?: string;
  feeBps: number;
  signatureFeeLamports: number;
  prioritizationFeeLamports: number;
  rentFeeLamports: number;
  swapType?: string;
  router: UltraRouter;
  transaction: string | null;
  gasless: boolean;
  requestId: string;
  totalTime: number;
  taker: string | null;
  quoteId?: string;
  maker?: string;
  expireAt?: string;
  platformFee?: {
    amount: string;
    feeBps: number;
  };
  errorCode?: number;
  errorMessage?: string;
};

type UltraExecuteResponse = {
  status: "Success" | "Failed";
  signature?: string;
  slot?: string;
  error?: string;
  code: number;
  totalInputAmount?: string;
  totalOutputAmount?: string;
  inputAmountResult?: string;
  outputAmountResult?: string;
};

async function getUltraOrder(
  params: URLSearchParams
): Promise<UltraOrderResponse> {
  const url = `${ULTRA_BASE_URL}/order?${params.toString()}`;
  const response = await fetch(url, {
    method: "GET",
    headers: {
      Accept: "application/json",
      "User-Agent": "SmartRebalanceBot/1.0",
    },
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(
      `Ultra order request failed (${response.status}): ${errorBody}`
    );
  }

  return (await response.json()) as UltraOrderResponse;
}

async function executeUltraOrder(
  requestId: string,
  signedTransaction: string
): Promise<UltraExecuteResponse> {
  const response = await fetch(`${ULTRA_BASE_URL}/execute`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      "User-Agent": "SmartRebalanceBot/1.0",
    },
    body: JSON.stringify({ requestId, signedTransaction }),
  });

  const body = await response.text();

  if (!response.ok) {
    throw new Error(
      `Ultra execute request failed (${response.status}): ${body}`
    );
  }

  return JSON.parse(body) as UltraExecuteResponse;
}

// Perform a swap using Jupiter Ultra Order + Execute flow
export async function flowQuoteAndSwap(
  wallet: Wallet,
  amountToSwap: number,
  inputMint: string,
  outputMint: string
) {
  const amount = Math.trunc(amountToSwap);

  if (amount <= 0) {
    console.warn("Skip swap: calculated amount is not positive.");
    return;
  }

  const params = new URLSearchParams({
    inputMint,
    outputMint,
    amount: amount.toString(),
    taker: wallet.publicKey.toBase58(),
  });

  const order = await getUltraOrder(params);

  if (!order.transaction) {
    const reason = order.errorMessage ?? "No transaction returned";
    console.error(
      `Ultra order did not return a transaction (router=${order.router}). Reason: ${reason}`
    );
    return;
  }

  const transactionBuffer = Buffer.from(order.transaction, "base64");
  const transaction = VersionedTransaction.deserialize(transactionBuffer);
  transaction.sign([wallet.payer]);

  const { value: simulation } = await connection.simulateTransaction(
    transaction,
    {
      replaceRecentBlockhash: true,
      commitment: "processed",
    }
  );

  if (simulation.err) {
    console.error("Simulation Error:", simulation.err, simulation.logs);
    return;
  }

  const signedBase64 = Buffer.from(transaction.serialize()).toString("base64");

  const executeResponse = await executeUltraOrder(
    order.requestId,
    signedBase64
  );

  if (executeResponse.status !== "Success" || executeResponse.code !== 0) {
    console.error(
      `Ultra execute failed: status=${executeResponse.status}, code=${
        executeResponse.code
      }, error=${executeResponse.error ?? "unknown"}`
    );
    return;
  }

  if (executeResponse.signature) {
    console.log(
      `Swap transaction: https://solscan.io/tx/${executeResponse.signature}`
    );
  } else {
    const signature = getSignature(transaction);
    console.log(
      `Swap submitted via Ultra (signature pending in response). Local signature: https://solscan.io/tx/${signature}`
    );
  }
}
