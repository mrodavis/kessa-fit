import { useState, useCallback, useEffect } from 'react';
import { View, Text, TouchableOpacity, ScrollView, RefreshControl } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';
import { UNIT_KEY } from '@/constants';

interface ActiveWorkout {
  id: string;
  name: string;
  started_at: string;
}

interface WorkoutCard {
  id: string;
  name: string;
  started_at: string;
  finished_at: string;
  setCount: number;
  muscleGroups: string[];
}

interface ActivityDot {
  date: Date;
  trained: boolean;
}

function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning,';
  if (h < 17) return 'Good afternoon,';
  return 'Good evening,';
}

function formatDuration(start: string, end: string | null): string {
  if (!end) return 'In progress';
  const mins = Math.round((new Date(end).getTime() - new Date(start).getTime()) / 60000);
  if (mins === 0) return '< 1 min';
  if (mins < 60) return `${mins} min`;
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

function calcStreak(startedAts: string[]): number {
  const uniqueDates = [...new Set(startedAts.map(d => new Date(d).toDateString()))];
  if (uniqueDates.length === 0) return 0;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const checkDate = new Date(today);

  // grace: allow missing today if yesterday is covered
  if (!uniqueDates.includes(checkDate.toDateString())) {
    checkDate.setDate(checkDate.getDate() - 1);
    if (!uniqueDates.includes(checkDate.toDateString())) return 0;
  }

  let streak = 0;
  while (uniqueDates.includes(checkDate.toDateString())) {
    streak++;
    checkDate.setDate(checkDate.getDate() - 1);
  }
  return streak;
}

const DAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

export default function HomeScreen() {
  const { user } = useAuth();
  const router = useRouter();

  const [activeWorkout, setActiveWorkout] = useState<ActiveWorkout | null>(null);
  const [workouts, setWorkouts] = useState<WorkoutCard[]>([]);
  const [activityDots, setActivityDots] = useState<ActivityDot[]>([]);
  const [weekVolumeKg, setWeekVolumeKg] = useState(0);
  const [weekWorkoutCount, setWeekWorkoutCount] = useState(0);
  const [streak, setStreak] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [useLbs, setUseLbs] = useState(true);

  const firstName = user?.user_metadata?.full_name?.split(' ')[0] ?? 'Athlete';

  const fetchData = useCallback(async () => {
    if (!user) return;

    const unitVal = await AsyncStorage.getItem(UNIT_KEY).catch(() => null);
    setUseLbs(unitVal !== 'kg');

    const todayMidnight = new Date();
    todayMidnight.setHours(0, 0, 0, 0);
    const weekStart = new Date(todayMidnight);
    weekStart.setDate(todayMidnight.getDate() - todayMidnight.getDay()); // back to Sunday

    const [activeRes, weekRes, recentRes, streakRes] = await Promise.all([
      supabase
        .from('workouts')
        .select('id, name, started_at')
        .eq('user_id', user.id)
        .is('finished_at', null)
        .order('started_at', { ascending: false })
        .limit(1)
        .maybeSingle(),

      supabase
        .from('workouts')
        .select('id, started_at, workout_sets(reps, weight_kg)')
        .eq('user_id', user.id)
        .not('finished_at', 'is', null)
        .gte('started_at', weekStart.toISOString()),

      supabase
        .from('workouts')
        .select('id, name, started_at, finished_at, workout_sets(exercises(muscle_group))')
        .eq('user_id', user.id)
        .not('finished_at', 'is', null)
        .order('started_at', { ascending: false })
        .limit(5),

      supabase
        .from('workouts')
        .select('started_at')
        .eq('user_id', user.id)
        .not('finished_at', 'is', null)
        .order('started_at', { ascending: false })
        .limit(120),
    ]);

    setActiveWorkout(activeRes.data ?? null);

    // Week activity dots
    const weekData = (weekRes.data ?? []) as Array<{
      id: string;
      started_at: string;
      workout_sets: Array<{ reps: number | null; weight_kg: number | null }>;
    }>;
    const trainedDates = new Set(weekData.map(w => new Date(w.started_at).toDateString()));
    const dots = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(weekStart);
      d.setDate(weekStart.getDate() + i);
      return { date: d, trained: trainedDates.has(d.toDateString()) };
    });
    setActivityDots(dots);
    setWeekWorkoutCount(weekData.length);

    const vol = weekData.reduce((sum, w) => {
      return sum + w.workout_sets.reduce(
        (s, set) => s + (set.weight_kg ?? 0) * (set.reps ?? 0),
        0
      );
    }, 0);
    setWeekVolumeKg(vol);

    // Recent workout cards
    const rawRecent = (recentRes.data ?? []) as Array<{
      id: string;
      name: string;
      started_at: string;
      finished_at: string;
      workout_sets: Array<{ exercises: { muscle_group: string | null } | null }>;
    }>;
    setWorkouts(
      rawRecent.map(w => ({
        id: w.id,
        name: w.name,
        started_at: w.started_at,
        finished_at: w.finished_at,
        setCount: w.workout_sets.length,
        muscleGroups: [
          ...new Set(
            w.workout_sets
              .map(s => s.exercises?.muscle_group)
              .filter((g): g is string => Boolean(g))
          ),
        ].slice(0, 3),
      }))
    );

    setStreak(calcStreak((streakRes.data ?? []).map(w => w.started_at)));
  }, [user]);

  useFocusEffect(useCallback(() => { fetchData(); }, [fetchData]));

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
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#6366f1" />}
      >
        {/* Header */}
        <View className="px-6 pt-4 pb-6">
          <Text className="text-muted text-sm">{getGreeting()}</Text>
          <View className="flex-row items-center justify-between mt-0.5">
            <Text className="text-white text-2xl font-bold tracking-tight">{firstName}</Text>
            {streak > 0 && (
              <View className="flex-row items-center bg-card border border-border rounded-xl px-3 py-1.5">
                <Text className="text-base mr-1">🔥</Text>
                <Text className="text-white font-bold text-sm">{streak}</Text>
                <Text className="text-muted text-xs ml-1">day streak</Text>
              </View>
            )}
          </View>
        </View>

        {/* Start / Resume CTA */}
        <View className="px-6 mb-8">
          {activeWorkout ? (
            <TouchableOpacity
              style={{ backgroundColor: '#0f0f2e' }}
              className="rounded-2xl px-6 py-5 border border-primary/40"
              onPress={() =>
                router.push({
                  pathname: '/(app)/workout/logger',
                  params: { workoutId: activeWorkout.id, workoutName: activeWorkout.name },
                })
              }
              activeOpacity={0.85}
            >
              <Text className="text-primary text-xs font-semibold uppercase tracking-widest mb-1">
                Active Session
              </Text>
              <Text className="text-white text-xl font-bold">{activeWorkout.name}</Text>
              <Text className="text-muted text-xs mt-2">Tap to resume →</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              className="bg-primary rounded-2xl px-6 py-5"
              onPress={() => router.push('/(app)/workout/start')}
              activeOpacity={0.85}
            >
              <Text className="text-white/70 text-sm mb-1">Ready to train?</Text>
              <Text className="text-white text-xl font-bold">Start Workout</Text>
              <Text className="text-white/60 text-xs mt-2">Tap to begin a new session</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* 7-Day Activity */}
        <View className="px-6 mb-8">
          <View className="flex-row items-baseline justify-between mb-4">
            <Text className="text-white font-semibold text-lg">This Week</Text>
            <Text className="text-muted text-sm">
              {weekWorkoutCount} session{weekWorkoutCount !== 1 ? 's' : ''} ·{' '}
              {(useLbs ? Math.round(weekVolumeKg * 2.20462) : Math.round(weekVolumeKg)).toLocaleString()} {useLbs ? 'lbs' : 'kg'}
            </Text>
          </View>
          <View className="flex-row justify-between">
            {activityDots.map((dot, i) => {
              const isToday = dot.date.toDateString() === new Date().toDateString();
              return (
                <View key={i} className="items-center" style={{ gap: 6 }}>
                  <View
                    className={`w-10 h-10 rounded-full items-center justify-center border ${
                      dot.trained ? 'bg-primary border-primary' : 'bg-card border-border'
                    }`}
                  >
                    {dot.trained && <Text className="text-white text-xs font-bold">✓</Text>}
                  </View>
                  <Text
                    className={`text-xs ${isToday ? 'text-primary font-semibold' : 'text-muted'}`}
                  >
                    {DAY_LABELS[dot.date.getDay()]}
                  </Text>
                </View>
              );
            })}
          </View>
        </View>

        {/* Recent Workouts */}
        <View className="px-6">
          <Text className="text-white font-semibold text-lg mb-4">Recent Workouts</Text>
          {workouts.length === 0 ? (
            <View className="bg-card rounded-2xl border border-border px-6 py-8 items-center">
              <Text className="text-muted text-sm text-center">
                No completed workouts yet.{'\n'}Start your first session above.
              </Text>
            </View>
          ) : (
            <View style={{ gap: 12 }}>
              {workouts.map(workout => (
                <TouchableOpacity
                  key={workout.id}
                  className="bg-card rounded-2xl border border-border px-5 py-4"
                  onPress={() =>
                    router.push({ pathname: '/(app)/workout/[id]', params: { id: workout.id } })
                  }
                  activeOpacity={0.75}
                >
                  <View className="flex-row items-center justify-between mb-0.5">
                    <Text
                      className="text-white font-semibold text-base flex-1 mr-2"
                      numberOfLines={1}
                    >
                      {workout.name}
                    </Text>
                    <Text className="text-primary text-sm font-medium">
                      {formatDuration(workout.started_at, workout.finished_at)}
                    </Text>
                  </View>
                  <Text className="text-muted text-xs mb-1.5">{formatDate(workout.started_at)}</Text>
                  {workout.muscleGroups.length > 0 && (
                    <Text className="text-muted text-xs">
                      {workout.muscleGroups.join(' · ')} · {workout.setCount} sets
                    </Text>
                  )}
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
