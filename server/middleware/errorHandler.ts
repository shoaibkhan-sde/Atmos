import { Request, Response, NextFunction } from "express";
import { env } from "../config/env.js";

/**
 * Application error with optional HTTP status code and error code.
 * Used to throw structured errors from route handlers and middleware.
 */
export interface AppError extends Error {
  /** HTTP status code (defaults to 500). */
  status?: number;
  /** Machine-readable error code (e.g. "VALIDATION_ERROR", "NOT_FOUND"). */
  code?: string;
}

/**
 * Global Express error-handling middleware.
 *
 * Logs full error details server-side and returns a sanitized JSON envelope
 * to the client. In production, internal error messages and stack traces are
 * suppressed to prevent information leakage.
 *
 * Response shape: `{ success: false, error: { code: string, message: string } }`
 */
export const errorHandler = (
  err: AppError,
  req: Request,
  res: Response,
  _next: NextFunction
): void => {
  const timestamp = new Date().toISOString();
  const route = req.originalUrl;
  const method = req.method;

  // Log full error details server-side (always)
  console.error(`[${timestamp}] ❌ Error during ${method} ${route}:`, err.stack || err);

  const status = err.status || 500;
  const errorCode = err.code || "INTERNAL_ERROR";

  // In production, suppress internal error messages to prevent information leakage
  const isProduction = env.NODE_ENV === "production";
  const errorMessage =
    isProduction && status >= 500
      ? "An internal server error occurred. Details have been logged."
      : err.message || "An internal server error occurred.";

  res.status(status).json({
    success: false,
    error: {
      code: errorCode,
      message: errorMessage,
    },
  });
};
