import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Platform,
  Alert,
  ActivityIndicator,
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ArrowLeft, MapPin, Navigation, ExternalLink, Share2 } from 'lucide-react-native';
import MapView, { Marker, PROVIDER_GOOGLE, LatLng } from 'react-native-maps';
import * as Location from 'expo-location';

export default function LocationViewerScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  
  const [isLoading, setIsLoading] = useState(true);
  const [userLocation, setUserLocation] = useState<LatLng | null>(null);
  const mapRef = useRef<MapView | null>(null);

  const latitude = parseFloat(Array.isArray(params.latitude) ? params.latitude[0] : params.latitude || '0');
  const longitude = parseFloat(Array.isArray(params.longitude) ? params.longitude[0] : params.longitude || '0');
  const address = Array.isArray(params.address) ? params.address[0] : (params.address || 'Shared Location');

  const targetLocation: LatLng = { latitude, longitude };

  // Get user's current location
  useEffect(() => {
    getCurrentLocation();
  }, []);

  const getCurrentLocation = async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === 'granted') {
        const location = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        setUserLocation({
          latitude: location.coords.latitude,
          longitude: location.coords.longitude,
        });
      }
    } catch (error) {
      console.error('Failed to get current location:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // Fit map to show both locations
  const fitMapToLocations = () => {
    if (!mapRef.current) return;

    const locations = userLocation 
      ? [targetLocation, userLocation]
      : [targetLocation];

    mapRef.current.fitToCoordinates(locations, {
      edgePadding: { top: 100, right: 50, bottom: 100, left: 50 },
      animated: true,
    });
  };

  // Open in external maps app
  const openInExternalMaps = async () => {
    try {
      const label = encodeURIComponent(address || 'Shared Location');
      
      // Google Maps URL (works on both iOS and Android)
      const googleMapsUrl = `https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}&query_place_id=${label}`;
      
      // Apple Maps URL (iOS only)
      const appleMapsUrl = `http://maps.apple.com/?q=${label}&ll=${latitude},${longitude}`;
      
      // Try to open in native maps app first, fallback to Google Maps
      if (Platform.OS === 'ios') {
        const canOpenApple = await Linking.canOpenURL(appleMapsUrl);
        if (canOpenApple) {
          await Linking.openURL(appleMapsUrl);
          return;
        }
      }
      
      const canOpenGoogle = await Linking.canOpenURL(googleMapsUrl);
      if (canOpenGoogle) {
        await Linking.openURL(googleMapsUrl);
      } else {
        Alert.alert('Error', 'No maps application found on this device');
      }
    } catch (error: any) {
      console.error('Failed to open external maps:', error);
      Alert.alert('Error', 'Failed to open location in maps');
    }
  };

  // Get navigation directions
  const getDirections = async () => {
    if (!userLocation) {
      Alert.alert('Location Required', 'Please enable location services to get directions.');
      return;
    }

    try {
      const directionsUrl = Platform.OS === 'ios'
        ? `http://maps.apple.com/?daddr=${latitude},${longitude}&saddr=${userLocation.latitude},${userLocation.longitude}`
        : `https://www.google.com/maps/dir/${userLocation.latitude},${userLocation.longitude}/${latitude},${longitude}`;

      const canOpen = await Linking.canOpenURL(directionsUrl);
      if (canOpen) {
        await Linking.openURL(directionsUrl);
      } else {
        Alert.alert('Error', 'Could not open directions');
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to get directions');
    }
  };

  // Share location
  const shareLocation = async () => {
    try {
      const { Share } = await import('react-native');
      const message = `📍 ${address}\n\nLocation: ${latitude}, ${longitude}\nView on map: https://maps.google.com/?q=${latitude},${longitude}`;
      
      await Share.share({
        message,
        title: 'Shared Location',
      });
    } catch (error) {
      console.error('Failed to share location:', error);
    }
  };

  if (isNaN(latitude) || isNaN(longitude)) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <ArrowLeft size={24} color="#111827" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Invalid Location</Text>
        </View>
        <View style={styles.errorContainer}>
          <MapPin size={48} color="#EF4444" />
          <Text style={styles.errorText}>Invalid location coordinates</Text>
          <TouchableOpacity onPress={() => router.back()} style={styles.errorButton}>
            <Text style={styles.errorButtonText}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <ArrowLeft size={24} color="#111827" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Location</Text>
        <TouchableOpacity onPress={shareLocation} style={styles.shareButton}>
          <Share2 size={20} color="#6B7280" />
        </TouchableOpacity>
      </View>

      {/* Location Details Card */}
      <View style={styles.locationCard}>
        <View style={styles.locationHeader}>
          <MapPin size={24} color="#3B82F6" />
          <Text style={styles.locationTitle}>{address}</Text>
        </View>
        <Text style={styles.coordinates}>
          {latitude.toFixed(6)}, {longitude.toFixed(6)}
        </Text>
      </View>

      {/* Map Container */}
      <View style={styles.mapContainer}>
        {Platform.OS === 'web' ? (
          <View style={styles.mapPlaceholder}>
            <MapPin size={48} color="#6B7280" />
            <Text style={styles.placeholderTitle}>Location Map</Text>
            <Text style={styles.placeholderText}>
              Interactive maps are not available on web platform.{'\n'}
              Use the mobile app for full map features.
            </Text>
          </View>
        ) : (
          <>
            {isLoading && (
              <View style={styles.loadingOverlay}>
                <ActivityIndicator size="large" color="#3B82F6" />
                <Text style={styles.loadingText}>Loading map...</Text>
              </View>
            )}
            <MapView
              ref={mapRef}
              provider={PROVIDER_GOOGLE}
              style={styles.map}
              initialRegion={{
                latitude,
                longitude,
                latitudeDelta: 0.01,
                longitudeDelta: 0.01,
              }}
              onMapReady={fitMapToLocations}
              showsUserLocation={true}
              showsMyLocationButton={false}
              toolbarEnabled={false}
            >
              {/* Target location marker */}
              <Marker
                coordinate={targetLocation}
                title={address}
                description={`${latitude.toFixed(6)}, ${longitude.toFixed(6)}`}
                pinColor="#3B82F6"
              />
            </MapView>
          </>
        )}
      </View>

      {/* Action Buttons */}
      <View style={styles.actionContainer}>
        <TouchableOpacity onPress={getDirections} style={styles.directionsButton}>
          <Navigation size={20} color="white" />
          <Text style={styles.directionsButtonText}>Get Directions</Text>
        </TouchableOpacity>
        
        <TouchableOpacity onPress={openInExternalMaps} style={styles.externalButton}>
          <ExternalLink size={20} color="#6B7280" />
          <Text style={styles.externalButtonText}>Open in Maps</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: 'white',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  backButton: {
    padding: 8,
    borderRadius: 20,
    backgroundColor: '#F3F4F6',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
    flex: 1,
    textAlign: 'center',
    marginHorizontal: 16,
  },
  shareButton: {
    padding: 8,
    borderRadius: 20,
    backgroundColor: '#F3F4F6',
  },
  locationCard: {
    backgroundColor: 'white',
    margin: 16,
    padding: 16,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  locationHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  locationTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    marginLeft: 12,
    flex: 1,
  },
  coordinates: {
    fontSize: 14,
    color: '#6B7280',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    marginLeft: 36,
  },
  mapContainer: {
    flex: 1,
    margin: 16,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#F3F4F6',
    position: 'relative',
  },
  map: {
    flex: 1,
  },
  mapPlaceholder: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F3F4F6',
    borderWidth: 2,
    borderColor: '#E5E7EB',
    borderStyle: 'dashed',
  },
  placeholderTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#374151',
    marginTop: 16,
    marginBottom: 8,
  },
  placeholderText: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 20,
    paddingHorizontal: 32,
  },
  loadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: '#6B7280',
  },
  actionContainer: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingBottom: 16,
    gap: 12,
  },
  directionsButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#3B82F6',
    paddingVertical: 14,
    borderRadius: 12,
    gap: 8,
    shadowColor: '#3B82F6',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 3,
  },
  directionsButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  externalButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'white',
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    gap: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 1,
  },
  externalButtonText: {
    color: '#6B7280',
    fontSize: 16,
    fontWeight: '600',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  errorText: {
    fontSize: 16,
    color: '#6B7280',
    textAlign: 'center',
    marginTop: 16,
    marginBottom: 24,
  },
  errorButton: {
    backgroundColor: '#3B82F6',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  errorButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
});