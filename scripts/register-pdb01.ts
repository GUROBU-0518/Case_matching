import { disconnectDatabase, getPrismaClient } from "../src/db/client.ts";
import { registerSampleProject01 } from "../src/db/register-sample-project.ts";

try {
  await registerSampleProject01(getPrismaClient());
} finally {
  await disconnectDatabase();
}
