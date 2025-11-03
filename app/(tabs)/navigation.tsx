// app/(tabs)/navigation.tsx
import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  Dimensions,
  Alert,
  ScrollView,
  Platform,
  ActivityIndicator,
  Image,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import {
  Navigation as NavigationIcon,
  Play,
  Pause,
  Square,
  DollarSign,
  Zap,
  MapPin,
  Phone,
  ArrowLeft,
  Star,
  X,
  LocateFixed,
} from 'lucide-react-native';
import MapView, {
  Marker,
  Polyline,
  PROVIDER_GOOGLE,
  LatLng,
  AnimatedRegion,
} from 'react-native-maps';
import * as Location from 'expo-location';
import { Audio } from 'expo-av';
import polyline from 'polyline';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';

import DropoffDialog from '@/components/DropoffDialog';
import DemandModal from '@/components/DemandModal';

// ✅ shared auth client
import { fetchMe, authFetch } from '../lib/authClient';

/* ----------------------------------------------------------------------------
 * CONFIG
 * --------------------------------------------------------------------------*/
const { height } = Dimensions.get('window');

const BASE_FARE = 2000;
const FARE_RATE = 1000;
const INITIAL_DISTANCE = 0.1;

const DEFAULT_REGION = {
  latitude: 16.8409,
  longitude: 96.1735,
  latitudeDelta: 0.05,
  longitudeDelta: 0.05,
};

// Map behavior / smoothing
const COURSE_UP = false; // set true if you want the camera to rotate with heading
const CAR_MARKER_HEADING_OFFSET = 0;
const HEADING_SMOOTHING = 0.2;
const MOVING_SPEED_MPS = 1.5;

// Wait charging
const WAIT_FREE_MS = 10 * 60 * 1000;
const WAIT_CHARGE_PER_MIN = 500;

// Assets
const carIcon = require('../../assets/images/car-marker.png');
const waitAlertSound = require('../../assets/sounds/wating_alert.mp3');

// Resting motion sensitivity
const REST_SPEED_KMH_THRESHOLD = 3;   // trigger near walking speed
const REST_DRIFT_METERS = 10;         // trigger if drift >= 10 m
const REST_TIME_INTERVAL_MS = 1000;   // 1s sampling
const REST_DISTANCE_INTERVAL_M = 1;   // 1m sampling
const REST_ALERT_THROTTLE_MS = 10_000;

/* ----------------------------------------------------------------------------
 * TYPES
 * --------------------------------------------------------------------------*/
interface OrderData {
  orderId: string;
  customerName: string;
  customerPhone: string;
  pickupLocation: string;
  destination: string;
  fareAmount: number;
  distance: string;
  estimatedDuration: string;
  customerRating: number;
}
interface TripState {
  status: 'idle' | 'active' | 'resting' | 'completed';
  startTime: number | null;
  restStartTime: number | null;
  totalRestTime: number;
}

/* ----------------------------------------------------------------------------
 * UTILS
 * --------------------------------------------------------------------------*/
const norm360 = (d: number) => ((d % 360) + 360) % 360;
const toRad = (deg: number) => (deg * Math.PI) / 180;
const shortestDelta = (from: number, to: number) => {
  let d = norm360(to) - norm360(from);
  if (d > 180) d -= 360;
  if (d < -180) d += 360;
  return d;
};
const smoothAngle = (prev: number, next: number, a = HEADING_SMOOTHING) =>
  norm360(prev + shortestDelta(prev, next) * a);

const haversineKm = (a: LatLng, b: LatLng) => {
  const R = 6371;
  const dLat = toRad(b.latitude - a.latitude);
  const dLng = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
};
const bearingDeg = (a: LatLng, b: LatLng) => {
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);
  const dLng = toRad(b.longitude - a.longitude);
  const y = Math.sin(dLng) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  return norm360((Math.atan2(y, x) * 180) / Math.PI);
};

/* ----------------------------------------------------------------------------
 * COMPONENT
 * --------------------------------------------------------------------------*/
export default function NavigationScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams();

  /* ----------------------------- Order & Driver ---------------------------- */
  const orderData: OrderData = {
    orderId: (params.orderId as string) || '',
    customerName: (params.customerName as string) || '',
    customerPhone: (params.customerPhone as string) || '',
    pickupLocation: (params.pickupLocation as string) || '',
    destination: (params.destination as string) || '',
    fareAmount: params.fareAmount ? parseInt(params.fareAmount as string) : 0,
    distance: (params.distance as string) || '',
    estimatedDuration: (params.estimatedDuration as string) || '',
    customerRating: params.customerRating ? parseFloat(params.customerRating as string) : 0,
  };
  const hasCompleteOrderData =
    !!(orderData.orderId && orderData.customerName && orderData.customerPhone && orderData.pickupLocation && orderData.destination);

  const [driverName, setDriverName] = useState<string>('');
  const [carNumber, setCarNumber] = useState<string | undefined>(undefined);

  /* ------------------------------ Render gate ------------------------------ */
  const [canRender, setCanRender] = useState(false);
  const [userBalance, setUserBalance] = useState<number | null>(null);
  const lowBalanceAlertShownRef = useRef(false);

  const checkBalanceAndGate = useCallback(async () => {
    try {
      setCanRender(false); // show spinner while verifying
      const me = await fetchMe<{ balance: number; name: string; carNumber?: string }>();
      setUserBalance(me.balance);
      setDriverName(me.name ?? '');
      setCarNumber(me.carNumber ?? undefined);

      if (me.balance < 500) {
        if (!lowBalanceAlertShownRef.current) {
          lowBalanceAlertShownRef.current = true;
          Alert.alert(
            'Insufficient balance',
            "You don't have enough balance. Please Top Up first!",
            [{ text: 'OK', onPress: () => router.push({ pathname: '/profile', params: { from: 'nav-insufficient' } }) }]
          );
        }
        return; // keep spinner; user should go top up
      }

      lowBalanceAlertShownRef.current = false;
      setCanRender(true);
    } catch (e: any) {
      const msg = String(e?.message ?? '');
      const authErrors = ['no_tokens', 'unauthorized', 'refresh_failed', '401'];
      if (authErrors.includes(msg)) {
        router.replace('/auth/login');
        return;
      }
      Alert.alert('Network', 'Could not verify your account right now. Some data may be stale.');
      setCanRender(true);
    }
  }, [router]);

  // Re-check whenever screen regains focus (e.g. after Top Up)
  useFocusEffect(useCallback(() => { checkBalanceAndGate(); }, [checkBalanceAndGate]));

  /* ------------------------------ Trip state ------------------------------- */
  const [tripState, setTripState] = useState<TripState>({
    status: 'idle',
    startTime: null,
    restStartTime: null,
    totalRestTime: 0,
  });
  const statusRef = useRef<TripState['status']>('idle');

  /* ---------------------------- Counters/metrics --------------------------- */
  const [distance, setDistance] = useState(INITIAL_DISTANCE);
  const [fare, setFare] = useState(BASE_FARE + INITIAL_DISTANCE * FARE_RATE);
  const [speed, setSpeed] = useState(0);
  const [eta, setEta] = useState('--:--');
  const [demandValue, setDemandValue] = useState(0);

  /* ------------------------------- UI flags -------------------------------- */
  const [showDropoffDialog, setShowDropoffDialog] = useState(false);
  const [showCancelButton, setShowCancelButton] = useState(false);
  const [showDemandModal, setShowDemandModal] = useState(false);

  /* --------------------------- Map & directions ---------------------------- */
  const mapRef = useRef<MapView | null>(null);
  const [region, setRegion] = useState(DEFAULT_REGION);
  const [routeCoords, setRouteCoords] = useState<LatLng[]>([]);
  const [originMarker, setOriginMarker] = useState<LatLng | null>(null);
  const [destMarker, setDestMarker] = useState<LatLng | null>(null);
  const [isFetchingRoute, setIsFetchingRoute] = useState(false);

  /* ------------------------------ Live tracking ---------------------------- */
  const [currentCoord, setCurrentCoord] = useState<LatLng | null>(null);
  const [trackCoords, setTrackCoords] = useState<LatLng[]>([]);
  const [carHeading, setCarHeading] = useState(0);
  const [cameraHeading, setCameraHeading] = useState(0);
  const watchRef = useRef<Location.LocationSubscription | null>(null);
  const prevCoordRef = useRef<LatLng | null>(null);

  // animated marker coordinate (smooth motion)
  const carAnimCoord = useRef(
    new AnimatedRegion({
      latitude: DEFAULT_REGION.latitude,
      longitude: DEFAULT_REGION.longitude,
      latitudeDelta: 0.001,
      longitudeDelta: 0.001,
    })
  ).current;
  const lastCamUpdateAtRef = useRef(0);

  /* -------------------------------- Compass -------------------------------- */
  const [compassHeading, setCompassHeading] = useState<number | null>(null);
  const headingWatchRef = useRef<Location.LocationSubscription | null>(null);
  const [waitSnapshotKm, setWaitSnapshotKm] = useState<number | null>(null);

  /* ------------------------- Resting motion detect ------------------------- */
  const restWatchRef = useRef<Location.LocationSubscription | null>(null);
  const restBaseCoordRef = useRef<LatLng | null>(null);
  const lastRestAlertAtRef = useRef(0);
  const lastRestSampleRef = useRef<{ point: LatLng; t: number } | null>(null);

  /* --------------------------------- Sound --------------------------------- */
  const waitSoundRef = useRef<Audio.Sound | null>(null);

  /* ---------------------------- Animations/timers -------------------------- */
  const buttonScaleAnim = useRef(new Animated.Value(1)).current;
  const buttonsOpacityAnim = useRef(new Animated.Value(0)).current;
  const tripTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const isMountedRef = useRef(true);
  const [waitTick, setWaitTick] = useState(0);
  const pausedForDropoffRef = useRef(false);

  // stop marker re-attachment churn (Android perf)
  const [markerTracksViewChanges, setMarkerTracksViewChanges] = useState(true);
  useEffect(() => {
    const id = setTimeout(() => setMarkerTracksViewChanges(false), 400);
    return () => clearTimeout(id);
  }, []);

  /* -------------------------------- Cleanup -------------------------------- */
  useEffect(() => {
    return () => {
      isMountedRef.current = false;
      if (tripTimer.current) { clearInterval(tripTimer.current); tripTimer.current = null; }
      watchRef.current?.remove(); watchRef.current = null;
      headingWatchRef.current?.remove(); headingWatchRef.current = null;
      stopRestMotionWatch();
      try { waitSoundRef.current?.unloadAsync(); } catch {}
    };
  }, []);

  /* ------------------------------- Safe setters ---------------------------- */
  const safeSet =
    <T,>(setter: React.Dispatch<React.SetStateAction<T>>) =>
    (updater: React.SetStateAction<T>) => { if (isMountedRef.current) setter(updater); };
  const setTripStateSafe = safeSet(setTripState);
  const setDistanceSafe = safeSet(setDistance);
  const setFareSafe = safeSet(setFare);
  const setEtaSafe = safeSet(setEta);
  const setSpeedSafe = safeSet(setSpeed);
  const setRouteCoordsSafe = safeSet(setRouteCoords);
  const setOriginMarkerSafe = safeSet(setOriginMarker);
  const setDestMarkerSafe = safeSet(setDestMarker);
  const setIsFetchingRouteSafe = safeSet(setIsFetchingRoute);
  const setCurrentCoordSafe = safeSet(setCurrentCoord);
  const setTrackCoordsSafe = safeSet(setTrackCoords);
  const setCarHeadingSafe = safeSet(setCarHeading);
  const setCameraHeadingSafe = safeSet(setCameraHeading);

  /* --------------------------------- ETA ----------------------------------- */
  const stopEtaTimer = useCallback(() => {
    if (tripTimer.current) { clearInterval(tripTimer.current); tripTimer.current = null; }
  }, []);
  const startEtaTimer = useCallback(() => {
    stopEtaTimer();
    tripTimer.current = setInterval(() => {
      if (!isMountedRef.current || statusRef.current !== 'active') return;
      const estimatedMinutes = Math.random() * 30 + 10;
      const etaTime = new Date(Date.now() + estimatedMinutes * 60000);
      setEtaSafe(etaTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
    }, 5000);
  }, [setEtaSafe, stopEtaTimer]);

  /* ------------------------ Permissions / initial loc ---------------------- */
  useEffect(() => {
    if (!canRender || Platform.OS === 'web') return;
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') return;
        const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        if (!isMountedRef.current) return;

        const coord = { latitude: loc.coords.latitude, longitude: loc.coords.longitude };
        setCurrentCoordSafe(coord);
        setRegion({ latitude: coord.latitude, longitude: coord.longitude, latitudeDelta: 0.05, longitudeDelta: 0.05 });
        prevCoordRef.current = coord;

        // seed animated marker
        carAnimCoord.setValue({
          latitude: coord.latitude,
          longitude: coord.longitude,
          latitudeDelta: 0.001,
          longitudeDelta: 0.001,
        });
      } catch {}
    })();
  }, [canRender, carAnimCoord]);

  /* -------------------------------- Compass -------------------------------- */
  useEffect(() => {
    if (!canRender || Platform.OS === 'web') return;
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') return;
        
        // Get initial heading immediately
        try {
          const initialHeading = await Location.getHeadingAsync();
          const initialRaw = Number.isFinite(initialHeading.trueHeading) && initialHeading.trueHeading >= 0 
            ? initialHeading.trueHeading 
            : initialHeading.magHeading ?? 0;
          setCompassHeading(initialRaw);
          setCarHeading(initialRaw);
        } catch {}
        
        // Start watching for heading changes
        const sub = await Location.watchHeadingAsync(({ trueHeading, magHeading }) => {
          const raw = Number.isFinite(trueHeading) && trueHeading! >= 0 ? trueHeading! : magHeading ?? 0;
          setCompassHeading((prev) => (prev == null ? raw : smoothAngle(prev, raw)));
        });
        headingWatchRef.current = sub;
      } catch {}
    })();
    return () => { headingWatchRef.current?.remove(); headingWatchRef.current = null; };
  }, [canRender]);

  // Always use compass heading to make car face the same direction as phone
  useEffect(() => {
    if (!canRender || Platform.OS === 'web') return;
    if (compassHeading == null) return;

    // Always use compass heading so car rotates with phone orientation
    setCarHeadingSafe((prev) => smoothAngle(prev || 0, compassHeading));
    
    // Only rotate camera if COURSE_UP is enabled, otherwise keep north up
    const cam = COURSE_UP ? compassHeading : 0;
    setCameraHeadingSafe(cam);
    
    if (mapRef.current && currentCoord && COURSE_UP) {
      try { mapRef.current.animateCamera({ center: currentCoord, heading: cam, pitch: 0 }, { duration: 250 }); } catch {}
    }
  }, [canRender, compassHeading, currentCoord]);

  /* ------------------------------ Wait ticker ------------------------------ */
  useEffect(() => {
    if (!canRender) return;
    if (tripState.status !== 'resting') return;
    const id = setInterval(() => setWaitTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [canRender, tripState.status]);

  /* --------------------------------- Audio --------------------------------- */
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        await Audio.setAudioModeAsync({ playsInSilentModeIOS: true, staysActiveInBackground: false, allowsRecordingIOS: false, shouldDuckAndroid: true });
        const { sound } = await Audio.Sound.createAsync(waitAlertSound);
        if (mounted) waitSoundRef.current = sound;
      } catch {}
    })();
    return () => { mounted = false; try { waitSoundRef.current?.unloadAsync(); } catch {} };
  }, []);

  /* ------------------------------ Directions ------------------------------- */
  const fetchRoute = useCallback(async () => {
    if (!canRender || !hasCompleteOrderData || Platform.OS === 'web') return;
    const apiKey = process.env.EXPO_PUBLIC_GOOGLE_MAPS_KEY;
    if (!apiKey) return;

    try {
      setIsFetchingRouteSafe(true);
      const originQ = encodeURIComponent(orderData.pickupLocation);
      const destQ = encodeURIComponent(orderData.destination);
      const url = `https://maps.googleapis.com/maps/api/directions/json?origin=${originQ}&destination=${destQ}&mode=driving&key=${apiKey}`;

      const resp = await fetch(url);
      if (!resp.ok) throw new Error('HTTP ' + resp.status);
      const data = await resp.json();

      const route = data?.routes?.[0];
      const leg = route?.legs?.[0];
      const encoded = route?.overview_polyline?.points;

      if (!route || !encoded) {
        Alert.alert('No route', 'Could not find a route for the given places.');
        setRouteCoordsSafe([]); setOriginMarkerSafe(null); setDestMarkerSafe(null);
        return;
      }

      const pts = polyline.decode(encoded);
      const coords: LatLng[] = (Array.isArray(pts) ? pts : [])
        .filter((pt): pt is [number, number] => Array.isArray(pt) && pt.length === 2 && typeof pt[0] === 'number' && typeof pt[1] === 'number')
        .map(([lat, lng]) => ({ latitude: lat, longitude: lng }));

      setRouteCoordsSafe(coords);

      const km = (leg?.distance?.value ?? 0) / 1000;
      if (km > 0 && statusRef.current === 'idle') setDistanceSafe(km);

      const secs = leg?.duration?.value;
      if (typeof secs === 'number') setEtaSafe(`${Math.round(secs / 60)} min`);

      if (coords.length > 1) {
        setOriginMarkerSafe(coords[0]);
        setDestMarkerSafe(coords[coords.length - 1]);
      }

      mapRef.current?.fitToCoordinates(coords, { edgePadding: { top: 60, right: 60, bottom: 60, left: 60 }, animated: true });
    } catch {
      if (isMountedRef.current) Alert.alert('Directions error', 'Failed to fetch route.');
    } finally {
      setIsFetchingRouteSafe(false);
    }
  }, [canRender, hasCompleteOrderData, orderData.pickupLocation, orderData.destination]);

  useEffect(() => {
    if (!canRender) return;
    if (hasCompleteOrderData) fetchRoute();
    else { setRouteCoords([]); setOriginMarker(null); setDestMarker(null); }
  }, [canRender, hasCompleteOrderData, fetchRoute]);

  /* ------------------------------- Keep awake ------------------------------ */
  useEffect(() => {
    if (!canRender) return;
    const TAG = 'whiteheart-trip';
    (async () => {
      try { (tripState.status === 'active' || tripState.status === 'resting') ? await activateKeepAwakeAsync(TAG) : await deactivateKeepAwake(TAG); } catch {}
    })();
    return () => { deactivateKeepAwake(TAG).catch(() => {}); };
  }, [canRender, tripState.status]);

  // fade in controls & show cancel
  useEffect(() => {
    if (!canRender) return;
    setShowCancelButton(!!hasCompleteOrderData);
    const id = setTimeout(() => { Animated.timing(buttonsOpacityAnim, { toValue: 1, duration: 500, useNativeDriver: true }).start(); }, 100);
    return () => clearTimeout(id);
  }, [canRender, hasCompleteOrderData]);

  /* --------------------------- Fare recomputation -------------------------- */
  useEffect(() => {
    if (!canRender) return;

    const distanceFare = distance * FARE_RATE;
    const inProgressWait = tripState.status === 'resting' && tripState.restStartTime ? Math.max(0, Date.now() - tripState.restStartTime) : 0;
    const totalWaitMsRaw = (tripState.totalRestTime || 0) + inProgressWait;
    const totalWaitMs = Number.isFinite(totalWaitMsRaw) ? Math.max(0, totalWaitMsRaw) : 0;
    const freeMins = WAIT_FREE_MS / 60000;
    const minsRaw = Math.floor(totalWaitMs / 60000) - freeMins;
    const chargeableMinutes = Number.isFinite(minsRaw) ? Math.max(0, minsRaw) : 0;

    const waitCharge = chargeableMinutes * WAIT_CHARGE_PER_MIN;
    const total = BASE_FARE + distanceFare + demandValue + waitCharge;

    setFareSafe(total);
  }, [canRender, distance, demandValue, tripState.totalRestTime, tripState.restStartTime, tripState.status, waitTick]);

  /* ------------------------------- GPS control ----------------------------- */
  const startLocationWatch = async () => {
    if (!canRender || Platform.OS === 'web') return;
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') { Alert.alert('Location', 'Permission required to track the trip.'); return; }

      watchRef.current?.remove();
      watchRef.current = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.BestForNavigation,
          timeInterval: 1000,
          distanceInterval: 1,
          mayShowUserSettingsDialog: true,
        },
        (loc) => {
          if (!isMountedRef.current || statusRef.current !== 'active') return;

          const point: LatLng = { latitude: loc.coords.latitude, longitude: loc.coords.longitude };
          const prevPt = prevCoordRef.current;
          prevCoordRef.current = point;
          setCurrentCoordSafe(point);

          // heading - prioritize compass for car orientation to match phone
          const courseHeading = Number.isFinite(loc.coords.heading)
            ? (loc.coords.heading as number)
            : prevPt
            ? bearingDeg(prevPt, point)
            : carHeading;

          // Always prefer compass heading for car rotation to match phone orientation
          const rawHeading = compassHeading ?? courseHeading;

          setCarHeadingSafe((prev) => smoothAngle(prev || 0, rawHeading));
          const camH = COURSE_UP ? norm360(rawHeading) : 0;
          setCameraHeadingSafe(camH);

          // smooth marker move
          carAnimCoord.timing({
            latitude: point.latitude,
            longitude: point.longitude,
            duration: 900,
            useNativeDriver: false,
            toValue: 0,
            latitudeDelta: 0,
            longitudeDelta: 0
          }).start();

          // Path & distance
          if (prevPt) {
            const movedMeters = haversineKm(prevPt, point) * 1000;
            if (movedMeters >= 3) { // record more often for smoother path
              setTrackCoordsSafe((prev) => (prev.length === 0 ? [point] : [...prev, point]));
              setDistanceSafe((d) => d + movedMeters / 1000);

              const sensorKmh = (loc.coords.speed ?? 0) * 3.6;
              const dtSec = Math.max(0.5, (1000) / 1000); // ~1s
              const kmhFromDelta = (movedMeters / 1000) / (dtSec / 3600);
              setSpeedSafe(sensorKmh > 0 ? sensorKmh : Math.min(Math.max(kmhFromDelta, 0), 160));
            }
          } else {
            setTrackCoordsSafe((prev) => (prev.length === 0 ? [point] : prev));
          }

          // camera follow (throttled)
          const now = Date.now();
          if (mapRef.current && now - lastCamUpdateAtRef.current > 500) {
            lastCamUpdateAtRef.current = now;
            try { mapRef.current.animateCamera({ center: point, heading: camH, pitch: 0 }, { duration: 400 }); } catch {}
          }
        }
      );
    } catch {
      Alert.alert('Tracking error', 'Failed to start GPS tracking.');
    }
  };
  const stopLocationWatch = () => { watchRef.current?.remove(); watchRef.current = null; };

  /* ------------------------- Resting motion monitor ------------------------ */
  const stopRestMotionWatch = () => {
    restWatchRef.current?.remove(); restWatchRef.current = null;
    restBaseCoordRef.current = null; lastRestSampleRef.current = null;
  };
  const triggerRestingMotionAlert = async () => {
    const now = Date.now();
    if (now - lastRestAlertAtRef.current < REST_ALERT_THROTTLE_MS) return;
    lastRestAlertAtRef.current = now;
    try { await waitSoundRef.current?.replayAsync(); } catch {}
    Alert.alert('Notice', 'You are driving and waiting mode');
  };
  const startRestMotionWatch = async () => {
    if (Platform.OS === 'web') return;
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return;

      // baseline
      const last = await Location.getLastKnownPositionAsync();
      if (last) {
        const p = { latitude: last.coords.latitude, longitude: last.coords.longitude };
        restBaseCoordRef.current = p;
        lastRestSampleRef.current = { point: p, t: last.timestamp ?? Date.now() };
      }
      try {
        const fresh = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Highest });
        const p2 = { latitude: fresh.coords.latitude, longitude: fresh.coords.longitude };
        restBaseCoordRef.current = p2; lastRestSampleRef.current = { point: p2, t: fresh.timestamp ?? Date.now() };
      } catch {}

      stopRestMotionWatch();
      restWatchRef.current = await Location.watchPositionAsync(
        {
          accuracy: Platform.OS === 'ios' ? Location.Accuracy.BestForNavigation : Location.Accuracy.Highest,
          timeInterval: REST_TIME_INTERVAL_MS,
          distanceInterval: REST_DISTANCE_INTERVAL_M,
          mayShowUserSettingsDialog: false,
        },
        (loc) => {
          const point: LatLng = { latitude: loc.coords.latitude, longitude: loc.coords.longitude };
          const rawSpeedKmh = (loc.coords.speed ?? 0) * 3.6;

          const base = restBaseCoordRef.current ?? point;
          const R = 6371;
          const dLat = toRad(point.latitude - base.latitude);
          const dLng = toRad(point.longitude - base.longitude);
          const lat1 = toRad(base.latitude);
          const lat2 = toRad(point.latitude);
          const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
          const driftMeters = 2 * R * Math.asin(Math.sqrt(h)) * 1000;

          let deltaSpeedKmh = 0;
          const lastS = lastRestSampleRef.current;
          if (lastS) {
            const dLat2 = toRad(point.latitude - lastS.point.latitude);
            const dLng2 = toRad(point.longitude - lastS.point.longitude);
            const lat1b = toRad(lastS.point.latitude);
            const lat2b = toRad(point.latitude);
            const h2 = Math.sin(dLat2 / 2) ** 2 + Math.cos(lat1b) * Math.cos(lat2b) * Math.sin(dLng2 / 2) ** 2;
            const distMeters = 2 * R * Math.asin(Math.sqrt(h2)) * 1000;
            const dtSec = Math.max(0.5, (Date.now() - lastS.t) / 1000);
            deltaSpeedKmh = (distMeters / dtSec) * 3.6;
          }
          lastRestSampleRef.current = { point, t: Date.now() };

          const effectiveSpeed = Math.max(rawSpeedKmh, deltaSpeedKmh);
          if (effectiveSpeed >= REST_SPEED_KMH_THRESHOLD || driftMeters >= REST_DRIFT_METERS) {
            triggerRestingMotionAlert();
            restBaseCoordRef.current = point;
          }
        }
      );
    } catch {}
  };

  /* -------------------------------- Handlers ------------------------------- */
  const handleCallCustomer = async () => {
    if (!orderData.customerPhone) { Alert.alert('Error', 'Customer phone number is not available.'); return; }
    try {
      const phoneRegex = /^\+?[\d\s\-\(\)]{10,}$/;
      if (!phoneRegex.test(orderData.customerPhone)) {
        Alert.alert('Invalid Phone Number', 'The customer phone number appears to be invalid.', [
          { text: 'OK' },
          { text: 'Show Number', onPress: () => Alert.alert('Customer Phone', orderData.customerPhone) },
        ]);
        return;
      }
      const phoneUrl = `tel:${orderData.customerPhone}`;
      const canOpen = await (await import('react-native')).Linking.canOpenURL(phoneUrl);
      if (canOpen) await (await import('react-native')).Linking.openURL(phoneUrl);
      else {
        Alert.alert('Call Not Supported', 'Your device does not support making phone calls.', [
          { text: 'OK' },
          { text: 'Show Number', onPress: () => Alert.alert('Customer Phone', orderData.customerPhone) },
        ]);
      }
    } catch { Alert.alert('Call Failed', 'Unable to initiate phone call. Please try again.'); }
  };

  const centerOnUser = useCallback(async () => {
    if (!canRender || Platform.OS === 'web') return;
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') { Alert.alert('Location permission required', 'Please enable location to recenter the map.'); return; }

      let loc = await Location.getLastKnownPositionAsync();
      if (!loc || Date.now() - new Date(loc.timestamp).getTime() > 15000) {
        loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      }
      if (!loc) return;

      const point = { latitude: loc.coords.latitude, longitude: loc.coords.longitude };
      setCurrentCoordSafe(point); prevCoordRef.current = point;
      carAnimCoord.setValue({ latitude: point.latitude, longitude: point.longitude, latitudeDelta: 0.001, longitudeDelta: 0.001 });

      if (mapRef.current?.animateCamera) {
        mapRef.current.animateCamera({ center: point, zoom: 16, heading: COURSE_UP ? cameraHeading : 0, pitch: 0 }, { duration: 800 });
      } else {
        mapRef.current?.animateToRegion({ ...point, latitudeDelta: 0.01, longitudeDelta: 0.01 }, 800);
      }
    } catch { Alert.alert('Location', 'Could not get current location.'); }
  }, [canRender, cameraHeading, carAnimCoord]);

  const startTrip = async () => {
    if (!canRender) return;
    if (tripState.status !== 'idle') return;
    if (userBalance != null && userBalance < 500) {
      Alert.alert("Insufficient balance", "You don't have enough balance. Please Top Up first!", [
        { text: 'OK', onPress: () => router.push({ pathname: '/profile', params: { from: 'nav-insufficient' } }) },
      ]);
      return;
    }

    try {
      // Charge start fee
      const res = await authFetch('/me/charge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: 500, reason: 'start_trip' }),
      });
      const data = await res.json().catch(() => ({} as any));
      if (!res.ok) {
        if (data?.error === 'INSUFFICIENT_BALANCE') {
          Alert.alert("Insufficient balance", "You don't have enough balance. Please Top Up first!", [
            { text: 'OK', onPress: () => router.push({ pathname: '/profile', params: { from: 'nav-insufficient' } }) },
          ]);
        } else {
          Alert.alert('Payment', 'Failed to charge start fee. Please try again.');
        }
        return;
      }
      if (typeof data.balance === 'number') setUserBalance(data.balance);

      // Begin trip
      setTrackCoords([]); setDistance(0); setSpeed(0);
      setTripStateSafe({ status: 'active', startTime: Date.now(), restStartTime: null, totalRestTime: 0 });
      statusRef.current = 'active';

      Animated.sequence([
        Animated.timing(buttonScaleAnim, { toValue: 0.95, duration: 100, useNativeDriver: true }),
        Animated.timing(buttonScaleAnim, { toValue: 1, duration: 100, useNativeDriver: true }),
      ]).start();

      startLocationWatch();
      startEtaTimer();
    } catch {
      Alert.alert('Network', 'Could not reach server to charge start fee.');
    }
  };

  const toggleRest = () => {
    if (!canRender) return;

    if (statusRef.current === 'active') {
      setWaitSnapshotKm(distance);
      setTripStateSafe((prev) => ({ ...prev, status: 'resting', restStartTime: Date.now() }));
      statusRef.current = 'resting';
      stopLocationWatch();
      startRestMotionWatch();
    } else if (statusRef.current === 'resting') {
      setWaitSnapshotKm(null);
      const restDuration = Date.now() - (tripState.restStartTime || 0);
      setTripStateSafe((prev) => ({ ...prev, status: 'active', restStartTime: null, totalRestTime: prev.totalRestTime + restDuration }));
      statusRef.current = 'active';
      stopRestMotionWatch();
      startLocationWatch();
    }
  };

  const dropOff = () => {
    if (!canRender) return;
    pausedForDropoffRef.current = false;
    if (statusRef.current === 'active') { pausedForDropoffRef.current = true; stopLocationWatch(); }
    stopEtaTimer();
    setShowDropoffDialog(true);
  };

  const handleDropoffClose = () => {
    setShowDropoffDialog(false);
    if (pausedForDropoffRef.current && statusRef.current === 'active') { startLocationWatch(); startEtaTimer(); }
    pausedForDropoffRef.current = false;
  };

  const handleDropoffConfirm = () => {
    stopEtaTimer(); stopLocationWatch(); pausedForDropoffRef.current = false;
    setTripStateSafe((prev) => ({ ...prev, status: 'completed', restStartTime: null }));
    statusRef.current = 'completed';
    setShowDropoffDialog(false);
  };

  const resetTrip = () => {
    stopEtaTimer(); stopLocationWatch();
    setTripStateSafe({ status: 'idle', startTime: null, restStartTime: null, totalRestTime: 0 });
    statusRef.current = 'idle';
    setSpeed(0); setEta('--:--'); setDemandValue(0); setTrackCoords([]);
  };

  const handleCancelOrder = () => {
    Alert.alert('Cancel Order', 'Are you sure you want to cancel this order? All order data will be cleared.', [
      { text: 'No', style: 'cancel' },
      {
        text: 'Yes, Cancel', style: 'destructive',
        onPress: () => {
          stopEtaTimer(); stopLocationWatch();
          setTripStateSafe({ status: 'idle', startTime: null, restStartTime: null, totalRestTime: 0 });
          statusRef.current = 'idle';
          setDistance(INITIAL_DISTANCE); setDemandValue(0); setTrackCoords([]);
          setRouteCoords([]); setOriginMarker(null); setDestMarker(null); setEta('--:--');
          setShowCancelButton(false);
          router.replace('/(tabs)/');
        },
      },
    ]);
  };

  /* ----------------------------- Render helpers ---------------------------- */
  const renderStars = (rating: number) =>
    Array.from({ length: 5 }, (_, i) => (
      <Star key={`star-${i}`} size={14} color={i < Math.floor(rating) ? '#F59E0B' : '#E5E7EB'} fill={i < Math.floor(rating) ? '#F59E0B' : '#E5E7EB'} />
    ));

  // Calculate car rotation - make sure it matches phone orientation
  const carImageRotation = norm360(carHeading + CAR_MARKER_HEADING_OFFSET);

  const totalWaitMs =
    tripState.totalRestTime +
    (tripState.status === 'resting' && tripState.restStartTime ? Date.now() - tripState.restStartTime : 0);
  const waitSecs = Math.max(0, Math.floor(totalWaitMs / 1000));
  const mmss = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  const tripDetails = {
    distance,
    duration: tripState.startTime ? `${Math.round((Date.now() - tripState.startTime) / 60000)} minutes` : '0 minutes',
    speed,
    totalCost: Math.round(fare),
    startTime: tripState.startTime
      ? new Date(tripState.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      : '--:--',
    endTime: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    pickupLocation: hasCompleteOrderData ? orderData.pickupLocation : 'Current Location',
    dropoffLocation: hasCompleteOrderData ? orderData.destination : 'Destination',
    customerName: hasCompleteOrderData ? orderData.customerName : undefined,
    customerPhone: hasCompleteOrderData ? orderData.customerPhone : undefined,
    orderId: hasCompleteOrderData ? orderData.orderId : undefined,
  };

  const distanceForDisplay = () => {
    if (tripState.status === 'idle') return orderData.distance || `${distance.toFixed(1)} km`;
    if (tripState.status === 'resting') {
      const d = waitSnapshotKm ?? distance;
      return `${d.toFixed(2)} km`;
    }
    return `${distance.toFixed(2)} km`;
  };

  /* ------------------------------- Render gate ----------------------------- */
  if (!canRender) {
    return (
      <SafeAreaView style={[styles.container, { alignItems: 'center', justifyContent: 'center' }]}>
        <ActivityIndicator size="large" />
        <Text style={{ marginTop: 8, color: '#6B7280' }}>Checking balance…</Text>
      </SafeAreaView>
    );
  }

  /* ---------------------------------- JSX ---------------------------------- */
  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        style={styles.scrollContainer}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Header */}
        <View style={styles.headerContainer}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => {
              if (statusRef.current === 'active' || statusRef.current === 'resting') {
                Alert.alert('Trip in Progress', 'You have an active trip. Are you sure you want to go back?', [
                  { text: 'Cancel', style: 'cancel' },
                  { text: 'Yes', onPress: () => router.back() },
                ]);
              } else {
                router.back();
              }
            }}
          >
            <ArrowLeft size={24} color="#1F2937" />
          </TouchableOpacity>

          <View style={styles.customerHeader}>
            {hasCompleteOrderData ? (
              <>
                <View style={styles.customerInfo}>
                  <View style={styles.customerNameRow}>
                    <Text style={styles.customerName}>{orderData.customerName}</Text>
                    <View style={styles.ratingContainer}>
                      <View style={styles.stars}>{renderStars(orderData.customerRating)}</View>
                      <Text style={styles.ratingText}>{orderData.customerRating}</Text>
                    </View>
                  </View>
                  <Text style={styles.customerPhone}>{orderData.customerPhone}</Text>
                  <Text style={styles.orderInfo}>Order #{orderData.orderId}</Text>
                </View>
                <TouchableOpacity style={styles.callButton} onPress={handleCallCustomer}>
                  <Phone size={20} color="white" />
                  <Text style={styles.callButtonText}>Call</Text>
                </TouchableOpacity>
              </>
            ) : (
              <View style={styles.customerInfo}>
                <Text style={styles.customerName}>Navigation</Text>
                <Text style={styles.customerPhone}>No active order</Text>
              </View>
            )}
          </View>
        </View>

        {/* Order Summary */}
        {hasCompleteOrderData && (
          <View style={styles.orderSummaryCard}>
            <View style={styles.routeInfo}>
              <View style={styles.routePoint}>
                <View style={[styles.routeDot, { backgroundColor: '#10B981' }]} />
                <Text style={styles.routeText} numberOfLines={1}>{orderData.pickupLocation}</Text>
              </View>
              <View style={styles.routePoint}>
                <View style={[styles.routeDot, { backgroundColor: '#EF4444' }]} />
                <Text style={styles.routeText} numberOfLines={1}>{orderData.destination}</Text>
              </View>
            </View>
            <View style={styles.orderMetrics}>
              <Text style={styles.metricText}>{distanceForDisplay()}</Text>
              <Text style={styles.metricText}>{orderData.estimatedDuration || eta}</Text>
              <Text style={[styles.metricText, styles.fareText]}>
                {orderData.fareAmount?.toLocaleString() || Math.round(fare).toLocaleString()} MMK
              </Text>
            </View>
          </View>
        )}

        {/* Map */}
        <View style={styles.mapContainer}>
          {Platform.OS === 'web' ? (
            <View style={styles.mapPlaceholder}>
              <MapPin size={48} color="#6B7280" />
              <Text style={styles.placeholderTitle}>Navigation Map</Text>
              <Text style={styles.placeholderText}>
                Interactive maps are not available on web platform.{'\n'}Use the mobile app for full navigation features.
              </Text>
            </View>
          ) : (
            <MapView
              key="nav-map"
              ref={(r) => { mapRef.current = r; }}
              provider={PROVIDER_GOOGLE}
              style={{ flex: 1, margin: 16, borderRadius: 12 }}
              initialRegion={region}
              showsUserLocation={false}
              loadingEnabled
              onMapLoaded={() => {
                try {
                  if (routeCoords.length && mapRef.current) {
                    mapRef.current.fitToCoordinates(routeCoords, { edgePadding: { top: 60, right: 60, bottom: 60, left: 60 }, animated: true });
                  } else if (currentCoord && mapRef.current) {
                    mapRef.current.animateCamera({ center: currentCoord }, { duration: 600 });
                  }
                } catch {}
              }}
            >
              {routeCoords.length > 0 && (
                <Polyline key={`route-${routeCoords.length}`} coordinates={routeCoords} strokeWidth={5} strokeColor="#3B82F6" />
              )}

              {trackCoords.length > 1 && (
                <Polyline key={`track-${trackCoords.length}`} coordinates={trackCoords} strokeWidth={5} strokeColor="#10B981" />
              )}

              {/* Animated vehicle marker - always show at current location */}
              {currentCoord && (
                <Marker.Animated
                  key="car-marker"
                  coordinate={carAnimCoord as unknown as LatLng}
                  anchor={{ x: 0.5, y: 1.0 }}
                  flat
                  rotation={carImageRotation}
                  tracksViewChanges={markerTracksViewChanges}
                  title="Your Location"
                >
                  <Image
                    source={carIcon}
                    style={styles.carMarkerImage}
                    resizeMode="contain"
                  />
                </Marker.Animated>
              )}

              {/* Fallback static marker for debugging */}
              {currentCoord && (
                <Marker
                  key="fallback-marker"
                  coordinate={currentCoord}
                  anchor={{ x: 0.5, y: 1.0 }}
                  rotation={carImageRotation}
                  title="Current Position (Static)"
                >
                  <Image
                    source={carIcon}
                    style={[
                      styles.carMarkerImage,
                      {
                        opacity: 0.7
                      }
                    ]}
                    resizeMode="contain"
                  />
                </Marker>
              )}

              {originMarker && <Marker key="pickup" coordinate={originMarker} title="Pickup" />}
              {destMarker && <Marker key="dest" coordinate={destMarker} title="Destination" />}
            </MapView>
          )}

          {/* Recenter */}
          {Platform.OS !== 'web' && (
            <TouchableOpacity
              onPress={centerOnUser}
              activeOpacity={0.9}
              style={[styles.locateBtn, { bottom: 28 + insets.bottom }]}
              accessibilityRole="button"
              accessibilityLabel="Recenter map on my location"
            >
              <LocateFixed size={22} color="#111827" />
            </TouchableOpacity>
          )}

          {/* Status */}
          <View style={styles.statusOverlay}>
            <View
              style={[
                styles.statusBadge,
                tripState.status === 'active' && styles.activeBadge,
                tripState.status === 'resting' && styles.restingBadge,
                tripState.status === 'completed' && styles.completedBadge,
              ]}
            >
              <Text style={styles.statusText}>
                {tripState.status === 'idle' && (isFetchingRoute ? 'Loading Route…' : 'Ready to Start')}
                {tripState.status === 'active' && 'Trip Active'}
                {tripState.status === 'resting' && 'Waiting'}
                {tripState.status === 'completed' && 'Completed'}
              </Text>
            </View>
          </View>
        </View>

        {/* Info Panel */}
        <Animated.View style={[styles.infoPanel, { paddingBottom: Math.max(20, insets.bottom + 10), opacity: buttonsOpacityAnim }]}>
          {/* Counters */}
          <View style={styles.countersContainer}>
            <View style={styles.counterItem}>
              <NavigationIcon size={20} color="#6B7280" />
              <Text style={styles.counterValue}>{distanceForDisplay().replace(' km', '')}</Text>
              <Text style={styles.counterLabel}>km</Text>
            </View>
            <View style={styles.counterItem}>
              <DollarSign size={20} color="#10B981" />
              <Text style={styles.counterValue}>{fare.toFixed(0)}</Text>
              <Text style={styles.counterLabel}>MMK</Text>
            </View>
            <View style={styles.counterItem}>
              <Zap size={20} color="#8B5CF6" />
              <Text style={styles.counterValue}>{Math.round(speed)}</Text>
              <Text style={styles.counterLabel}>km/h</Text>
            </View>
            <View style={styles.counterItem}>
              <TouchableOpacity style={styles.demandButton} onPress={() => setShowDemandModal(true)}>
                <Text style={styles.demandButtonText}>Demand</Text>
                {demandValue > 0 && <Text style={styles.demandValue}>+{demandValue}</Text>}
              </TouchableOpacity>
            </View>
          </View>

          {/* Controls */}
          <View style={styles.controlsContainer}>
            {tripState.status === 'idle' && (
              <View style={styles.idleControls}>
                <Animated.View style={{ transform: [{ scale: buttonScaleAnim }] }}>
                  <TouchableOpacity
                    style={styles.startButton}
                    onPress={startTrip}
                    disabled={(isFetchingRoute && hasCompleteOrderData) || Platform.OS === 'web'}
                  >
                    <Play size={24} color="white" />
                    <Text style={styles.startButtonText}>
                      {(isFetchingRoute && hasCompleteOrderData) ? 'Loading Route…' : 'Start Trip'}
                    </Text>
                  </TouchableOpacity>
                </Animated.View>

                {showCancelButton && (
                  <TouchableOpacity style={styles.cancelButton} onPress={handleCancelOrder}>
                    <X size={20} color="#EF4444" />
                    <Text style={styles.cancelButtonText}>Cancel Order</Text>
                  </TouchableOpacity>
                )}
              </View>
            )}

            {(tripState.status === 'active' || tripState.status === 'resting') && (
              <View style={styles.activeControls}>
                <View style={styles.waitCol}>
                  <TouchableOpacity
                    style={[
                      styles.controlButton,
                      styles.fullWidth,
                      styles.restButton,
                      tripState.status === 'resting' && styles.continueButton,
                    ]}
                    onPress={toggleRest}
                  >
                    {tripState.status === 'resting' ? (
                      <>
                        <Play size={20} color="white" />
                        <Text style={styles.controlButtonText}>Continue</Text>
                      </>
                    ) : (
                      <>
                        <Pause size={20} color="white" />
                        <Text style={styles.controlButtonText}>Wait</Text>
                      </>
                    )}
                  </TouchableOpacity>

                  {tripState.status === 'resting' && <Text style={styles.waitTimerText}>Wait: {mmss(waitSecs)}</Text>}
                </View>

                <TouchableOpacity style={[styles.controlButton, styles.dropOffButton, styles.flex1]} onPress={dropOff}>
                  <Square size={20} color="white" />
                  <Text style={styles.controlButtonText}>Drop Off</Text>
                </TouchableOpacity>
              </View>
            )}

            {tripState.status === 'completed' && (
              <View style={styles.completedControls}>
                <TouchableOpacity style={styles.resetButton} onPress={resetTrip}>
                  <NavigationIcon size={20} color="white" />
                  <Text style={styles.resetButtonText}>New Trip</Text>
                </TouchableOpacity>

                {showCancelButton && (
                  <TouchableOpacity style={styles.cancelButton} onPress={handleCancelOrder}>
                    <X size={20} color="#EF4444" />
                    <Text style={styles.cancelButtonText}>Cancel Order</Text>
                  </TouchableOpacity>
                )}
              </View>
            )}
          </View>
        </Animated.View>
      </ScrollView>

      {/* Modals */}
      <DropoffDialog
        visible={showDropoffDialog}
        onClose={handleDropoffClose}
        onConfirm={handleDropoffConfirm}
        tripDetails={tripDetails}
        driverName={driverName || 'Driver'}
        carNumber={carNumber}
        routeCoords={trackCoords}
        origin={originMarker}
        dest={destMarker}
      />
      <DemandModal
        visible={showDemandModal}
        onClose={() => setShowDemandModal(false)}
        onSelect={setDemandValue}
        baseFare={BASE_FARE}
        currentDistance={distance}
        fareRate={FARE_RATE}
        currentDemand={demandValue}
      />
    </SafeAreaView>
  );
}

/* ----------------------------------------------------------------------------
 * STYLES
 * --------------------------------------------------------------------------*/
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB' },
  scrollContainer: { flex: 1 },
  scrollContent: { flexGrow: 1 },

  headerContainer: { backgroundColor: 'white', borderBottomWidth: 1, borderBottomColor: '#E5E7EB' },
  backButton: {
    position: 'absolute',
    top: 16,
    left: 16,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
  },

  customerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 70,
    paddingVertical: 16,
  },
  customerInfo: { flex: 1 },
  customerNameRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  customerName: { fontSize: 18, fontWeight: '600', color: '#1F2937' },
  ratingContainer: { flexDirection: 'row', alignItems: 'center' },
  stars: { flexDirection: 'row', marginRight: 4 },
  ratingText: { fontSize: 14, color: '#6B7280', fontWeight: '500' },
  customerPhone: { fontSize: 14, color: '#6B7280', marginBottom: 2 },
  orderInfo: { fontSize: 12, color: '#9CA3AF' },

  callButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#10B981',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    gap: 6,
  },
  callButtonText: { color: 'white', fontSize: 14, fontWeight: '600' },

  orderSummaryCard: {
    backgroundColor: 'white',
    marginHorizontal: 16,
    marginVertical: 8,
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  routeInfo: { marginBottom: 12 },
  routePoint: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  routeDot: { width: 8, height: 8, borderRadius: 4, marginRight: 8 },
  routeText: { fontSize: 14, color: '#374151', flex: 1 },
  orderMetrics: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
  },
  metricText: { fontSize: 14, color: '#6B7280', fontWeight: '500' },
  fareText: { color: '#10B981', fontWeight: '600' },

  mapContainer: { height: height * 0.45, position: 'relative' },
  mapPlaceholder: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F3F4F6',
    margin: 16,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#E5E7EB',
    borderStyle: 'dashed',
  },
  placeholderTitle: { fontSize: 24, fontWeight: 'bold', color: '#374151', marginTop: 16, marginBottom: 8 },
  placeholderText: { fontSize: 16, color: '#6B7280', textAlign: 'center', lineHeight: 24, paddingHorizontal: 32 },

  statusOverlay: { position: 'absolute', top: 16, left: 16, right: 16, alignItems: 'center' },
  statusBadge: {
    backgroundColor: '#6B7280',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  activeBadge: { backgroundColor: '#10B981' },
  restingBadge: { backgroundColor: '#F59E0B' },
  completedBadge: { backgroundColor: '#3B82F6' },
  statusText: { color: 'white', fontSize: 14, fontWeight: '600' },

  locateBtn: {
    position: 'absolute',
    right: 28,
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'white',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
    elevation: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
  },

  infoPanel: {
    flex: 1,
    backgroundColor: 'white',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 100,
  },
  countersContainer: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 24 },
  counterItem: { alignItems: 'center', flex: 1 },
  counterValue: { fontSize: 20, fontWeight: 'bold', color: '#1F2937', marginVertical: 4 },
  counterLabel: { fontSize: 12, color: '#6B7280', fontWeight: '500' },

  controlsContainer: { paddingBottom: 20 },
  idleControls: { gap: 12 },
  completedControls: { gap: 12 },

  startButton: {
    backgroundColor: '#10B981',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    borderRadius: 16,
    shadowColor: '#10B981',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  startButtonText: { color: 'white', fontSize: 18, fontWeight: '600', marginLeft: 8 },

  cancelButton: {
    backgroundColor: 'white',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#EF4444',
    shadowColor: '#EF4444',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
    gap: 6,
  },
  cancelButtonText: { color: '#EF4444', fontSize: 16, fontWeight: '600' },

  activeControls: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  waitCol: { flex: 1 },
  controlButton: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  restButton: { backgroundColor: '#F59E0B' },
  continueButton: { backgroundColor: '#10B981' },
  dropOffButton: { backgroundColor: '#EF4444' },
  controlButtonText: { color: 'white', fontSize: 16, fontWeight: '600', marginLeft: 6 },

  resetButton: {
    backgroundColor: '#3B82F6',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    borderRadius: 16,
    shadowColor: '#3B82F6',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  resetButtonText: { color: 'white', fontSize: 18, fontWeight: '600', marginLeft: 8 },

  demandButton: {
    backgroundColor: '#8B5CF6',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 80,
    shadowColor: '#8B5CF6',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 3,
  },
  demandButtonText: { color: 'white', fontSize: 14, fontWeight: '600' },
  demandValue: { color: '#FEF3C7', fontSize: 12, fontWeight: '700', marginTop: 2 },

  fullWidth: { width: '100%' },
  flex1: { flex: 1 },

  waitTimerText: { marginTop: 6, fontSize: 12, fontWeight: '600', color: '#6B7280', textAlign: 'center' },

  // Car marker styles
  carMarkerContainer: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#3B82F6',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: 'white',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 8,
  },
  carMarkerImage: {
    width: 40,
    height: 40,
  },
});
