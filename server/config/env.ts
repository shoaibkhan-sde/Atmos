import dotenv from "dotenv";
import { z } from "zod";

// Load dotenv
dotenv.config();

const envSchema = z.object({
  PORT: z.preprocess((val) => Number(val ?? 5000), z.number().positive()),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  GEMINI_API_KEY: z.string().optional(),
  CORS_ORIGIN: z.string().default("http://localhost:3000"),
});

const parsedEnv = envSchema.safeParse(process.env);

if (!parsedEnv.success) {
  console.error("❌ Invalid environment configuration:", parsedEnv.error.format());
  process.exit(1);
}

export const env = parsedEnv.data;
