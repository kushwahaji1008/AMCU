import express from "express";
import cors from "cors";
import { createServer as createViteServer } from "vite";
import path from "path";
import dotenv from "dotenv";
import mongoose from "mongoose";
import backendApp, { seedDatabase } from "./src/backend/index";

dotenv.config();

async function startServer() {
  const app = express();
  const PORT = 3000;

  // MongoDB Connection
  const MONGODB_URI = process.env.MONGODB_URI;
  if (MONGODB_URI) {
    try {
      await mongoose.connect(MONGODB_URI, {
        serverSelectionTimeoutMS: 5000, // Timeout after 5 seconds
      });
      console.log("Connected to MongoDB successfully.");
      
      // Seed database after connection
      await seedDatabase();
    } catch (error: any) {
      console.error("MongoDB connection error:", error.message);
      if (error.message.includes("MongooseServerSelectionError")) {
        console.error("TIP: This usually means your IP is not whitelisted in MongoDB Atlas. Go to 'Network Access' in Atlas and add '0.0.0.0/0'.");
      }
    }
  } else {
    console.warn("MONGODB_URI not found in environment variables. Running without MongoDB.");
  }

  if (!process.env.JWT_SECRET) {
    console.warn("JWT_SECRET not found in environment variables. Using default insecure secret key.");
  }

  app.use(cors({
    origin: process.env.ALLOWED_ORIGINS?.split(',') || '*',
    credentials: true
  }));
  app.use(express.json());

  // Mount Backend API
  app.use(backendApp);

  // API Route for Notifications (Simulation Only)
  app.post("/api/notify", async (req, res) => {
    const { mobile, message, type } = req.body;

    if (!mobile || !message) {
      return res.status(400).json({ error: "Mobile and message are required" });
    }

    // Simulation Mode - Real delivery removed as per request
    console.info(`[SIMULATED ${type?.toUpperCase() || 'SMS'}] To: ${mobile}, Message: ${message}`);
    return res.json({ 
      success: true, 
      simulated: true, 
      message: "Notification simulated. Real delivery is disabled." 
    });
  });

  // Diagnostic route for Email testing
  app.get("/api/diag/email", async (req, res) => {
    const { emailService } = await import("./src/backend/Application/Services/EmailService");
    const testEmail = req.query.to as string;
    if (!testEmail) {
      return res.status(400).json({ error: "Email address is required for testing" });
    }
    
    console.log(`[DIAG] Running email test to: ${testEmail}`);
    try {
      await emailService.sendOTP(testEmail, "123456");
      res.json({ 
        success: true, 
        message: `Test email sent to ${testEmail}. Check your inbox (and spam folder).`,
        config: {
          host: process.env.EMAIL_HOST || process.env.SMTP_HOST || "default (gmail)",
          user: process.env.EMAIL_USER || process.env.SMTP_USER || "not set",
          port: process.env.EMAIL_PORT || process.env.SMTP_PORT || "587"
        }
      });
    } catch (error: any) {
      console.error("[DIAG] Email test failed:", error);
      res.status(500).json({ 
        success: false, 
        error: error.message,
        tip: error.message.includes("535-5.7.8") 
          ? "This is a Gmail authentication error. You MUST use an 'App Password' from Google, not your regular password." 
          : "Check your SMTP host, port, and credentials in the Secrets panel."
      });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    console.log("Starting Vite in development mode...");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
    console.log("Vite middleware mounted.");
  } else {
    console.log("Starting in production mode...");
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
    console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  });
}

startServer();
