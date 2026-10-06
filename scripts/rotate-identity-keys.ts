/**
 * Re-encrypt identities under the active key after adding a new key to
 * IDENTIFIER_ENCRYPTION_KEYS and switching IDENTIFIER_ENCRYPTION_ACTIVE_KEY_ID.
 * Usage: npm run keys:rotate
 */
import { disconnectFromDatabase } from "@/lib/db/mongoose";
import { rotateIdentityKeys } from "@/server/services/identity/key-rotation";

rotateIdentityKeys()
  .then((report) => {
    console.log(JSON.stringify(report));
    process.exitCode = report.failed > 0 ? 1 : 0;
  })
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => disconnectFromDatabase());
