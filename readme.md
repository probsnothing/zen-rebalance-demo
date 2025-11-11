# Smart Rebalance Bot

Automated Solana portfolio rebalancer that keeps two SPL token positions near a target 50/50 allocation using Jupiter Ultra swaps.

## Features

- Polls current token balances and prices to compute portfolio weights.
- Tracks baseline value for profit/loss reporting in the console.
- Triggers a swap via Jupiter Ultra when either asset drifts beyond the configured threshold.
- Pulls runtime configuration (RPC URL, keypair, token mints, threshold) from environment variables.

## Prerequisites

- Node.js 18+ and npm.
- A funded Solana wallet capable of signing swaps.
- Access to a Solana RPC endpoint (Helius, Triton, or other mainnet provider).

## Installation

```bash
git clone <your-fork-url>
cd bot
npm install
```

## Configuration

1. Copy the example environment file:
   ```bash
   cp .env.example .env
   ```
2. Edit `.env` and provide:
   - `SOLANA_RPC_URL`: mainnet RPC endpoint.
   - `SOLANA_KEYPAIR_SECRET`: JSON array of the fee-payer secret key.
   - `TOKEN_MINTS`: comma-separated mint addresses (exactly two).
   - `REBALANCE_THRESHOLD_PERCENT`: optional float threshold (default 1.7).

## Running the Bot

```bash
npm start
```

The bot immediately evaluates portfolio state and continues every 10 seconds. Console output includes wallet address, individual token valuations, PnL, allocation breakdown, and any swap activity.

## Notes

- Never commit real secrets; keep `.env` out of source control.
- Ensure your RPC provider allows transaction simulation and Ultra swap execution.
- Threshold logic currently supports exactly two tokens with a target 50/50 split; extend `src/index.ts` if you need more assets or dynamic targets.
