import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Alert,
  Modal,
  ScrollView,
  FlatList,
  ActivityIndicator,
  Animated,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { UNIT_KEY } from '@/constants';

interface Exercise {
  id: string;
  name: string;
  muscle_group: string | null;
  equipment: string | null;
}

interface LastSession {
  workoutDate: string;
  sets: Array<{ setNumber: number; reps: number | null; weightKg: number | null }>;
}

interface LoggedSet {
  id: string;
  exerciseId: string;
  exerciseName: string;
  setNumber: number;
  reps: string;
  weightKg: string;
  isBodyweight: boolean;
  isWarmup: boolean;
  supersetGroupId: string | null;
  saved: boolean;
}

type DisplayGroup =
  | { type: 'solo'; exerciseName: string; exerciseId: string; sets: LoggedSet[] }
  | { type: 'superset'; supersetGroupId: string; exercises: { name: string; id: string; sets: LoggedSet[] }[] };

const AMBER = '#f59e0b';
const AMBER_BG = '#1c1407';
const SUPERSET_COLOR = '#6366f1';
const SUPERSET_BG = '#13123a';

const generateUUID = (): string =>
  'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });

const getDisplayNumber = (set: LoggedSet, exerciseSets: LoggedSet[]): string => {
  if (set.isWarmup) {
    const n = exerciseSets.filter(s => s.isWarmup && s.setNumber < set.setNumber).length + 1;
    return `W${n}`;
  }
  const n = exerciseSets.filter(s => !s.isWarmup && s.setNumber < set.setNumber).length + 1;
  return String(n);
};

export default function WorkoutLoggerScreen() {
  const { workoutId, workoutName, templateId } = useLocalSearchParams<{ workoutId: string; workoutName: string; templateId?: string }>();
  const router = useRouter();
  const { user } = useAuth();

  const [sets, setSets] = useState<LoggedSet[]>([]);
  const [elapsed, setElapsed] = useState(0);
  const [useLbs, setUseLbs] = useState(true);

  // Add set modal
  const [addModalVisible, setAddModalVisible] = useState(false);
  const [selectedExercise, setSelectedExercise] = useState<Exercise | null>(null);
  const [reps, setReps] = useState('');
  const [weight, setWeight] = useState('');
  const [saving, setSaving] = useState(false);
  const [isBodyweight, setIsBodyweight] = useState(false);
  const [isWarmup, setIsWarmup] = useState(false);

  // Last session reference
  const [lastSession, setLastSession] = useState<LastSession | null>(null);
  const [loadingLastSession, setLoadingLastSession] = useState(false);

  // Rest timer
  const [restSecondsLeft, setRestSecondsLeft] = useState<number | null>(null);
  const pulseAnim = useRef(new Animated.Value(0)).current;

  // Edit set
  const [editingSet, setEditingSet] = useState<LoggedSet | null>(null);
  const [editWeight, setEditWeight] = useState('');
  const [editReps, setEditReps] = useState('');
  const [editSaving, setEditSaving] = useState(false);
  const [editIsBodyweight, setEditIsBodyweight] = useState(false);
  const [editIsWarmup, setEditIsWarmup] = useState(false);

  // Superset linking
  const [linkingExercise, setLinkingExercise] = useState<string | null>(null);

  // Template plan
  const [templateExercises, setTemplateExercises] = useState<Array<{
    exerciseId: string;
    exerciseName: string;
    targetSets: number;
  }>>([]);

  // Exercise picker
  const [pickerVisible, setPickerVisible] = useState(false);
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loadingExercises, setLoadingExercises] = useState(false);

  useEffect(() => {
    const interval = setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!templateId) return;
    supabase
      .from('workout_template_exercises')
      .select('exercise_id, exercise_name, sets')
      .eq('template_id', templateId)
      .order('position')
      .then(({ data }) => {
        if (data) setTemplateExercises(data.map(e => ({
          exerciseId: e.exercise_id,
          exerciseName: e.exercise_name,
          targetSets: e.sets,
        })));
      });
  }, [templateId]);

  useEffect(() => {
    if (restSecondsLeft === null) return;
    if (restSecondsLeft <= 0) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1, duration: 200, useNativeDriver: false }),
        Animated.timing(pulseAnim, { toValue: 0, duration: 200, useNativeDriver: false }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 200, useNativeDriver: false }),
        Animated.timing(pulseAnim, { toValue: 0, duration: 400, useNativeDriver: false }),
      ]).start(() => setRestSecondsLeft(null));
      return;
    }
    const t = setTimeout(() => setRestSecondsLeft(s => s !== null ? s - 1 : null), 1000);
    return () => clearTimeout(t);
  }, [restSecondsLeft]);

  useEffect(() => {
    AsyncStorage.getItem(UNIT_KEY)
      .then(val => { if (val !== null) setUseLbs(val === 'lbs'); })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!selectedExercise || !user) {
      setLastSession(null);
      return;
    }
    let cancelled = false;
    setLoadingLastSession(true);

    const fetchLast = async () => {
      const { data: recentWorkouts } = await supabase
        .from('workouts')
        .select('id, started_at')
        .eq('user_id', user.id)
        .not('finished_at', 'is', null)
        .neq('id', workoutId)
        .order('started_at', { ascending: false })
        .limit(20);

      const ids = (recentWorkouts ?? []).map(w => w.id);
      if (ids.length === 0) {
        if (!cancelled) { setLastSession(null); setLoadingLastSession(false); }
        return;
      }

      const { data: prevSets } = await supabase
        .from('workout_sets')
        .select('set_number, reps, weight_kg, workout_id')
        .eq('exercise_id', selectedExercise.id)
        .in('workout_id', ids)
        .order('set_number', { ascending: true });

      if (cancelled) return;

      const targetId = ids.find(id => prevSets?.some(s => s.workout_id === id));
      if (!targetId) {
        setLastSession(null);
        setLoadingLastSession(false);
        return;
      }

      const targetDate = recentWorkouts!.find(w => w.id === targetId)!.started_at;
      const targetSets = (prevSets ?? []).filter(s => s.workout_id === targetId);

      setLastSession({
        workoutDate: targetDate,
        sets: targetSets.map(s => ({
          setNumber: s.set_number,
          reps: s.reps,
          weightKg: s.weight_kg,
        })),
      });
      setLoadingLastSession(false);
    };

    fetchLast();
    return () => { cancelled = true; };
  }, [selectedExercise?.id]);

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60).toString().padStart(2, '0');
    const s = (seconds % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  const fetchExercises = useCallback(async (query: string) => {
    setLoadingExercises(true);
    const req = supabase
      .from('exercises')
      .select('id, name, muscle_group, equipment')
      .order('name');
    if (query.trim()) req.ilike('name', `%${query.trim()}%`);
    const { data } = await req.limit(50);
    setExercises(data ?? []);
    setLoadingExercises(false);
  }, []);

  useEffect(() => {
    if (pickerVisible) fetchExercises(searchQuery);
  }, [pickerVisible, searchQuery]);

  const openPicker = () => {
    setSearchQuery('');
    setPickerVisible(true);
  };

  const selectExercise = (ex: Exercise) => {
    setSelectedExercise(ex);
    setPickerVisible(false);
    setReps('');
    setWeight('');
    setIsBodyweight(false);
    setIsWarmup(false);
  };

  const addSet = async () => {
    if (!selectedExercise) {
      Alert.alert('Missing Info', 'Please select an exercise.');
      return;
    }
    setSaving(true);

    const setsForExercise = sets.filter((s) => s.exerciseId === selectedExercise.id);
    const setNumber = setsForExercise.length + 1;
    const existingSupersetGroupId = setsForExercise.find(s => s.supersetGroupId)?.supersetGroupId ?? null;

    const rawWeight = isBodyweight ? null : (weight ? parseFloat(weight) : null);
    const weightKg = rawWeight != null
      ? (useLbs ? rawWeight / 2.20462 : rawWeight)
      : null;

    const { data, error } = await supabase
      .from('workout_sets')
      .insert({
        workout_id: workoutId,
        exercise_id: selectedExercise.id,
        set_number: setNumber,
        reps: reps ? parseInt(reps) : null,
        weight_kg: weightKg,
        is_warmup: isWarmup,
        superset_group_id: existingSupersetGroupId,
      })
      .select()
      .single();

    setSaving(false);

    if (error) {
      Alert.alert('Error', error.message);
      return;
    }

    setSets((prev) => [
      ...prev,
      {
        id: data.id,
        exerciseId: selectedExercise.id,
        exerciseName: selectedExercise.name,
        setNumber,
        reps,
        weightKg: weight,
        isBodyweight,
        isWarmup,
        supersetGroupId: existingSupersetGroupId,
        saved: true,
      },
    ]);

    setReps('');
    setWeight('');
    setIsBodyweight(false);
    setIsWarmup(false);
    setSelectedExercise(null);
    setLastSession(null);
    setAddModalVisible(false);
    pulseAnim.setValue(0);
    setRestSecondsLeft(90);
  };

  const duplicateSet = async (set: LoggedSet) => {
    const newSetNumber = sets.filter(s => s.exerciseId === set.exerciseId).length + 1;
    const rawWeight = set.isBodyweight ? null : (set.weightKg ? parseFloat(set.weightKg) : null);
    const weightKg = rawWeight != null ? (useLbs ? rawWeight / 2.20462 : rawWeight) : null;

    const { data, error } = await supabase
      .from('workout_sets')
      .insert({
        workout_id: workoutId,
        exercise_id: set.exerciseId,
        set_number: newSetNumber,
        reps: set.reps ? parseInt(set.reps) : null,
        weight_kg: weightKg,
        is_warmup: set.isWarmup,
        superset_group_id: set.supersetGroupId,
      })
      .select()
      .single();

    if (error) { Alert.alert('Error', error.message); return; }

    setSets(prev => [...prev, {
      id: data.id,
      exerciseId: set.exerciseId,
      exerciseName: set.exerciseName,
      setNumber: newSetNumber,
      reps: set.reps,
      weightKg: set.weightKg,
      isBodyweight: set.isBodyweight,
      isWarmup: set.isWarmup,
      supersetGroupId: set.supersetGroupId,
      saved: true,
    }]);
    pulseAnim.setValue(0);
    setRestSecondsLeft(90);
  };

  const updateSet = async () => {
    if (!editingSet) return;
    setEditSaving(true);

    const rawWeight = editIsBodyweight ? null : (editWeight ? parseFloat(editWeight) : null);
    const weightKg = rawWeight != null ? (useLbs ? rawWeight / 2.20462 : rawWeight) : null;

    const { error } = await supabase
      .from('workout_sets')
      .update({
        reps: editReps ? parseInt(editReps) : null,
        weight_kg: weightKg,
        is_warmup: editIsWarmup,
      })
      .eq('id', editingSet.id);

    setEditSaving(false);
    if (error) { Alert.alert('Error', error.message); return; }

    setSets(prev => prev.map(s =>
      s.id === editingSet.id
        ? { ...s, reps: editReps, weightKg: editWeight, isBodyweight: editIsBodyweight, isWarmup: editIsWarmup }
        : s
    ));
    setEditingSet(null);
  };

  const deleteSet = () => {
    if (!editingSet) return;
    Alert.alert('Delete Set', `Remove Set ${editingSet.setNumber} of ${editingSet.exerciseName}?`, [
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

          setSets(prev => {
            const filtered = prev.filter(s => s.id !== editingSet.id);
            let n = 0;
            return filtered.map(s =>
              s.exerciseId === editingSet.exerciseId ? { ...s, setNumber: ++n } : s
            );
          });
          setEditingSet(null);
        },
      },
    ]);
  };

  const linkExercise = async (targetName: string) => {
    if (!linkingExercise || linkingExercise === targetName) {
      setLinkingExercise(null);
      return;
    }
    const sourceIds = sets.filter(s => s.exerciseName === linkingExercise).map(s => s.id);
    const targetIds = sets.filter(s => s.exerciseName === targetName).map(s => s.id);
    const allIds = [...sourceIds, ...targetIds];
    if (allIds.length === 0) { setLinkingExercise(null); return; }

    const uuid = generateUUID();
    const { error } = await supabase
      .from('workout_sets')
      .update({ superset_group_id: uuid })
      .in('id', allIds);

    if (error) { Alert.alert('Error', error.message); return; }

    setSets(prev => prev.map(s => allIds.includes(s.id) ? { ...s, supersetGroupId: uuid } : s));
    setLinkingExercise(null);
  };

  const unlinkSuperset = async (supersetGroupId: string) => {
    Alert.alert('Unlink Superset', 'Remove the superset grouping for these exercises?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Unlink',
        style: 'destructive',
        onPress: async () => {
          const allIds = sets.filter(s => s.supersetGroupId === supersetGroupId).map(s => s.id);
          const { error } = await supabase
            .from('workout_sets')
            .update({ superset_group_id: null })
            .in('id', allIds);
          if (error) { Alert.alert('Error', error.message); return; }
          setSets(prev => prev.map(s => allIds.includes(s.id) ? { ...s, supersetGroupId: null } : s));
        },
      },
    ]);
  };

  const finishWorkout = () => {
    Alert.alert('Finish Workout', 'Are you sure you want to end this session?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Finish',
        style: 'destructive',
        onPress: async () => {
          await supabase
            .from('workouts')
            .update({ finished_at: new Date().toISOString() })
            .eq('id', workoutId);
          router.replace('/(app)/(tabs)');
        },
      },
    ]);
  };

  const displayGroups = useMemo<DisplayGroup[]>(() => {
    const byExercise = new Map<string, { id: string; name: string; sets: LoggedSet[] }>();
    for (const set of sets) {
      if (!byExercise.has(set.exerciseName)) {
        byExercise.set(set.exerciseName, { id: set.exerciseId, name: set.exerciseName, sets: [] });
      }
      byExercise.get(set.exerciseName)!.sets.push(set);
    }

    const supersetMap = new Map<string, string[]>();
    for (const [name, ex] of byExercise) {
      const sgId = ex.sets.find(s => s.supersetGroupId)?.supersetGroupId;
      if (sgId) {
        if (!supersetMap.has(sgId)) supersetMap.set(sgId, []);
        if (!supersetMap.get(sgId)!.includes(name)) supersetMap.get(sgId)!.push(name);
      }
    }

    const result: DisplayGroup[] = [];
    const seen = new Set<string>();

    for (const [name, ex] of byExercise) {
      if (seen.has(name)) continue;
      const sgId = ex.sets.find(s => s.supersetGroupId)?.supersetGroupId;
      if (sgId && (supersetMap.get(sgId)?.length ?? 0) > 1) {
        const exerciseNames = supersetMap.get(sgId)!;
        const exercises = exerciseNames
          .filter(n => byExercise.has(n))
          .map(n => ({ name: n, id: byExercise.get(n)!.id, sets: byExercise.get(n)!.sets }));
        result.push({ type: 'superset', supersetGroupId: sgId, exercises });
        exerciseNames.forEach(n => seen.add(n));
      } else {
        result.push({ type: 'solo', exerciseName: name, exerciseId: ex.id, sets: ex.sets });
        seen.add(name);
      }
    }

    return result;
  }, [sets]);

  const supersetExerciseNames = useMemo(() => {
    const names = new Set<string>();
    for (const group of displayGroups) {
      if (group.type === 'superset') group.exercises.forEach(e => names.add(e.name));
    }
    return names;
  }, [displayGroups]);

  const renderSetRows = (exerciseSets: LoggedSet[]) => (
    <>
      <View className="flex-row mb-2 px-1">
        <Text className="text-muted text-xs w-10">SET</Text>
        <Text className="text-muted text-xs flex-1 text-center">
          WEIGHT ({useLbs ? 'LBS' : 'KG'})
        </Text>
        <Text className="text-muted text-xs flex-1 text-center">REPS</Text>
        <Text className="text-muted text-xs w-8" />
      </View>
      {exerciseSets.map((set) => {
        const displayNum = getDisplayNumber(set, exerciseSets);
        return (
          <TouchableOpacity
            key={set.id}
            className="flex-row items-center bg-card rounded-xl px-4 py-3 mb-2 border border-border"
            style={set.isWarmup ? { opacity: 0.65 } : undefined}
            onPress={() => {
              setEditingSet(set);
              setEditWeight(set.weightKg);
              setEditReps(set.reps);
              setEditIsBodyweight(set.isBodyweight);
              setEditIsWarmup(set.isWarmup);
            }}
            activeOpacity={0.7}
          >
            <Text
              style={set.isWarmup
                ? { color: AMBER, fontWeight: '700', fontSize: 12, width: 40 }
                : { color: '#8e8e93', fontSize: 14, width: 40 }
              }
            >
              {displayNum}
            </Text>
            <Text className="text-white text-sm flex-1 text-center">
              {set.isBodyweight ? 'BW' : set.weightKg || '—'}
            </Text>
            <Text className="text-white text-sm flex-1 text-center">
              {set.reps || '—'}
            </Text>
            <TouchableOpacity
              onPress={() => duplicateSet(set)}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              className="w-8 items-center"
            >
              <Text className="text-primary text-lg">⊕</Text>
            </TouchableOpacity>
          </TouchableOpacity>
        );
      })}
    </>
  );

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top']}>
      {/* Header */}
      <View className="px-6 pt-4 pb-4 flex-row items-center justify-between border-b border-border">
        <View>
          <Text className="text-white font-bold text-lg">{workoutName}</Text>
          <Text className="text-primary text-sm font-semibold">{formatTime(elapsed)}</Text>
        </View>
        <TouchableOpacity
          className="bg-danger rounded-xl px-4 py-2"
          onPress={finishWorkout}
          activeOpacity={0.8}
        >
          <Text className="text-white font-semibold text-sm">Finish</Text>
        </TouchableOpacity>
      </View>

      {/* Template Plan Bar */}
      {templateExercises.length > 0 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          className="border-b border-border"
          contentContainerStyle={{ paddingHorizontal: 24, paddingVertical: 12, gap: 8 }}
        >
          {templateExercises.map(te => {
            const logged = sets.filter(s => s.exerciseId === te.exerciseId).length;
            const done = logged >= te.targetSets;
            return (
              <TouchableOpacity
                key={te.exerciseId}
                className={`px-3 py-2 rounded-xl border mr-2 ${done ? 'border-success/40' : 'bg-card border-border'}`}
                style={done ? { backgroundColor: '#052e16' } : undefined}
                onPress={() => {
                  setSelectedExercise({ id: te.exerciseId, name: te.exerciseName, muscle_group: null, equipment: null });
                  setReps('');
                  setWeight('');
                  setIsWarmup(false);
                  setRestSecondsLeft(null);
                  setAddModalVisible(true);
                }}
                activeOpacity={0.7}
              >
                <Text
                  className={`text-xs font-semibold ${done ? 'text-success' : 'text-white'}`}
                  numberOfLines={1}
                >
                  {te.exerciseName}
                </Text>
                <Text className="text-muted text-xs">{logged}/{te.targetSets} sets</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      )}

      {/* Linking Mode Banner */}
      {linkingExercise && (
        <View style={{ backgroundColor: SUPERSET_BG, paddingHorizontal: 24, paddingVertical: 12, flexDirection: 'row', alignItems: 'center' }}>
          <Text style={{ color: SUPERSET_COLOR, fontSize: 13, flex: 1 }}>
            Tap an exercise to superset with{' '}
            <Text style={{ fontWeight: '700' }}>{linkingExercise}</Text>
          </Text>
          <TouchableOpacity onPress={() => setLinkingExercise(null)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Text style={{ color: '#8e8e93', fontSize: 13 }}>Cancel</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Set List */}
      <ScrollView className="flex-1 px-6 pt-4" showsVerticalScrollIndicator={false}>
        {displayGroups.length === 0 ? (
          <View className="items-center py-16">
            <Text className="text-muted text-center">
              No exercises yet.{'\n'}Tap + to log your first set.
            </Text>
          </View>
        ) : (
          displayGroups.map((group, groupIdx) => {
            if (group.type === 'superset') {
              return (
                <View
                  key={group.supersetGroupId}
                  style={{ borderLeftWidth: 2, borderLeftColor: SUPERSET_COLOR, paddingLeft: 12, marginBottom: 24 }}
                >
                  <View className="flex-row items-center justify-between mb-4">
                    <View style={{ backgroundColor: SUPERSET_BG, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 }}>
                      <Text style={{ color: SUPERSET_COLOR, fontSize: 10, fontWeight: '700', letterSpacing: 1 }}>
                        SUPERSET
                      </Text>
                    </View>
                    <TouchableOpacity onPress={() => unlinkSuperset(group.supersetGroupId)} activeOpacity={0.7}>
                      <Text style={{ color: '#8e8e93', fontSize: 12 }}>Unlink</Text>
                    </TouchableOpacity>
                  </View>
                  {group.exercises.map((ex, exIdx) => (
                    <View key={ex.name} style={exIdx > 0 ? { marginTop: 16 } : undefined}>
                      <Text className="text-white font-semibold text-sm mb-3">{ex.name}</Text>
                      {renderSetRows(ex.sets)}
                    </View>
                  ))}
                </View>
              );
            }

            // Solo group
            const isLinkingThis = linkingExercise === group.exerciseName;
            const isInSuperset = supersetExerciseNames.has(group.exerciseName);
            const isLinkTarget = !!linkingExercise && !isLinkingThis && !isInSuperset;

            return (
              <View key={group.exerciseName} className="mb-6">
                <View className="flex-row items-center justify-between mb-3">
                  <Text className="text-white font-semibold text-base flex-1 mr-3" numberOfLines={1}>
                    {group.exerciseName}
                  </Text>
                  {isLinkingThis ? (
                    <TouchableOpacity onPress={() => setLinkingExercise(null)} activeOpacity={0.7}>
                      <Text style={{ color: '#8e8e93', fontSize: 12 }}>Cancel</Text>
                    </TouchableOpacity>
                  ) : isLinkTarget ? (
                    <TouchableOpacity onPress={() => linkExercise(group.exerciseName)} activeOpacity={0.7}>
                      <Text style={{ color: SUPERSET_COLOR, fontSize: 12, fontWeight: '600' }}>+ Link here</Text>
                    </TouchableOpacity>
                  ) : !linkingExercise && !isInSuperset ? (
                    <TouchableOpacity onPress={() => setLinkingExercise(group.exerciseName)} activeOpacity={0.7}>
                      <Text style={{ color: '#8e8e93', fontSize: 12 }}>Link</Text>
                    </TouchableOpacity>
                  ) : null}
                </View>
                {renderSetRows(group.sets)}
              </View>
            );
          })
        )}
        <View className="h-24" />
      </ScrollView>

      {/* Rest Timer Banner */}
      {restSecondsLeft !== null && (
        <Animated.View
          style={{
            position: 'absolute',
            bottom: 108,
            left: 24,
            right: 24,
            backgroundColor: pulseAnim.interpolate({
              inputRange: [0, 1],
              outputRange: ['#141414', '#22c55e'],
            }),
            borderRadius: 20,
            borderWidth: 1,
            borderColor: '#2c2c2e',
            paddingHorizontal: 20,
            paddingVertical: 14,
            flexDirection: 'row',
            alignItems: 'center',
            shadowColor: '#000',
            shadowOffset: { width: 0, height: -2 },
            shadowOpacity: 0.3,
            shadowRadius: 8,
            elevation: 8,
          }}
        >
          <View>
            <Text style={{ color: '#8e8e93', fontSize: 10, fontWeight: '600', letterSpacing: 1, textTransform: 'uppercase' }}>
              Rest
            </Text>
            <Text style={{
              color: restSecondsLeft <= 10 ? '#ef4444' : restSecondsLeft <= 30 ? '#f97316' : '#f5f5f7',
              fontSize: 28,
              fontWeight: 'bold',
            }}>
              {Math.floor(restSecondsLeft / 60)}:{(restSecondsLeft % 60).toString().padStart(2, '0')}
            </Text>
          </View>
          <View style={{ flex: 1, flexDirection: 'row', justifyContent: 'center', gap: 5 }}>
            {Array.from({ length: 9 }, (_, i) => (
              <View
                key={i}
                style={{
                  width: 7,
                  height: 7,
                  borderRadius: 3.5,
                  backgroundColor: i < Math.ceil(restSecondsLeft / 10) ? '#6366f1' : '#2c2c2e',
                }}
              />
            ))}
          </View>
          <TouchableOpacity onPress={() => setRestSecondsLeft(null)} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
            <Text style={{ color: '#8e8e93', fontSize: 14 }}>Skip</Text>
          </TouchableOpacity>
        </Animated.View>
      )}

      {/* FAB */}
      <View className="absolute bottom-8 right-6">
        <TouchableOpacity
          className="bg-primary w-16 h-16 rounded-full items-center justify-center"
          onPress={() => { setRestSecondsLeft(null); setAddModalVisible(true); }}
          activeOpacity={0.85}
        >
          <Text className="text-white text-3xl leading-none">+</Text>
        </TouchableOpacity>
      </View>

      {/* ── Add Set Modal ── */}
      <Modal visible={addModalVisible} transparent animationType="slide">
        <View className="flex-1 justify-end bg-black/60">
          <View className="bg-surface rounded-t-3xl px-6 pt-6 pb-10 border-t border-border">
            <Text className="text-white font-bold text-xl mb-6">Log a Set</Text>

            {/* Exercise Picker Button */}
            <Text className="text-textSecondary text-sm mb-2 ml-1">Exercise</Text>
            <TouchableOpacity
              className="bg-card border border-border rounded-2xl px-4 py-4 mb-4 flex-row items-center justify-between"
              onPress={openPicker}
              activeOpacity={0.7}
            >
              <Text className={selectedExercise ? 'text-white text-base' : 'text-muted text-base'}>
                {selectedExercise ? selectedExercise.name : 'Select an exercise...'}
              </Text>
              <Text className="text-muted text-sm">▼</Text>
            </TouchableOpacity>

            {selectedExercise?.muscle_group && (
              <Text className="text-muted text-xs mb-3 ml-1 -mt-2">
                {selectedExercise.muscle_group} · {selectedExercise.equipment}
              </Text>
            )}

            {/* Last session reference */}
            {loadingLastSession && (
              <View className="items-center mb-4">
                <ActivityIndicator size="small" color="#6366f1" />
              </View>
            )}
            {!loadingLastSession && lastSession && (
              <View className="bg-background border border-border rounded-xl px-4 py-3 mb-4">
                <Text className="text-muted text-xs mb-2">
                  Last session ·{' '}
                  {new Date(lastSession.workoutDate).toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                  })}
                </Text>
                {lastSession.sets.map(s => (
                  <View key={s.setNumber} className="flex-row mb-0.5">
                    <Text className="text-muted text-xs w-14">Set {s.setNumber}</Text>
                    <Text className="text-white text-xs font-medium">
                      {s.weightKg != null
                        ? `${useLbs ? Math.round(s.weightKg * 2.20462) : s.weightKg} ${useLbs ? 'lbs' : 'kg'}`
                        : 'BW'}{' '}
                      × {s.reps ?? '—'}
                    </Text>
                  </View>
                ))}
              </View>
            )}

            {/* Set type toggle */}
            <View style={{ flexDirection: 'row', backgroundColor: '#1c1c1e', borderRadius: 12, borderWidth: 1, borderColor: '#2c2c2e', marginBottom: 16, overflow: 'hidden' }}>
              <TouchableOpacity
                style={{ flex: 1, paddingVertical: 10, alignItems: 'center', backgroundColor: !isWarmup ? '#6366f1' : 'transparent', borderRadius: 11 }}
                onPress={() => setIsWarmup(false)}
                activeOpacity={0.7}
              >
                <Text style={{ color: !isWarmup ? '#fff' : '#8e8e93', fontSize: 13, fontWeight: '600' }}>Working</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={{ flex: 1, paddingVertical: 10, alignItems: 'center', backgroundColor: isWarmup ? AMBER_BG : 'transparent', borderRadius: 11 }}
                onPress={() => setIsWarmup(true)}
                activeOpacity={0.7}
              >
                <Text style={{ color: isWarmup ? AMBER : '#8e8e93', fontSize: 13, fontWeight: '600' }}>Warm-up</Text>
              </TouchableOpacity>
            </View>

            {/* Bodyweight toggle */}
            <TouchableOpacity
              className={`flex-row items-center justify-between px-4 py-3 rounded-xl border mb-4 ${isBodyweight ? 'border-primary/40' : 'border-border bg-card'}`}
              style={isBodyweight ? { backgroundColor: '#0f0f2e' } : undefined}
              onPress={() => { setIsBodyweight(b => !b); setWeight(''); }}
              activeOpacity={0.7}
            >
              <Text className={`text-sm font-medium ${isBodyweight ? 'text-primary' : 'text-white'}`}>
                Bodyweight
              </Text>
              <View
                className={`w-5 h-5 rounded border items-center justify-center ${isBodyweight ? 'bg-primary border-primary' : 'border-border'}`}
              >
                {isBodyweight && <Text className="text-white text-xs font-bold">✓</Text>}
              </View>
            </TouchableOpacity>

            <View className="flex-row gap-x-3 mb-6">
              <View className="flex-1">
                <Text className="text-textSecondary text-sm mb-2 ml-1">
                  {isBodyweight ? 'Weight' : `Weight (${useLbs ? 'lbs' : 'kg'})`}
                </Text>
                <TextInput
                  className="bg-card text-white px-4 py-4 rounded-2xl text-base border border-border"
                  placeholder={isBodyweight ? 'BW' : '0'}
                  placeholderTextColor={isBodyweight ? '#6366f1' : '#8e8e93'}
                  value={isBodyweight ? '' : weight}
                  onChangeText={isBodyweight ? undefined : setWeight}
                  keyboardType="decimal-pad"
                  editable={!isBodyweight}
                  style={isBodyweight ? { opacity: 0.5 } : undefined}
                />
              </View>
              <View className="flex-1">
                <Text className="text-textSecondary text-sm mb-2 ml-1">Reps</Text>
                <TextInput
                  className="bg-card text-white px-4 py-4 rounded-2xl text-base border border-border"
                  placeholder="0"
                  placeholderTextColor="#8e8e93"
                  value={reps}
                  onChangeText={setReps}
                  keyboardType="number-pad"
                />
              </View>
            </View>

            <TouchableOpacity
              className="rounded-2xl py-4 items-center mb-3"
              style={{ backgroundColor: isWarmup ? '#92400e' : '#6366f1' }}
              onPress={addSet}
              disabled={saving}
              activeOpacity={0.85}
            >
              {saving ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text className="text-white font-semibold text-base">
                  {isWarmup ? 'Add Warm-up Set' : 'Add Set'}
                </Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              className="py-3 items-center"
              onPress={() => {
                setAddModalVisible(false);
                setSelectedExercise(null);
                setLastSession(null);
                setIsBodyweight(false);
                setIsWarmup(false);
              }}
            >
              <Text className="text-muted text-base">Cancel</Text>
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
              {editingSet?.exerciseName} · Set {editingSet?.setNumber}
            </Text>

            {/* Set type toggle */}
            <View style={{ flexDirection: 'row', backgroundColor: '#1c1c1e', borderRadius: 12, borderWidth: 1, borderColor: '#2c2c2e', marginBottom: 16, overflow: 'hidden' }}>
              <TouchableOpacity
                style={{ flex: 1, paddingVertical: 10, alignItems: 'center', backgroundColor: !editIsWarmup ? '#6366f1' : 'transparent', borderRadius: 11 }}
                onPress={() => setEditIsWarmup(false)}
                activeOpacity={0.7}
              >
                <Text style={{ color: !editIsWarmup ? '#fff' : '#8e8e93', fontSize: 13, fontWeight: '600' }}>Working</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={{ flex: 1, paddingVertical: 10, alignItems: 'center', backgroundColor: editIsWarmup ? AMBER_BG : 'transparent', borderRadius: 11 }}
                onPress={() => setEditIsWarmup(true)}
                activeOpacity={0.7}
              >
                <Text style={{ color: editIsWarmup ? AMBER : '#8e8e93', fontSize: 13, fontWeight: '600' }}>Warm-up</Text>
              </TouchableOpacity>
            </View>

            {/* Bodyweight toggle */}
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
                  onPress={() => selectExercise(item)}
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
