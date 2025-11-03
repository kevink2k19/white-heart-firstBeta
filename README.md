# White Heart - Professional Taxi Booking App

A professional taxi booking application built with React Native and Expo, featuring real-time tracking, bilingual support (English/Myanmar), and comprehensive ride management.

## 🚀 Features

### 📱 Core Functionality
- **Real-time Ride Booking** with interactive map interface
- **Driver Matching & Tracking** with live location updates
- **Bilingual Support** (English & Myanmar/Burmese)
- **Phone-based Booking** alternative for traditional users
- **Trip History** with detailed ride records and ratings
- **Profile Management** with photo upload and preferences

### 🌍 Localization
- **Dynamic Language Switching** without app restart
- **Complete UI Translation** for all interface elements
- **Cultural Localization** with appropriate Myanmar context
- **Myanmar Kyat (MMK)** currency support

### 🎨 User Experience
- **Modern Material Design** with smooth animations
- **Intuitive Navigation** with tab-based interface
- **Accessibility Features** for users with disabilities
- **Responsive Design** for various screen sizes

## 📋 Build Requirements

### Prerequisites
- Node.js 18+ 
- npm or yarn
- Expo CLI (`npm install -g @expo/cli`)
- EAS CLI (`npm install -g eas-cli`)
- Android Studio (for Android builds)
- Xcode (for iOS builds, macOS only)

## 🛠️ Development Setup

### 1. Clone and Install
```bash
git clone <repository-url>
cd white-heart-passenger
npm install
```

### 2. Start Development Server
```bash
npm run dev
# or
npm run start
```

### 3. Run on Specific Platforms
```bash
npm run android    # Android emulator/device
npm run ios        # iOS simulator/device  
npm run web        # Web browser
```

## 📦 Building for Production

### Android APK Build
```bash
# Install EAS CLI if not already installed
npm install -g eas-cli

# Login to Expo account
eas login

# Configure project (first time only)
eas build:configure

# Build APK for showcase/testing
npm run build:android

# Build production APK
npm run build:android:production
```

### iOS Build
```bash
# Build iOS app (requires macOS and Xcode)
npm run build:ios

# Build production iOS app
npm run build:ios:production
```

### Build Both Platforms
```bash
npm run build:all
```

## 📁 Project Structure

```
app/
├── (tabs)/
│   ├── _layout.tsx          # Tab navigation layout
│   ├── index.tsx            # Main booking screen
│   ├── trips.tsx            # Trip history
│   ├── call.tsx             # Phone booking directory
│   └── settings.tsx         # App settings
├── profile.tsx              # User profile screen
├── _layout.tsx              # Root layout
└── +not-found.tsx           # 404 screen

contexts/
└── LanguageContext.tsx      # Language localization context

hooks/
└── useFrameworkReady.ts     # Framework initialization

assets/
└── images/                  # App icons and images

Configuration Files:
├── app.json                 # Expo configuration
├── eas.json                 # EAS Build configuration
├── app.config.js            # Dynamic app configuration
└── package.json             # Dependencies and scripts
```

## 🔧 Configuration Files

### App Configuration (`app.json`)
- **Bundle identifiers** for iOS/Android
- **Permissions** for location, camera, phone calls
- **App metadata** and descriptions
- **Plugin configurations** for Expo modules

### Build Configuration (`eas.json`)
- **Development builds** for testing
- **Preview builds** for client showcase
- **Production builds** for app store release

## 📱 App Features Overview

### 🏠 Home Screen (Book Ride)
- Interactive map with route visualization
- Destination search with autocomplete
- Real-time fare calculation in MMK
- Complete ride flow with driver matching
- Bilingual interface (English/Myanmar)

### 📞 Call Screen
- Comprehensive taxi service directory
- Organized by service type (Premium, Standard, Airport, Emergency)
- One-tap calling functionality
- Service ratings and availability hours

### 🚗 Trips Screen
- Complete ride history with details
- Driver ratings and feedback
- Fare breakdowns and receipts
- Trip status tracking

### 👤 Profile Screen
- User information management
- Profile photo upload
- Account statistics and ratings
- Settings and preferences

### ⚙️ Settings Screen
- Language switching (English/Myanmar)
- App preferences and notifications
- Privacy and security settings
- Help and support access

## 🌐 Internationalization

The app supports complete bilingual functionality:
- **English**: Standard international interface
- **Myanmar/Burmese**: Localized with cultural context
- **Real-time switching**: No app restart required
- **Persistent preferences**: Language choice saved across sessions

## 💰 Pricing Structure

- **Base fare**: 1,000 MMK
- **Per kilometer**: 500 MMK  
- **Currency**: Myanmar Kyat (MMK)
- **Calculation**: Base + (Distance × Rate)

## 🚀 Technologies Used

- **React Native** with Expo SDK 53
- **TypeScript** for type safety
- **Expo Router** for navigation
- **React Context** for state management
- **AsyncStorage** for data persistence
- **Lucide React Native** for icons
- **Expo Location** for GPS functionality
- **Expo Camera** for profile photos

## 📄 License

# Messaging Route
GET /chat/conversations (all convs w/ last message)

POST /chat/conversations/private

POST /chat/conversations/group

GET /chat/conversations/:id

GET /chat/conversations/:id/messages

POST /chat/conversations/:id/messages (TEXT / IMAGE / VOICE / ORDER)

POST /chat/messages/:id/delivered

POST /chat/messages/:id/read