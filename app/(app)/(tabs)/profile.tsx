import { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, Switch, ScrollView, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '@/hooks/useAuth';
import { UNIT_KEY } from '@/constants';

export default function ProfileScreen() {
  const { user, signOut } = useAuth();
  const [useLbs, setUseLbs] = useState(true);

  useEffect(() => {
    AsyncStorage.getItem(UNIT_KEY)
      .then(val => { if (val !== null) setUseLbs(val === 'lbs'); })
      .catch(() => {});
  }, []);

  const toggleUnit = async (value: boolean) => {
    setUseLbs(value);
    await AsyncStorage.setItem(UNIT_KEY, value ? 'lbs' : 'kg').catch(() => {});
  };

  const fullName: string = user?.user_metadata?.full_name ?? '';
  const email = user?.email ?? '';
  const initials = fullName
    .split(' ')
    .map((n: string) => n[0] ?? '')
    .join('')
    .toUpperCase()
    .slice(0, 2) || '?';

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top']}>
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
      >
        <View className="px-6 pt-4 pb-8">
          <Text className="text-white text-2xl font-bold tracking-tight mb-8">Profile</Text>

          {/* Avatar */}
          <View className="items-center mb-8">
            <View className="w-20 h-20 rounded-full bg-primary items-center justify-center mb-3">
              <Text className="text-white text-2xl font-bold">{initials}</Text>
            </View>
            <Text className="text-white text-xl font-bold">{fullName || 'Athlete'}</Text>
            {email ? <Text className="text-muted text-sm mt-1">{email}</Text> : null}
          </View>

          {/* Preferences */}
          <Text className="text-muted text-xs font-semibold uppercase tracking-widest mb-3 ml-1">
            Preferences
          </Text>
          <View className="bg-card border border-border rounded-2xl overflow-hidden mb-6">
            <View className="flex-row items-center justify-between px-5 py-4">
              <View>
                <Text className="text-white font-medium">Weight Unit</Text>
                <Text className="text-muted text-xs mt-0.5">Used when logging sets</Text>
              </View>
              <View className="flex-row items-center" style={{ gap: 8 }}>
                <Text className={`text-sm font-medium ${!useLbs ? 'text-white' : 'text-muted'}`}>
                  kg
                </Text>
                <Switch
                  value={useLbs}
                  onValueChange={toggleUnit}
                  trackColor={{ false: '#2c2c2e', true: '#6366f1' }}
                  thumbColor="#fff"
                />
                <Text className={`text-sm font-medium ${useLbs ? 'text-white' : 'text-muted'}`}>
                  lbs
                </Text>
              </View>
            </View>
          </View>

          {/* Account */}
          <Text className="text-muted text-xs font-semibold uppercase tracking-widest mb-3 ml-1">
            Account
          </Text>
          <TouchableOpacity
            className="bg-card border border-border rounded-2xl px-5 py-4"
            onPress={() =>
              Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Sign Out', style: 'destructive', onPress: signOut },
              ])
            }
            activeOpacity={0.7}
          >
            <Text className="text-danger font-medium text-center">Sign Out</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
