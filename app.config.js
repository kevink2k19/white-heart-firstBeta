// app.config.js
import 'dotenv/config';
export default {
  expo: {
    name: process.env.NODE_ENV === 'production' ? 'White Heart' : 'White Heart (Dev)',
    slug: 'white-heart-taxi',
    scheme: 'whiteheart',
    version: '1.0.0',

    orientation: 'portrait',
    icon: './assets/images/icon.png',
    userInterfaceStyle: 'automatic',
    splash: { image: './assets/images/splash.png', resizeMode: 'contain', backgroundColor: '#3B82F6' },
    assetBundlePatterns: ['**/*'],

    ios: {
      supportsTablet: true,
      bundleIdentifier: 'com.whiteheart.driver',
      buildNumber: '1',
      infoPlist: {
        NSLocationWhenInUseUsageDescription: 'We use your location for navigation.',
        NSMicrophoneUsageDescription: 'We use your microphone for voice messages and walkie-talkie functionality.',
        // Background audio for voice transmission playback
        UIBackgroundModes: ['audio'],
        // Uncomment if you need background tracking on iOS:
        // NSLocationAlwaysAndWhenInUseUsageDescription: 'We use your location to track trips even in the background.',
        // UIBackgroundModes: ['location', 'audio'],
      },
      // Only needed if you render Google maps on iOS (not required for Apple Maps):
      config: { googleMapsApiKey: 'AIzaSyBtinZ-NpA8cvnCJQKZ7NJwKl6QkV4o_Qg' }
    },

    android: {
      package: 'com.whiteheart.driver',
      versionCode: 1, // bump on every production build
      adaptiveIcon: { foregroundImage: './assets/images/adaptive-icon.png', backgroundColor: '#ffffff' },
      permissions: [
        'ACCESS_COARSE_LOCATION',
        'ACCESS_FINE_LOCATION',
        // Uncomment if you need background trip tracking on Android:
        // 'ACCESS_BACKGROUND_LOCATION',
        // 'FOREGROUND_SERVICE',
        'CAMERA',
        'RECORD_AUDIO',
        'CALL_PHONE',
        'INTERNET',
        'ACCESS_NETWORK_STATE',
        // Background audio for voice transmission
        'WAKE_LOCK',
        'FOREGROUND_SERVICE'
      ],
      // Native Maps SDK key (DO NOT hard-code; supply via EAS secret)
      config: {
        googleMaps: { apiKey: 'AIzaSyBtinZ-NpA8cvnCJQKZ7NJwKl6QkV4o_Qg'}
      }
    },

    web: { favicon: './assets/images/favicon.png' },

    plugins: [
      'expo-router',
      'expo-font',
      'expo-web-browser',
      'expo-location',
      "expo-secure-store",
      ['expo-camera', { cameraPermission: 'Allow White Heart to access your camera to take profile photos.' }],
      
    ],

    experiments: { typedRoutes: true },

    extra: {
      eas: { projectId: 'edbf3288-0fb6-4da9-9353-3bf9b13bd351' },
      // Optional: expose your Directions REST key here if you prefer reading from Constants.expoConfig.extra
      // EXPO_PUBLIC_GOOGLE_MAPS_KEY is also available directly via process.env at runtime.
      EXPO_PUBLIC_GOOGLE_MAPS_KEY: process.env.EXPO_PUBLIC_GOOGLE_MAPS_KEY
    }
  }
};
