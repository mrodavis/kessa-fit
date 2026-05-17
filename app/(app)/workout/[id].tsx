import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Modal,
  TextInput,
  Alert,
  FlatList,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '@/lib/supabase';
import { UNIT_KEY } from '@/constants';

interface WorkoutSet {
  id: string;
  exercise_id: string;
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
  exerciseId: string;
  muscleGroup: string | null;
  sets: WorkoutSet[];
}

interface Exercise {
  id: string;
  name: string;
  muscle_group: string | null;
  equipment: string | null;
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
  const [useLbs, setUseLbs] = useState(true);

  const [editingSet, setEditingSet] = useState<WorkoutSet | null>(null);
  const [editWeight, setEditWeight] = useState('');
  const [editReps, setEditReps] = useState('');
  const [editSaving, setEditSaving] = useState(false);

  const [addingToGroup, setAddingToGroup] = useState<GroupedExercise | null>(null);
  const [addWeight, setAddWeight] = useState('');
  const [addReps, setAddReps] = useState('');
  const [addSaving, setAddSaving] = useState(false);

  const [pickerVisible, setPickerVisible] = useState(false);
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loadingExercises, setLoadingExercises] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(UNIT_KEY)
      .then(val => { if (val !== null) setUseLbs(val === 'lbs'); })
      .catch(() => {});
  }, []);

  const fetchExercises = useCallback(async (query: string) => {
    setLoadingExercises(true);
    const req = supabase.from('exercises').select('id, name, muscle_group, equipment').order('name');
    if (query.trim()) req.ilike('name', `%${query.trim()}%`);
    const { data } = await req.limit(50);
    setExercises(data ?? []);
    setLoadingExercises(false);
  }, []);

  useEffect(() => {
    if (pickerVisible) fetchExercises(searchQuery);
  }, [pickerVisible, searchQuery]);

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
          .select('id, exercise_id, set_number, reps, weight_kg, exercises(name, muscle_group)')
          .eq('workout_id', id)
          .order('set_number', { ascending: true }),
      ]);

      if (workoutRes.data) setWorkout(workoutRes.data);

      if (setsRes.data) {
        const sets = setsRes.data as WorkoutSet[];

        const grouped: Record<string, GroupedExercise> = {};
        sets.forEach((set) => {
          const name = set.exercises?.name ?? 'Unknown';
          if (!grouped[name]) {
            grouped[name] = {
              name,
              exerciseId: set.exercise_id,
              muscleGroup: set.exercises?.muscle_group ?? null,
              sets: [],
            };
          }
          grouped[name].sets.push(set);
        });
        setGroups(Object.values(grouped));

        const vol = sets.reduce((sum, s) => sum + (s.weight_kg ?? 0) * (s.reps ?? 0), 0);
        setTotalVolume(Math.round(vol * 2.20462));
      }

      setLoading(false);
    };

    fetchWorkout();
  }, [id]);

  const displayWeight = (kg: number | null): string => {
    if (kg == null) return '—';
    return useLbs ? `${Math.round(kg * 2.20462)} lbs` : `${Math.round(kg)} kg`;
  };

  const openEdit = (set: WorkoutSet) => {
    setEditingSet(set);
    setEditWeight(
      set.weight_kg != null
        ? String(useLbs ? Math.round(set.weight_kg * 2.20462) : Math.round(set.weight_kg))
        : ''
    );
    setEditReps(set.reps != null ? String(set.reps) : '');
  };

  const updateSet = async () => {
    if (!editingSet) return;
    setEditSaving(true);

    const rawWeight = editWeight ? parseFloat(editWeight) : null;
    const weightKg = rawWeight != null ? (useLbs ? rawWeight / 2.20462 : rawWeight) : null;
    const repsVal = editReps ? parseInt(editReps) : null;

    const { error } = await supabase
      .from('workout_sets')
      .update({ weight_kg: weightKg, reps: repsVal })
      .eq('id', editingSet.id);

    setEditSaving(false);
    if (error) { Alert.alert('Error', error.message); return; }

    const updated = groups.map(g => ({
      ...g,
      sets: g.sets.map(s =>
        s.id === editingSet.id ? { ...s, weight_kg: weightKg, reps: repsVal } : s
      ),
    }));
    setGroups(updated);
    const vol = updated.flatMap(g => g.sets).reduce((sum, s) => sum + (s.weight_kg ?? 0) * (s.reps ?? 0), 0);
    setTotalVolume(Math.round(vol * 2.20462));
    setEditingSet(null);
  };

  const deleteSet = () => {
    if (!editingSet) return;
    const groupName = groups.find(g => g.sets.some(s => s.id === editingSet.id))?.name ?? 'this exercise';
    Alert.alert('Delete Set', `Remove Set ${editingSet.set_number} of ${groupName}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          const { error } = await supabase
            .from('workout_sets')
            .delete()
            .eq('id', editingSet.id);

          if (error) { Alert.alert('Error', error.message); return; }

          const updated = groups
            .map(g => {
              if (!g.sets.some(s => s.id === editingSet.id)) return g;
              const filtered = g.sets.filter(s => s.id !== editingSet.id);
              return { ...g, sets: filtered.map((s, i) => ({ ...s, set_number: i + 1 })) };
            })
            .filter(g => g.sets.length > 0);

          setGroups(updated);
          const vol = updated.flatMap(g => g.sets).reduce((sum, s) => sum + (s.weight_kg ?? 0) * (s.reps ?? 0), 0);
          setTotalVolume(Math.round(vol * 2.20462));
          setEditingSet(null);
        },
      },
    ]);
  };

  const selectNewExercise = (ex: Exercise) => {
    setPickerVisible(false);
    const existingGroup = groups.find(g => g.exerciseId === ex.id);
    if (existingGroup) {
      const lastSet = existingGroup.sets[existingGroup.sets.length - 1];
      setAddingToGroup(existingGroup);
      if (lastSet?.weight_kg != null) {
        setAddWeight(String(useLbs ? Math.round(lastSet.weight_kg * 2.20462) : Math.round(lastSet.weight_kg)));
        setAddReps(lastSet.reps != null ? String(lastSet.reps) : '');
      } else {
        setAddWeight('');
        setAddReps('');
      }
    } else {
      setAddingToGroup({ name: ex.name, exerciseId: ex.id, muscleGroup: ex.muscle_group, sets: [] });
      setAddWeight('');
      setAddReps('');
    }
  };

  const saveNewSet = async () => {
    if (!addingToGroup) return;
    setAddSaving(true);

    const rawWeight = addWeight ? parseFloat(addWeight) : null;
    const weightKg = rawWeight != null ? (useLbs ? rawWeight / 2.20462 : rawWeight) : null;
    const repsVal = addReps ? parseInt(addReps) : null;
    const nextSetNumber = addingToGroup.sets.length > 0
      ? Math.max(...addingToGroup.sets.map(s => s.set_number)) + 1
      : 1;

    const { data, error } = await supabase
      .from('workout_sets')
      .insert({
        workout_id: id,
        exercise_id: addingToGroup.exerciseId,
        set_number: nextSetNumber,
        weight_kg: weightKg,
        reps: repsVal,
      })
      .select('id, exercise_id, set_number, reps, weight_kg')
      .single();

    setAddSaving(false);
    if (error) { Alert.alert('Error', error.message); return; }

    const newSet: WorkoutSet = {
      id: data.id,
      exercise_id: data.exercise_id,
      set_number: data.set_number,
      reps: data.reps,
      weight_kg: data.weight_kg,
      exercises: { name: addingToGroup.name, muscle_group: addingToGroup.muscleGroup },
    };

    const exists = groups.some(g => g.name === addingToGroup.name);
    const updated = exists
      ? groups.map(g => g.name === addingToGroup.name ? { ...g, sets: [...g.sets, newSet] } : g)
      : [...groups, { ...addingToGroup, sets: [newSet] }];
    setGroups(updated);
    const vol = updated.flatMap(g => g.sets).reduce((sum, s) => sum + (s.weight_kg ?? 0) * (s.reps ?? 0), 0);
    setTotalVolume(Math.round(vol * 2.20462));
    setAddingToGroup(null);
  };

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
            <Text className="text-white text-lg font-bold">
              {useLbs ? totalVolume : Math.round(totalVolume / 2.20462)}
            </Text>
            <Text className="text-muted text-xs mt-1">Volume ({useLbs ? 'lbs' : 'kg'})</Text>
          </View>
        </View>

        {/* Exercises */}
        <View className="px-6">
          {groups.length === 0 ? (
            <View className="bg-card rounded-2xl border border-border px-6 py-8 items-center">
              <Text className="text-muted text-sm text-center">No sets were logged.</Text>
            </View>
          ) : (
            groups.map((group) => {
              const bestWeight = Math.max(0, ...group.sets.map(s => s.weight_kg ?? 0));
              return (
                <View key={group.name} className="mb-6">
                  <View className="flex-row items-baseline justify-between mb-3">
                    <TouchableOpacity
                      onPress={() => router.push({
                        pathname: '/(app)/exercise/[id]',
                        params: { id: group.exerciseId, name: group.name },
                      })}
                      activeOpacity={0.7}
                    >
                      <Text className="text-white font-semibold text-base">
                        {group.name}{' '}
                        <Text className="text-primary text-xs">↗</Text>
                      </Text>
                    </TouchableOpacity>
                    {group.muscleGroup && (
                      <Text className="text-muted text-xs">{group.muscleGroup}</Text>
                    )}
                  </View>

                  {/* Column headers */}
                  <View className="flex-row mb-2 px-1">
                    <Text className="text-muted text-xs w-10">SET</Text>
                    <Text className="text-muted text-xs flex-1 text-center">
                      WEIGHT ({useLbs ? 'LBS' : 'KG'})
                    </Text>
                    <Text className="text-muted text-xs flex-1 text-center">REPS</Text>
                    <Text className="text-muted text-xs flex-1 text-right">VOLUME</Text>
                  </View>

                  {group.sets.map((set) => {
                    const isBest =
                      bestWeight > 0 &&
                      set.weight_kg != null &&
                      set.weight_kg === bestWeight;
                    return (
                      <TouchableOpacity
                        key={set.id}
                        className={`flex-row items-center rounded-xl px-4 py-3 mb-2 border ${
                          isBest ? 'border-primary/40' : 'bg-card border-border'
                        }`}
                        style={isBest ? { backgroundColor: '#0f0f2e' } : undefined}
                        onPress={() => openEdit(set)}
                        activeOpacity={0.7}
                      >
                        <Text className="text-muted text-sm w-10">{set.set_number}</Text>
                        <View className="flex-1 flex-row items-center justify-center">
                          <Text className="text-white text-sm text-center">
                            {displayWeight(set.weight_kg)}
                          </Text>
                          {isBest && (
                            <Text className="text-primary text-xs ml-1">★</Text>
                          )}
                        </View>
                        <Text className="text-white text-sm flex-1 text-center">
                          {set.reps ?? '—'}
                        </Text>
                        <Text className="text-muted text-sm flex-1 text-right">
                          {set.weight_kg != null && set.reps != null
                            ? displayWeight(set.weight_kg * set.reps)
                            : '—'}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}

                  <TouchableOpacity
                    className="flex-row items-center mt-1 py-2 px-1"
                    onPress={() => {
                      const lastSet = group.sets[group.sets.length - 1];
                      setAddingToGroup(group);
                      if (lastSet?.weight_kg != null) {
                        setAddWeight(String(useLbs ? Math.round(lastSet.weight_kg * 2.20462) : Math.round(lastSet.weight_kg)));
                        setAddReps(lastSet.reps != null ? String(lastSet.reps) : '');
                      } else {
                        setAddWeight('');
                        setAddReps('');
                      }
                    }}
                    activeOpacity={0.7}
                  >
                    <Text className="text-primary text-sm font-medium">+ Add Set</Text>
                  </TouchableOpacity>
                </View>
              );
            })
          )}

          <TouchableOpacity
            className="flex-row items-center justify-center py-4 mt-4 rounded-2xl border border-border"
            onPress={() => { setSearchQuery(''); setPickerVisible(true); }}
            activeOpacity={0.7}
          >
            <Text className="text-primary text-sm font-medium">+ Add Exercise</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* ── Edit Set Modal ── */}
      <Modal visible={editingSet !== null} transparent animationType="slide">
        <View className="flex-1 justify-end bg-black/60">
          <View className="bg-surface rounded-t-3xl px-6 pt-6 pb-10 border-t border-border">
            <Text className="text-white font-bold text-xl mb-1">Edit Set</Text>
            <Text className="text-muted text-sm mb-6">
              {editingSet
                ? `${groups.find(g => g.sets.some(s => s.id === editingSet.id))?.name} · Set ${editingSet.set_number}`
                : ''}
            </Text>

            <View className="flex-row gap-x-3 mb-6">
              <View className="flex-1">
                <Text className="text-textSecondary text-sm mb-2 ml-1">
                  Weight ({useLbs ? 'lbs' : 'kg'})
                </Text>
                <TextInput
                  className="bg-card text-white px-4 py-4 rounded-2xl text-base border border-border"
                  placeholder="0"
                  placeholderTextColor="#8e8e93"
                  value={editWeight}
                  onChangeText={setEditWeight}
                  keyboardType="decimal-pad"
                  autoFocus
                />
              </View>
              <View className="flex-1">
                <Text className="text-textSecondary text-sm mb-2 ml-1">Reps</Text>
                <TextInput
                  className="bg-card text-white px-4 py-4 rounded-2xl text-base border border-border"
                  placeholder="0"
                  placeholderTextColor="#8e8e93"
                  value={editReps}
                  onChangeText={setEditReps}
                  keyboardType="number-pad"
                />
              </View>
            </View>

            <TouchableOpacity
              className="bg-primary rounded-2xl py-4 items-center mb-3"
              onPress={updateSet}
              disabled={editSaving}
              activeOpacity={0.85}
            >
              {editSaving ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text className="text-white font-semibold text-base">Update Set</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              className="py-3 items-center"
              onPress={() => setEditingSet(null)}
            >
              <Text className="text-muted text-base">Cancel</Text>
            </TouchableOpacity>

            <TouchableOpacity
              className="py-2 items-center"
              onPress={deleteSet}
            >
              <Text className="text-danger text-sm">Delete Set</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ── Add Set Modal ── */}
      <Modal visible={addingToGroup !== null} transparent animationType="slide">
        <View className="flex-1 justify-end bg-black/60">
          <View className="bg-surface rounded-t-3xl px-6 pt-6 pb-10 border-t border-border">
            <Text className="text-white font-bold text-xl mb-1">Add Set</Text>
            <Text className="text-muted text-sm mb-6">
              {addingToGroup
                ? `${addingToGroup.name} · Set ${addingToGroup.sets.length + 1}`
                : ''}
            </Text>

            <View className="flex-row gap-x-3 mb-6">
              <View className="flex-1">
                <Text className="text-textSecondary text-sm mb-2 ml-1">
                  Weight ({useLbs ? 'lbs' : 'kg'})
                </Text>
                <TextInput
                  className="bg-card text-white px-4 py-4 rounded-2xl text-base border border-border"
                  placeholder="0"
                  placeholderTextColor="#8e8e93"
                  value={addWeight}
                  onChangeText={setAddWeight}
                  keyboardType="decimal-pad"
                  autoFocus
                />
              </View>
              <View className="flex-1">
                <Text className="text-textSecondary text-sm mb-2 ml-1">Reps</Text>
                <TextInput
                  className="bg-card text-white px-4 py-4 rounded-2xl text-base border border-border"
                  placeholder="0"
                  placeholderTextColor="#8e8e93"
                  value={addReps}
                  onChangeText={setAddReps}
                  keyboardType="number-pad"
                />
              </View>
            </View>

            <TouchableOpacity
              className="bg-primary rounded-2xl py-4 items-center mb-3"
              onPress={saveNewSet}
              disabled={addSaving}
              activeOpacity={0.85}
            >
              {addSaving ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text className="text-white font-semibold text-base">Add Set</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              className="py-3 items-center"
              onPress={() => setAddingToGroup(null)}
            >
              <Text className="text-muted text-base">Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ── Exercise Picker Modal ── */}
      <Modal visible={pickerVisible} transparent animationType="slide">
        <SafeAreaView className="flex-1 bg-surface" edges={['top', 'bottom']}>
          <View className="px-6 pt-4 pb-3 border-b border-border flex-row items-center gap-x-3">
            <TextInput
              className="flex-1 bg-card text-white px-4 py-3 rounded-xl text-base border border-border"
              placeholder="Search exercises..."
              placeholderTextColor="#8e8e93"
              value={searchQuery}
              onChangeText={setSearchQuery}
              autoFocus
            />
            <TouchableOpacity onPress={() => setPickerVisible(false)}>
              <Text className="text-muted text-base">Cancel</Text>
            </TouchableOpacity>
          </View>

          {loadingExercises ? (
            <View className="flex-1 items-center justify-center">
              <ActivityIndicator color="#6366f1" />
            </View>
          ) : (
            <FlatList
              data={exercises}
              keyExtractor={(item) => item.id}
              contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 8, paddingBottom: 40 }}
              ItemSeparatorComponent={() => <View className="h-px bg-border" />}
              renderItem={({ item }) => (
                <TouchableOpacity
                  className="py-4"
                  onPress={() => selectNewExercise(item)}
                  activeOpacity={0.7}
                >
                  <Text className="text-white text-base font-medium">{item.name}</Text>
                  <Text className="text-muted text-xs mt-0.5">
                    {item.muscle_group} · {item.equipment}
                  </Text>
                </TouchableOpacity>
              )}
              ListEmptyComponent={
                <View className="items-center py-12">
                  <Text className="text-muted text-sm">No exercises found.</Text>
                </View>
              }
            />
          )}
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}
