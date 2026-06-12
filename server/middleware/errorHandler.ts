import { Request, Response, NextFunction } from "express";

export const errorHandler = (
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  err: any,
  req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction
) => {
  const timestamp = new Date().toISOString();
  const route = req.originalUrl;
  const method = req.method;

  // Log full error details server-side
  console.error(`[${timestamp}] ❌ Error during ${method} ${route}:`, err.stack || err);

  const status = err.status || 500;
  const errorCode = err.code || "INTERNAL_ERROR";
  const errorMessage = err.message || "A secure server error occurred. Internal stack details are suppressed.";

  res.status(status).json({
    success: false,
    error: {
      code: errorCode,
      message: errorMessage,
    },
  });
};
