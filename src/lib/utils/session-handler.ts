import { browser } from "$app/environment";
import { goto } from "$app/navigation";
import { auth } from "$lib/stores/auth.store";

// Global flag to prevent multiple redirects
let redirectInProgress = false;

export function handleSessionExpiration() {
  if (!browser || redirectInProgress) return;
  
  console.log("Session expired, handling redirection");
  redirectInProgress = true;
  
  // Clear auth state using the available clearAuth method
  auth.clearAuth();
  
  // Get current path for redirect after login
  const currentPath = window.location.pathname + window.location.search;
  const redirectParam = currentPath !== "/login" ? `?redirect=${encodeURIComponent(currentPath)}` : "";
  
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
