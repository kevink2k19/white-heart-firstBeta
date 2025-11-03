// env.ts
import { z } from "zod";

const schema = z.object({
  PORT: z.string().default("4000"),
  DATABASE_URL: z.string().url(),
  JWT_ACCESS_SECRET: z.string(),
  JWT_REFRESH_SECRET: z.string(),
  CORS_ORIGIN: z
    .string()
    .default("*") // e.g. "http://localhost:8081,http://10.0.2.2:8081"
    .transform((s) =>
      s === "*" ? ["*"] : s.split(",").map((x) => x.trim()).filter(Boolean)
    ),
});

export const env = schema.parse(process.env);
