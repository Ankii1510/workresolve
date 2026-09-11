import { describe, expect, it } from "vitest";
import { classifyReceiptShape } from "../../../scripts/deploy-contract.mjs";

/**
 * The safety net for the 2026-09-09 incident (docs/limitations.md): a deploy
 * that silently landed on Asimov while everyone believed it was Studio, whose
 * address was then configured as the app's Studio address — after which every
 * write got "Contract not found" from Studio, and reads kept working because
 * the CLI reading them was on Asimov too.
 *
 * The tell was in the deploy receipt from the very first minute: genlayer-js
 * returns a *simulator-shaped* transaction for Studio/localnet chains and a
 * *consensus-contract-shaped* one for real chains. These tests pin that
 * distinction against the real shapes observed during the investigation, so
 * scripts/deploy-contract.mjs can refuse to hand over an address that came
 * from a network other than the one that was asked for.
 */
describe("classifyReceiptShape", () => {
  it('reports "real-chain" for the actual Asimov receipt that was mistaken for Studio', () => {
    // Field names lifted verbatim from the receipt of deploy tx
    // 0x66a429a8…dfb03c, which produced 0x941F3904…fCB64. Believed at the time
    // to be a Studio deployment; it was Asimov.
    const asimovReceipt = {
      currentTimestamp: "1788910723",
      sender: "0xaE21b9e271FBfBF67aC5ec42C7Bbecca5CcC16A2",
      recipient: "0x941F3904D19b39113d82AA3dC8942966b33fCB64",
      initialRotations: 3n,
      txCalldata: "0xf9b3d5b9b3d023207b2022446570656e6473…",
      readStateBlockRange: {
        activationBlock: "21151360",
        processingBlock: "21151363",
        proposalBlock: "21151367",
      },
      lastRound: { round: "0", votesCommitted: "5", validatorVotesName: ["AGREE"] },
      consumedValidators: ["0xeBe8e4d2C847405A8793867213078F614F3E6A6A"],
      status_name: "FINALIZED",
      txExecutionResultName: "FINISHED_WITH_RETURN",
    };
    expect(classifyReceiptShape(asimovReceipt)).toBe("real-chain");
  });

  it('reports "studio" for a simulator-shaped receipt', () => {
    // genlayer-js routes Studio/localnet transactions through
    // decodeLocalnetTransaction, which works on `consensus_data.leader_receipt`
    // and snake_case `data.calldata` — see node_modules/genlayer-js.
    const studioReceipt = {
      hash: "0xabc",
      status: "ACCEPTED",
      consensus_data: {
        leader_receipt: [{ result: "…", calldata: { base64: "…" }, eq_outputs: {} }],
      },
      data: { contract_address: "0x1111111111111111111111111111111111111111" },
    };
    expect(classifyReceiptShape(studioReceipt)).toBe("studio");
  });

  it('reports "unknown" rather than guessing when the shape is unrecognized', () => {
    // A genlayer-js shape change must degrade to "verify it yourself", never
    // to a confident wrong answer that blocks or green-lights a deploy.
    expect(classifyReceiptShape({ some: "future shape" })).toBe("unknown");
    expect(classifyReceiptShape(null)).toBe("unknown");
    expect(classifyReceiptShape(undefined)).toBe("unknown");
    expect(classifyReceiptShape("not an object")).toBe("unknown");
  });

  it("survives the bigint fields genlayer-js puts in real-chain receipts", () => {
    // JSON.stringify throws on bigint without a replacer; the classifier runs
    // right after a deploy, so throwing here would lose the address entirely.
    expect(() => classifyReceiptShape({ initialRotations: 3n, txCalldata: "0x" })).not.toThrow();
    expect(classifyReceiptShape({ initialRotations: 3n, txCalldata: "0x" })).toBe("real-chain");
  });
});
