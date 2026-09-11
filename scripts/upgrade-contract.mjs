#!/usr/bin/env node
/**
 * Upgrade the live WorkResolve contract in place, using the upgradability
 * mechanism built into contracts/workresolve.py (see docs/contracts.md
 * "Upgradability"), instead of deploying to a brand-new address.
 *
 * WHY THIS SCRIPT EXISTS (don't delete it after one use — it's the standing
 * tool for every future contract fix):
 *
 * `genlayer write <address> upgrade --args b#<hex>` (the CLI's only way to
 * pass a `bytes` argument) cannot actually carry a whole contract file's
 * bytes: hex-encoding contracts/workresolve.py (~46 KB) produces roughly
 * 92,000 hex characters, and that single CLI argument blows past Windows'
 * ~32,000-character command-line limit (the limit applies to the whole
 * command line the shell hands to the child process, not just one argument's
 * "reasonable" length). `genlayer write` also has no `--contract <path>`
 * file-reading flag the way `genlayer deploy` does — confirmed by reading
 * the installed genlayer-cli package's own source
 * (dist/index.js, `initializeContractsCommands`), not guessed.
 *
 * This script instead calls genlayer-js's own `writeContract` directly,
 * which accepts the file's raw bytes as a Uint8Array (`fs.readFileSync`'s
 * return value) with no command-line length limit at all, exactly the way
 * `createClient(...).deployContract({ code })` already works for the initial
 * deploy — see src/lib/genlayer/client.ts for the same createClient pattern
 * used by the frontend itself (chain + account, confirmed directly from the
 * installed genlayer-js@1.1.8 type definitions).
 *
 * ONE-TIME SETUP (only needed the first time you use this script):
 *   0. Confirm which account is actually allowed to upgrade before exporting
 *      anything — it must be an address in root.upgraders, which is set at
 *      __init__ time to whichever account ran `genlayer deploy` for this
 *      contract's CURRENT (fourth) address, not necessarily whatever account
 *      is active in the CLI right now, and NOT the browser wallet you use
 *      from the frontend to create/fund/accept milestones as a client:
 *        npx genlayer call 0x14255277822815F43DA58271d8d28f0F844cf209 get_upgraders
 *        npx genlayer account list
 *      Use `npx genlayer account use <name>` to switch the CLI's active
 *      account to the one that matches, if it isn't already active.
 *   1. Export that account to an encrypted keystore file:
 *        npx genlayer account export --output upgrader-keystore.json
 *      It will ask you to set a password for the exported file — remember it,
 *      you'll type it in again below. (Your original account/keystore inside
 *      genlayer-cli itself is untouched by this — this only makes a copy.)
 *   2. Make sure dependencies are installed (this script's only extra
 *      dependency, `ethers` — needed just to decrypt the keystore file from
 *      step 1, since genlayer-js/viem don't ship a keystore decryptor in
 *      this version — is already listed in package.json devDependencies):
 *        npm install
 *      (run this from the workresolve project root)
 *
 * USAGE (every time you need to push a contract fix without a new address):
 *   npm run upgrade-contract -- <contractAddress> <path-to-fixed-.py-file> <path-to-keystore.json>
 *
 * Example, for the current live Asimov contract:
 *   npm run upgrade-contract -- testnetAsimov 0x14255277822815F43DA58271d8d28f0F844cf209 contracts/workresolve.py upgrader-keystore.json
 *
 * And for a Studio deployment (its own, different address):
 *   npm run upgrade-contract -- studionet <studio-address> contracts/workresolve.py upgrader-keystore.json
 *
 * THIS IS THE NORMAL WAY TO SHIP A CONTRACT CHANGE. `genlayer deploy` is only
 * for standing a contract up on a network for the FIRST time; after that, each
 * network keeps one permanent address and every code change goes through this
 * script, so no address ever has to be re-issued, re-documented, or re-entered
 * into Vercel again.
 *
 * It will prompt for the keystore password, then print the upgrade
 * transaction's hash — verify it the same way as every deployment this
 * project has ever done:
 *   npx genlayer receipt <txHash>   (look for txExecutionResultName: FINISHED_WITH_RETURN)
 *   npx genlayer code <contractAddress>   (should return the NEW source)
 */

import { readFileSync } from "node:fs";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { createClient, createAccount } from "genlayer-js";
import { localnet, studionet, testnetAsimov, testnetBradbury } from "genlayer-js/chains";
import { Wallet } from "ethers";

/**
 * Every network this contract can live on. A contract deployed on Asimov and
 * one deployed on Studio are different contracts at different addresses on
 * unrelated chains — upgradability keeps ONE address stable across code
 * changes on ONE network, it can never make a single address serve two. So
 * each network has its own permanent address, and this script is pointed at
 * one of them per run.
 *
 * The network used to be hardcoded to testnetAsimov here, which silently
 * limited this tool to a single network — and sending an upgrade to the wrong
 * network is exactly the class of mistake that cost a day on 2026-09-09 (see
 * docs/limitations.md). Hence: required argument, no default, and the target
 * chain is echoed back before anything is signed.
 */
const CHAINS = { localnet, studionet, testnetAsimov, testnetBradbury };

async function main() {
  const [, , network, contractAddress, contractFilePath, keystorePath] = process.argv;

  if (!network || !contractAddress || !contractFilePath || !keystorePath) {
    console.error(
      "Usage: node scripts/upgrade-contract.mjs <network> <contractAddress> <path-to-.py-file> <path-to-keystore.json>",
    );
    console.error(`  <network> is one of: ${Object.keys(CHAINS).join(", ")}`);
    process.exit(1);
  }

  const chain = CHAINS[network];
  if (!chain) {
    console.error(`Unknown network "${network}". Expected one of: ${Object.keys(CHAINS).join(", ")}`);
    process.exit(1);
  }

  const rl = createInterface({ input: stdin, output: stdout });
  const password = await rl.question("Keystore password: ");
  rl.close();

  const keystoreJson = readFileSync(keystorePath, "utf8");
  const wallet = await Wallet.fromEncryptedJson(keystoreJson, password);
  const privateKey = /** @type {`0x${string}`} */ (wallet.privateKey);

  const account = createAccount(privateKey);
  console.log(`Signing as ${account.address} — confirm this matches your deployer/upgrader address on-chain.`);
  console.log(`Target network: ${chain.name} (chain id ${chain.id}, rpc ${chain.rpcUrls.default.http[0]})`);
  console.log(`Target contract: ${contractAddress}`);
  console.log(
    `Confirm ${contractAddress} exists on ${chain.name} before continuing — an address from a different ` +
      "GenLayer network will fail with \"Contract not found\" (see docs/limitations.md).",
  );

  const client = createClient({ chain, account });

  const newCode = readFileSync(contractFilePath);
  console.log(`Read ${newCode.length} bytes from ${contractFilePath}. Sending upgrade transaction...`);

  const txHash = await client.writeContract({
    address: contractAddress,
    functionName: "upgrade",
    args: [newCode],
    value: 0n,
  });

  console.log(`Upgrade transaction submitted: ${txHash}`);
  console.log("Verify it the same way as every deployment in this project:");
  console.log(`  npx genlayer receipt ${txHash}`);
  console.log(`  npx genlayer code ${contractAddress}`);
}

main().catch((err) => {
  console.error("Upgrade failed:", err);
  process.exit(1);
});
