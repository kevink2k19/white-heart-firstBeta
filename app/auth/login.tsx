// app/auth/login.tsx
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
import { Phone, ArrowRight, UserPlus, Lock } from 'lucide-react-native';
import { saveTokens, saveUser } from "../lib/auth";

const API_URL =
  process.env.EXPO_PUBLIC_API_URL ??
  (Platform.OS === 'android' ? 'http://10.0.2.2:4000' : 'http://localhost:4000');

export default function LoginScreen() {
  const router = useRouter();

  const [phoneNumber, setPhoneNumber] = useState('');
  const [password, setPassword] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [loading, setLoading] = useState(false);

  const [errors, setErrors] = useState<{ phoneNumber?: string; password?: string; general?: string }>({});

  // validation + normalization (match register.tsx logic)
  const isValidPhone = (v: string) => /^\d{7,15}$/.test(v.replace(/\D/g, ''));
  const normalizePhone = (raw: string) => {
    const trimmed = raw.trim();
    if (trimmed.startsWith('+')) return trimmed; // already normalized
    const digits = trimmed.replace(/\D/g, '').replace(/^0/, '');
    return `+95${digits}`;
  };

  const handleLogin = async () => {
    const nextErrors: typeof errors = {};

    if (!phoneNumber) nextErrors.phoneNumber = 'Phone number is required';
    else if (!isValidPhone(phoneNumber)) nextErrors.phoneNumber = 'Enter a valid phone number (digits only)';

    if (!password) nextErrors.password = 'Password is required';
    else if (password.length < 8) nextErrors.password = 'Password must be at least 8 characters';

    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: normalizePhone(phoneNumber),
          password,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg = data?.error || 'Login failed';
        return Alert.alert('Error', msg);
      }

    await saveTokens(data.tokens.access, data.tokens.refresh);
    await saveUser(data.user); // optional cache for quick display

      Alert.alert('Welcome', 'Login successful!', [
        { text: 'Continue', onPress: () => router.replace('/(tabs)/') },
      ]);
    } catch (e) {
      Alert.alert('Network', `Cannot reach ${API_URL}. Check base URL / firewall / server.`);
    } finally {
      setLoading(false);
    }
  };

  const handleNavigateToRegister = () => router.push('/auth/register');

  const handleForgotPassword = () => {
    // Placeholder flow — update once you build reset API
    Alert.alert(
      'Forgot password',
      'Please contact support to reset your password.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Contact Support', onPress: () => Alert.alert('Support', 'Call: +95 9 123 456 789') },
      ]
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardAvoid}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.title}>Welcome Back</Text>
            <Text style={styles.subtitle}>Sign in to your driver account</Text>
          </View>

          {/* Form */}
          <View style={styles.form}>
            {/* Phone */}
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Phone Number</Text>
              <View style={styles.phoneInputContainer}>
                <View style={styles.countryCode}>
                  <Phone size={20} color="#6B7280" />
                  <Text style={styles.countryCodeText}>+95</Text>
                </View>
                <TextInput
                  style={[styles.phoneInput, errors.phoneNumber && styles.inputError]}
                  placeholder="9 123 456 789"
                  value={phoneNumber}
                  onChangeText={(t) => {
                    const clean = t.replace(/\D/g, '').slice(0, 15);
                    setPhoneNumber(clean);
                    if (errors.phoneNumber) setErrors((p) => ({ ...p, phoneNumber: undefined }));
                  }}
                  keyboardType="phone-pad"
                  autoComplete="tel"
                />
              </View>
              {errors.phoneNumber ? <Text style={styles.errorText}>{errors.phoneNumber}</Text> : null}
            </View>

            {/* Password */}
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Password</Text>
              <View style={styles.inputContainer}>
                <Lock size={20} color="#6B7280" style={styles.inputIcon} />
                <TextInput
                  style={[styles.textInput, errors.password && styles.inputError]}
                  placeholder="Your password"
                  value={password}
                  onChangeText={(t) => {
                    setPassword(t);
                    if (errors.password) setErrors((p) => ({ ...p, password: undefined }));
                  }}
                  secureTextEntry={!showPwd}
                  autoComplete="password"
                />
                <TouchableOpacity style={styles.revealBtn} onPress={() => setShowPwd((s) => !s)}>
                  <Text style={styles.revealText}>{showPwd ? 'HIDE' : 'SHOW'}</Text>
                </TouchableOpacity>
              </View>
              {errors.password ? <Text style={styles.errorText}>{errors.password}</Text> : null}
            </View>

            {/* General error */}
            {errors.general ? <Text style={styles.generalError}>{errors.general}</Text> : null}

            {/* Login */}
            <TouchableOpacity
              style={[styles.loginButton, loading && styles.loginButtonDisabled]}
              onPress={handleLogin}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator size="small" color="white" />
              ) : (
                <>
                  <Text style={styles.loginButtonText}>Login</Text>
                  <ArrowRight size={20} color="white" />
                </>
              )}
            </TouchableOpacity>

            {/* Forgot password */}
            <TouchableOpacity style={styles.forgotPassword} onPress={handleForgotPassword}>
              <Text style={styles.forgotPasswordText}>Forgot password?</Text>
            </TouchableOpacity>
          </View>

          {/* Register link */}
          <View style={styles.footer}>
            <Text style={styles.footerText}>Don&apos;t have an account? </Text>
            <TouchableOpacity onPress={handleNavigateToRegister}>
              <View style={styles.registerLink}>
                <UserPlus size={16} color="#3B82F6" />
                <Text style={styles.registerLinkText}>Register here</Text>
              </View>
            </TouchableOpacity>
          </View>

          {/* Demo hint */}
          <View style={styles.demoInstructions}>
            <Text style={styles.demoTitle}>Tip</Text>
            <Text style={styles.demoText}>
              Use the phone + password you created on the Register screen.
            </Text>
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

  header: { alignItems: 'center', marginBottom: 40 },
  title: { fontSize: 32, fontWeight: 'bold', color: '#1F2937', marginBottom: 8 },
  subtitle: { fontSize: 16, color: '#6B7280', textAlign: 'center' },

  form: {
    backgroundColor: 'white',
    borderRadius: 16,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 5,
    marginBottom: 24,
  },

  inputGroup: { marginBottom: 20 },
  label: { fontSize: 16, fontWeight: '600', color: '#374151', marginBottom: 8 },

  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#E5E7EB',
    borderRadius: 12,
    backgroundColor: '#F9FAFB',
  },
  inputIcon: { marginLeft: 16 },
  textInput: { flex: 1, paddingHorizontal: 12, paddingVertical: 16, fontSize: 16, color: '#1F2937' },

  phoneInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#E5E7EB',
    borderRadius: 12,
    backgroundColor: '#F9FAFB',
  },
  countryCode: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderRightWidth: 1,
    borderRightColor: '#E5E7EB',
    gap: 8,
  },
  countryCodeText: { fontSize: 16, fontWeight: '600', color: '#374151' },
  phoneInput: { flex: 1, paddingHorizontal: 16, paddingVertical: 16, fontSize: 16, color: '#1F2937' },

  revealBtn: { paddingHorizontal: 12, paddingVertical: 12 },
  revealText: { color: '#6B7280', fontWeight: '700' },

  inputError: { borderColor: '#EF4444', backgroundColor: '#FEF2F2' },
  errorText: { fontSize: 14, color: '#EF4444', marginTop: 4 },

  generalError: {
    fontSize: 14,
    color: '#EF4444',
    textAlign: 'center',
    marginBottom: 16,
    padding: 12,
    backgroundColor: '#FEF2F2',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#FECACA',
  },

  loginButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#3B82F6',
    paddingVertical: 16,
    borderRadius: 12,
    shadowColor: '#3B82F6',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
    gap: 8,
  },
  loginButtonDisabled: { backgroundColor: '#9CA3AF', shadowOpacity: 0 },
  loginButtonText: { color: 'white', fontSize: 18, fontWeight: '600' },

  forgotPassword: { alignItems: 'center', marginTop: 16 },
  forgotPasswordText: { fontSize: 16, color: '#3B82F6', fontWeight: '500' },

  footer: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginBottom: 24 },
  footerText: { fontSize: 16, color: '#6B7280' },
  registerLink: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  registerLinkText: { fontSize: 16, color: '#3B82F6', fontWeight: '600' },

  demoInstructions: {
    backgroundColor: '#EBF4FF',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  demoTitle: { fontSize: 16, fontWeight: '600', color: '#1E40AF', marginBottom: 8 },
  demoText: { fontSize: 14, color: '#1E40AF', marginBottom: 4 },
});
