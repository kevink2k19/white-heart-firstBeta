// app/auth/register.tsx
import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Phone, ArrowRight, User, Car, IdCard, Lock } from 'lucide-react-native';
// fetch(`${API_URL}/auth/register`), etc.


const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:4000';

export default function RegisterScreen() {
  const router = useRouter();

  const [fullName, setFullName] = useState('');
  const [licenseNumber, setLicenseNumber] = useState('');
  const [carNumber, setCarNumber] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const [showPwd, setShowPwd] = useState(false);
  const [showPwd2, setShowPwd2] = useState(false);
  const [loading, setLoading] = useState(false);

  // Simple MM phone validation (you can relax/tighten as needed)
const isValidPhone = (v: string) => /^\d{7,15}$/.test(v.replace(/\D/g, ""));
const normalizePhone = (raw: string) => {
  // already includes country code
  const trimmed = raw.trim();
  if (trimmed.startsWith("+")) return trimmed;

  // remove non-digits, drop a single leading 0 (e.g. 09xxxx -> 9xxxx)
  const digits = trimmed.replace(/\D/g, "").replace(/^0/, "");
  return `+95${digits}`;
};

  const onRegister = async () => {
    if (!fullName.trim()) return Alert.alert('Error', 'Full name is required.');
    if (!licenseNumber.trim()) return Alert.alert('Error', 'License number is required.');
    if (!carNumber.trim()) return Alert.alert('Error', 'Car number is required.');
    if (!phoneNumber) return Alert.alert('Error', 'Phone number is required.');
    if (!isValidPhone(phoneNumber)) return Alert.alert('Error', 'Enter a valid phone number (digits only).');
    if (!password || password.length < 8)
      return Alert.alert('Error', 'Password must be at least 8 characters.');
    if (password !== confirmPassword)
      return Alert.alert('Error', 'Passwords do not match.');

    const payload = {
      phone: normalizePhone(phoneNumber),
      password,
      name: fullName.trim(),
      licenseNumber: licenseNumber.trim(),
      carNumber: carNumber.trim(),
    };
    try {
  const ping = await fetch(`${API_URL}/health`);
  if (!ping.ok) throw new Error("health not ok");
} catch (err) {
  Alert.alert("Network", `Cannot reach ${API_URL}. Fix base URL / firewall / server.`);
  return;
}

    try {
      setLoading(true);
      const res = await fetch(`${API_URL}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg = data?.error || 'Registration failed';
        return Alert.alert('Error', msg);
      }

      Alert.alert('Success', 'Account created!', [
        { text: 'Continue', onPress: () => router.replace('/auth/login') },
      ]);
    } catch (e) {
      Alert.alert('Error', 'Could not connect to server.');
    } finally {
      setLoading(false);
    }
  };

  const goLogin = () => router.push('/auth/login');

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.keyboardAvoid}>
        <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.title}>Create Driver Account</Text>
            <Text style={styles.subtitle}>Join White Heart Driver today</Text>
          </View>

          {/* Form */}
          <View style={styles.form}>
            {/* Full Name */}
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Full Name</Text>
              <View style={styles.inputContainer}>
                <User size={20} color="#6B7280" style={styles.inputIcon} />
                <TextInput
                  style={styles.textInput}
                  placeholder="Enter your full name"
                  value={fullName}
                  onChangeText={setFullName}
                  autoComplete="name"
                />
              </View>
            </View>

            {/* License Number */}
            <View style={styles.inputGroup}>
              <Text style={styles.label}>License Number</Text>
              <View style={styles.inputContainer}>
                <IdCard size={20} color="#6B7280" style={styles.inputIcon} />
                <TextInput
                  style={styles.textInput}
                  placeholder="e.g., ABC-123456"
                  value={licenseNumber}
                  onChangeText={setLicenseNumber}
                  autoCapitalize="characters"
                />
              </View>
            </View>

            {/* Car Number */}
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Car Number</Text>
              <View style={styles.inputContainer}>
                <Car size={20} color="#6B7280" style={styles.inputIcon} />
                <TextInput
                  style={styles.textInput}
                  placeholder="e.g., YGN-9X9999"
                  value={carNumber}
                  onChangeText={setCarNumber}
                  autoCapitalize="characters"
                />
              </View>
            </View>

            {/* Phone */}
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Phone Number</Text>
              <View style={styles.phoneInputContainer}>
                <View style={styles.countryCode}>
                  <Phone size={20} color="#6B7280" />
                  <Text style={styles.countryCodeText}>+95</Text>
                </View>
                <TextInput
                  style={styles.phoneInput}
                  placeholder="9 123 456 789"
                  value={phoneNumber}
                  onChangeText={(t) => setPhoneNumber(t.replace(/\D/g, '').slice(0, 15))}
                  keyboardType="phone-pad"
                  autoComplete="tel"
                />
              </View>
            </View>

            {/* Password */}
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Password</Text>
              <View style={styles.inputContainer}>
                <Lock size={20} color="#6B7280" style={styles.inputIcon} />
                <TextInput
                  style={styles.textInput}
                  placeholder="At least 8 characters"
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry={!showPwd}
                  autoComplete="new-password"
                />
                <TouchableOpacity style={styles.revealBtn} onPress={() => setShowPwd(s => !s)}>
                  <Text style={styles.revealText}>{showPwd ? 'HIDE' : 'SHOW'}</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Confirm Password */}
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Confirm Password</Text>
              <View style={styles.inputContainer}>
                <Lock size={20} color="#6B7280" style={styles.inputIcon} />
                <TextInput
                  style={styles.textInput}
                  placeholder="Re-enter password"
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  secureTextEntry={!showPwd2}
                  autoComplete="new-password"
                />
                <TouchableOpacity style={styles.revealBtn} onPress={() => setShowPwd2(s => !s)}>
                  <Text style={styles.revealText}>{showPwd2 ? 'HIDE' : 'SHOW'}</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Register */}
            <TouchableOpacity
              style={[styles.registerButton, loading && styles.registerButtonDisabled]}
              onPress={onRegister}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator size="small" color="white" />
              ) : (
                <>
                  <Text style={styles.registerButtonText}>Register</Text>
                  <ArrowRight size={20} color="white" />
                </>
              )}
            </TouchableOpacity>
          </View>

          {/* Footer */}
          <View style={styles.footer}>
            <Text style={styles.footerText}>Already have an account? </Text>
            <TouchableOpacity onPress={goLogin}>
              <View style={styles.loginLink}>
                <Text style={styles.loginLinkText}>Login here</Text>
              </View>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB' },
  keyboardAvoid: { flex: 1 },
  scrollContent: { flexGrow: 1, paddingHorizontal: 24, paddingVertical: 32 },
  header: { alignItems: 'center', marginBottom: 32 },
  title: { fontSize: 28, fontWeight: 'bold', color: '#1F2937', marginBottom: 8 },
  subtitle: { fontSize: 16, color: '#6B7280', textAlign: 'center' },

  form: {
    backgroundColor: 'white', borderRadius: 16, padding: 24,
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1, shadowRadius: 12, elevation: 5, marginBottom: 24,
  },

  inputGroup: { marginBottom: 20 },
  label: { fontSize: 16, fontWeight: '600', color: '#374151', marginBottom: 8 },

  inputContainer: {
    flexDirection: 'row', alignItems: 'center',
    borderWidth: 2, borderColor: '#E5E7EB',
    borderRadius: 12, backgroundColor: '#F9FAFB',
  },
  inputIcon: { marginLeft: 16 },
  textInput: { flex: 1, paddingHorizontal: 12, paddingVertical: 16, fontSize: 16, color: '#1F2937' },

  phoneInputContainer: {
    flexDirection: 'row', alignItems: 'center',
    borderWidth: 2, borderColor: '#E5E7EB',
    borderRadius: 12, backgroundColor: '#F9FAFB',
  },
  countryCode: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 16,
    borderRightWidth: 1, borderRightColor: '#E5E7EB', gap: 8,
  },
  countryCodeText: { fontSize: 16, fontWeight: '600', color: '#374151' },
  phoneInput: { flex: 1, paddingHorizontal: 16, paddingVertical: 16, fontSize: 16, color: '#1F2937' },

  revealBtn: { paddingHorizontal: 12, paddingVertical: 12 },
  revealText: { color: '#6B7280', fontWeight: '700' },

  registerButton: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#10B981', paddingVertical: 16, borderRadius: 12,
    shadowColor: '#10B981', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3, shadowRadius: 8, elevation: 4, gap: 8,
  },
  registerButtonDisabled: { backgroundColor: '#9CA3AF', shadowOpacity: 0 },
  registerButtonText: { color: 'white', fontSize: 18, fontWeight: '600' },

  footer: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginBottom: 24 },
  footerText: { fontSize: 16, color: '#6B7280' },
  loginLink: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  loginLinkText: { fontSize: 16, color: '#3B82F6', fontWeight: '600' },
});
