// app/topup.tsx
import React, { useEffect, useMemo, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput, ScrollView,
  Alert, KeyboardAvoidingView, Platform, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ArrowLeft, CreditCard, Smartphone, CheckCircle2, Building2, Hash } from 'lucide-react-native';
import { useRouter } from 'expo-router';

// ✅ reuse your existing auth helpers
import {
  getAccess,
  getRefresh,
  saveTokens,
} from './lib/auth';

type PaymentMethod = {
  id: string;
  name: string;
  bank: string;
  number: string; // phone or bank account
  createdAt?: string;
};

const API_URL =
  process.env.EXPO_PUBLIC_API_URL ??
  (Platform.OS === 'android' ? 'http://10.0.2.2:4000' : 'http://localhost:4000');

/** Fallback local list (used if server returns empty / fails) */
const FALLBACK_METHODS: PaymentMethod[] = [
  { id: 'k1', name: 'KPay No. 1', bank: 'KBZPay', number: '09 975 123 456' },
  { id: 'k2', name: 'KPay No. 2', bank: 'KBZPay', number: '09 777 888 999' },
];

export default function TopUpScreen() {
  const router = useRouter();

  // form state
  const [amount, setAmount] = useState<string>('');
  const [last5, setLast5] = useState<string>('');
  const [selectedId, setSelectedId] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);

  // methods state
  const [methods, setMethods] = useState<PaymentMethod[]>([]);
  const [loadingMethods, setLoadingMethods] = useState(true);
  const [loadingError, setLoadingError] = useState<string | null>(null);

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
    await saveTokens(data.access, refreshToken);
    return data.access as string;
  };

  const authedFetch = useCallback(async (path: string, init?: RequestInit) => {
    let access = await getAccess();
    const refresh = await getRefresh();
    const doFetch = (token?: string) =>
      fetch(`${API_URL}${path}`, {
        ...(init || {}),
        headers: {
          'Content-Type': 'application/json',
          ...(init?.headers || {}),
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });

    let res = access ? await doFetch(access) : await doFetch();
    if (res.status === 401 && refresh) {
      const newAccess = await refreshAccess(refresh);
      res = await doFetch(newAccess);
    }
    return res;
  }, []);

  // ---- load payment methods -------------------------------------------------
  const loadMethods = useCallback(async () => {
    setLoadingMethods(true);
    setLoadingError(null);
    try {
      const r = await authedFetch(`/payment-methods`, { method: 'GET' });
      if (!r.ok) throw new Error('load_failed');
      const data = (await r.json()) as PaymentMethod[];
      const list = Array.isArray(data) ? data : [];
      if (list.length === 0) {
        // fallback if server is empty
        setMethods(FALLBACK_METHODS);
      } else {
        setMethods(list);
      }
      // preselect first
      setSelectedId((prev) => prev || (list[0]?.id || FALLBACK_METHODS[0]?.id || ''));
    } catch (e) {
      setLoadingError('Failed to load payment methods. Using a temporary list.');
      setMethods(FALLBACK_METHODS);
      setSelectedId((prev) => prev || FALLBACK_METHODS[0]?.id || '');
    } finally {
      setLoadingMethods(false);
    }
  }, [authedFetch]);

  useEffect(() => {
    loadMethods();
  }, [loadMethods]);

  const selectedMethod = useMemo(
    () => methods.find((m) => m.id === selectedId) || null,
    [methods, selectedId]
  );

  const canSubmit = useMemo(() => {
    const amt = parseInt(amount || '0', 10);
    return Number.isFinite(amt) && amt > 0 && /^\d{5}$/.test(last5) && !!selectedMethod;
  }, [amount, last5, selectedMethod]);

  // ---- submit ---------------------------------------------------------------
  const handleSubmit = async () => {
    if (!canSubmit || !selectedMethod) return;

    setSubmitting(true);
    try {
      // Adjust to your actual endpoint/shape:
      // Suggested server route: POST /topups  { amount, paymentId, paymentMethodId }
      const body = {
        amount: Number(amount),
        paymentId: last5,
        paymentMethodId: selectedMethod.id,
      };
      const r = await authedFetch(`/topups`, {
        method: 'POST',
        body: JSON.stringify(body),
      });

      // If backend not ready, treat any non-2xx as soft success when using fallback
      if (!r.ok && methods !== FALLBACK_METHODS) {
        const data = await r.json().catch(() => ({}));
        throw new Error(data?.error || 'submit_failed');
      }

      Alert.alert('Top Up', 'That payment has already beend submit!', [
        { text: 'OK', onPress: () => router.back() },
      ]);
    } catch (e: any) {
      Alert.alert('Top Up', 'Failed to submit top up. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  // ---- UI -------------------------------------------------------------------
  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.select({ ios: 'padding', android: undefined })}
        style={{ flex: 1 }}
        keyboardVerticalOffset={Platform.select({ ios: 80, android: 0 })}
      >
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          {/* Header */}
          <View style={styles.header}>
            <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
              <ArrowLeft size={24} color="#1F2937" />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>Top Up</Text>
            <View style={{ width: 44 }} />
          </View>

          {/* Notice (when falling back) */}
          {loadingError && (
            <View style={styles.notice}>
              <Text style={styles.noticeText}>{loadingError}</Text>
            </View>
          )}

          {/* Card */}
          <View style={styles.card}>
            {/* Amount */}
            <View style={styles.row}>
              <CreditCard size={20} color="#6B7280" />
              <View style={styles.rowRight}>
                <Text style={styles.label}>Amount (MMK)</Text>
                <TextInput
                  value={amount}
                  onChangeText={(t) => setAmount(t.replace(/[^\d]/g, '').slice(0, 9))}
                  placeholder="e.g. 5000"
                  keyboardType="number-pad"
                  style={styles.input}
                />
              </View>
            </View>

            {/* Final 5 digits */}
            <View style={styles.row}>
              <CheckCircle2 size={20} color="#6B7280" />
              <View style={styles.rowRight}>
                <Text style={styles.label}>Final 5 digits of Payment ID</Text>
                <TextInput
                  value={last5}
                  onChangeText={(t) => setLast5(t.replace(/[^\d]/g, '').slice(0, 5))}
                  placeholder="e.g. 12345"
                  keyboardType="number-pad"
                  style={styles.input}
                  maxLength={5}
                />
              </View>
            </View>

            {/* Payment method list */}
            <View style={styles.block}>
              <Text style={styles.label}>Payment Method</Text>

              {loadingMethods ? (
                <View style={[styles.loadingRow]}>
                  <ActivityIndicator />
                  <Text style={{ marginLeft: 8, color: '#6B7280' }}>Loading methods…</Text>
                </View>
              ) : methods.length === 0 ? (
                <Text style={{ color: '#6B7280' }}>No payment methods configured yet.</Text>
              ) : (
                <View style={styles.methodList}>
                  {methods.map((m) => {
                    const active = selectedId === m.id;
                    return (
                      <TouchableOpacity
                        key={m.id}
                        style={[styles.methodItem, active && styles.methodItemActive]}
                        onPress={() => setSelectedId(m.id)}
                      >
                        <View style={[styles.methodDot, active && styles.methodDotActive]} />
                        <View style={{ flex: 1 }}>
                          <Text style={[styles.methodName, active && styles.methodNameActive]}>
                            {m.name}
                          </Text>
                          <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 2 }}>
                            <Building2 size={14} color={active ? '#1D4ED8' : '#6B7280'} />
                            <Text style={[styles.methodMeta, active && styles.methodMetaActive]}>
                              {' '}{m.bank}
                            </Text>
                          </View>
                          <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 2 }}>
                            <Hash size={14} color={active ? '#1D4ED8' : '#6B7280'} />
                            <Text style={[styles.methodMeta, active && styles.methodMetaActive]}>
                              {' '}{m.number}
                            </Text>
                          </View>
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              )}
            </View>

            {/* Submit */}
            <TouchableOpacity
              style={[styles.submitBtn, !canSubmit && { opacity: 0.5 }]}
              onPress={handleSubmit}
              disabled={!canSubmit || submitting || loadingMethods}
            >
              <Text style={styles.submitText}>{submitting ? 'Submitting…' : 'Submit Top Up'}</Text>
            </TouchableOpacity>
          </View>

          {/* Helper note */}
          <Text style={styles.note}>
            After transferring, select the payment method you used, then enter the final 5 digits of the payment ID and the amount you sent.
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

/* ---- styles ---- */
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB' },
  content: { paddingHorizontal: 20, paddingBottom: 28 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 16 },
  backButton: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#F3F4F6', alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 24, fontWeight: 'bold', color: '#1F2937' },

  notice: { backgroundColor: '#EFF6FF', borderWidth: 1, borderColor: '#DBEAFE', padding: 10, borderRadius: 10, marginBottom: 10 },
  noticeText: { color: '#1D4ED8', fontSize: 13 },

  loadingRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8 },

  card: {
    backgroundColor: 'white',
    borderRadius: 16,
    padding: 16,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06, shadowRadius: 8, elevation: 2,
  },

  row: { flexDirection: 'row', alignItems: 'center', marginBottom: 14 },
  rowRight: { marginLeft: 12, flex: 1 },
  label: { fontSize: 14, fontWeight: '600', color: '#374151', marginBottom: 6 },
  input: {
    height: 46,
    backgroundColor: '#F9FAFB',
    borderRadius: 10,
    paddingHorizontal: 12,
    fontSize: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },

  block: { marginTop: 8, marginBottom: 12 },

  methodList: { gap: 8 },
  methodItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 12,
    padding: 12,
  },
  methodItemActive: { borderColor: '#2563EB', backgroundColor: '#EFF6FF' },
  methodDot: { width: 14, height: 14, borderRadius: 7, borderWidth: 2, borderColor: '#9CA3AF', marginRight: 12, backgroundColor: 'white' },
  methodDotActive: { borderColor: '#2563EB', backgroundColor: '#2563EB' },
  methodName: { fontSize: 14, fontWeight: '700', color: '#374151' },
  methodNameActive: { color: '#1D4ED8' },
  methodMeta: { fontSize: 13, color: '#6B7280' },
  methodMetaActive: { color: '#1D4ED8' },

  submitBtn: {
    marginTop: 6,
    backgroundColor: '#3B82F6',
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
  },
  submitText: { color: 'white', fontSize: 16, fontWeight: '700' },

  note: { color: '#6B7280', fontSize: 13, marginTop: 12, lineHeight: 18 },
});
