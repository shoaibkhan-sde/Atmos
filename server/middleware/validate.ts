import { Request, Response, NextFunction } from "express";
import { z } from "zod";

/**
 * Helper to sanitize strings to prevent XSS / malicious input.
 * Strips out HTML tags and trims whitespace.
 * 
 * @param str - The raw input string
 * @returns The sanitized string
 */
export const sanitizeString = (str: string): string => {
  return str.replace(/<[^>]*>/g, "").trim();
};

export const profileSchema = z.object({
  body: z.object({
    country: z.string().min(1).transform(sanitizeString),
    householdSize: z.number().int().positive(),
    primaryTransport: z.string().transform(sanitizeString).default("car_petrol"),
    weeklyTransportKm: z.number().nonnegative(),
    dietType: z.string().transform(sanitizeString).default("average"),
    electricityKwh: z.number().nonnegative(),
    heatingType: z.string().transform(sanitizeString).default("none"),
    heatingQty: z.number().nonnegative(),
    recycleCompost: z.boolean().default(false),
  }),
});

export const goalsSchema = z.object({
  body: z.object({
    targetPercent: z.number().min(0).max(100),
    targetAnnualKg: z.number().nonnegative().optional().default(0),
  }),
});

export const activitySchema = z.object({
  body: z.object({
    date: z.string().optional().transform((val) => (val ? sanitizeString(val) : new Date().toISOString().split("T")[0])),
    category: z.enum(["Transport", "Energy", "Food", "Shopping", "Waste"]),
    type: z.string().min(1).transform(sanitizeString),
    value: z.number().positive("Value must be a positive number"),
    note: z.string().optional().transform((val) => (val ? sanitizeString(val) : "")),
  }),
});

export const chatSchema = z.object({
  body: z.object({
    message: z.string().min(1, "Message is required").transform(sanitizeString),
  }),
});

/**
 * Zod validation middleware factory.
 * Validates the request body, query, and params against the provided Zod schema.
 * Replaces the request properties with their parsed & sanitized versions.
 * 
 * @param schema - The Zod schema to validate against
 * @returns An Express middleware function
 */
export const validate = (schema: z.ZodSchema<any>) => {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    let parsed;
    try {
      parsed = await schema.parseAsync({
        body: req.body,
        query: req.query,
        params: req.params,
      });
    } catch (error: any) {
      console.error("Validation failed for route:", req.originalUrl, error);
      if (error instanceof z.ZodError) {
        res.status(400).json({
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message: "Input validation failed",
            details: (error as any).errors || (error as any).issues,
          },
        });
        return;
      }
      res.status(400).json({
        success: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "Input validation failed",
          details: error instanceof Error ? error.message : String(error),
        },
      });
      return;
    }

    // Replace req body/params/query with parsed & sanitized versions if present
    if (parsed.body !== undefined) {
      req.body = parsed.body;
    }
    if (parsed.query !== undefined) {
      req.query = parsed.query as typeof req.query;
    }
    if (parsed.params !== undefined) {
      req.params = parsed.params as typeof req.params;
    }
    next();
  };
};

