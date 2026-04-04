# MilkFlow AMCU - Technical Documentation

This document provides a detailed technical overview of the MilkFlow AMCU application, including its architecture, data models, and core logic.

## 🏗 Architecture Overview

MilkFlow AMCU is built as a modern, full-stack application using a client-side React frontend with a Firebase backend. It is designed to be "offline-first" with synchronization capabilities, ensuring that milk collection can continue even in areas with intermittent internet connectivity.

### Core Modules
- **Authentication**: Firebase Auth (Google Login).
- **Database**: Firestore (NoSQL) for real-time data storage.
- **State Management**: React Context API for global state (Theme, Language, Auth).
- **Routing**: React Router for navigation.
- **Styling**: Tailwind CSS with dark mode support.
- **Mobile Wrapper**: Capacitor for cross-platform deployment.

## 📊 Data Models (Firestore Schema)

The application follows a structured NoSQL schema defined in `firebase-blueprint.json`.

### 1. Farmer (`/farmers/{farmerId}`)
Stores master records for all member farmers.
- `farmerId`: Unique identifier (e.g., 101, 102).
- `name`: Full name.
- `mobile`: 10-digit contact number.
- `village`: Farmer's location.
- `cattleType`: "Cow", "Buffalo", or "Mixed".
- `bankAccount` & `ifsc`: Payment details.
- `status`: "Active" or "Inactive".

### 2. Collection Transaction (`/collections/{txnId}`)
Records every milk pour transaction.
- `shift`: "Morning" or "Evening".
- `quantity`: Weight in kg/liters.
- `fat` & `snf`: Quality metrics.
- `rate`: Calculated price per liter.
- `amount`: Total value (`quantity * rate`).

### 3. Rate Chart (`/rateCharts/{chartId}`)
Defines the pricing logic.
- `baseRate`: Starting price.
- `fatStandard` & `snfStandard`: Reference quality levels.
- `fatStep` & `snfStep`: Price adjustment per unit of FAT/SNF.

### 4. Shift Summary (`/shiftSummaries/{summaryId}`)
Aggregated data for shift closure.
- `totalQuantity`: Sum of all milk collected in the shift.
- `totalAmount`: Total payable for the shift.
- `avgFat` & `avgSnf`: Weighted averages of quality.

## 🧪 Business Logic

### Milk Pricing Formula
The milk price is dynamically calculated based on the FAT and SNF content. The standard formula used in the app is:
`Rate = BaseRate + ((CurrentFAT - StandardFAT) * FATStep) + ((CurrentSNF - StandardSNF) * SNFStep)`

### Barcode Generation
The app uses `jsbarcode` to generate CODE128 barcodes for farmer IDs. These can be downloaded as PNG files and used for physical ID cards to speed up the collection process.

## 📱 Mobile Deployment (Capacitor)

The app is ready for Android deployment via Capacitor.
- **Configuration**: `capacitor.config.ts`
- **Android Source**: `/android` directory
- **Permissions**: Requires `camera` permission for potential QR/Barcode scanning in future updates (currently defined in `metadata.json`).

## 🌐 Localization

The app supports multiple languages via `LanguageContext.tsx`.
- **Supported Languages**: English, Hindi (extendable).
- **Implementation**: Uses a simple translation key-value mapping.

## 🛠 Development Guidelines

### Adding New Components
1. Create the component in `src/components/`.
2. Ensure it supports dark mode using `dark:` Tailwind classes.
3. Add the route in `App.tsx` if it's a new page.
4. Update the sidebar in `Layout.tsx` if necessary.

### Theme Support
Always use the following pattern for colors:
- Background: `bg-white dark:bg-stone-900`
- Text: `text-stone-900 dark:text-white`
- Borders: `border-stone-100 dark:border-stone-800`

---
*Last Updated: April 2026*
