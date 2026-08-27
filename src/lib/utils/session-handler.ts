import { browser } from "$app/environment";
import { goto } from "$app/navigation";
import { auth } from "$lib/stores/auth.store";

// Global flag to prevent multiple redirects
let redirectInProgress = false;

/**
 * True for any route served by the login page, so we never treat one as a
 * post-login destination.
 *
 * Matching on the *pathname* alone is the whole point. The previous check
 * compared `pathname + search` against the literal "/login", which stops
 * matching the moment a query string is attached — so `/login?redirect=%2Fcases`
 * looked like an ordinary page and got wrapped in yet another `?redirect=`.
 * Each 401 then added a layer:
 *
 *   /cases
 *   → /login?redirect=%2Fcases
 *   → /login?redirect=%2Flogin%3Fredirect%3D%252Fcases
 *   → ...
 *
 * until the URL outgrew the proxy's limit and sign-in broke outright.
 */
const isLoginPath = (pathname: string) =>
  pathname === "/login" || pathname.startsWith("/login/");

export function handleSessionExpiration() {
  if (!browser || redirectInProgress) return;

  console.log("Session expired, handling redirection");
  redirectInProgress = true;

  // Clear auth state using the available clearAuth method
  auth.clearAuth();

  const { pathname, search } = window.location;

  // Already on the login page: just clear state and stop. The root layout
  // keeps the `session-expired` listener mounted here too, and the login
  // page itself calls `loadAuth()` on mount, so 401s legitimately fire
  // while sitting on /login. Redirecting in response to those is what
  // built the nested URL in the first place.
  if (isLoginPath(pathname)) {
    redirectInProgress = false;
    return;
  }

  const redirectParam = `?redirect=${encodeURIComponent(pathname + search)}`;

  // Force the redirect to happen in the next tick
  setTimeout(() => {
    console.log("Redirecting to login page now...");
    goto(`/login${redirectParam}`, { replaceState: true })
      .then(() => {
        console.log("Redirect to login page complete");
        // Reset the flag after a delay
        setTimeout(() => {
          redirectInProgress = false;
        }, 1000);
      })
      .catch(err => {
        console.error("Failed to redirect to login page:", err);
        redirectInProgress = false;
      });
  }, 0);
}
