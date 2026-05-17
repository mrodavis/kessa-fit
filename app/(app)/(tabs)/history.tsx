import { useState, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  RefreshControl,
  TextInput,
  ActivityIndicator,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';

interface WorkoutItem {
  id: string;
  name: string;
  started_at: string;
  finished_at: string | null;
  setCount: number;
  muscleGroups: string[];
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
  return date.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

type RawWorkout = {
  id: string;
  name: string;
  started_at: string;
  finished_at: string | null;
  workout_sets: Array<{ exercises: { muscle_group: string | null } | null }>;
};

export default function HistoryScreen() {
  const { user } = useAuth();
  const router = useRouter();

  const [allWorkouts, setAllWorkouts] = useState<WorkoutItem[]>([]);
  const [filtered, setFiltered] = useState<WorkoutItem[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchData = useCallback(async () => {
    if (!user) return;

    const { data } = await supabase
      .from('workouts')
      .select('id, name, started_at, finished_at, workout_sets(exercises(muscle_group))')
      .eq('user_id', user.id)
      .order('started_at', { ascending: false })
      .limit(200);

    const processed = ((data ?? []) as RawWorkout[]).map(w => ({
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
    }));

    setAllWorkouts(processed);
    applySearch(processed, search);
    setLoading(false);
  }, [user]);

  useFocusEffect(useCallback(() => { fetchData(); }, [fetchData]));

  const applySearch = (list: WorkoutItem[], q: string) => {
    if (!q.trim()) {
      setFiltered(list);
    } else {
      setFiltered(list.filter(w => w.name.toLowerCase().includes(q.toLowerCase())));
    }
  };

  const onSearch = (q: string) => {
    setSearch(q);
    applySearch(allWorkouts, q);
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchData();
    setRefreshing(false);
  };

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top']}>
      <View className="px-6 pt-4 pb-3">
        <Text className="text-white text-2xl font-bold tracking-tight mb-4">History</Text>
        <TextInput
          className="bg-card border border-border rounded-2xl px-4 py-3 text-white text-base"
          placeholder="Search workouts..."
          placeholderTextColor="#8e8e93"
          value={search}
          onChangeText={onSearch}
        />
      </View>

      {loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color="#6366f1" size="large" />
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={item => item.id}
          contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 40, paddingTop: 4 }}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#6366f1" />
          }
          ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
          ListEmptyComponent={
            <View className="bg-card rounded-2xl border border-border px-6 py-8 items-center mt-4">
              <Text className="text-muted text-sm text-center">
                {search
                  ? 'No workouts match your search.'
                  : 'No workouts yet.\nStart your first session on the Home tab.'}
              </Text>
            </View>
          }
          renderItem={({ item }) => (
            <TouchableOpacity
              className="bg-card rounded-2xl border border-border px-5 py-4"
              onPress={() =>
                router.push({ pathname: '/(app)/workout/[id]', params: { id: item.id } })
              }
              activeOpacity={0.75}
            >
              <View className="flex-row items-center justify-between mb-0.5">
                <Text
                  className="text-white font-semibold text-base flex-1 mr-2"
                  numberOfLines={1}
                >
                  {item.name}
                </Text>
                <Text className="text-primary text-sm font-medium">
                  {formatDuration(item.started_at, item.finished_at)}
                </Text>
              </View>
              <Text className="text-muted text-xs mb-1.5">{formatDate(item.started_at)}</Text>
              {item.setCount > 0 && (
                <Text className="text-muted text-xs">
                  {item.muscleGroups.length > 0 ? `${item.muscleGroups.join(' · ')} · ` : ''}
                  {item.setCount} sets
                </Text>
              )}
            </TouchableOpacity>
          )}
        />
      )}
    </SafeAreaView>
  );
}
