import React, { useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  TouchableWithoutFeedback,
  Animated,
  Dimensions,
  Platform,
} from 'react-native';
import { X, CheckCircle } from 'lucide-react-native';
import MapView, { Polyline, Marker, PROVIDER_GOOGLE, LatLng } from 'react-native-maps';

const { height } = Dimensions.get('window');

interface TripDetails {
  distance: number;      // km
  duration: string;      // "23 minutes"
  totalCost: number;     // MMK
  startTime: string;     // "14:03"
  endTime: string;       // "14:42"
}

interface DropoffDialogProps {
  visible: boolean;
  onClose: () => void;
  onConfirm: () => void;

  tripDetails: TripDetails;

  driverName: string;
  carNumber?: string;

  routeCoords?: LatLng[];
  origin?: LatLng | null;
  dest?: LatLng | null;
}

export default function DropoffDialog({
  visible,
  onClose,
  onConfirm,
  tripDetails,
  driverName,
  carNumber,
  routeCoords = [],
  origin = null,
  dest = null,
}: DropoffDialogProps) {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.9)).current;

  const mapRef = useRef<MapView | null>(null);

  // fallback markers if not provided
  const startMarker = origin ?? (routeCoords.length > 0 ? routeCoords[0] : null);
  const endMarker = dest ?? (routeCoords.length > 1 ? routeCoords[routeCoords.length - 1] : null);

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.timing(fadeAnim, { toValue: 1, duration: 220, useNativeDriver: true }),
        Animated.spring(scaleAnim, { toValue: 1, useNativeDriver: true }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(fadeAnim, { toValue: 0, duration: 160, useNativeDriver: true }),
        Animated.timing(scaleAnim, { toValue: 0.9, duration: 160, useNativeDriver: true }),
      ]).start();
    }
  }, [visible]);

  const handleConfirm = () => {
    onConfirm();
    onClose();
  };

  const formatCurrency = (amount: number) => `${amount.toLocaleString()} MMK`;

  const fitMapToRoute = useCallback(() => {
    if (!mapRef.current || routeCoords.length < 2) return;
    try {
      mapRef.current.fitToCoordinates(routeCoords, {
        edgePadding: { top: 32, right: 32, bottom: 32, left: 32 },
        animated: false,
      });
    } catch {}
  }, [routeCoords]);

  // Fit once the modal becomes visible and whenever route changes
  useEffect(() => {
    if (!visible) return;
    const id = setTimeout(fitMapToRoute, 100); // slight delay to ensure layout ready
    return () => clearTimeout(id);
  }, [visible, routeCoords, fitMapToRoute]);

  // Center to a reasonable initial region (will be overridden by fit)
  const midRegion =
    routeCoords.length > 0
      ? {
          latitude: routeCoords[Math.floor(routeCoords.length / 2)].latitude,
          longitude: routeCoords[Math.floor(routeCoords.length / 2)].longitude,
          latitudeDelta: 0.05,
          longitudeDelta: 0.05,
        }
      : undefined;

  return (
    <Modal visible={visible} transparent animationType="none" statusBarTranslucent onRequestClose={onClose}>
      <TouchableWithoutFeedback onPress={onClose}>
        <Animated.View style={[styles.overlay, { opacity: fadeAnim }]}>
          <TouchableWithoutFeedback onPress={() => {}}>
            <Animated.View style={[styles.dialogContainer, { transform: [{ scale: scaleAnim }] }]}>
              {/* Header */}
              <View style={styles.header}>
                <View style={styles.headerIcon}>
                  <CheckCircle size={28} color="#10B981" />
                </View>
                <Text style={styles.headerTitle}>Complete Trip</Text>
                <TouchableOpacity style={styles.closeButton} onPress={onClose}>
                  <X size={24} color="#6B7280" />
                </TouchableOpacity>
              </View>

              {/* TOP rows */}
              <View style={styles.topBox}>
                {/* Driver + Car */}
                <View style={styles.topRow}>
                  <Text style={styles.topLabel}>Driver</Text>
                  <Text style={styles.topValue}>
                    {driverName}
                    {carNumber ? `  •  ${carNumber}` : ''}
                  </Text>
                </View>

                {/* Fare + Distance */}
                <View style={[styles.topRow, styles.twoCols]}>
                  <View style={styles.col}>
                    <Text style={styles.topLabel}>Fare</Text>
                    <Text style={[styles.topValue, styles.fareValue]}>{formatCurrency(tripDetails.totalCost)}</Text>
                  </View>
                  <View style={styles.col}>
                    <Text style={styles.topLabel}>Total Distance</Text>
                    <Text style={styles.topValue}>{tripDetails.distance.toFixed(2)} km</Text>
                  </View>
                </View>

                {/* Time + Duration */}
                <View style={[styles.topRow, styles.twoCols]}>
                  <View style={styles.col}>
                    <Text style={styles.topLabel}>Trip Time</Text>
                    <Text style={styles.topValue}>
                      {tripDetails.startTime} - {tripDetails.endTime}
                    </Text>
                  </View>
                  <View style={styles.col}>
                    <Text style={styles.topLabel}>Trip Duration</Text>
                    <Text style={styles.topValue}>{tripDetails.duration}</Text>
                  </View>
                </View>
              </View>

              {/* MAP */}
              <View style={styles.mapWrap} onLayout={fitMapToRoute}>
                {Platform.OS !== 'web' && routeCoords.length > 1 && midRegion ? (
                  <MapView
                    ref={mapRef}
                    provider={PROVIDER_GOOGLE}
                    style={styles.map}
                    initialRegion={midRegion}
                    onMapReady={fitMapToRoute}
                    toolbarEnabled={false}
                    rotateEnabled={false}
                    pitchEnabled={false}
                    zoomControlEnabled={false}
                    pointerEvents="none"
                  >
                    <Polyline coordinates={routeCoords} strokeWidth={5} strokeColor="#10B981" />
                    {startMarker && <Marker coordinate={startMarker} title="Start" />}
                    {endMarker && <Marker coordinate={endMarker} title="End" />}
                  </MapView>
                ) : (
                  <View style={styles.mapFallback}>
                    <Text style={styles.mapFallbackText}>
                      {routeCoords.length > 1 ? 'Route preview unavailable on web.' : 'No route data to display.'}
                    </Text>
                  </View>
                )}
              </View>

              {/* Actions */}
              <View style={styles.actionButtons}>
                <TouchableOpacity style={styles.cancelButton} onPress={onClose}>
                  <Text style={styles.cancelButtonText}>Back</Text>
                </TouchableOpacity>

                <TouchableOpacity style={styles.confirmButton} onPress={handleConfirm}>
                  <CheckCircle size={20} color="white" />
                  <Text style={styles.confirmButtonText}>Complete Trip</Text>
                </TouchableOpacity>
              </View>
            </Animated.View>
          </TouchableWithoutFeedback>
        </Animated.View>
      </TouchableWithoutFeedback>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center', paddingHorizontal: 20 },
  dialogContainer: { backgroundColor: 'white', borderRadius: 24, width: '100%', maxWidth: 420, maxHeight: height * 0.86, overflow: 'hidden' },

  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 24, paddingTop: 24, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
  headerIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#D1FAE5', alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  headerTitle: { flex: 1, fontSize: 20, fontWeight: '700', color: '#1F2937' },
  closeButton: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#F3F4F6', alignItems: 'center', justifyContent: 'center' },

  topBox: { paddingHorizontal: 24, paddingTop: 18, paddingBottom: 10, backgroundColor: '#F8FAFC' },
  topRow: { marginBottom: 12 },
  twoCols: { flexDirection: 'row', gap: 16 },
  col: { flex: 1 },
  topLabel: { fontSize: 12, color: '#6B7280', fontWeight: '600', marginBottom: 4 },
  topValue: { fontSize: 16, color: '#111827', fontWeight: '700' },
  fareValue: { color: '#10B981' },

  mapWrap: { height: 200, marginHorizontal: 24, marginTop: 14, borderRadius: 12, overflow: 'hidden', backgroundColor: '#F3F4F6' },
  map: { flex: 1 },
  mapFallback: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  mapFallbackText: { color: '#6B7280' },

  actionButtons: { flexDirection: 'row', paddingHorizontal: 24, paddingBottom: 24, paddingTop: 16, gap: 12 },
  cancelButton: { flex: 1, paddingVertical: 16, borderRadius: 16, backgroundColor: '#F3F4F6', alignItems: 'center', justifyContent: 'center' },
  cancelButtonText: { fontSize: 16, fontWeight: '600', color: '#6B7280' },
  confirmButton: { flex: 2, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 16, borderRadius: 16, backgroundColor: '#10B981', gap: 8 },
  confirmButtonText: { fontSize: 16, fontWeight: '600', color: 'white' },
});
