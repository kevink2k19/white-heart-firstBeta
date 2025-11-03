// app/lib/apiBase.ts
import { Platform } from "react-native";

// If you're on a real device, set this in your .env
// EXPO_PUBLIC_API_BASE=http://192.168.x.x:4000  (your Mac's LAN IP)
const LAN = process.env.EXPO_PUBLIC_API_BASE?.replace(/\/$/, "");

export const getApiBase = () => {
  // Prefer explicit env (good for real devices on same Wi-Fi)
  if (LAN) return LAN;

  // Sensible defaults for simulators/emulators
  if (Platform.OS === "android") return "http://10.0.2.2:4000"; // Android emulator
  if (Platform.OS === "ios") return "http://localhost:4000";   // iOS simulator
  return "http://localhost:4000";
};
