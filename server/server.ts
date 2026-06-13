import express from "express";
import cors from "cors";
import helmet from "helmet";
import compression from "compression";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

import { env } from "./config/env.js";
import { globalRateLimiter } from "./middleware/rateLimiters.js";
import { errorHandler } from "./middleware/errorHandler.js";

// Routes imports
import healthRouter from "./routes/health.routes.js";
import profileRouter from "./routes/profile.routes.js";
import goalsRouter from "./routes/goals.routes.js";
import activitiesRouter from "./routes/activities.routes.js";
import insightsRouter from "./routes/insights.routes.js";
import chatRouter from "./routes/chat.routes.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// 1. Compression middleware (gzip)
app.use(compression());

// 2. Helmet for security headers
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        fontSrc: ["'self'", "https://fonts.gstatic.com"],
        imgSrc: ["'self'", "data:", "blob:"],
        connectSrc: ["'self'"],
      },
    },
    referrerPolicy: { policy: "strict-origin-when-cross-origin" },
    crossOriginResourcePolicy: { policy: "same-origin" },
    crossOriginEmbedderPolicy: false,
  })
);

// 3. CORS setup with production guard
const allowedOrigins = ["http://localhost:3000", "http://localhost:5000"];
app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (e.g. server-to-server)
      if (!origin) return callback(null, true);

      if (env.NODE_ENV === "production") {
        // In production, reject localhost origins
        if (origin.includes("localhost") || origin.includes("127.0.0.1")) {
          return callback(new Error("CORS: localhost origins blocked in production"));
        }
        return callback(null, true);
      }

      // In development, allow configured origins
      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      return callback(new Error("CORS: origin not allowed"));
    },
    methods: ["GET", "POST", "PUT", "DELETE"],
    credentials: true,
  })
);

// 4. Request JSON body parser with size limit
app.use(express.json({ limit: "50kb" }));

// 5. Global rate limiting for general API calls (mounted under `/api`)
app.use("/api", globalRateLimiter);

// 6. Router registrations
app.use("/api/health", healthRouter);
app.use("/api/profile", profileRouter);
app.use("/api/goals", goalsRouter);
app.use("/api/activities", activitiesRouter);
app.use("/api/insights", insightsRouter);
app.use("/api/chat", chatRouter);

// 7. Production static serving of built frontend assets
if (env.NODE_ENV === "production") {
  const distPath = path.resolve(__dirname, "../dist");
  console.log(`Serving static files in production from: ${distPath}`);
  
  if (fs.existsSync(distPath)) {
    app.use(express.static(distPath, {
      setHeaders: (res, filePath) => {
        if (path.extname(filePath) === ".html") {
          res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
          res.setHeader("Pragma", "no-cache");
          res.setHeader("Expires", "0");
        } else {
          // Static assets (JS, CSS, images, etc.) are hashed and can be cached aggressively
          res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
        }
      }
    }));
    app.get(/.*/, (req, res) => {
      res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
      res.setHeader("Pragma", "no-cache");
      res.setHeader("Expires", "0");
      res.sendFile(path.join(distPath, "index.html"));
    });
  } else {
    console.warn("Production build folder (dist) not found. Production asset serving is disabled.");
  }
} else {
  // Simple check root for development backend
  app.get("/", (req, res) => {
    res.send("Atmos Personal Carbon Ledger API is running. Direct your Vite dev server proxy here.");
  });
}

// 8. Centralized error handling envelope
app.use(errorHandler);

// 9. Startup server listener (except when running integration tests)
if (env.NODE_ENV !== "test") {
  app.listen(env.PORT, () => {
    console.log(`Atmos Express Server running in ${env.NODE_ENV} mode on port ${env.PORT}`);
  });
}

export default app;
export { app };
