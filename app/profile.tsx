// app/profile.tsx
import React, { useEffect, useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput,
  ActivityIndicator, Alert, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  User, Phone, MapPin, CreditCard, Settings, Star, Edit3, Camera,
  Heart, Shield, Bell, CircleHelp as HelpCircle, ArrowLeft, Car, IdCard,
  Lock, Eye, EyeOff,List
} from 'lucide-react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';


const params = useLocalSearchParams<{ from?: string }>();
const cameFromNavInsufficient = params.from === 'nav-insufficient';

// ✅ reuse your existing auth helpers
import {
  getAccess,
  getRefresh,
  saveTokens,
  clearTokens,
  saveUser,
  getUser,
} from './lib/auth';

const API_URL =
  process.env.EXPO_PUBLIC_API_URL ??
  (Platform.OS === 'android' ? 'http://10.0.2.2:4000' : 'http://localhost:4000');

type Role = 'SUPER_ADMIN' | 'ADMIN' | 'MODERATOR' | 'USER';
type Status = 'ACTIVE' | 'NORMAL' | 'WARNING' | 'BANNED';

interface ApiUser {
  id: string;
  name: string;
  phone: string;
  role: Role;
  status: Status;
  balance: number;        // MMK
  rating: number;         // 1..10
  licenseNumber: string;
  carNumber: string;
  avatarUrl?: string | null;
}

export default function ProfileScreen() {
  const router = useRouter();

  const [user, setUser] = useState<ApiUser | null>(null);
  const [loading, setLoading] = useState(true);

  // profile editing
  const [saving, setSaving] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [name, setName] = useState('');
  const [phoneEdit, setPhoneEdit] = useState('');
  const [licenseNumber, setLicenseNumber] = useState('');
  const [carNumber, setCarNumber] = useState('');

  // password change
  const [showPwdBox, setShowPwdBox] = useState(false);
  const [savingPwd, setSavingPwd] = useState(false);
  const [oldPwd, setOldPwd] = useState('');
  const [newPwd, setNewPwd] = useState('');
  const [confirmPwd, setConfirmPwd] = useState('');
  const [showOld, setShowOld] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const starCount = useMemo(
    () => (user ? Math.max(0, Math.min(5, Math.round(user.rating / 2))) : 0),
    [user]
  );

  const menuItems = [
    { icon: Bell, title: 'Notifications', subtitle: 'Push notifications settings' },
    { icon: Shield, title: 'Safety', subtitle: 'Emergency contacts and safety' },
    { icon: HelpCircle, title: 'Help & Support', subtitle: 'Get help and contact us' },
    { icon: Settings, title: 'Settings', subtitle: 'App preferences and privacy' },
  ];
const isSuperAdmin = (user?.role ?? '').toString().toUpperCase() === 'SUPER_ADMIN';
  // ---- token/refresh helpers ------------------------------------------------
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

  const fetchMeWithAutoRefresh = async (): Promise<ApiUser> => {
    let access = await getAccess();
    let refresh = await getRefresh();

    // no tokens → user must login
    if (!access && !refresh) throw new Error('no_tokens');

    // try with current access first
    if (access) {
      const r1 = await fetch(`${API_URL}/me`, {
        headers: { Authorization: `Bearer ${access}` },
      });
      if (r1.ok) return (await r1.json()) as ApiUser;
      // if unauthorized and we have refresh, fall through to refresh
      if (r1.status !== 401 || !refresh) throw new Error(`me_failed_${r1.status}`);
    }

    // refresh once
    const newAccess = await refreshAccess(refresh!);
    const r2 = await fetch(`${API_URL}/me`, {
      headers: { Authorization: `Bearer ${newAccess}` },
    });
    if (!r2.ok) throw new Error(`me_failed_after_refresh_${r2.status}`);
    return (await r2.json()) as ApiUser;
  };

  // ---- initial load ---------------------------------------------------------
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        // optional: show cached user immediately if you saved it at login
        const cached = await getUser<ApiUser>();
        if (alive && cached) {
          setUser(cached);
          setName(cached.name ?? '');
          setPhoneEdit((cached.phone ?? '').replace(/^\+95/, ''));
          setLicenseNumber(cached.licenseNumber ?? '');
          setCarNumber(cached.carNumber ?? '');
        }

        const u = await fetchMeWithAutoRefresh();
        if (!alive) return;
        setUser(u);
        setName(u.name ?? '');
        setPhoneEdit((u.phone ?? '').replace(/^\+95/, ''));
        setLicenseNumber(u.licenseNumber ?? '');
        setCarNumber(u.carNumber ?? '');
        // keep a fresh cache
        await saveUser(u);
      } catch {
        // only redirect if we truly can’t recover
        await clearTokens();
        if (alive) router.replace('/auth/login');
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [router]);

  // ---- save profile (name/phone/license/car) --------------------------------
  const handleSaveProfile = async () => {
    if (!user) return;
    setSaving(true);
    try {
      let access = await getAccess();
      const refresh = await getRefresh();

      const normalizedPhone = phoneEdit.trim().startsWith('+')
        ? phoneEdit.trim()
        : `+95${phoneEdit.replace(/\D/g, '').replace(/^0/, '')}`;

      const body = {
        name: name.trim(),
        phone: normalizedPhone,
        licenseNumber: String(licenseNumber || '').trim(),
        carNumber: String(carNumber || '').trim(),
      };

      // simple local validation
      if (!body.name) throw new Error('name_required');
      if (!/^\+?\d{7,15}$/.test(body.phone)) throw new Error('phone_invalid');

      const doPatch = async (token: string) =>
        fetch(`${API_URL}/me`, {
          method: 'PATCH',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(body),
        });

      // try once
      let res = access ? await doPatch(access) : null;

      // if 401 and we have refresh, refresh and retry once
      if (!res || res.status === 401) {
        if (!refresh) throw new Error('unauthorized');
        const newAccess = await refreshAccess(refresh);
        access = newAccess;
        res = await doPatch(newAccess);
      }

      if (!res.ok) throw new Error('update_failed');

      const updated = (await res.json()) as ApiUser;
      setUser((prev) => (prev ? { ...prev, ...updated } : updated));
      await saveUser(updated);
      setIsEditing(false);
      Alert.alert('Success', 'Profile updated successfully!');
    } catch (e: any) {
      const msg = String(e?.message ?? '');
      if (msg === 'name_required') {
        Alert.alert('Name required', 'Please enter your name.');
      } else if (msg === 'phone_invalid') {
        Alert.alert('Invalid phone', 'Please enter a valid phone number.');
      } else {
        Alert.alert('Error', 'Could not update profile.');
      }
    } finally {
      setSaving(false);
    }
  };

  const handleCancelEdit = () => {
    if (!user) return;
    setName(user.name ?? '');
    setPhoneEdit((user.phone ?? '').replace(/^\+95/, ''));
    setLicenseNumber(user.licenseNumber ?? '');
    setCarNumber(user.carNumber ?? '');
    setIsEditing(false);
  };

  // ---- change password ------------------------------------------------------
  const handleChangePassword = async () => {
    if (savingPwd) return;

    const newTrim = newPwd.trim();
    if (!oldPwd || !newTrim) {
      Alert.alert('Password', 'Please fill both current and new passwords.');
      return;
    }
    if (newTrim.length < 8) {
      Alert.alert('Password', 'New password must be at least 8 characters.');
      return;
    }
    if (newTrim !== confirmPwd.trim()) {
      Alert.alert('Password', 'New password and confirmation do not match.');
      return;
    }

    setSavingPwd(true);
    try {
      let access = await getAccess();
      const refresh = await getRefresh();

      const doChange = async (token: string) =>
        fetch(`${API_URL}/me/password`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ oldPassword: oldPwd, newPassword: newTrim }),
        });

      let res = access ? await doChange(access) : null;

      if (!res || res.status === 401) {
        if (!refresh) throw new Error('unauthorized');
        const newAccess = await refreshAccess(refresh);
        res = await doChange(newAccess);
      }

      if (!res.ok) {
        const data = await res.json().catch(() => ({} as any));
        if (data?.error === 'INVALID_OLD_PASSWORD') {
          Alert.alert('Password', 'Current password is incorrect.');
        } else {
          Alert.alert('Password', 'Failed to change password.');
        }
        return;
      }

      setOldPwd('');
      setNewPwd('');
      setConfirmPwd('');
      setShowPwdBox(false);
      Alert.alert('Password', 'Password changed successfully.');
    } catch {
      Alert.alert('Password', 'Could not change password. Please try again.');
    } finally {
      setSavingPwd(false);
    }
  };

const handleGoBack = () => {
  if (cameFromNavInsufficient) {
    // Send them to your Tabs root (adjust this path if you have a dedicated settings route)
    router.replace('/(tabs)');
  } else {
    router.back();
  }
 };

  const renderStars = (count: number) =>
    Array.from({ length: 5 }, (_, i) => (
      <Star key={i} size={16} color={i < count ? '#F59E0B' : '#E5E7EB'} fill={i < count ? '#F59E0B' : '#E5E7EB'} />
    ));

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { alignItems: 'center', justifyContent: 'center' }]}>
        <ActivityIndicator size="large" />
      </SafeAreaView>
    );
  }

  if (!user) {
    return (
      <SafeAreaView style={[styles.container, { alignItems: 'center', justifyContent: 'center' }]}>
        <Text style={{ color: '#6B7280' }}>No profile loaded</Text>
      </SafeAreaView>
    );
  }

  const balanceMMK = `MMK ${user.balance.toLocaleString()}`;
  const ratingText = `${user.rating}/10`;

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={handleGoBack}>
            <ArrowLeft size={24} color="#1F2937" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Profile</Text>
          <TouchableOpacity style={styles.editButton} onPress={() => setIsEditing((v) => !v)} disabled={saving}>
            <Edit3 size={20} color="#3B82F6" />
          </TouchableOpacity>
        </View>

        {/* Profile Card */}
        <View style={styles.profileCard}>
          <View style={styles.profileHeader}>
            <View style={styles.avatarContainer}>
              <View style={styles.avatar}>
                <User size={40} color="#6B7280" />
              </View>
              <TouchableOpacity style={styles.cameraButton} onPress={() => Alert.alert('Avatar', 'Upload coming soon')}>
                <Camera size={16} color="white" />
              </TouchableOpacity>
            </View>

            <View style={styles.profileInfo}>
              {isEditing ? (
                <TextInput
                  style={styles.nameInput}
                  value={name}
                  onChangeText={setName}
                  placeholder="Enter your name"
                />
              ) : (
                <Text style={styles.profileName}>{user.name}</Text>
              )}

              <View style={styles.ratingContainer}>
                <View style={styles.stars}>{renderStars(starCount)}</View>
                <Text style={styles.ratingText}>{ratingText}</Text>
              </View>
            </View>
          </View>

          {/* Stats / Balance */}
          <View style={styles.statsContainer}>
            <View style={styles.statItem}>
              <Text style={styles.statNumber}>{ratingText}</Text>
              <Text style={styles.statLabel}>Rating</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={[styles.statNumber, { color: '#3B82F6' }]}>{balanceMMK}</Text>
              <Text style={styles.statLabel}>Balance</Text>
            </View>
          </View>
        </View>

        {/* Balance Quick Box */}
        <View style={styles.balanceCard}>
          <Text style={styles.balanceLabel}>Balance</Text>
          <Text style={styles.balanceValue}>{balanceMMK}</Text>
          <TouchableOpacity
            style={styles.topUpButton}
            onPress={() => router.push('/topup')}
          >
            <Text style={styles.topUpText}>Top Up</Text>
          </TouchableOpacity>
        </View>

        {/* Driver Info (now fully editable) */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Driver Information</Text>

          {/* Phone */}
          <View style={styles.contactItem}>
            <Phone size={20} color="#6B7280" />
            {isEditing ? (
              <TextInput
                style={styles.contactInput}
                value={phoneEdit}
                onChangeText={(t) => setPhoneEdit(t.replace(/[^\d+]/g, '').slice(0, 15))}
                placeholder="Enter phone number"
                keyboardType="phone-pad"
              />
            ) : (
              <Text style={styles.contactText}>{user.phone}</Text>
            )}
          </View>

          {/* License */}
          <View style={styles.contactItem}>
            <IdCard size={20} color="#6B7280" />
            {isEditing ? (
              <TextInput
                style={styles.contactInput}
                value={licenseNumber}
                onChangeText={(t) => setLicenseNumber(t.slice(0, 32))}
                placeholder="Enter license number"
              />
            ) : (
              <Text style={styles.contactText}>{user.licenseNumber}</Text>
            )}
          </View>

          {/* Car number */}
          <View style={styles.contactItem}>
            <Car size={20} color="#6B7280" />
            {isEditing ? (
              <TextInput
                style={styles.contactInput}
                value={carNumber}
                onChangeText={(t) => setCarNumber(t.slice(0, 16))}
                placeholder="Enter car number"
              />
            ) : (
              <Text style={styles.contactText}>{user.carNumber}</Text>
            )}
          </View>
        </View>

        {/* Edit Actions */}
        {isEditing && (
          <View style={styles.editActions}>
            <TouchableOpacity style={styles.cancelButton} onPress={handleCancelEdit} disabled={saving}>
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.saveButton} onPress={handleSaveProfile} disabled={saving}>
              <Text style={styles.saveButtonText}>{saving ? 'Saving…' : 'Save Changes'}</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Change Password */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Security</Text>

          {!showPwdBox ? (
            <TouchableOpacity
              style={[styles.menuItem, { justifyContent: 'flex-start' }]}
              onPress={() => setShowPwdBox(true)}
            >
              <View style={styles.menuIcon}>
                <Lock size={20} color="#6B7280" />
              </View>
              <Text style={styles.menuTitle}>Change Password</Text>
            </TouchableOpacity>
          ) : (
            <View style={styles.passwordCard}>
              {/* Old password */}
              <View style={styles.passwordRow}>
                <Text style={styles.pwLabel}>Current Password</Text>
                <View style={styles.pwField}>
                  <TextInput
                    value={oldPwd}
                    onChangeText={setOldPwd}
                    placeholder="Enter current password"
                    secureTextEntry={!showOld}
                    style={styles.pwInput}
                  />
                  <TouchableOpacity onPress={() => setShowOld((v) => !v)} style={styles.eyeBtn}>
                    {showOld ? <Eye size={18} color="#6B7280" /> : <EyeOff size={18} color="#9CA3AF" />}
                  </TouchableOpacity>
                </View>
              </View>

              {/* New password */}
              <View style={styles.passwordRow}>
                <Text style={styles.pwLabel}>New Password</Text>
                <View style={styles.pwField}>
                  <TextInput
                    value={newPwd}
                    onChangeText={setNewPwd}
                    placeholder="Enter new password"
                    secureTextEntry={!showNew}
                    style={styles.pwInput}
                  />
                  <TouchableOpacity onPress={() => setShowNew((v) => !v)} style={styles.eyeBtn}>
                    {showNew ? <Eye size={18} color="#6B7280" /> : <EyeOff size={18} color="#9CA3AF" />}
                  </TouchableOpacity>
                </View>
              </View>

              {/* Confirm */}
              <View style={styles.passwordRow}>
                <Text style={styles.pwLabel}>Confirm New Password</Text>
                <View style={styles.pwField}>
                  <TextInput
                    value={confirmPwd}
                    onChangeText={setConfirmPwd}
                    placeholder="Re-enter new password"
                    secureTextEntry={!showConfirm}
                    style={styles.pwInput}
                  />
                  <TouchableOpacity onPress={() => setShowConfirm((v) => !v)} style={styles.eyeBtn}>
                    {showConfirm ? <Eye size={18} color="#6B7280" /> : <EyeOff size={18} color="#9CA3AF" />}
                  </TouchableOpacity>
                </View>
              </View>

              <View style={{ flexDirection: 'row', gap: 8, marginTop: 6 }}>
                <TouchableOpacity
                  style={[styles.cancelButton, { flex: 1 }]}
                  onPress={() => {
                    setShowPwdBox(false);
                    setOldPwd('');
                    setNewPwd('');
                    setConfirmPwd('');
                  }}
                  disabled={savingPwd}
                >
                  <Text style={styles.cancelButtonText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.saveButton, { flex: 1 }]}
                  onPress={handleChangePassword}
                  disabled={savingPwd}
                >
                  <Text style={styles.saveButtonText}>{savingPwd ? 'Saving…' : 'Save Password'}</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </View>

        

        {/* Regular Menu */}
        {/* Regular Menu */}
{!isEditing && (
  <>
  {isSuperAdmin && (
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Admin</Text>

        <TouchableOpacity
          key="admin-topups"
          style={styles.menuItem}
          onPress={() => router.push('/admin/top-ups')}
        >
          <View style={styles.menuItemLeft}>
            <View style={styles.menuIcon}>
              <List size={20} color="#6B7280" />
            </View>
            <View style={styles.menuContent}>
              <Text style={styles.menuTitle}>Top Up List</Text>
              <Text style={styles.menuSubtitle}>View all top-up records</Text>
            </View>
          </View>
          <Text style={styles.menuArrow}>›</Text>
        </TouchableOpacity>

        <TouchableOpacity
          key="admin-payment-methods"
          style={styles.menuItem}
          onPress={() => router.push('/admin/payment-methods')}
        >
          <View style={styles.menuItemLeft}>
            <View style={styles.menuIcon}>
              <CreditCard size={20} color="#6B7280" />
            </View>
            <View style={styles.menuContent}>
              <Text style={styles.menuTitle}>Payment Method (Kpay Accounts)</Text>
              <Text style={styles.menuSubtitle}>Configure global payment methods</Text>
            </View>
          </View>
          <Text style={styles.menuArrow}>›</Text>
        </TouchableOpacity>
      </View>
    )}
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Account</Text>
      {menuItems.map((item, index) => (
        <TouchableOpacity
          key={index}
          style={styles.menuItem}
          onPress={() => Alert.alert(item.title, 'Coming soon')}
        >
          <View style={styles.menuItemLeft}>
            <View style={styles.menuIcon}>
              <item.icon size={20} color="#6B7280" />
            </View>
            <View style={styles.menuContent}>
              <Text style={styles.menuTitle}>{item.title}</Text>
              <Text style={styles.menuSubtitle}>{item.subtitle}</Text>
            </View>
          </View>
          <Text style={styles.menuArrow}>›</Text>
        </TouchableOpacity>
      ))}
    </View>

    {/* App Info */}
    <View style={styles.appInfo}>
      <View style={styles.appLogo}>
        <Heart size={24} color="#3B82F6" fill="#3B82F6" />
      </View>
      <Text style={styles.appName}>White Heart</Text>
      <Text style={styles.appVersion}>Version 1.0.0</Text>
    </View>
  </>
)}

      </ScrollView>
    </SafeAreaView>
  );
}

/* ---- styles ---- */
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB' },
  content: { flex: 1, paddingHorizontal: 20 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 16 },
  backButton: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#F3F4F6', alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 24, fontWeight: 'bold', color: '#1F2937' },
  editButton: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#EBF4FF', alignItems: 'center', justifyContent: 'center' },

  profileCard: { backgroundColor: 'white', borderRadius: 16, padding: 20, marginBottom: 20, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 8, elevation: 3 },
  profileHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 20 },
  avatarContainer: { position: 'relative', marginRight: 16 },
  avatar: { width: 80, height: 80, borderRadius: 40, backgroundColor: '#E5E7EB', alignItems: 'center', justifyContent: 'center' },
  cameraButton: { position: 'absolute', bottom: 0, right: 0, width: 28, height: 28, borderRadius: 14, backgroundColor: '#3B82F6', alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: 'white' },
  profileInfo: { flex: 1 },
  profileName: { fontSize: 24, fontWeight: 'bold', color: '#1F2937', marginBottom: 8 },
  nameInput: { fontSize: 24, fontWeight: 'bold', color: '#1F2937', marginBottom: 8, borderBottomWidth: 1, borderBottomColor: '#D1D5DB', paddingBottom: 4 },
  ratingContainer: { flexDirection: 'row', alignItems: 'center' },
  stars: { flexDirection: 'row', marginRight: 8 },
  ratingText: { fontSize: 16, fontWeight: '600', color: '#1F2937' },

  statsContainer: { flexDirection: 'row', justifyContent: 'space-around', paddingTop: 20, borderTopWidth: 1, borderTopColor: '#F3F4F6' },
  statItem: { alignItems: 'center' },
  statNumber: { fontSize: 20, fontWeight: 'bold', color: '#1F2937', marginBottom: 4 },
  statLabel: { fontSize: 14, color: '#6B7280' },
  statDivider: { width: 1, height: 40, backgroundColor: '#E5E7EB' },

  section: { marginBottom: 24 },
  sectionTitle: { fontSize: 18, fontWeight: '600', color: '#1F2937', marginBottom: 16 },

  contactItem: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'white', padding: 16, borderRadius: 12, marginBottom: 8, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 1 },
  contactText: { flex: 1, marginLeft: 12, fontSize: 16, color: '#374151' },
  contactInput: { flex: 1, marginLeft: 12, fontSize: 16, color: '#374151', borderBottomWidth: 1, borderBottomColor: '#D1D5DB', paddingBottom: 4 },

  editActions: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 24 },
  cancelButton: { flex: 1, backgroundColor: '#F3F4F6', paddingVertical: 16, borderRadius: 12, alignItems: 'center', marginRight: 8 },
  cancelButtonText: { fontSize: 16, fontWeight: '600', color: '#6B7280' },
  saveButton: { flex: 1, backgroundColor: '#3B82F6', paddingVertical: 16, borderRadius: 12, alignItems: 'center', marginLeft: 8 },
  saveButtonText: { fontSize: 16, fontWeight: '600', color: 'white' },

  // menus
  menuItem: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: 'white', padding: 16, borderRadius: 12, marginBottom: 8, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 1 },
  menuItemLeft: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  menuIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#F3F4F6', alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  menuContent: { flex: 1 },
  menuTitle: { fontSize: 16, fontWeight: '600', color: '#1F2937' },
  menuSubtitle: { fontSize: 14, color: '#6B7280' },
  menuArrow: { fontSize: 20, color: '#9CA3AF', fontWeight: '300' },

  // app info
  appInfo: { alignItems: 'center', paddingVertical: 32 },
  appLogo: { width: 60, height: 60, borderRadius: 30, backgroundColor: '#EBF4FF', alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  appName: { fontSize: 18, fontWeight: '600', color: '#1F2937' },
  appVersion: { fontSize: 14, color: '#6B7280' },

  // balance box
  balanceCard: { backgroundColor: 'white', borderRadius: 16, padding: 20, marginBottom: 20, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 6, elevation: 2, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  balanceLabel: { fontSize: 18, fontWeight: '600', color: '#1F2937' },
  balanceValue: { fontSize: 20, fontWeight: 'bold', color: '#3B82F6' },
  topUpButton: { backgroundColor: '#3B82F6', paddingVertical: 8, paddingHorizontal: 16, borderRadius: 8 },
  topUpText: { fontSize: 14, fontWeight: '600', color: 'white' },

  // password box
  passwordCard: { backgroundColor: 'white', borderRadius: 12, padding: 16, gap: 12, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 6, elevation: 1 },
  passwordRow: {},
  pwLabel: { fontSize: 14, fontWeight: '600', color: '#374151', marginBottom: 6 },
  pwField: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    height: 46,
    paddingHorizontal: 12,
  },
  pwInput: { flex: 1, fontSize: 16, color: '#111827' },
  eyeBtn: { paddingHorizontal: 6, paddingVertical: 6 },
});