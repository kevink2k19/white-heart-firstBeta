import React, { useEffect, useMemo, useState, useCallback } from 'react';
import {
  ActivityIndicator, Alert, FlatList, Modal, Platform, StyleSheet,
  Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import {
  ArrowLeft, Plus, X as XIcon, Save, Building2, CreditCard, Hash, User as UserIcon, Info,
} from 'lucide-react-native';

// auth helpers
import { getUser } from '../lib/auth';
import { getAccess, getRefresh, saveTokens } from '../lib/auth';

type Role = 'SUPER_ADMIN'|'ADMIN'|'MODERATOR'|'USER';
type Status = 'ACTIVE'|'NORMAL'|'WARNING'|'BANNED';

interface ApiUser { id:string; role:Role; name:string; phone:string; status:Status; }
interface PaymentMethod { id:string; name:string; bank:string; number:string; createdAt?:string; isActive?:boolean; }

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? (Platform.OS === 'android' ? 'http://10.0.2.2:4000' : 'http://localhost:4000');

export default function AdminPaymentMethods() {
  const router = useRouter();

  const [me, setMe] = useState<ApiUser | null>(null);
  const [loadingMe, setLoadingMe] = useState(true);

  const [items, setItems] = useState<PaymentMethod[]>([]);
  const [loading, setLoading] = useState(true);

  const [open, setOpen] = useState(false);
  const [pName, setPName] = useState('');
  const [pBank, setPBank] = useState('');
  const [pNumber, setPNumber] = useState('');

  const isSuperAdmin = (me?.role ?? '').toUpperCase() === 'SUPER_ADMIN';

  // token helpers
  const refreshAccess = async (refreshToken: string) => {
    const r = await fetch(`${API_URL}/auth/refresh`, { method: 'POST', headers: { 'Content-Type':'application/json' }, body: JSON.stringify({ refresh: refreshToken })});
    if (!r.ok) throw new Error('refresh_failed');
    const data = await r.json();
    await saveTokens(data.access, refreshToken);
    return data.access as string;
  };
  const authedFetch = useCallback(async (path: string, init?: RequestInit) => {
    let access = await getAccess();
    const refresh = await getRefresh();
    const go = (t?: string) => fetch(`${API_URL}${path}`, { ...(init||{}), headers: { 'Content-Type':'application/json', ...(init?.headers||{}), ...(t?{Authorization:`Bearer ${t}`}:{}) }});
    let res = access ? await go(access) : await go();
    if (res.status===401 && refresh) { const na = await refreshAccess(refresh); res = await go(na); }
    return res;
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      try { const cached = await getUser<ApiUser>(); if (alive) setMe(cached || null); }
      finally { if (alive) setLoadingMe(false); }
    })();
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    if (!loadingMe && me && !isSuperAdmin) {
      Alert.alert('Unauthorized','Admins only.'); router.replace('/profile');
    }
  }, [loadingMe, me, isSuperAdmin, router]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await authedFetch('/admin/payment-methods');
      const data = await r.json();
      setItems(Array.isArray(data) ? data : []);
    } catch { /* noop */ }
    finally { setLoading(false); }
  }, [authedFetch]);

  useEffect(() => { if (isSuperAdmin) load(); }, [isSuperAdmin, load]);

  const validate = ():string|null => {
    if (!pName.trim()) return 'Name is required.';
    if (!pBank.trim()) return 'Bank is required.';
    if (pNumber.trim().replace(/\D/g,'').length < 5) return 'Number seems too short.';
    return null;
  };
  const resetForm = () => { setPName(''); setPBank(''); setPNumber(''); };

  const onCreate = async () => {
    const err = validate(); if (err) return Alert.alert('Create Payment Method', err);
    try {
      const r = await authedFetch('/admin/payment-methods', {
        method:'POST',
        body: JSON.stringify({ name: pName.trim(), bank: pBank.trim(), number: pNumber.trim() }),
      });
      if (!r.ok) {
        const j = await r.json().catch(()=>({}));
        return Alert.alert('Payment Methods', j?.error === 'DUPLICATE_NUMBER' ? 'This bank & number already exists.' : 'Failed to create.');
      }
      const created = await r.json();
      setItems(prev => [created, ...prev]);
      setOpen(false); resetForm();
      Alert.alert('Payment Methods','New payment method created.');
    } catch { Alert.alert('Payment Methods','Network error.'); }
  };

  const Header = () => (
    <View style={styles.header}>
      <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
        <ArrowLeft size={22} color="#1F2937" />
      </TouchableOpacity>
      <Text style={styles.headerTitle}>Payment Methods</Text>
      <TouchableOpacity style={styles.primaryIconBtn} onPress={() => setOpen(true)}>
        <Plus size={20} color="white" />
      </TouchableOpacity>
    </View>
  );

  const Notice = () => (
    <View style={styles.notice}><Info size={16} color="#1D4ED8" />
      <Text style={styles.noticeText}>Admins can add methods that users will see on the Top Up screen.</Text>
    </View>
  );

  const renderItem = ({ item }: { item: PaymentMethod }) => (
    <View style={styles.card}>
      <View style={{ flexDirection:'row', alignItems:'center', marginBottom:8 }}>
        <View style={styles.avatar}><CreditCard size={18} color="#6B7280" /></View>
        <View><Text style={styles.name}>{item.name}</Text>
          {item.createdAt ? <Text style={styles.subtle}>{new Date(item.createdAt).toLocaleString()}</Text> : null}
        </View>
        <View style={{ flex:1 }} />
        {item.isActive === false ? <Text style={{ color:'#DC2626', fontWeight:'700' }}>Inactive</Text> : null}
      </View>
      <View style={styles.row}><Building2 size={16} color="#6B7280" /><Text style={styles.rowText}>{item.bank}</Text></View>
      <View style={styles.row}><Hash       size={16} color="#6B7280" /><Text style={styles.rowText}>{item.number}</Text></View>
    </View>
  );

  if (loadingMe || (me && !isSuperAdmin)) {
    return <SafeAreaView style={[styles.container, styles.center]}><ActivityIndicator size="large" /></SafeAreaView>;
  }

  return (
    <SafeAreaView style={styles.container}>
      <Header />
      <Notice />
      {loading ? (
        <View style={[styles.center, { paddingTop: 24 }]}><ActivityIndicator /></View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(x) => x.id}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24 }}
          renderItem={renderItem}
          ListEmptyComponent={<View style={[styles.center, { padding: 24 }]}><Text style={{ color:'#6B7280' }}>No payment methods yet.</Text></View>}
        />
      )}

      {/* Create Dialog */}
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>New Payment Method</Text>
              <TouchableOpacity onPress={() => { setOpen(false); resetForm(); }} style={styles.iconGhost}>
                <XIcon size={20} color="#6B7280" />
              </TouchableOpacity>
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>Name</Text>
              <View style={styles.inputWrap}>
                <UserIcon size={18} color="#9CA3AF" />
                <TextInput value={pName} onChangeText={setPName} placeholder="e.g., Main KPay" placeholderTextColor="#9CA3AF" style={styles.input}/>
              </View>
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>Bank</Text>
              <View style={styles.inputWrap}>
                <Building2 size={18} color="#9CA3AF" />
                <TextInput value={pBank} onChangeText={setPBank} placeholder="KBZPay / WavePay / KBZ Bank" placeholderTextColor="#9CA3AF" style={styles.input} autoCapitalize="words"/>
              </View>
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>Bank Number / Phone</Text>
              <View style={styles.inputWrap}>
                <Hash size={18} color="#9CA3AF" />
                <TextInput value={pNumber} onChangeText={setPNumber} placeholder="09-7777-888999 or account no." placeholderTextColor="#9CA3AF" style={styles.input} keyboardType="phone-pad"/>
              </View>
            </View>

            <View style={styles.modalActions}>
              <TouchableOpacity style={[styles.btn, styles.btnGhost]} onPress={() => { setOpen(false); resetForm(); }}>
                <Text style={styles.btnGhostText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.btn, styles.btnPrimary]} onPress={onCreate}>
                <Save size={18} color="white" /><Text style={styles.btnPrimaryText}>Create</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container:{ flex:1, backgroundColor:'#F9FAFB' }, center:{ alignItems:'center', justifyContent:'center' },
  header:{ flexDirection:'row', alignItems:'center', justifyContent:'space-between', paddingHorizontal:16, paddingVertical:14 },
  backButton:{ width:44, height:44, borderRadius:22, backgroundColor:'#F3F4F6', alignItems:'center', justifyContent:'center' },
  headerTitle:{ fontSize:22, fontWeight:'700', color:'#1F2937' },
  primaryIconBtn:{ width:44, height:44, borderRadius:10, backgroundColor:'#3B82F6', alignItems:'center', justifyContent:'center' },
  notice:{ marginHorizontal:16, marginBottom:10, padding:10, backgroundColor:'#DBEAFE', borderRadius:10, flexDirection:'row', alignItems:'center' },
  noticeText:{ marginLeft:8, color:'#1D4ED8' },
  card:{ backgroundColor:'white', borderRadius:14, padding:14, marginTop:12, shadowColor:'#000', shadowOffset:{ width:0, height:2 }, shadowOpacity:0.06, shadowRadius:6, elevation:2 },
  avatar:{ width:36, height:36, borderRadius:18, backgroundColor:'#F3F4F6', alignItems:'center', justifyContent:'center', marginRight:10 },
  name:{ fontSize:16, fontWeight:'700', color:'#111827' }, subtle:{ fontSize:12, color:'#6B7280' },
  row:{ flexDirection:'row', alignItems:'center', marginTop:6 }, rowText:{ fontSize:14, color:'#374151', marginLeft:8 },

  modalBackdrop:{ flex:1, backgroundColor:'rgba(0,0,0,0.35)', alignItems:'center', justifyContent:'center', padding:16 },
  modalCard:{ width:'100%', backgroundColor:'white', borderRadius:14, padding:16, shadowColor:'#000', shadowOffset:{ width:0, height:4 }, shadowOpacity:0.1, shadowRadius:8, elevation:3 },
  modalHeader:{ flexDirection:'row', alignItems:'center', justifyContent:'space-between', marginBottom:8 },
  modalTitle:{ fontSize:18, fontWeight:'700', color:'#111827' }, iconGhost:{ padding:6 },
  field:{ marginTop:10 }, label:{ fontSize:14, color:'#374151', marginBottom:6, fontWeight:'600' },
  inputWrap:{ flexDirection:'row', alignItems:'center', backgroundColor:'#F9FAFB', borderRadius:10, borderWidth:1, borderColor:'#E5E7EB', height:46, paddingHorizontal:12 },
  input:{ flex:1, marginLeft:8, fontSize:16, color:'#111827' },
  modalActions:{ flexDirection:'row', gap:10, marginTop:14 },
  btn:{ flexDirection:'row', alignItems:'center', justifyContent:'center', paddingVertical:12, borderRadius:10, gap:8, flex:1 },
  btnGhost:{ backgroundColor:'#F3F4F6' }, btnGhostText:{ color:'#374151', fontWeight:'700' },
  btnPrimary:{ backgroundColor:'#3B82F6' }, btnPrimaryText:{ color:'white', fontWeight:'700' },
});
