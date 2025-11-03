// app/lib/apiUrl.ts
import { Platform, NativeModules } from "react-native";

const isAndroid = Platform.OS === "android";
export const API_URL =
  process.env.EXPO_PUBLIC_API_URL ||
  (isAndroid ? "http://10.0.2.2:4000" : "http://localhost:4000");
