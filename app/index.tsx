import React, { useEffect } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getAccess, getRefresh } from './lib/auth';
import { fetchMe } from './lib/authClient';

// Check if user has valid authentication tokens and can access protected routes
const checkAuthStatus = async (): Promise<boolean> => {
  try {
    const accessToken = await getAccess();
    const refreshToken = await getRefresh();
    
    // If no tokens exist, user is not authenticated
    if (!accessToken && !refreshToken) {
      return false;
    }
    
    // Try to fetch user profile to validate tokens
    // This will automatically refresh the token if it's expired
    await fetchMe();
    return true;
    
  } catch (error) {
    console.error('Authentication validation failed:', error);
    // If token validation fails, clear invalid tokens
    try {
      const { clearTokens, clearUser } = await import('./lib/auth');
      await clearTokens();
      await clearUser();
    } catch (clearError) {
      console.error('Failed to clear tokens:', clearError);
    }
    return false;
  }
};

export default function IndexScreen() {
  const router = useRouter();

  useEffect(() => {
    const initializeApp = async () => {
      try {
        const isAuthenticated = await checkAuthStatus();
        
        if (isAuthenticated) {
          // User is authenticated, go to main app
          router.replace('/(tabs)/');
        } else {
          // User needs to authenticate, go to login
          router.replace('/auth/login');
        }
      } catch (error) {
        console.error('Authentication check failed:', error);
        // On error, redirect to login
        router.replace('/auth/login');
      }
    };

    initializeApp();
  }, [router]);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <ActivityIndicator size="large" color="#3B82F6" />
        <Text style={styles.loadingText}>Loading White Heart Driver...</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  loadingText: {
    fontSize: 18,
    color: '#6B7280',
    marginTop: 16,
    fontWeight: '500',
  },
});