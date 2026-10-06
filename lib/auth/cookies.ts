/**
 * Session cookie naming (D-018). Over HTTPS the cookie is `__Host-` prefixed,
 * which the browser only accepts with Secure, Path=/ and no Domain, so it
 * can't be set or overwritten by a subdomain. Over plain http (local dev, E2E)
 * the prefix is impossible, so a plain name is used.
 *
 * Kept free of server-only imports: proxy.ts uses it for the coarse redirect.
 */
export function sessionCookieConfig(appUrl: string) {
  const secure = new URL(appUrl).protocol === "https:";
  const prefix = secure ? "__Host-exovault" : "exovault";
  return {
    secure,
    prefix,
    sessionTokenName: `${prefix}.session_token`,
  };
}
