import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Switch,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { 
  Bell, 
  Shield, 
  Globe, 
  Moon, 
  Volume2, 
  MapPin, 
  CreditCard, 
  CircleHelp as HelpCircle, 
  FileText, 
  LogOut, 
  ChevronRight, 
  Smartphone, 
  Car, 
  Users, 
  User,
  Navigation,
  DollarSign,
  Clock,
  Headphones
} from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { useLanguage } from '@/contexts/LanguageContext';
import { clearTokens, clearUser } from '../lib/auth';


interface SettingItem {
  id: string;
  title: string;
  subtitle?: string;
  icon: any;
  type: 'toggle' | 'navigation' | 'action';
  value?: boolean;
  onPress?: () => void;
  onToggle?: (value: boolean) => void;
}

export default function SettingsScreen() {
  const { language, setLanguage, t } = useLanguage();
  const [notifications, setNotifications] = useState(true);
  const [driverModeNotifications, setDriverModeNotifications] = useState(true);
  const [orderAlerts, setOrderAlerts] = useState(true);
  const [locationServices, setLocationServices] = useState(true);
  const [autoAcceptOrders, setAutoAcceptOrders] = useState(false);
  const [darkMode, setDarkMode] = useState(false);
  const [soundEffects, setSoundEffects] = useState(true);
  const [voiceAlerts, setVoiceAlerts] = useState(true);
  const [offlineMode, setOfflineMode] = useState(false);

  const router = useRouter();

  const handleLanguageChange = async () => {
    const newLanguage = language === 'en' ? 'my' : 'en';
    await setLanguage(newLanguage);
  };

  const handleProfilePress = () => {
    router.push('/profile');
  };

const handleLogout = () => {
  Alert.alert(
    'Logout',
    'Are you sure you want to logout?',
    [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Logout',
        style: 'destructive',
        onPress: async () => {
          try {
            // Clear all authentication data
            await clearTokens();
            await clearUser();
            
            console.log('User logged out successfully');
          } catch (error) {
            console.error('Error during logout:', error);
          } finally {
            // Navigate back to login screen
            router.replace('/auth/login');
          }
        },
      },
    ]
  );
};




  const settingSections = [
    // {
    //   title: 'Driver Notifications',
    //   items: [
    //     {
    //       id: 'driver_notifications',
    //       title: 'Driver Mode Notifications',
    //       subtitle: 'Receive notifications when in driver mode',
    //       icon: Bell,
    //       type: 'toggle' as const,
    //       value: driverModeNotifications,
    //       onToggle: setDriverModeNotifications,
    //     },
    //     {
    //       id: 'order_alerts',
    //       title: 'New Order Alerts',
    //       subtitle: 'Get notified when new orders are available',
    //       icon: Bell,
    //       type: 'toggle' as const,
    //       value: orderAlerts,
    //       onToggle: setOrderAlerts,
    //     },
    //     {
    //       id: 'voice_alerts',
    //       title: 'Voice Alerts',
    //       subtitle: 'Hear audio notifications for orders',
    //       icon: Headphones,
    //       type: 'toggle' as const,
    //       value: voiceAlerts,
    //       onToggle: setVoiceAlerts,
    //     },
    //   ],
    // },
    // {
    //   title: 'Driver Operations',
    //   items: [
    //     {
    //       id: 'auto_accept_orders',
    //       title: 'Auto Accept Orders',
    //       subtitle: 'Automatically accept orders matching your preferences',
    //       icon: Car,
    //       type: 'toggle' as const,
    //       value: autoAcceptOrders,
    //       onToggle: setAutoAcceptOrders,
    //     },
    //     {
    //       id: 'offline_mode',
    //       title: 'Offline Mode',
    //       subtitle: 'Stop receiving new orders',
    //       icon: Clock,
    //       type: 'toggle' as const,
    //       value: offlineMode,
    //       onToggle: setOfflineMode,
    //     },
    //     {
    //       id: 'driver_preferences',
    //       title: 'Driver Preferences',
    //       subtitle: 'Set your driving preferences and zones',
    //       icon: Navigation,
    //       type: 'navigation' as const,
    //       onPress: () => Alert.alert('Driver Preferences', 'Driver preferences coming soon'),
    //     },
    //   ],
    // },
    {
      title: 'App Preferences',
      items: [
        {
          id: 'location_services',
          title: 'Location Services',
          subtitle: 'Allow app to access your location for navigation',
          icon: MapPin,
          type: 'toggle' as const,
          value: locationServices,
          onToggle: setLocationServices,
        },
        {
          id: 'language',
          title: 'Language',
          subtitle: language === 'en' ? 'English (Myanmar available)' : 'မြန်မာ (English available)',
          icon: Globe,
          type: 'navigation' as const,
          onPress: handleLanguageChange,
        },
        {
          id: 'sound_effects',
          title: 'Sound Effects',
          subtitle: 'Play sounds for app interactions',
          icon: Volume2,
          type: 'toggle' as const,
          value: soundEffects,
          onToggle: setSoundEffects,
        },
        {
          id: 'dark_mode',
          title: 'Dark Mode',
          subtitle: 'Use dark theme for the app',
          icon: Moon,
          type: 'toggle' as const,
          value: darkMode,
          onToggle: setDarkMode,
        },
      ],
    },
    {
      title: 'Support & Legal',
      items: [
        {
          id: 'help_support',
          title: 'Help & Support',
          subtitle: 'Get help and contact support',
          icon: HelpCircle,
          type: 'navigation' as const,
          onPress: () => Alert.alert('Help & Support', 'Help & Support coming soon'),
        },
        {
          id: 'terms_privacy',
          title: 'Terms & Privacy',
          subtitle: 'Read our terms and privacy policy',
          icon: FileText,
          type: 'navigation' as const,
          onPress: () => Alert.alert('Terms & Privacy', 'Terms & Privacy coming soon'),
        },
      ],
    },
  ];

  const renderSettingItem = (item: SettingItem) => {
    return (
      <TouchableOpacity
        key={item.id}
        style={styles.settingItem}
        onPress={item.onPress}
        disabled={item.type === 'toggle'}
      >
        <View style={styles.settingLeft}>
          <View style={styles.settingIcon}>
            <item.icon size={20} color="#6B7280" />
          </View>
          <View style={styles.settingContent}>
            <Text style={styles.settingTitle}>{item.title}</Text>
            {item.subtitle && (
              <Text style={styles.settingSubtitle}>{item.subtitle}</Text>
            )}
          </View>
        </View>
        
        <View style={styles.settingRight}>
          {item.type === 'toggle' ? (
            <Switch
              value={item.value}
              onValueChange={item.onToggle}
              trackColor={{ false: '#E5E7EB', true: '#3B82F6' }}
              thumbColor={item.value ? '#FFFFFF' : '#FFFFFF'}
            />
          ) : (
            <ChevronRight size={20} color="#9CA3AF" />
          )}
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerContent}>
          <Text style={styles.headerTitle}>Driver Settings</Text>
          <TouchableOpacity style={styles.profileButton} onPress={handleProfilePress}>
            <User size={24} color="#3B82F6" />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {settingSections.map((section, sectionIndex) => (
          <View key={sectionIndex} style={styles.section}>
            <Text style={styles.sectionTitle}>{section.title}</Text>
            <View style={styles.sectionContent}>
              {section.items.map(renderSettingItem)}
            </View>
          </View>
        ))}

        {/* Logout Button */}
        <View style={styles.section}>
          <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
            <View style={styles.logoutIcon}>
              <LogOut size={20} color="#EF4444" />
            </View>
            <Text style={styles.logoutText}>Logout</Text>
          </TouchableOpacity>
        </View>

        {/* App Version */}
        <View style={styles.appVersion}>
          <Text style={styles.versionText}>White Heart Driver v1.0.0</Text>
          <Text style={styles.buildText}>Build 2024.01.01</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  header: {
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  headerContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#1F2937',
  },
  profileButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#EBF4FF',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 12,
    marginLeft: 4,
  },
  sectionContent: {
    backgroundColor: 'white',
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 1,
  },
  settingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  settingLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  settingIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  settingContent: {
    flex: 1,
  },
  settingTitle: {
    fontSize: 16,
    fontWeight: '500',
    color: '#1F2937',
    marginBottom: 2,
  },
  settingSubtitle: {
    fontSize: 14,
    color: '#6B7280',
  },
  settingRight: {
    marginLeft: 12,
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'white',
    padding: 16,
    borderRadius: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 1,
  },
  logoutIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#FEF2F2',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  logoutText: {
    fontSize: 16,
    fontWeight: '500',
    color: '#EF4444',
  },
  appVersion: {
    alignItems: 'center',
    paddingVertical: 32,
  },
  versionText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#6B7280',
    marginBottom: 4,
  },
  buildText: {
    fontSize: 12,
    color: '#9CA3AF',
  },
});