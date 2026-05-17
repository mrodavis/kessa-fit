import { useState, useEffect, useCallback } from 'react';
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
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '@/lib/supabase';
import { UNIT_KEY } from '../(tabs)/profile';

interface Exercise {
  id: string;
  name: string;
  muscle_group: string | null;
  equipment: string | null;
}

interface LoggedSet {
  id: string;
  exerciseId: string;
  exerciseName: string;
  setNumber: number;
  reps: string;
  weightKg: string;
  saved: boolean;
}

export default function WorkoutLoggerScreen() {
  const { workoutId, workoutName } = useLocalSearchParams<{ workoutId: string; workoutName: string }>();
  const router = useRouter();

  const [sets, setSets] = useState<LoggedSet[]>([]);
  const [elapsed, setElapsed] = useState(0);
  const [useLbs, setUseLbs] = useState(true);

  // Add set modal
  const [addModalVisible, setAddModalVisible] = useState(false);
  const [selectedExercise, setSelectedExercise] = useState<Exercise | null>(null);
  const [reps, setReps] = useState('');
  const [weight, setWeight] = useState('');
  const [saving, setSaving] = useState(false);

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
    AsyncStorage.getItem(UNIT_KEY)
      .then(val => { if (val !== null) setUseLbs(val === 'lbs'); })
      .catch(() => {});
  }, []);

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

    if (query.trim()) {
      req.ilike('name', `%${query.trim()}%`);
    }

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
  };

  const addSet = async () => {
    if (!selectedExercise) {
      Alert.alert('Missing Info', 'Please select an exercise.');
      return;
    }
    setSaving(true);

    const setsForExercise = sets.filter((s) => s.exerciseId === selectedExercise.id).length;
    const setNumber = setsForExercise + 1;

    const rawWeight = weight ? parseFloat(weight) : null;
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
        saved: true,
      },
    ]);

    setReps('');
    setWeight('');
    setAddModalVisible(false);
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

  const groupedSets = sets.reduce<Record<string, LoggedSet[]>>((acc, set) => {
    if (!acc[set.exerciseName]) acc[set.exerciseName] = [];
    acc[set.exerciseName].push(set);
    return acc;
  }, {});

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

      {/* Set List */}
      <ScrollView className="flex-1 px-6 pt-4" showsVerticalScrollIndicator={false}>
        {Object.keys(groupedSets).length === 0 ? (
          <View className="items-center py-16">
            <Text className="text-muted text-center">
              No exercises yet.{'\n'}Tap + to log your first set.
            </Text>
          </View>
        ) : (
          Object.entries(groupedSets).map(([exercise, exerciseSets]) => (
            <View key={exercise} className="mb-6">
              <Text className="text-white font-semibold text-base mb-3">{exercise}</Text>
              <View className="flex-row mb-2 px-1">
                <Text className="text-muted text-xs w-10">SET</Text>
                <Text className="text-muted text-xs flex-1 text-center">
                  WEIGHT ({useLbs ? 'LBS' : 'KG'})
                </Text>
                <Text className="text-muted text-xs flex-1 text-center">REPS</Text>
              </View>
              {exerciseSets.map((set) => (
                <View
                  key={set.id}
                  className="flex-row items-center bg-card rounded-xl px-4 py-3 mb-2 border border-border"
                >
                  <Text className="text-muted text-sm w-10">{set.setNumber}</Text>
                  <Text className="text-white text-sm flex-1 text-center">
                    {set.weightKg || '—'}
                  </Text>
                  <Text className="text-white text-sm flex-1 text-center">
                    {set.reps || '—'}
                  </Text>
                </View>
              ))}
            </View>
          ))
        )}
        <View className="h-24" />
      </ScrollView>

      {/* FAB */}
      <View className="absolute bottom-8 right-6">
        <TouchableOpacity
          className="bg-primary w-16 h-16 rounded-full items-center justify-center"
          onPress={() => setAddModalVisible(true)}
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
              <Text className="text-muted text-xs mb-4 ml-1 -mt-2">
                {selectedExercise.muscle_group} · {selectedExercise.equipment}
              </Text>
            )}

            <View className="flex-row gap-x-3 mb-6">
              <View className="flex-1">
                <Text className="text-textSecondary text-sm mb-2 ml-1">
                  Weight ({useLbs ? 'lbs' : 'kg'})
                </Text>
                <TextInput
                  className="bg-card text-white px-4 py-4 rounded-2xl text-base border border-border"
                  placeholder="0"
                  placeholderTextColor="#8e8e93"
                  value={weight}
                  onChangeText={setWeight}
                  keyboardType="decimal-pad"
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
              className="bg-primary rounded-2xl py-4 items-center mb-3"
              onPress={addSet}
              disabled={saving}
              activeOpacity={0.85}
            >
              {saving ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text className="text-white font-semibold text-base">Add Set</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity className="py-3 items-center" onPress={() => setAddModalVisible(false)}>
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
