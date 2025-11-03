// app/user-profile/[userId].tsx
import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ActivityIndicator, Alert, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { TouchableOpacity } from 'react-native';
import { ArrowLeft, User, Star, Car, IdCard } from 'lucide-react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { getAccess, getRefresh, saveTokens } from '../lib/auth';

const API_URL =
  process.env.EXPO_PUBLIC_API_URL ??
  (Platform.OS === 'android' ? 'http://10.0.2.2:4000' : 'http://localhost:4000');

interface ApiUser {
  id: string;
  name: string;
  rating: number;         // 1..10
  licenseNumber: string;
  carNumber: string;
}

export default function UserProfileScreen() {
  const router = useRouter();
  const { userId } = useLocalSearchParams<{ userId: string }>();

  const [user, setUser] = useState<ApiUser | null>(null);
  const [loading, setLoading] = useState(true);

  // Helper to refresh access token
  const refreshAccess = async (refreshToken: string) => {
    const r = await fetch(`${API_URL}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh: refreshToken }),
    });
    if (!r.ok) throw new Error('refresh_failed');
    const data = await r.json();
    if (!data?.access) throw new Error('no_access_token_returned');
    // persist new access while keeping the same refresh
    await saveTokens(data.access, refreshToken);
    return data.access as string;
  };

  // Fetch user profile with auto-refresh
  const fetchUserProfile = async (targetUserId: string): Promise<ApiUser> => {
    let access = await getAccess();
    let refresh = await getRefresh();

    // no tokens → user must login
    if (!access && !refresh) throw new Error('no_tokens');

    // try with current access first
    if (access) {
      const r1 = await fetch(`${API_URL}/me/user/${targetUserId}`, {
        headers: { Authorization: `Bearer ${access}` },
      });
      if (r1.ok) return (await r1.json()) as ApiUser;
      // if unauthorized and we have refresh, fall through to refresh
      if (r1.status !== 401 || !refresh) throw new Error(`profile_failed_${r1.status}`);
    }

    // refresh once
    const newAccess = await refreshAccess(refresh!);
    const r2 = await fetch(`${API_URL}/me/user/${targetUserId}`, {
      headers: { Authorization: `Bearer ${newAccess}` },
    });
    if (!r2.ok) throw new Error(`profile_failed_after_refresh_${r2.status}`);
    return (await r2.json()) as ApiUser;
  };

  // Load user profile
  useEffect(() => {
    let alive = true;
    (async () => {
      if (!userId) {
        if (alive) {
          Alert.alert('Error', 'No user ID provided');
          router.back();
        }
        return;
      }

      try {
        const userProfile = await fetchUserProfile(userId);
        if (!alive) return;
        setUser(userProfile);
      } catch (error: any) {
        console.error('Failed to load user profile:', error);
        if (alive) {
          Alert.alert('Error', 'Failed to load user profile');
          router.back();
        }
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [userId, router]);

  // Calculate star count from rating (1-10 scale to 1-5 stars)
  const starCount = user ? Math.max(0, Math.min(5, Math.round(user.rating / 2))) : 0;

  const renderStars = (count: number) =>
    Array.from({ length: 5 }, (_, i) => (
      <Star 
        key={i} 
        size={20} 
        color={i < count ? '#F59E0B' : '#E5E7EB'} 
        fill={i < count ? '#F59E0B' : '#E5E7EB'} 
      />
    ));

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { alignItems: 'center', justifyContent: 'center' }]}>
        <ActivityIndicator size="large" color="#3B82F6" />
        <Text style={styles.loadingText}>Loading profile...</Text>
      </SafeAreaView>
    );
  }

  if (!user) {
    return (
      <SafeAreaView style={[styles.container, { alignItems: 'center', justifyContent: 'center' }]}>
        <Text style={styles.errorText}>User not found</Text>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Text style={styles.backButtonText}>Go Back</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  const ratingText = `${user.rating}/10`;

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.headerBackButton} onPress={() => router.back()}>
          <ArrowLeft size={24} color="#1F2937" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Driver Profile</Text>
        <View style={styles.headerSpacer} />
      </View>

      {/* Profile Content */}
      <View style={styles.content}>
        {/* Profile Card */}
        <View style={styles.profileCard}>
          <View style={styles.profileHeader}>
            <View style={styles.avatarContainer}>
              <View style={styles.avatar}>
                <User size={48} color="#6B7280" />
              </View>
            </View>

            <View style={styles.profileInfo}>
              <Text style={styles.profileName}>{user.name}</Text>
              
              <View style={styles.ratingContainer}>
                <View style={styles.stars}>{renderStars(starCount)}</View>
                <Text style={styles.ratingText}>{ratingText}</Text>
              </View>
            </View>
          </View>
        </View>

        {/* Driver Information */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Driver Information</Text>

          {/* License Number */}
          <View style={styles.infoItem}>
            <View style={styles.infoIcon}>
              <IdCard size={24} color="#6B7280" />
            </View>
            <View style={styles.infoContent}>
              <Text style={styles.infoLabel}>License Number</Text>
              <Text style={styles.infoValue}>{user.licenseNumber || 'Not provided'}</Text>
            </View>
          </View>

          {/* Car Number */}
          <View style={styles.infoItem}>
            <View style={styles.infoIcon}>
              <Car size={24} color="#6B7280" />
            </View>
            <View style={styles.infoContent}>
              <Text style={styles.infoLabel}>Car Number</Text>
              <Text style={styles.infoValue}>{user.carNumber || 'Not provided'}</Text>
            </View>
          </View>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { 
    flex: 1, 
    backgroundColor: '#F9FAFB' 
  },
  
  // Header styles
  header: { 
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    alignItems: 'center', 
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: 'white',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB'
  },
  headerBackButton: { 
    width: 44, 
    height: 44, 
    borderRadius: 22, 
    backgroundColor: '#F3F4F6', 
    alignItems: 'center', 
    justifyContent: 'center' 
  },
  headerTitle: { 
    fontSize: 20, 
    fontWeight: 'bold', 
    color: '#1F2937' 
  },
  headerSpacer: { 
    width: 44 
  },

  // Content styles
  content: { 
    flex: 1, 
    paddingHorizontal: 20,
    paddingTop: 20
  },

  // Profile card styles
  profileCard: { 
    backgroundColor: 'white', 
    borderRadius: 16, 
    padding: 24, 
    marginBottom: 24, 
    shadowColor: '#000', 
    shadowOffset: { width: 0, height: 2 }, 
    shadowOpacity: 0.1, 
    shadowRadius: 8, 
    elevation: 3 
  },
  profileHeader: { 
    flexDirection: 'row', 
    alignItems: 'center' 
  },
  avatarContainer: { 
    marginRight: 20 
  },
  avatar: { 
    width: 80, 
    height: 80, 
    borderRadius: 40, 
    backgroundColor: '#E5E7EB', 
    alignItems: 'center', 
    justifyContent: 'center' 
  },
  profileInfo: { 
    flex: 1 
  },
  profileName: { 
    fontSize: 24, 
    fontWeight: 'bold', 
    color: '#1F2937', 
    marginBottom: 8 
  },
  ratingContainer: { 
    flexDirection: 'row', 
    alignItems: 'center' 
  },
  stars: { 
    flexDirection: 'row', 
    marginRight: 8 
  },
  ratingText: { 
    fontSize: 16, 
    fontWeight: '600', 
    color: '#1F2937' 
  },

  // Section styles
  section: { 
    marginBottom: 24 
  },
  sectionTitle: { 
    fontSize: 18, 
    fontWeight: '600', 
    color: '#1F2937', 
    marginBottom: 16 
  },

  // Info item styles
  infoItem: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    backgroundColor: 'white', 
    padding: 16, 
    borderRadius: 12, 
    marginBottom: 12, 
    shadowColor: '#000', 
    shadowOffset: { width: 0, height: 1 }, 
    shadowOpacity: 0.05, 
    shadowRadius: 4, 
    elevation: 1 
  },
  infoIcon: { 
    width: 48, 
    height: 48, 
    borderRadius: 24, 
    backgroundColor: '#F3F4F6', 
    alignItems: 'center', 
    justifyContent: 'center', 
    marginRight: 16 
  },
  infoContent: { 
    flex: 1 
  },
  infoLabel: { 
    fontSize: 14, 
    fontWeight: '500', 
    color: '#6B7280', 
    marginBottom: 4 
  },
  infoValue: { 
    fontSize: 16, 
    fontWeight: '600', 
    color: '#1F2937' 
  },

  // Loading and error styles
  loadingText: { 
    fontSize: 16, 
    color: '#6B7280', 
    marginTop: 12 
  },
  errorText: { 
    fontSize: 18, 
    color: '#EF4444', 
    fontWeight: '600' 
  },
  backButton: { 
    marginTop: 20, 
    backgroundColor: '#3B82F6', 
    paddingHorizontal: 24, 
    paddingVertical: 12, 
    borderRadius: 8 
  },
  backButtonText: { 
    fontSize: 16, 
    fontWeight: '600', 
    color: 'white' 
  },
});