import { createClient, createAccount } from "genlayer-js";
import { studionet } from "genlayer-js/chains";
import { randomBytes } from "crypto";

const pk = "0x" + randomBytes(32).toString("hex");
const account = createAccount(pk);
console.log("Throwaway test account:", account.address);

const client = createClient({ chain: studionet, account });

const contractAddress = "0x941F3904D19b39113d82AA3dC8942966b33fCB64";

try {
  console.log("Reading get_milestone_count (sanity check)...");
  const count = await client.readContract({
    address: contractAddress,
    functionName: "get_milestone_count",
    args: [],
  });
  console.log("get_milestone_count ->", count);
} catch (e) {
  console.error("READ FAILED:", e.message || e);
}

try {
  console.log("Attempting create_milestone write with a throwaway (unfunded) account...");
  const txHash = await client.writeContract({
    address: contractAddress,
    functionName: "create_milestone",
    args: [
      "0x4D3D7023479bF78a3181aeFAec977b71202619FF",
      "prep dex",
      "prep dex live",
      ["ready to live website"],
      [100],
      10,
      Math.floor(Date.now() / 1000) + 86400,
      70,
    ],
  });
  console.log("SUCCESS, tx hash:", txHash);
} catch (e) {
  console.error("WRITE FAILED:");
  console.error("message:", e.message);
  console.error("shortMessage:", e.shortMessage);
  console.error("details:", e.details);
  console.error("cause:", e.cause);
  console.error(JSON.stringify(e, (k,v) => typeof v === "bigint" ? v.toString() : v, 2).slice(0, 3000));
}
