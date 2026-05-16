import { useState, useEffect, useCallback } from 'react';
import { View, Text, TouchableOpacity, ScrollView, RefreshControl } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';

interface Workout {
  id: string;
  name: string;
  started_at: string;
  finished_at: string | null;
}

interface WeekStats {
  workouts: number;
  sets: number;
  volumeKg: number;
}

function formatDuration(start: string, end: string | null): string {
  if (!end) return 'In progress';
  const mins = Math.round((new Date(end).getTime() - new Date(start).getTime()) / 60000);
  if (mins < 60) return `${mins}m`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  if (date.toDateString() === today.toDateString()) return 'Today';
  if (date.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

export default function DashboardScreen() {
  const { user, signOut } = useAuth();
  const router = useRouter();

  const [workouts, setWorkouts] = useState<Workout[]>([]);
  const [stats, setStats] = useState<WeekStats>({ workouts: 0, sets: 0, volumeKg: 0 });
  const [refreshing, setRefreshing] = useState(false);

  const firstName = user?.user_metadata?.full_name?.split(' ')[0] ?? 'Athlete';

  const fetchData = useCallback(async () => {
    if (!user) return;

    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);

    // Fetch recent workouts
    const { data: workoutsData } = await supabase
      .from('workouts')
      .select('id, name, started_at, finished_at')
      .eq('user_id', user.id)
      .order('started_at', { ascending: false })
      .limit(10);

    if (workoutsData) {
      setWorkouts(workoutsData);

      // Calculate week stats from the workouts we already have
      const weekWorkouts = workoutsData.filter(
        (w) => new Date(w.started_at) >= weekAgo
      );
      const weekIds = weekWorkouts.map((w) => w.id);

      if (weekIds.length > 0) {
        const { data: setsData } = await supabase
          .from('workout_sets')
          .select('reps, weight_kg')
          .in('workout_id', weekIds);

        const volumeKg = (setsData ?? []).reduce(
          (sum, s) => sum + (s.weight_kg ?? 0) * (s.reps ?? 0),
          0
        );
        setStats({
          workouts: weekWorkouts.length,
          sets: (setsData ?? []).length,
          volumeKg: Math.round(volumeKg * 2.20462),
        });
      } else {
        setStats({ workouts: 0, sets: 0, volumeKg: 0 });
      }
    }
  }, [user]);

  // Refresh every time the screen comes into focus (e.g. returning from a workout)
  useFocusEffect(
    useCallback(() => {
      fetchData();
    }, [fetchData])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchData();
    setRefreshing(false);
  };

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top']}>
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#6366f1" />
        }
      >
        {/* Header */}
        <View className="px-6 pt-4 pb-6 flex-row items-center justify-between">
          <View>
            <Text className="text-muted text-sm">Good morning,</Text>
            <Text className="text-white text-2xl font-bold tracking-tight">{firstName}</Text>
          </View>
          <TouchableOpacity
            className="bg-card border border-border px-4 py-2 rounded-xl"
            onPress={signOut}
            activeOpacity={0.7}
          >
            <Text className="text-muted text-sm">Sign Out</Text>
          </TouchableOpacity>
        </View>

        {/* Quick Start */}
        <View className="px-6 mb-8">
          <TouchableOpacity
            className="bg-primary rounded-2xl px-6 py-5"
            onPress={() => router.push('/(app)/workout/start')}
            activeOpacity={0.85}
          >
            <Text className="text-white/70 text-sm mb-1">Ready to train?</Text>
            <Text className="text-white text-xl font-bold">Start Workout</Text>
            <Text className="text-white/60 text-xs mt-2">Tap to begin a new session</Text>
          </TouchableOpacity>
        </View>

        {/* Stats Row */}
        <View className="px-6 mb-8">
          <Text className="text-white font-semibold text-lg mb-4">This Week</Text>
          <View className="flex-row gap-x-3">
            <StatCard label="Workouts" value={String(stats.workouts)} />
            <StatCard label="Sets" value={String(stats.sets)} />
            <StatCard label="Volume" value={`${stats.volumeKg} lbs`} />
          </View>
        </View>

        {/* Recent Workouts */}
        <View className="px-6">
          <Text className="text-white font-semibold text-lg mb-4">Recent Workouts</Text>
          {workouts.length === 0 ? (
            <View className="bg-card rounded-2xl border border-border px-6 py-8 items-center">
              <Text className="text-muted text-sm text-center">
                No workouts yet.{'\n'}Start your first session above.
              </Text>
            </View>
          ) : (
            <View className="gap-y-3">
              {workouts.map((workout) => (
                <TouchableOpacity
                  key={workout.id}
                  className="bg-card rounded-2xl border border-border px-5 py-4"
                  onPress={() => router.push({ pathname: '/(app)/workout/[id]', params: { id: workout.id } })}
                  activeOpacity={0.75}
                >
                  <View className="flex-row items-center justify-between">
                    <Text className="text-white font-semibold text-base">{workout.name}</Text>
                    <Text className="text-primary text-sm font-medium">
                      {formatDuration(workout.started_at, workout.finished_at)}
                    </Text>
                  </View>
                  <Text className="text-muted text-xs mt-1">
                    {formatDate(workout.started_at)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-1 bg-card rounded-2xl border border-border px-4 py-4">
      <Text className="text-white text-xl font-bold">{value}</Text>
      <Text className="text-muted text-xs mt-1">{label}</Text>
    </View>
  );
}
