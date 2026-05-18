import { useState, useEffect, useCallback } from 'react';
import { View, Text, TouchableOpacity, Switch, ScrollView, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';
import { UNIT_KEY } from '@/constants';

function calcLongestStreak(startedAts: string[]): number {
  const sorted = [...new Set(startedAts.map(d => new Date(d).toDateString()))]
    .map(d => new Date(d))
    .sort((a, b) => a.getTime() - b.getTime());
  if (sorted.length === 0) return 0;
  let longest = 1;
  let current = 1;
  for (let i = 1; i < sorted.length; i++) {
    const diffDays = Math.round((sorted[i].getTime() - sorted[i - 1].getTime()) / 86400000);
    if (diffDays === 1) { current++; longest = Math.max(longest, current); }
    else { current = 1; }
  }
  return longest;
}

function formatVolume(kg: number, useLbs: boolean): string {
  const val = useLbs ? Math.round(kg * 2.20462) : Math.round(kg);
  if (val >= 1_000_000) return `${(val / 1_000_000).toFixed(1)}M`;
  if (val >= 1_000) return `${Math.round(val / 1_000)}K`;
  return val.toLocaleString();
}

export default function ProfileScreen() {
  const { user, signOut } = useAuth();
  const [useLbs, setUseLbs] = useState(true);

  const [totalWorkouts, setTotalWorkouts] = useState(0);
  const [totalVolumeKg, setTotalVolumeKg] = useState(0);
  const [longestStreak, setLongestStreak] = useState(0);
  const [topMuscle, setTopMuscle] = useState<string | null>(null);

  useEffect(() => {
    AsyncStorage.getItem(UNIT_KEY)
      .then(val => { if (val !== null) setUseLbs(val === 'lbs'); })
      .catch(() => {});
  }, []);

  const fetchStats = useCallback(async () => {
    if (!user) return;

    const { data } = await supabase
      .from('workouts')
      .select('started_at, workout_sets(weight_kg, reps, exercises(muscle_group))')
      .eq('user_id', user.id)
      .not('finished_at', 'is', null);

    if (!data) return;

    setTotalWorkouts(data.length);

    let vol = 0;
    const muscleCounts: Record<string, number> = {};

    for (const workout of data) {
      const sets = workout.workout_sets as Array<{
        weight_kg: number | null;
        reps: number | null;
        exercises: { muscle_group: string | null } | null;
      }>;
      for (const set of sets) {
        if (set.weight_kg != null && set.reps != null) vol += set.weight_kg * set.reps;
        const mg = set.exercises?.muscle_group;
        if (mg) muscleCounts[mg] = (muscleCounts[mg] ?? 0) + 1;
      }
    }

    setTotalVolumeKg(vol);
    const top = Object.entries(muscleCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
    setTopMuscle(top);
    setLongestStreak(calcLongestStreak(data.map(w => w.started_at)));
  }, [user]);

  useFocusEffect(useCallback(() => { fetchStats(); }, [fetchStats]));

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

          {/* Lifetime Stats */}
          <Text className="text-muted text-xs font-semibold uppercase tracking-widest mb-3 ml-1">
            Lifetime Stats
          </Text>
          <View className="flex-row gap-x-3 mb-3">
            <View className="flex-1 bg-card border border-border rounded-2xl px-4 py-4">
              <Text className="text-white text-xl font-bold">{totalWorkouts}</Text>
              <Text className="text-muted text-xs mt-1">Workouts</Text>
            </View>
            <View className="flex-1 bg-card border border-border rounded-2xl px-4 py-4">
              <Text className="text-white text-xl font-bold" numberOfLines={1}>
                {formatVolume(totalVolumeKg, useLbs)}
              </Text>
              <Text className="text-muted text-xs mt-1">Volume ({useLbs ? 'lbs' : 'kg'})</Text>
            </View>
          </View>
          <View className="flex-row gap-x-3 mb-8">
            <View className="flex-1 bg-card border border-border rounded-2xl px-4 py-4">
              <Text className="text-white text-xl font-bold">{longestStreak}</Text>
              <Text className="text-muted text-xs mt-1">Best Streak</Text>
            </View>
            <View className="flex-1 bg-card border border-border rounded-2xl px-4 py-4">
              <Text className="text-white text-xl font-bold" numberOfLines={1}>
                {topMuscle ?? '—'}
              </Text>
              <Text className="text-muted text-xs mt-1">Top Muscle</Text>
            </View>
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
