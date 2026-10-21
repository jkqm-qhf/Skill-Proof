import { resolve } from "node:path";
import { createSkillProofService } from "./service.ts";
const service = createSkillProofService(
  resolve(
    process.env.SKILLPROOF_DATA_DIR ?? ".skillproof-data",
    "skillproof.sqlite",
  ),
);
const port = await service.listen(Number(process.env.SKILLPROOF_PORT ?? 8787));
console.log(`SkillProof local API: http://127.0.0.1:${port}`);
for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.once(signal, () => {
    void service.close().then(() => process.exit(0));
  });
