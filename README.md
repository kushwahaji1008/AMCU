# MilkFlow AMCU - Dairy Management System

MilkFlow AMCU (Automatic Milk Collection Unit) is a comprehensive, production-grade dairy management application designed for local dairy societies and collection centers. It streamlines the entire milk collection process, from farmer registration to automated billing and quality testing.

## 🚀 Key Features

### 1. Dashboard & Analytics
- **Real-time Overview**: Monitor total milk collection (Morning/Evening), active farmers, and daily revenue.
- **Visual Trends**: Interactive charts showing collection trends and quality metrics (FAT/SNF).
- **Recent Activity**: Quick view of the latest collections and system events.

### 2. Farmer Management
- **Digital Records**: Maintain detailed profiles for all member farmers.
- **Barcode Integration**: Generate and download unique barcodes for each farmer ID for quick scanning.
- **Mobile Validation**: Built-in validation for 10-digit mobile numbers to ensure data integrity.

### 3. Milk Collection & Quality Testing
- **Shift Management**: Support for Morning and Evening collection shifts.
- **FAT/SNF Analysis**: Input quality parameters to automatically calculate milk price based on configurable rate charts.
- **Real-time Entry**: Fast data entry interface designed for high-volume collection centers.

### 4. Billing & Payments
- **Automated Billing**: Generate periodic bills based on collection data and current rates.
- **Payment Processing**: Track pending payments and mark them as paid once processed.
- **Receipt Printing**: Generate and print professional collection receipts for farmers.

### 5. Advanced System Features
- **Light/Dark Mode**: User-selectable theme that persists across sessions.
- **Multi-language Support**: Ready for localization (English/Hindi/Regional).
- **Synchronization**: Local-first architecture with cloud sync capabilities.
- **Audit Logs**: Detailed tracking of system activities and security exceptions.
- **User Management**: Role-based access control for Operators and Administrators.

## 🛠 Tech Stack

- **Frontend**: React 19, TypeScript, Vite
- **Styling**: Tailwind CSS 4.0
- **Icons**: Lucide React
- **Charts**: Recharts
- **Animations**: Motion (formerly Framer Motion)
- **State Management**: React Context API (Theme, Language, Auth)
- **Database/Auth**: Firebase (Firestore & Firebase Auth)
- **Mobile**: Capacitor (Android/iOS support)
- **Utilities**: Date-fns, Sonner (Toasts), JsBarcode

## 📂 Project Structure

```text
src/
├── components/          # UI Components & Pages
│   ├── Dashboard.tsx    # Main analytics view
│   ├── FarmerManagement # Farmer records & Barcodes
│   ├── CollectionEntry  # Milk intake & Quality testing
│   ├── Layout.tsx       # Main app shell with Sidebar
│   └── ...              # Other functional modules
├── lib/                 # Utility functions (cn, etc.)
├── services/            # Firebase & API services
├── ThemeContext.tsx     # Light/Dark mode logic
├── LanguageContext.tsx  # Localization logic
├── App.tsx              # Main routing & Provider setup
└── main.tsx             # Application entry point
```

## ⚙️ Getting Started

### Prerequisites
- Node.js (v18 or higher)
- npm or yarn

### Installation
1. Clone the repository.
2. Install dependencies:
   ```bash
   npm install
   ```
3. Start the development server:
   ```bash
   npm run dev
   ```

### Building for Production
```bash
npm run build
```

## 📱 Mobile APK Build (Android)

The project is pre-configured with Capacitor for Android.

1. **Sync Capacitor**:
   ```bash
   npx cap sync
   ```
2. **Open in Android Studio**:
   ```bash
   npx cap open android
   ```
3. **Build APK**:
   In Android Studio, go to `Build > Build Bundle(s) / APK(s) > Build APK(s)`.

*Note: Ensure you have a valid JDK installed and JAVA_HOME configured.*

## 🔒 Firebase Configuration

The app uses Firebase for real-time data and authentication.
- Configuration is stored in `src/firebase.ts`.
- Ensure your `firebase-applet-config.json` is correctly populated with your Firebase project credentials.

## 🎨 Customization

### Theming
The app uses a custom `ThemeContext`. You can switch themes via the **Settings** page. Tailwind's `dark:` utility classes are used throughout the components to handle dark mode styling.

### Rate Charts
Milk pricing logic is centralized in the `RateChartManagement` component. You can define FAT/SNF ranges and their corresponding prices per liter.

---
Developed with ❤️ for the Dairy Industry.
