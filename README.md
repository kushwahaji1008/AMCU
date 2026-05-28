# Offline-First Dairy Management System

## Project Overview
A fully-featured, offline-first application for managing dairy operations, including farmer records, milk collections, bulk sales, shift tracking, and dynamic rate calculation. 

The software is built with a local-first philosophy. Operations run entirely locally on the device (Web or Native Android via Capacitor) using `PouchDB` backed by `IndexedDB`. When a network connection is available, background synchronization reconciles data with the remote Node.js/Express backend (backed by MongoDB).

## 🛠 Tech Stack

### Frontend & Mobile Native
* **Framework:** React 19 + TypeScript + Vite
* **Styling:** Tailwind CSS + Lucide React (Icons)
* **Mobile Wrapper:** Capacitor JS (v8) for Android/iOS native deployment
* **Local Database:** PouchDB (`pouchdb-browser`, `pouchdb-find`) using modern `idb` built-in adapters.
* **Charts/UI:** Recharts, Web5/PWA integrations.

### Backend Server
* **Environment:** Node.js (Express v4)
* **Database:** MongoDB (via Mongoose)
* **Authentication:** JSON Web Tokens (JWT) + bcryptjs
* **Security/Config:** Helmet, Cors, dotenv, express-rate-limit 
* **Compilation:** Managed via `tsx` (Dev) and `esbuild` (Prod) into a single `server.cjs` executable.

---

## 🏗 Architecture & Offline Synchronization

1. **Local State (PouchDB):** 
   - Operations (Create, Update, Delete) are immediately written to local PouchDB instances.
   - PouchDB utilizes the built-in IndexedDB (`idb`) adapter natively for both Mobile (Capacitor) and Browser environments.
2. **Offline Queueing:**
   - If offline, state transitions are scheduled into a local `sync_queue` PouchDB collection.
3. **Background Sync:**
   - When connection is restored (`offlineService.ts`), the `sync_queue` pushes pending modifications to the Express backend via REST endpoints.
   - Remote changes are pulled into the local databases to ensure the device is up to date.

---

## 🗄️ Database Schemas / Collections

Both MongoDB and local PouchDB mirror these core data collections:
* **Farmers:** Registered farmers providing milk.
* **Collections:** Individual milk deposit records.
* **Shifts:** Morning/Evening collection shift summaries.
* **Sales Customers:** Buyers/businesses purchasing bulk milk.
* **Sales Records:** Transaction logs for bulk sales.
* **Rates & Rate Settings:** Dynamic SNF / FAT based pricing matrices.
* **Payments & Ledgers:** Farmer accounting, payouts, and balances.
* **Users:** App administrator and staff accounts.
* **Dairies:** Global/tenant configurations.

---

## ⚙️ Setup & Installation Instructions

### 1. Prerequisites
* **Node.js**: v18.x or v22.x recommended
* **Database**: A MongoDB instance (Local or MongoDB Atlas)
* **Mobile Build**: Android Studio (for Android app) or Xcode (for iOS)

### 2. Environment Variables
Create a `.env` file in the root directory:
```env
# Server Target & Port (required for cloud run / Docker setup)
PORT=3000

# MongoDB URI (Required)
MONGODB_URI=mongodb+srv://<username>:<password>@cluster0.../dairy_db

# Backend App Secret (For JWT Auth)
JWT_SECRET=your_super_secret_jwt_key
```

### 3. Installation
```bash
# Install all required npm packages
npm install
```

### 4. Running Locally
Start the unified DEV server (Vite + Express):
```bash
npm run dev
```
*The app will automatically run on http://localhost:3000*

---

## 📦 Building for Production

### Web / PWA Deployment
1. Build the client and server applications:
   ```bash
   npm run build
   ```
2. Start the production server:
   ```bash
   npm start
   ```

### 📱 Android Deployment (Capacitor)
To build the project into a native `.apk` or `.aab`:
1. Build the production React web bundle:
   ```bash
   npm run build
   ```
2. Sync the web assets into the Capacitor Android project:
   ```bash
   npx cap sync android
   ```
3. Open Android Studio to build the app package:
   ```bash
   npx cap open android
   ```
4. *Inside Android Studio:* Select `Build > Generate Signed Bundle / APK` to create your distribution file.

## 🔑 Customizations & Notes
* If you modify any native configurations in `android/app/src/main/AndroidManifest.xml`, make sure to run `npx cap sync` afterward.
* HMR (Hot Module Replacement) routes through Vite middleware while in `development` mode but serves purely static files in `production`.
