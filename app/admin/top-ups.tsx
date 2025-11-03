import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator, Alert, FlatList, Platform, RefreshControl,
  StyleSheet, Text, TextInput, TouchableOpacity, View
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ArrowLeft, Check, X, Search, CreditCard } from 'lucide-react-native';

import { getUser } from '../lib/auth';
import { getAccess, getRefresh, saveTokens } from '../lib/auth';

type Role = 'SUPER_ADMIN'|'ADMIN'|'MODERATOR'|'USER';
interface ApiUser { id:string; role:Role; name:string; phone:string; carNumber?:string | null; }
type Status = 'PENDING'|'APPROVED'|'REJECTED';

interface TopUpItem {
  id: string;
  amount: number;
  paymentId: string;
  status: Status;
  createdAt: string;
  user: { id:string; name:string; phone:string; carNumber:string | null };
  paymentMethod: { id:string; name:string; bank:string; number:string };
}

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? (Platform.OS === 'android' ? 'http://10.0.2.2:4000' : 'http://localhost:4000');

export default function AdminTopUps() {
  const router = useRouter();

  const [me, setMe] = useState<ApiUser | null>(null);
  const [loadingMe, setLoadingMe] = useState(true);

  const [status, setStatus] = useState<Status>('PENDING');
  const [query, setQuery] = useState('');
  const [items, setItems] = useState<TopUpItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actingId, setActingId] = useState<string | null>(null);

  const isSuperAdmin = (me?.role ?? '').toUpperCase() === 'SUPER_ADMIN';

  // token helpers
  const refreshAccess = async (refreshToken: string) => {
    const r = await fetch(`${API_URL}/auth/refresh`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ refresh: refreshToken }) });
    if (!r.ok) throw new Error('refresh_failed');
    const data = await r.json();
    await saveTokens(data.access, refreshToken);
    return data.access as string;
  };
  const authedFetch = useCallback(async (path: string, init?: RequestInit) => {
    let access = await getAccess(); const refresh = await getRefresh();
    const go = (t?:string) => fetch(`${API_URL}${path}`, { ...(init||{}), headers: { 'Content-Type':'application/json', ...(init?.headers||{}), ...(t?{Authorization:`Bearer ${t}`}:{}) }});
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
    if (!loadingMe && me && !isSuperAdmin) { Alert.alert('Unauthorized','Admins only.'); router.replace('/profile'); }
  }, [loadingMe, me, isSuperAdmin, router]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const qs = `?status=${status}${query.trim() ? `&q=${encodeURIComponent(query.trim())}` : ''}`;
      const r = await authedFetch(`/admin/topups${qs}`);
      const data = await r.json();
      setItems(Array.isArray(data) ? data : []);
    } catch { /* noop */ }
    finally { setLoading(false); }
  }, [authedFetch, status, query]);

  useEffect(() => { if (isSuperAdmin) load(); }, [isSuperAdmin, load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true); await load(); setRefreshing(false);
  }, [load]);

  const act = async (id: string, to: Status) => {
    setActingId(id);
    try {
      const r = await authedFetch(`/admin/topups/${id}`, { method:'PATCH', body: JSON.stringify({ status: to }) });
      if (!r.ok) {
        const j = await r.json().catch(()=>({})); return Alert.alert('Top Ups', j?.error ?? 'Failed to update.');
      }
      setItems(prev => prev.map(x => x.id === id ? { ...x, status: to } : x));
    } finally { setActingId(null); }
  };

  const Header = () => (
    <View style={styles.header}>
      <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
        <ArrowLeft size={22} color="#1F2937" />
      </TouchableOpacity>
      <Text style={styles.headerTitle}>Top Up List</Text>
      <View style={{ width:44 }} />
    </View>
  );

  const Tabs = () => (
    <View style={styles.tabs}>
      {(['PENDING','APPROVED','REJECTED'] as Status[]).map(s => {
        const active = status === s;
        return (
          <TouchableOpacity key={s} onPress={() => setStatus(s)} style={[styles.tab, active && styles.tabActive]}>
            <Text style={[styles.tabText, active && styles.tabTextActive]}>{s}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );

  const SearchBar = () => (
    <View style={styles.searchWrap}>
      <Search size={16} color="#6B7280" />
      <TextInput
        value={query}
        onChangeText={setQuery}
        placeholder="Search by Name, Car Number, Phone or Payment ID"
        placeholderTextColor="#9CA3AF"
        style={styles.searchInput}
        returnKeyType="search"
        onSubmitEditing={load}
      />
      <TouchableOpacity style={styles.searchBtn} onPress={load}><Text style={styles.searchBtnText}>Search</Text></TouchableOpacity>
    </View>
  );

  const renderItem = ({ item }: { item: TopUpItem }) => {
    const isPending = item.status === 'PENDING';
    return (
      <View style={styles.card}>
        <View style={styles.rowTop}>
          <View style={styles.pmIcon}><CreditCard size={16} color="#6B7280" /></View>
          <View style={{ flex:1 }}>
            <Text style={styles.title}>{item.user.name}</Text>
            <Text style={styles.subtle}>{new Date(item.createdAt).toLocaleString()}</Text>
          </View>
          <Text style={[styles.badge, styles[`badge_${item.status}` as const]]}>{item.status}</Text>
        </View>

        <View style={styles.grid}>
          <Text style={styles.k}>Car Number</Text><Text style={styles.v}>{item.user.carNumber || '-'}</Text>
          <Text style={styles.k}>Phone</Text><Text style={styles.v}>{item.user.phone}</Text>
          <Text style={styles.k}>Amount</Text><Text style={styles.v}>MMK {item.amount.toLocaleString()}</Text>
          <Text style={styles.k}>Payment ID (last 5)</Text><Text style={styles.v}>{item.paymentId}</Text>
          <Text style={styles.k}>Method</Text><Text style={styles.v}>{item.paymentMethod.name} • {item.paymentMethod.bank} • {item.paymentMethod.number}</Text>
        </View>

        {isPending && (
          <View style={styles.actions}>
            <TouchableOpacity style={[styles.btn, styles.btnDanger]} onPress={() => act(item.id,'REJECTED')} disabled={actingId===item.id}>
              <X size={16} color="white" /><Text style={styles.btnText}>Decline</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.btn, styles.btnPrimary]} onPress={() => act(item.id,'APPROVED')} disabled={actingId===item.id}>
              <Check size={16} color="white" /><Text style={styles.btnText}>Accept</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    );
  };

  if (loadingMe || (me && !isSuperAdmin)) {
    return <SafeAreaView style={[styles.container, styles.center]}><ActivityIndicator size="large" /></SafeAreaView>;
  }

  return (
    <SafeAreaView style={styles.container}>
      <Header />
      <Tabs />
      <SearchBar />

      {loading ? (
        <View style={[styles.center, { paddingTop: 24 }]}><ActivityIndicator /></View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(x) => x.id}
          contentContainerStyle={{ paddingHorizontal:16, paddingBottom:24 }}
          renderItem={renderItem}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          ListEmptyComponent={<View style={[styles.center, { padding:24 }]}><Text style={{ color:'#6B7280' }}>No records.</Text></View>}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container:{ flex:1, backgroundColor:'#F9FAFB' }, center:{ alignItems:'center', justifyContent:'center' },
  header:{ flexDirection:'row', alignItems:'center', justifyContent:'space-between', paddingHorizontal:16, paddingVertical:14 },
  backButton:{ width:44, height:44, borderRadius:22, backgroundColor:'#F3F4F6', alignItems:'center', justifyContent:'center' },
  headerTitle:{ fontSize:22, fontWeight:'700', color:'#1F2937' },

  tabs:{ flexDirection:'row', gap:8, paddingHorizontal:16, marginBottom:8 },
  tab:{ paddingVertical:8, paddingHorizontal:12, borderRadius:9999, backgroundColor:'#F3F4F6' },
  tabActive:{ backgroundColor:'#DBEAFE' }, tabText:{ color:'#374151', fontWeight:'700' }, tabTextActive:{ color:'#1D4ED8' },

  searchWrap:{ flexDirection:'row', alignItems:'center', backgroundColor:'#F9FAFB', marginHorizontal:16, borderWidth:1, borderColor:'#E5E7EB', borderRadius:12, paddingHorizontal:10, height:46, marginBottom:10 },
  searchInput:{ flex:1, marginLeft:8, fontSize:14, color:'#111827' },
  searchBtn:{ backgroundColor:'#3B82F6', paddingHorizontal:12, paddingVertical:8, borderRadius:8 },
  searchBtnText:{ color:'white', fontWeight:'700' },

  card:{ backgroundColor:'white', borderRadius:14, padding:14, marginTop:12, shadowColor:'#000', shadowOffset:{ width:0, height:2 }, shadowOpacity:0.06, shadowRadius:6, elevation:2 },
  rowTop:{ flexDirection:'row', alignItems:'center', marginBottom:8 },
  pmIcon:{ width:32, height:32, borderRadius:16, backgroundColor:'#F3F4F6', alignItems:'center', justifyContent:'center', marginRight:10 },
  title:{ fontSize:16, fontWeight:'700', color:'#111827' }, subtle:{ fontSize:12, color:'#6B7280' },

  grid:{ marginTop:6, columnGap:8, rowGap:4, display:'grid', gridTemplateColumns:'110px 1fr' } as any, // RN doesn't support grid; keep pairs stacked:
  k:{ fontSize:13, color:'#6B7280', marginTop:4 },
  v:{ fontSize:14, color:'#111827', marginTop:4 },

  actions:{ flexDirection:'row', gap:10, marginTop:12 },
  btn:{ flex:1, flexDirection:'row', alignItems:'center', justifyContent:'center', gap:6, paddingVertical:10, borderRadius:10 },
  btnPrimary:{ backgroundColor:'#10B981' }, btnDanger:{ backgroundColor:'#EF4444' }, btnText:{ color:'white', fontWeight:'700' },

  badge:{ paddingHorizontal:8, paddingVertical:4, borderRadius:9999, fontSize:12, fontWeight:'800', color:'white' },
  badge_PENDING:{ backgroundColor:'#F59E0B' }, badge_APPROVED:{ backgroundColor:'#10B981' }, badge_REJECTED:{ backgroundColor:'#EF4444' },
});
