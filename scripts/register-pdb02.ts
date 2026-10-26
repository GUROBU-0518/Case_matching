import { disconnectDatabase, getPrismaClient } from "../src/db/client.ts";
import { registerSampleProject02 } from "../src/db/register-sample-project02.ts";

try {
  await registerSampleProject02(getPrismaClient());
} finally {
  await disconnectDatabase();
}
