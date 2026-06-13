import { useState, useEffect, useCallback, useMemo } from 'react';
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
import { useAuth } from '@/hooks/useAuth';
import { UNIT_KEY } from '@/constants';

interface WorkoutSet {
  id: string;
  exercise_id: string;
  set_number: number;
  reps: number | null;
  weight_kg: number | null;
  is_warmup: boolean;
  superset_group_id: string | null;
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
  supersetGroupId: string | null;
  sets: WorkoutSet[];
}

type DetailDisplayGroup =
  | { type: 'solo'; group: GroupedExercise }
  | { type: 'superset'; supersetGroupId: string; groups: GroupedExercise[] };

const AMBER = '#f59e0b';
const SUPERSET_COLOR = '#6366f1';
const SUPERSET_BG = '#13123a';

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
  const { user } = useAuth();

  const [workout, setWorkout] = useState<WorkoutDetail | null>(null);
  const [groups, setGroups] = useState<GroupedExercise[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalVolume, setTotalVolume] = useState(0);
  const [useLbs, setUseLbs] = useState(true);

  const [editingSet, setEditingSet] = useState<WorkoutSet | null>(null);
  const [editWeight, setEditWeight] = useState('');
  const [editReps, setEditReps] = useState('');
  const [editSaving, setEditSaving] = useState(false);
  const [editIsBodyweight, setEditIsBodyweight] = useState(false);

  const [addingToGroup, setAddingToGroup] = useState<GroupedExercise | null>(null);
  const [addWeight, setAddWeight] = useState('');
  const [addReps, setAddReps] = useState('');
  const [addSaving, setAddSaving] = useState(false);
  const [addIsBodyweight, setAddIsBodyweight] = useState(false);

  const [saveTemplateVisible, setSaveTemplateVisible] = useState(false);
  const [templateName, setTemplateName] = useState('');
  const [savingTemplate, setSavingTemplate] = useState(false);

  const [editWorkoutVisible, setEditWorkoutVisible] = useState(false);
  const [editName, setEditName] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [editWorkoutSaving, setEditWorkoutSaving] = useState(false);

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
          .select('id, exercise_id, set_number, reps, weight_kg, is_warmup, superset_group_id, exercises(name, muscle_group)')
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
              supersetGroupId: set.superset_group_id,
              sets: [],
            };
          }
          grouped[name].sets.push(set);
        });
        setGroups(Object.values(grouped));

        const vol = sets
          .filter(s => !s.is_warmup)
          .reduce((sum, s) => sum + (s.weight_kg ?? 0) * (s.reps ?? 0), 0);
        setTotalVolume(Math.round(vol * 2.20462));
      }

      setLoading(false);
    };

    fetchWorkout();
  }, [id]);

  const displayWeight = (kg: number | null): string => {
    if (kg == null) return 'BW';
    return useLbs ? `${Math.round(kg * 2.20462)} lbs` : `${Math.round(kg)} kg`;
  };

  const openEdit = (set: WorkoutSet) => {
    setEditingSet(set);
    setEditIsBodyweight(set.weight_kg === null);
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

    const rawWeight = editIsBodyweight ? null : (editWeight ? parseFloat(editWeight) : null);
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
    const vol = updated.flatMap(g => g.sets).filter(s => !s.is_warmup).reduce((sum, s) => sum + (s.weight_kg ?? 0) * (s.reps ?? 0), 0);
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
          const vol = updated.flatMap(g => g.sets).filter(s => !s.is_warmup).reduce((sum, s) => sum + (s.weight_kg ?? 0) * (s.reps ?? 0), 0);
          setTotalVolume(Math.round(vol * 2.20462));
          setEditingSet(null);
        },
      },
    ]);
  };

  const saveAsTemplate = async () => {
    if (!user || !templateName.trim()) return;
    setSavingTemplate(true);

    const { data: tmpl, error } = await supabase
      .from('workout_templates')
      .insert({ user_id: user.id, name: templateName.trim() })
      .select('id')
      .single();

    if (error) { Alert.alert('Error', error.message); setSavingTemplate(false); return; }

    await supabase.from('workout_template_exercises').insert(
      groups.map((g, i) => ({
        template_id: tmpl.id,
        exercise_id: g.exerciseId,
        exercise_name: g.name,
        sets: g.sets.length,
        position: i,
      }))
    );

    setSavingTemplate(false);
    setSaveTemplateVisible(false);
    Alert.alert('Saved', `"${templateName.trim()}" saved as a template.`);
  };

  const saveWorkoutEdit = async () => {
    if (!editName.trim()) return;
    setEditWorkoutSaving(true);
    const { error } = await supabase
      .from('workouts')
      .update({ name: editName.trim(), notes: editNotes.trim() || null })
      .eq('id', id);
    setEditWorkoutSaving(false);
    if (error) { Alert.alert('Error', error.message); return; }
    setWorkout(prev => prev ? { ...prev, name: editName.trim(), notes: editNotes.trim() || null } : prev);
    setEditWorkoutVisible(false);
  };

  const deleteWorkout = () => {
    Alert.alert('Delete Workout', 'This will permanently delete this workout and all its sets.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await supabase.from('workout_sets').delete().eq('workout_id', id);
          await supabase.from('workouts').delete().eq('id', id);
          router.back();
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
      const wasBodyweight = !!lastSet && lastSet.weight_kg === null;
      setAddIsBodyweight(wasBodyweight);
      if (!wasBodyweight && lastSet?.weight_kg != null) {
        setAddWeight(String(useLbs ? Math.round(lastSet.weight_kg * 2.20462) : Math.round(lastSet.weight_kg)));
        setAddReps(lastSet.reps != null ? String(lastSet.reps) : '');
      } else {
        setAddWeight('');
        setAddReps(lastSet?.reps != null ? String(lastSet.reps) : '');
      }
    } else {
      setAddingToGroup({ name: ex.name, exerciseId: ex.id, muscleGroup: ex.muscle_group, sets: [] });
      setAddWeight('');
      setAddReps('');
      setAddIsBodyweight(false);
    }
  };

  const saveNewSet = async () => {
    if (!addingToGroup) return;
    setAddSaving(true);

    const rawWeight = addIsBodyweight ? null : (addWeight ? parseFloat(addWeight) : null);
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
    const vol = updated.flatMap(g => g.sets).filter(s => !s.is_warmup).reduce((sum, s) => sum + (s.weight_kg ?? 0) * (s.reps ?? 0), 0);
    setTotalVolume(Math.round(vol * 2.20462));
    setAddingToGroup(null);
    setAddIsBodyweight(false);
  };

  const hasWarmupSets = groups.some(g => g.sets.some(s => s.is_warmup));

  const displayGroups = useMemo<DetailDisplayGroup[]>(() => {
    const supersetMap = new Map<string, GroupedExercise[]>();
    for (const group of groups) {
      if (group.supersetGroupId) {
        if (!supersetMap.has(group.supersetGroupId)) supersetMap.set(group.supersetGroupId, []);
        supersetMap.get(group.supersetGroupId)!.push(group);
      }
    }

    const result: DetailDisplayGroup[] = [];
    const seen = new Set<string>();
    for (const group of groups) {
      if (seen.has(group.name)) continue;
      if (group.supersetGroupId && (supersetMap.get(group.supersetGroupId)?.length ?? 0) > 1) {
        const paired = supersetMap.get(group.supersetGroupId)!;
        result.push({ type: 'superset', supersetGroupId: group.supersetGroupId, groups: paired });
        paired.forEach(g => seen.add(g.name));
      } else {
        result.push({ type: 'solo', group });
        seen.add(group.name);
      }
    }
    return result;
  }, [groups]);

  const getDisplayNum = (set: WorkoutSet, groupSets: WorkoutSet[]): string => {
    if (set.is_warmup) {
      const n = groupSets.filter(s => s.is_warmup && s.set_number < set.set_number).length + 1;
      return `W${n}`;
    }
    const n = groupSets.filter(s => !s.is_warmup && s.set_number < set.set_number).length + 1;
    return String(n);
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
          <View className="flex-row items-start justify-between">
            <Text className="text-white text-2xl font-bold tracking-tight flex-1 mr-4">
              {workout.name}
            </Text>
            <TouchableOpacity
              onPress={() => { setEditName(workout.name); setEditNotes(workout.notes ?? ''); setEditWorkoutVisible(true); }}
              className="mt-1"
              activeOpacity={0.7}
            >
              <Text className="text-muted text-sm">Edit</Text>
            </TouchableOpacity>
          </View>
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
            <Text className="text-muted text-xs mt-1">
              Volume ({useLbs ? 'lbs' : 'kg'}){hasWarmupSets ? '*' : ''}
            </Text>
          </View>
        </View>

        {/* Notes */}
        {workout.notes ? (
          <View className="mx-6 mb-6 bg-card border border-border rounded-2xl px-4 py-4">
            <Text className="text-muted text-xs font-semibold uppercase tracking-widest mb-2">Notes</Text>
            <Text className="text-white text-sm">{workout.notes}</Text>
          </View>
        ) : null}

        {/* Exercises */}
        <View className="px-6">
          {hasWarmupSets && (
            <Text style={{ color: '#8e8e93', fontSize: 11, marginBottom: 12 }}>
              * Volume excludes warm-up sets
            </Text>
          )}

          {displayGroups.length === 0 ? (
            <View className="bg-card rounded-2xl border border-border px-6 py-8 items-center">
              <Text className="text-muted text-sm text-center">No sets were logged.</Text>
            </View>
          ) : (
            displayGroups.map((displayGroup, dgIdx) => {
              const renderExerciseGroup = (group: GroupedExercise) => {
                const workingSets = group.sets.filter(s => !s.is_warmup);
                const bestWeight = Math.max(0, ...workingSets.map(s => s.weight_kg ?? 0));
                return (
                  <View key={group.name}>
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
                        !set.is_warmup &&
                        bestWeight > 0 &&
                        set.weight_kg != null &&
                        set.weight_kg === bestWeight;
                      const displayNum = getDisplayNum(set, group.sets);
                      return (
                        <TouchableOpacity
                          key={set.id}
                          className={`flex-row items-center rounded-xl px-4 py-3 mb-2 border ${
                            isBest ? 'border-primary/40' : 'bg-card border-border'
                          }`}
                          style={[
                            isBest ? { backgroundColor: '#0f0f2e' } : undefined,
                            set.is_warmup ? { opacity: 0.6 } : undefined,
                          ]}
                          onPress={() => openEdit(set)}
                          activeOpacity={0.7}
                        >
                          <Text
                            style={set.is_warmup
                              ? { color: AMBER, fontWeight: '700', fontSize: 12, width: 40 }
                              : { color: '#8e8e93', fontSize: 14, width: 40 }
                            }
                          >
                            {displayNum}
                          </Text>
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
                            {!set.is_warmup && set.weight_kg != null && set.reps != null
                              ? displayWeight(set.weight_kg * set.reps)
                              : set.is_warmup ? 'W/U' : '—'}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}

                    <TouchableOpacity
                      className="flex-row items-center mt-1 py-2 px-1"
                      onPress={() => {
                        const lastSet = group.sets[group.sets.length - 1];
                        setAddingToGroup(group);
                        const wasBodyweight = !!lastSet && lastSet.weight_kg === null;
                        setAddIsBodyweight(wasBodyweight);
                        if (!wasBodyweight && lastSet?.weight_kg != null) {
                          setAddWeight(String(useLbs ? Math.round(lastSet.weight_kg * 2.20462) : Math.round(lastSet.weight_kg)));
                          setAddReps(lastSet.reps != null ? String(lastSet.reps) : '');
                        } else {
                          setAddWeight('');
                          setAddReps(lastSet?.reps != null ? String(lastSet.reps) : '');
                        }
                      }}
                      activeOpacity={0.7}
                    >
                      <Text className="text-primary text-sm font-medium">+ Add Set</Text>
                    </TouchableOpacity>
                  </View>
                );
              };

              if (displayGroup.type === 'superset') {
                return (
                  <View
                    key={displayGroup.supersetGroupId}
                    style={{ borderLeftWidth: 2, borderLeftColor: SUPERSET_COLOR, paddingLeft: 12, marginBottom: 24 }}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
                      <View style={{ backgroundColor: SUPERSET_BG, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 }}>
                        <Text style={{ color: SUPERSET_COLOR, fontSize: 10, fontWeight: '700', letterSpacing: 1 }}>
                          SUPERSET
                        </Text>
                      </View>
                    </View>
                    {displayGroup.groups.map((g, i) => (
                      <View key={g.name} style={i > 0 ? { marginTop: 20 } : undefined}>
                        {renderExerciseGroup(g)}
                      </View>
                    ))}
                  </View>
                );
              }

              return (
                <View key={displayGroup.group.name} className="mb-6">
                  {renderExerciseGroup(displayGroup.group)}
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

          <TouchableOpacity
            className="py-4 items-center"
            onPress={() => { setTemplateName(workout?.name ?? ''); setSaveTemplateVisible(true); }}
            activeOpacity={0.7}
          >
            <Text className="text-muted text-xs">Save as Template</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* ── Edit Workout Modal ── */}
      <Modal visible={editWorkoutVisible} transparent animationType="slide">
        <View className="flex-1 justify-end bg-black/60">
          <View className="bg-surface rounded-t-3xl px-6 pt-6 pb-10 border-t border-border">
            <Text className="text-white font-bold text-xl mb-6">Edit Workout</Text>

            <Text className="text-textSecondary text-sm mb-2 ml-1">Workout Name</Text>
            <TextInput
              className="bg-card text-white px-4 py-4 rounded-2xl text-base border border-border mb-4"
              value={editName}
              onChangeText={setEditName}
              autoFocus
              returnKeyType="done"
            />

            <Text className="text-textSecondary text-sm mb-2 ml-1">Notes</Text>
            <TextInput
              className="bg-card text-white px-4 py-3 rounded-2xl text-base border border-border mb-6"
              value={editNotes}
              onChangeText={setEditNotes}
              placeholder="Add notes..."
              placeholderTextColor="#8e8e93"
              multiline
              style={{ minHeight: 80, textAlignVertical: 'top' }}
            />

            <TouchableOpacity
              className="bg-primary rounded-2xl py-4 items-center mb-3"
              onPress={saveWorkoutEdit}
              disabled={editWorkoutSaving || !editName.trim()}
              activeOpacity={0.85}
            >
              {editWorkoutSaving ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text className="text-white font-semibold text-base">Save</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              className="py-3 items-center"
              onPress={() => setEditWorkoutVisible(false)}
            >
              <Text className="text-muted text-base">Cancel</Text>
            </TouchableOpacity>

            <TouchableOpacity
              className="py-2 items-center"
              onPress={() => { setEditWorkoutVisible(false); deleteWorkout(); }}
            >
              <Text className="text-danger text-sm">Delete Workout</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

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

            <TouchableOpacity
              className={`flex-row items-center justify-between px-4 py-3 rounded-xl border mb-4 ${editIsBodyweight ? 'border-primary/40' : 'border-border bg-card'}`}
              style={editIsBodyweight ? { backgroundColor: '#0f0f2e' } : undefined}
              onPress={() => { setEditIsBodyweight(b => !b); setEditWeight(''); }}
              activeOpacity={0.7}
            >
              <Text className={`text-sm font-medium ${editIsBodyweight ? 'text-primary' : 'text-white'}`}>
                Bodyweight
              </Text>
              <View
                className={`w-5 h-5 rounded border items-center justify-center ${editIsBodyweight ? 'bg-primary border-primary' : 'border-border'}`}
              >
                {editIsBodyweight && <Text className="text-white text-xs font-bold">✓</Text>}
              </View>
            </TouchableOpacity>

            <View className="flex-row gap-x-3 mb-6">
              <View className="flex-1">
                <Text className="text-textSecondary text-sm mb-2 ml-1">
                  {editIsBodyweight ? 'Weight' : `Weight (${useLbs ? 'lbs' : 'kg'})`}
                </Text>
                <TextInput
                  className="bg-card text-white px-4 py-4 rounded-2xl text-base border border-border"
                  placeholder={editIsBodyweight ? 'BW' : '0'}
                  placeholderTextColor={editIsBodyweight ? '#6366f1' : '#8e8e93'}
                  value={editIsBodyweight ? '' : editWeight}
                  onChangeText={editIsBodyweight ? undefined : setEditWeight}
                  keyboardType="decimal-pad"
                  autoFocus={!editIsBodyweight}
                  editable={!editIsBodyweight}
                  style={editIsBodyweight ? { opacity: 0.5 } : undefined}
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

            <TouchableOpacity
              className={`flex-row items-center justify-between px-4 py-3 rounded-xl border mb-4 ${addIsBodyweight ? 'border-primary/40' : 'border-border bg-card'}`}
              style={addIsBodyweight ? { backgroundColor: '#0f0f2e' } : undefined}
              onPress={() => { setAddIsBodyweight(b => !b); setAddWeight(''); }}
              activeOpacity={0.7}
            >
              <Text className={`text-sm font-medium ${addIsBodyweight ? 'text-primary' : 'text-white'}`}>
                Bodyweight
              </Text>
              <View
                className={`w-5 h-5 rounded border items-center justify-center ${addIsBodyweight ? 'bg-primary border-primary' : 'border-border'}`}
              >
                {addIsBodyweight && <Text className="text-white text-xs font-bold">✓</Text>}
              </View>
            </TouchableOpacity>

            <View className="flex-row gap-x-3 mb-6">
              <View className="flex-1">
                <Text className="text-textSecondary text-sm mb-2 ml-1">
                  {addIsBodyweight ? 'Weight' : `Weight (${useLbs ? 'lbs' : 'kg'})`}
                </Text>
                <TextInput
                  className="bg-card text-white px-4 py-4 rounded-2xl text-base border border-border"
                  placeholder={addIsBodyweight ? 'BW' : '0'}
                  placeholderTextColor={addIsBodyweight ? '#6366f1' : '#8e8e93'}
                  value={addIsBodyweight ? '' : addWeight}
                  onChangeText={addIsBodyweight ? undefined : setAddWeight}
                  keyboardType="decimal-pad"
                  autoFocus={!addIsBodyweight}
                  editable={!addIsBodyweight}
                  style={addIsBodyweight ? { opacity: 0.5 } : undefined}
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
              onPress={() => { setAddingToGroup(null); setAddIsBodyweight(false); }}
            >
              <Text className="text-muted text-base">Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ── Save as Template Modal ── */}
      <Modal visible={saveTemplateVisible} transparent animationType="slide">
        <View className="flex-1 justify-end bg-black/60">
          <View className="bg-surface rounded-t-3xl px-6 pt-6 pb-10 border-t border-border">
            <Text className="text-white font-bold text-xl mb-1">Save as Template</Text>
            <Text className="text-muted text-sm mb-6">
              {groups.length} exercise{groups.length !== 1 ? 's' : ''} will be saved
            </Text>
            <Text className="text-textSecondary text-sm mb-2 ml-1">Template Name</Text>
            <TextInput
              className="bg-card text-white px-4 py-4 rounded-2xl text-base border border-border mb-6"
              placeholder="e.g. Push Day"
              placeholderTextColor="#8e8e93"
              value={templateName}
              onChangeText={setTemplateName}
              autoFocus
            />
            <TouchableOpacity
              className="bg-primary rounded-2xl py-4 items-center mb-3"
              onPress={saveAsTemplate}
              disabled={savingTemplate || !templateName.trim()}
              activeOpacity={0.85}
            >
              {savingTemplate ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text className="text-white font-semibold text-base">Save Template</Text>
              )}
            </TouchableOpacity>
            <TouchableOpacity className="py-3 items-center" onPress={() => setSaveTemplateVisible(false)}>
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
