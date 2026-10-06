import "server-only";
import type { AppSession } from "./session";
import type { Actor } from "@/server/services/identity/identity-service";

export function actorFrom(session: AppSession): Actor {
  return {
    userId: session.user.id,
    accountEmail: session.user.email,
    accountEmailVerified: session.user.emailVerified,
  };
}
