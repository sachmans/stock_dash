export { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";

/**
 * Get the login page URL for standalone auth.
 * No longer uses Manus OAuth — redirects to the local login page.
 */
export function getLoginUrl(returnPath?: string): string {
  const base = "/login";
  if (returnPath) {
    return `${base}?return=${encodeURIComponent(returnPath)}`;
  }
  return base;
}
