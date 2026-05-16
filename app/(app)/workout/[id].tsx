import { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, ScrollView, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '@/lib/supabase';

interface WorkoutSet {
  id: string;
  set_number: number;
  reps: number | null;
  weight_kg: number | null;
  exercises: { name: string; muscle_group: string | null } | null;
}

interface WorkoutDetail {
  id: string;
  name: string;
  started_at: string;
  finished_at: string | null;
  notes: string | null;
}

interface GroupedExercise {
  name: string;
  muscleGroup: string | null;
  sets: WorkoutSet[];
}

function formatDuration(start: string, end: string | null): string {
  if (!end) return 'In progress';
  const mins = Math.round((new Date(end).getTime() - new Date(start).getTime()) / 60000);
  if (mins < 60) return `${mins} min`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

export default function WorkoutDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  const [workout, setWorkout] = useState<WorkoutDetail | null>(null);
  const [groups, setGroups] = useState<GroupedExercise[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalVolume, setTotalVolume] = useState(0);

  useEffect(() => {
    const fetchWorkout = async () => {
      const [workoutRes, setsRes] = await Promise.all([
        supabase
          .from('workouts')
          .select('id, name, started_at, finished_at, notes')
          .eq('id', id)
          .single(),
        supabase
          .from('workout_sets')
          .select('id, set_number, reps, weight_kg, exercises(name, muscle_group)')
          .eq('workout_id', id)
          .order('set_number', { ascending: true }),
      ]);

      if (workoutRes.data) setWorkout(workoutRes.data);

      if (setsRes.data) {
        const sets = setsRes.data as WorkoutSet[];

        // Group by exercise name
        const grouped: Record<string, GroupedExercise> = {};
        sets.forEach((set) => {
          const name = set.exercises?.name ?? 'Unknown';
          if (!grouped[name]) {
            grouped[name] = {
              name,
              muscleGroup: set.exercises?.muscle_group ?? null,
              sets: [],
            };
          }
          grouped[name].sets.push(set);
        });
        setGroups(Object.values(grouped));

        const vol = sets.reduce(
          (sum, s) => sum + (s.weight_kg ?? 0) * (s.reps ?? 0),
          0
        );
        setTotalVolume(Math.round(vol * 2.20462));
      }

      setLoading(false);
    };

    fetchWorkout();
  }, [id]);

  if (loading) {
    return (
      <SafeAreaView className="flex-1 bg-background items-center justify-center" edges={['top']}>
        <ActivityIndicator color="#6366f1" size="large" />
      </SafeAreaView>
    );
  }

  if (!workout) {
    return (
      <SafeAreaView className="flex-1 bg-background items-center justify-center" edges={['top']}>
        <Text className="text-muted">Workout not found.</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top']}>
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingBottom: 48 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View className="px-6 pt-4 pb-2 flex-row items-center">
          <TouchableOpacity onPress={() => router.back()} className="mr-4 p-2 -ml-2">
            <Text className="text-primary text-base">← Back</Text>
          </TouchableOpacity>
        </View>

        <View className="px-6 pb-6">
          <Text className="text-white text-2xl font-bold tracking-tight">{workout.name}</Text>
          <Text className="text-muted text-sm mt-1">{formatDate(workout.started_at)}</Text>
        </View>

        {/* Stats Bar */}
        <View className="flex-row px-6 gap-x-3 mb-8">
          <View className="flex-1 bg-card rounded-2xl border border-border px-4 py-4">
            <Text className="text-white text-lg font-bold">
              {formatDuration(workout.started_at, workout.finished_at)}
            </Text>
            <Text className="text-muted text-xs mt-1">Duration</Text>
          </View>
          <View className="flex-1 bg-card rounded-2xl border border-border px-4 py-4">
            <Text className="text-white text-lg font-bold">
              {groups.reduce((sum, g) => sum + g.sets.length, 0)}
            </Text>
            <Text className="text-muted text-xs mt-1">Total Sets</Text>
          </View>
          <View className="flex-1 bg-card rounded-2xl border border-border px-4 py-4">
            <Text className="text-white text-lg font-bold">{totalVolume}</Text>
            <Text className="text-muted text-xs mt-1">Volume (lbs)</Text>
          </View>
        </View>

        {/* Exercises */}
        <View className="px-6">
          {groups.length === 0 ? (
            <View className="bg-card rounded-2xl border border-border px-6 py-8 items-center">
              <Text className="text-muted text-sm text-center">No sets were logged.</Text>
            </View>
          ) : (
            groups.map((group) => (
              <View key={group.name} className="mb-6">
                <View className="flex-row items-baseline justify-between mb-3">
                  <Text className="text-white font-semibold text-base">{group.name}</Text>
                  {group.muscleGroup && (
                    <Text className="text-muted text-xs">{group.muscleGroup}</Text>
                  )}
                </View>

                {/* Column headers */}
                <View className="flex-row mb-2 px-1">
                  <Text className="text-muted text-xs w-10">SET</Text>
                  <Text className="text-muted text-xs flex-1 text-center">WEIGHT</Text>
                  <Text className="text-muted text-xs flex-1 text-center">REPS</Text>
                  <Text className="text-muted text-xs flex-1 text-right">VOLUME</Text>
                </View>

                {group.sets.map((set) => (
                  <View
                    key={set.id}
                    className="flex-row items-center bg-card rounded-xl px-4 py-3 mb-2 border border-border"
                  >
                    <Text className="text-muted text-sm w-10">{set.set_number}</Text>
                    <Text className="text-white text-sm flex-1 text-center">
                      {set.weight_kg != null ? `${Math.round(set.weight_kg * 2.20462)} lbs` : '—'}
                    </Text>
                    <Text className="text-white text-sm flex-1 text-center">
                      {set.reps ?? '—'}
                    </Text>
                    <Text className="text-muted text-sm flex-1 text-right">
                      {set.weight_kg && set.reps
                        ? `${Math.round(set.weight_kg * set.reps * 2.20462)} lbs`
                        : '—'}
                    </Text>
                  </View>
                ))}
              </View>
            ))
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
