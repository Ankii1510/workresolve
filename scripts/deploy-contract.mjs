#!/usr/bin/env node
/**
 * Deploys contracts/workresolve.py to a named GenLayer network — and proves,
 * from the receipt itself, which network it actually landed on.
 *
 * WHY THIS EXISTS RATHER THAN `genlayer deploy`:
 *
 * `genlayer deploy` takes its target network from genlayer-cli's *global*
 * config (`genlayer network set …`), which is per-machine, per-shell-user, and
 * invisible in the command you type. On 2026-09-09 that cost a full day: a
 * `genlayer network set studionet` had been run in one shell (a sandboxed VM
 * with its own genlayer config), while the deploy ran in a different shell
 * still set to `testnet-asimov`. The deploy succeeded — on Asimov — and its
 * address was then configured as the app's *Studio* address. Every write then
 * asked Studio's consensus contract for a contract that only exists on Asimov,
 * and Studio replied "Contract not found". Reads kept working the whole time
 * (the CLI reading them was also on Asimov), and the wallet reported the write
 * failure as nothing more useful than "an internal error". See
 * docs/limitations.md for the full incident.
 *
 * So this script:
 *   1. Takes the network as a required argument. There is no global state to
 *      get out of sync with, and the command you typed is the whole truth.
 *   2. Prints the resolved chain name, id and RPC URL before signing anything.
 *   3. After the receipt arrives, checks its SHAPE and says which kind of
 *      network produced it. genlayer-js returns a simulator-shaped receipt for
 *      Studio chains (`consensus_data` / `leader_receipt`) and a
 *      consensus-contract-shaped one for real chains (`txCalldata`,
 *      `readStateBlockRange`, `consumedValidators`). That difference was
 *      sitting in the receipt from the first minute on 2026-09-09 and would
 *      have ended the whole investigation immediately. Now it is asserted.
 *   4. Prints the exact env-var line and the correct explorer URL to confirm on.
 *
 * DEPLOY ONCE PER NETWORK. This contract is upgradeable (see `upgrade()` in
 * contracts/workresolve.py): after a network's first deployment, every later
 * code change goes through scripts/upgrade-contract.mjs against that same
 * permanent address. Re-running this script on a network that already has a
 * deployment creates a SECOND, unrelated contract with empty storage — which
 * is how Asimov ended up with a stray duplicate. Don't.
 *
 * The deploying account becomes the contract's sole upgrader (GenVM records
 * `gl.message.sender_address` in `root.upgraders` during `__init__`), so use
 * the same account you intend to keep upgrading with.
 *
 * Usage:
 *   node scripts/deploy-contract.mjs <network> <path-to-.py-file> <path-to-keystore.json>
 *   node scripts/deploy-contract.mjs <network> <path-to-.py-file> --throwaway
 *
 * Examples:
 *   npm run deploy-contract -- studionet contracts/workresolve.py upgrader-keystore.json
 *   npm run deploy-contract -- studionet contracts/workresolve.py --throwaway
 *
 * `--throwaway` generates a fresh key instead of prompting for a keystore
 * password. Studio has no gas token, so an unfunded key deploys there fine —
 * this is the same fallback GenLayer's own examples use for studionet. The key
 * is printed once, because it is the ONLY account that will ever be able to
 * upgrade the resulting contract: save it or accept that the deployment is
 * permanently frozen. Never use --throwaway on a real testnet.
 */

import { readFileSync, realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { createClient, createAccount, generatePrivateKey } from "genlayer-js";
import { localnet, studionet, testnetAsimov, testnetBradbury } from "genlayer-js/chains";
import { Wallet } from "ethers";

const CHAINS = { localnet, studionet, testnetAsimov, testnetBradbury };

/** Which env var the resulting address belongs in, per network — mirrors the
 * switch in src/lib/genlayer/config.ts's readContractAddressForNetwork(). */
const ENV_VAR_BY_NETWORK = {
  studionet: "NEXT_PUBLIC_WORKRESOLVE_CONTRACT_ADDRESS_STUDIONET",
  testnetAsimov: "NEXT_PUBLIC_WORKRESOLVE_CONTRACT_ADDRESS_TESTNET_ASIMOV",
  testnetBradbury: "NEXT_PUBLIC_WORKRESOLVE_CONTRACT_ADDRESS_TESTNET_BRADBURY",
  localnet: "NEXT_PUBLIC_WORKRESOLVE_CONTRACT_ADDRESS_LOCALNET",
};

const EXPLORER_BY_NETWORK = {
  studionet: "https://explorer-studio.genlayer.com/address/",
  testnetAsimov: "https://explorer-asimov.genlayer.com/address/",
};

/**
 * Reports which kind of network a receipt came from, purely from its shape.
 *
 * genlayer-js decodes Studio/localnet transactions through
 * `decodeLocalnetTransaction` (simulator JSON: `consensus_data`,
 * `leader_receipt`, snake_case `data.calldata`) and real-chain transactions by
 * reading the consensus data contract (`txCalldata`, `txDataDecoded`,
 * `readStateBlockRange`, `consumedValidators`, `lastRound`). Returns
 * "studio" | "real-chain" | "unknown" — "unknown" is not treated as a failure,
 * since a shape change in genlayer-js must not block a deploy.
 */
export function classifyReceiptShape(receipt) {
  if (!receipt || typeof receipt !== "object") return "unknown";
  const realChainKeys = ["txCalldata", "readStateBlockRange", "consumedValidators", "lastRound"];
  const studioKeys = ["consensus_data", "leader_receipt"];
  const flat = JSON.stringify(receipt, (_k, v) => (typeof v === "bigint" ? v.toString() : v));
  if (studioKeys.some((k) => flat.includes(`"${k}"`))) return "studio";
  if (realChainKeys.some((k) => flat.includes(`"${k}"`))) return "real-chain";
  return "unknown";
}

async function resolveAccount(keystoreArg) {
  if (keystoreArg === "--throwaway") {
    const privateKey = generatePrivateKey();
    const account = createAccount(privateKey);
    console.log("");
    console.log("--throwaway: generated a fresh key for this deployment.");
    console.log(`  address:     ${account.address}`);
    console.log(`  private key: ${privateKey}`);
    console.log("  SAVE THIS KEY. It is the only account that can ever call upgrade() on the");
    console.log("  contract this deploys. Keep it out of git (.env.local is gitignored).");
    console.log("");
    return account;
  }

  const rl = createInterface({ input: stdin, output: stdout });
  const password = await rl.question("Keystore password: ");
  rl.close();
  const wallet = await Wallet.fromEncryptedJson(readFileSync(keystoreArg, "utf8"), password);
  return createAccount(/** @type {`0x${string}`} */ (wallet.privateKey));
}

async function main() {
  const [, , network, contractFilePath, keystoreArg] = process.argv;

  if (!network || !contractFilePath || !keystoreArg) {
    console.error(
      "Usage: node scripts/deploy-contract.mjs <network> <path-to-.py-file> <path-to-keystore.json | --throwaway>",
    );
    console.error(`  <network> is one of: ${Object.keys(CHAINS).join(", ")}`);
    process.exit(1);
  }

  const chain = CHAINS[network];
  if (!chain) {
    console.error(`Unknown network "${network}". Expected one of: ${Object.keys(CHAINS).join(", ")}`);
    process.exit(1);
  }

  const code = readFileSync(contractFilePath, "utf8");
  const account = await resolveAccount(keystoreArg);

  console.log(`Deploying ${contractFilePath} (${code.length} bytes)`);
  console.log(`  network:  ${chain.name}  (chain id ${chain.id})`);
  console.log(`  rpc:      ${chain.rpcUrls.default.http[0]}`);
  console.log(`  deployer: ${account.address}   <- becomes this contract's sole upgrader`);
  console.log("");

  const client = createClient({ chain, account });
  const hash = await client.deployContract({ code, args: [] });
  console.log(`Deploy transaction: ${hash}`);
  console.log("Waiting for the receipt (this can take a minute)...");

  const receipt = await client.waitForTransactionReceipt({
    hash,
    status: "ACCEPTED",
    retries: 60,
    interval: 3000,
    fullTransaction: true,
  });

  const address =
    receipt?.data?.contract_address ??
    receipt?.data?.contractAddress ??
    receipt?.contract_address ??
    receipt?.txDataDecoded?.contractAddress ??
    null;

  const shape = classifyReceiptShape(receipt);
  const expected = chain.isStudio ? "studio" : "real-chain";

  console.log("");
  if (shape === "unknown") {
    console.log("NOTE: could not classify the receipt's shape — genlayer-js may have changed it.");
    console.log("      Verify the address on the explorer below before trusting this deployment.");
  } else if (shape !== expected) {
    console.error("STOP — this receipt does not look like it came from the network you asked for.");
    console.error(`  asked for: ${chain.name} (expects a "${expected}" shaped receipt)`);
    console.error(`  got:       a "${shape}" shaped receipt`);
    console.error("  This is exactly the 2026-09-09 failure (see docs/limitations.md). Do NOT");
    console.error("  configure this address for that network until you have confirmed it on the");
    console.error("  explorer below.");
  } else {
    console.log(`Receipt shape matches ${chain.name} ("${shape}") — deployed to the intended network.`);
  }

  if (!address) {
    console.error("");
    console.error("Deployed, but no contract address was found in the receipt. Full receipt:");
    console.error(JSON.stringify(receipt, (_k, v) => (typeof v === "bigint" ? v.toString() : v), 2));
    process.exit(1);
  }

  const explorer = EXPLORER_BY_NETWORK[network];
  console.log("");
  console.log(`Contract deployed at: ${address}`);
  console.log("");
  console.log("Confirm it independently before configuring it anywhere:");
  console.log(`  npx genlayer receipt ${hash}      (expect txExecutionResultName: FINISHED_WITH_RETURN)`);
  console.log(`  npx genlayer code ${address}`);
  if (explorer) console.log(`  ${explorer}${address}      (must resolve HERE, not on another network's explorer)`);
  console.log("");
  console.log("Then set this, locally in .env.local and on Vercel (redeploy after — Next.js inlines");
  console.log("NEXT_PUBLIC_* at build time, so adding the variable alone changes nothing):");
  console.log(`  ${ENV_VAR_BY_NETWORK[network]}=${address}`);
  console.log("");
  console.log("This is the last deploy this network needs. Every future code change goes through:");
  console.log(`  npm run upgrade-contract -- ${network} ${address} ${contractFilePath} <keystore.json>`);
}

/** Only deploy when this file is *run*, never when it is imported — the
 * receipt-shape classifier above is unit-tested (src/tests/unit/deployReceiptShape.test.ts),
 * and an import that deployed a contract as a side effect would be a very
 * expensive kind of test. `realpathSync` normalizes the symlinked/relative
 * paths npm and Windows can hand us before comparing. */
const invokedPath = process.argv[1] ? realpathSync(process.argv[1]) : "";
if (invokedPath && realpathSync(fileURLToPath(import.meta.url)) === invokedPath) {
  main().catch((err) => {
    console.error("Deploy failed:", err);
    process.exit(1);
  });
}
