import { Connection, PublicKey } from "@solana/web3.js";
import { SOLANA_RPC_URL } from "../env";

export async function getTokenBalances(
  publicKeyString: string,
  tokenMintAddresses: string[]
): Promise<{ [mint: string]: { balance: number; decimals: number } }> {
  const connection = new Connection(SOLANA_RPC_URL, "confirmed");
  const publicKey = new PublicKey(publicKeyString);
  const balances: { [mint: string]: { balance: number; decimals: number } } =
    {};

  for (const tokenMintAddress of tokenMintAddresses) {
    try {
      const mintAddress = new PublicKey(tokenMintAddress);
      const tokenAccounts = await connection.getParsedTokenAccountsByOwner(
        publicKey,
        {
          mint: mintAddress,
        }
      );

      if (tokenAccounts.value.length > 0) {
        const tokenAmount =
          tokenAccounts.value[0].account.data.parsed.info.tokenAmount;
        const tokenBalance = tokenAmount.uiAmount;
        const decimals = tokenAmount.decimals;
        console.log(
          `✅ Token balance for ${tokenMintAddress}: ${tokenBalance} (decimals: ${decimals})`
        );
        balances[tokenMintAddress] = { balance: tokenBalance, decimals };
      } else {
        console.warn(`⚠️ No token account found for ${tokenMintAddress}`);
        balances[tokenMintAddress] = { balance: 0, decimals: 0 };
      }
    } catch (err) {
      console.error(`❌ Error fetching balance for ${tokenMintAddress}:`, err);
      balances[tokenMintAddress] = { balance: 0, decimals: 0 };
    }
  }

  return balances;
}
