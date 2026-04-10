import express from "express";
import cors from "cors";
import { createServer as createViteServer } from "vite";
import path from "path";
import twilio from "twilio";
import dotenv from "dotenv";
import mongoose from "mongoose";
import backendApp from "./src/backend/index";

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
    } catch (error: any) {
      console.error("MongoDB connection error:", error.message);
      if (error.message.includes("MongooseServerSelectionError")) {
        console.error("TIP: This usually means your IP is not whitelisted in MongoDB Atlas. Go to 'Network Access' in Atlas and add '0.0.0.0/0'.");
      }
    }
  } else {
    console.warn("MONGODB_URI not found in environment variables. Running without MongoDB.");
  }

  app.use(cors());
  app.use(express.json());

  // Mount Backend API
  app.use(backendApp);

  // Twilio Client (Lazy Initialization)
  let twilioClient: twilio.Twilio | null = null;
  const getTwilio = () => {
    if (!twilioClient) {
      const sid = process.env.TWILIO_ACCOUNT_SID;
      const token = process.env.TWILIO_AUTH_TOKEN;
      if (!sid || !token) {
        console.warn("Twilio credentials missing. Notifications will be simulated. Please configure TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN in the AI Studio Secrets panel for real SMS/WhatsApp.");
        return null;
      }
      twilioClient = twilio(sid, token);
    }
    return twilioClient;
  };

  // API Route for Notifications
  app.post("/api/notify", async (req, res) => {
    const { mobile, message, type } = req.body;

    if (!mobile || !message) {
      return res.status(400).json({ error: "Mobile and message are required" });
    }

    try {
      const client = getTwilio();
      
      if (!client) {
        // Simulation Mode
        console.info(`[SIMULATED ${type.toUpperCase()}] To: ${mobile}, Message: ${message}`);
        return res.json({ 
          success: true, 
          simulated: true, 
          message: "Notification simulated. Configure Twilio secrets for real delivery." 
        });
      }

      const phone = process.env.TWILIO_PHONE_NUMBER;
      const whatsapp = process.env.TWILIO_WHATSAPP_NUMBER;

      if (type === 'whatsapp' && !whatsapp) {
        throw new Error("TWILIO_WHATSAPP_NUMBER is not configured in Secrets.");
      }
      if (type !== 'whatsapp' && !phone) {
        throw new Error("TWILIO_PHONE_NUMBER is not configured in Secrets.");
      }

      const from = type === 'whatsapp' 
        ? `whatsapp:${whatsapp}` 
        : phone;
      
      const to = type === 'whatsapp' ? `whatsapp:${mobile}` : mobile;

      const result = await client.messages.create({
        body: message,
        from,
        to,
      });

      res.json({ success: true, sid: result.sid });
    } catch (error: any) {
      console.error("Notification Error:", error);
      res.status(500).json({ error: error.message || "Failed to send notification" });
    }
  });

  // Diagnostic route for Email testing
  app.get("/api/diag/email", async (req, res) => {
    const { emailService } = await import("./src/backend/Application/Services/EmailService");
    const testEmail = req.query.to as string || process.env.SUPERADMIN_EMAIL || "test@example.com";
    
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
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
