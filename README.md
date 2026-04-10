# DugdhSetu - Dairy Management System

DugdhSetu is a comprehensive, full-stack dairy management application designed to streamline milk collection, farmer management, sales, and financial reporting for dairy cooperatives and private dairies.

## 🚀 Features

- **Farmer Management**: Register and manage farmer profiles with unique IDs.
- **Milk Collection**: Real-time recording of milk collection with FAT/SNF testing and automatic price calculation.
- **Sales Management**: Track milk sales to customers and manage customer accounts.
- **Rate Chart Management**: Dynamic rate charts based on FAT and SNF ranges.
- **Financial Ledger**: Automatic ledger entries for collections and manual payment recording.
- **Reporting & Analytics**: Dashboard statistics, daily collection reports, and individual farmer statements.
- **Multi-Tenant Architecture**: Support for multiple dairies with isolated data using a tenant-based database system.
- **Role-Based Access Control (RBAC)**: Distinct permissions for Super Admins, Admins, and Operators.
- **Notifications**: Integrated Twilio support for SMS and WhatsApp notifications (with simulation mode).
- **Case-Insensitive Login**: Robust authentication supporting various username casings.

## 🛠 Tech Stack

### Frontend
- **React 18** with **Vite**
- **TypeScript**
- **Tailwind CSS** for styling
- **Lucide React** for iconography
- **Framer Motion** for animations
- **Recharts** & **D3** for data visualization
- **Sonner** for toast notifications
- **Axios** for API communication

### Backend
- **Node.js** with **Express**
- **MongoDB** with **Mongoose**
- **JWT** for authentication
- **Bcryptjs** for password hashing
- **Twilio SDK** for notifications

## 🏗 Architecture

The project follows a modular architecture inspired by Clean Architecture principles:

### Backend Structure (`/src/backend`)
- **Core**: Contains domain entities and interfaces.
- **Application**: Business logic services and repository interfaces.
- **Infrastructure**: Implementation of repositories (MongoDB) and external services.
- **API**: Express controllers, middleware (Auth, Error), and route definitions.

### Frontend Structure (`/src`)
- **components**: Reusable UI components and layout elements.
- **services**: API client and service wrappers.
- **context**: React Context providers (Auth, Theme).
- **hooks**: Custom React hooks for shared logic.
- **pages**: Main application views.

## 🚦 Getting Started

### Prerequisites
- Node.js (v18+)
- MongoDB Atlas account or local MongoDB instance

### Environment Variables
Create a `.env` file in the root directory (refer to `.env.example`):
```env
MONGODB_URI=your_mongodb_connection_string
JWT_SECRET=your_jwt_secret
SUPERADMIN_EMAIL=admin@example.com
SUPERADMIN_PASS=AdminPassword123
TWILIO_ACCOUNT_SID=your_sid
TWILIO_AUTH_TOKEN=your_token
TWILIO_PHONE_NUMBER=your_phone
TWILIO_WHATSAPP_NUMBER=your_whatsapp
```

### Installation
1. Install dependencies:
   ```bash
   npm install
   ```
2. Start the development server (Express + Vite):
   ```bash
   npm run dev
   ```
3. Build for production:
   ```bash
   npm run build
   ```

## 🔐 Authentication

- **Super Admin**: Global access to manage all dairies and users.
- **Admin**: Manage a specific dairy, its farmers, rates, and operators.
- **Operator**: Daily milk collection and sales recording.

Usernames are case-insensitive. The system automatically normalizes usernames to lowercase during registration and login.

## 📊 Database Multi-Tenancy

The application uses a `databaseId` to isolate data between different dairies. 
- The `RequestContext` (using `AsyncLocalStorage`) manages the `databaseId` throughout the request lifecycle.
- Repositories use `dbManager.getModel(getDatabaseId())` to dynamically switch between database contexts.

## 🛡 Security
...

## 🔧 Troubleshooting Email (OTP)

If you see the error `535-5.7.8 Username and Password not accepted`, it means Google is rejecting your login.

### Solution: Use a Google App Password
1.  **Enable 2-Step Verification** in your [Google Account Security settings](https://myaccount.google.com/security).
2.  Go to [App Passwords](https://myaccount.google.com/apppasswords).
3.  Select **Mail** and **Other (DugdhaSetu)**, then click **Generate**.
4.  Copy the **16-character code** (e.g. `abcd efgh ijkl mnop`).
5.  Go to **Settings > Secrets** in AI Studio and update `EMAIL_PASS` with this code (remove spaces).
6.  Ensure `EMAIL_USER` is your full Gmail address.

### Diagnostic Tool
You can test your email configuration by visiting:
`{APP_URL}/api/diag/email?to=your-email@example.com`

## 📝 License

This project is proprietary. All rights reserved.
