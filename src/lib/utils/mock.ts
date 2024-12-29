import { browser } from "$app/environment";

export function randomDelay() {
  if (!browser) return
  const max = 700
  const min = 100
  const ms = Math.floor(Math.random() * (max - min)) + min
  return new Promise(resolve => setTimeout(resolve, ms));
}