// app/lib/auth.ts
import * as SecureStore from "expo-secure-store";

const ACCESS_KEY = "wh_access";
const REFRESH_KEY = "wh_refresh";
const USER_KEY   = "wh_user"; // optional (cached user profile)

export async function saveTokens(access: string, refresh: string) {
  await SecureStore.setItemAsync(ACCESS_KEY, access);
  await SecureStore.setItemAsync(REFRESH_KEY, refresh);
}
export async function getAccess() {
  return SecureStore.getItemAsync(ACCESS_KEY);
}
export async function getRefresh() {
  return SecureStore.getItemAsync(REFRESH_KEY);
}
export async function clearTokens() {
  await SecureStore.deleteItemAsync(ACCESS_KEY);
  await SecureStore.deleteItemAsync(REFRESH_KEY);
}

export async function saveUser(user: unknown) {
  await SecureStore.setItemAsync(USER_KEY, JSON.stringify(user));
}
export async function getUser<T = any>() {
  const s = await SecureStore.getItemAsync(USER_KEY);
  return s ? (JSON.parse(s) as T) : null;
}
export async function clearUser() {
  await SecureStore.deleteItemAsync(USER_KEY);
}
