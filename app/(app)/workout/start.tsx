import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Modal,
  ScrollView,
  FlatList,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';

interface Exercise {
  id: string;
  name: string;
  muscle_group: string | null;
  equipment: string | null;
}

interface BuilderExercise {
  exerciseId: string;
  exerciseName: string;
  sets: number;
}

interface WorkoutTemplate {
  id: string;
  name: string;
  exercises: BuilderExercise[];
}

const QUICK_NAMES = ['Push Day', 'Pull Day', 'Leg Day', 'Upper Body', 'Lower Body', 'Full Body'];

export default function StartWorkoutScreen() {
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const { user } = useAuth();
  const router = useRouter();

  const [templates, setTemplates] = useState<WorkoutTemplate[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(true);

  const [builderVisible, setBuilderVisible] = useState(false);
  const [builderStep, setBuilderStep] = useState<'name' | 'exercises'>('name');
  const [builderName, setBuilderName] = useState('');
  const [builderExercises, setBuilderExercises] = useState<BuilderExercise[]>([]);
  const [builderSaving, setBuilderSaving] = useState(false);

  const [pickerVisible, setPickerVisible] = useState(false);
  const [pickerExercises, setPickerExercises] = useState<Exercise[]>([]);
  const [pickerSearch, setPickerSearch] = useState('');
  const [loadingPicker, setLoadingPicker] = useState(false);

  useEffect(() => {
    if (!user) return;
    const fetchTemplates = async () => {
      const { data } = await supabase
        .from('workout_templates')
        .select('id, name, workout_template_exercises(exercise_id, exercise_name, sets, position)')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (data) {
        setTemplates(data.map(t => ({
          id: t.id,
          name: t.name,
          exercises: ((t.workout_template_exercises as any[]) ?? [])
            .sort((a, b) => a.position - b.position)
            .map(e => ({ exerciseId: e.exercise_id, exerciseName: e.exercise_name, sets: e.sets })),
        })));
      }
      setLoadingTemplates(false);
    };
    fetchTemplates();
  }, [user]);

  const fetchPickerExercises = useCallback(async (query: string) => {
    setLoadingPicker(true);
    const req = supabase.from('exercises').select('id, name, muscle_group, equipment').order('name');
    if (query.trim()) req.ilike('name', `%${query.trim()}%`);
    const { data } = await req.limit(50);
    setPickerExercises(data ?? []);
    setLoadingPicker(false);
  }, []);

  useEffect(() => {
    if (pickerVisible) fetchPickerExercises(pickerSearch);
  }, [pickerVisible, pickerSearch]);

  const handleStart = async (workoutName: string, templateId?: string) => {
    if (!user) return;
    setLoading(true);
    const { data, error } = await supabase
      .from('workouts')
      .insert({ user_id: user.id, name: workoutName, started_at: new Date().toISOString() })
      .select()
      .single();
    setLoading(false);

    if (error) { Alert.alert('Error', error.message); return; }
    router.push({
      pathname: '/(app)/workout/logger',
      params: { workoutId: data.id, workoutName: data.name, ...(templateId ? { templateId } : {}) },
    });
  };

  const deleteTemplate = (template: WorkoutTemplate) => {
    Alert.alert('Delete Template', `Remove "${template.name}"?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await supabase.from('workout_templates').delete().eq('id', template.id);
          setTemplates(prev => prev.filter(t => t.id !== template.id));
        },
      },
    ]);
  };

  const openBuilder = () => {
    setBuilderName('');
    setBuilderExercises([]);
    setBuilderStep('name');
    setBuilderVisible(true);
  };

  const addToBuilder = (ex: Exercise) => {
    setPickerVisible(false);
    if (!builderExercises.some(e => e.exerciseId === ex.id)) {
      setBuilderExercises(prev => [...prev, { exerciseId: ex.id, exerciseName: ex.name, sets: 3 }]);
    }
  };

  const saveTemplate = async () => {
    if (!user || !builderName.trim() || builderExercises.length === 0) return;
    setBuilderSaving(true);

    const { data: tmpl, error } = await supabase
      .from('workout_templates')
      .insert({ user_id: user.id, name: builderName.trim() })
      .select('id')
      .single();

    if (error) { Alert.alert('Error', error.message); setBuilderSaving(false); return; }

    await supabase.from('workout_template_exercises').insert(
      builderExercises.map((ex, i) => ({
        template_id: tmpl.id,
        exercise_id: ex.exerciseId,
        exercise_name: ex.exerciseName,
        sets: ex.sets,
        position: i,
      }))
    );

    setTemplates(prev => [{ id: tmpl.id, name: builderName.trim(), exercises: builderExercises }, ...prev]);
    setBuilderSaving(false);
    setBuilderVisible(false);
  };

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top']}>
      <ScrollView
        className="flex-1 px-6"
        contentContainerStyle={{ paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View className="flex-row items-center pt-4 mb-8">
          <TouchableOpacity onPress={() => router.back()} className="mr-4 p-2 -ml-2">
            <Text className="text-primary text-base">← Back</Text>
          </TouchableOpacity>
          <Text className="text-white text-xl font-bold">New Workout</Text>
        </View>

        {/* Templates */}
        {!loadingTemplates && (
          <>
            <View className="flex-row items-center justify-between mb-3">
              <Text className="text-muted text-xs font-semibold uppercase tracking-widest ml-1">
                Templates
              </Text>
              <TouchableOpacity onPress={openBuilder} activeOpacity={0.7}>
                <Text className="text-primary text-sm font-medium">+ New</Text>
              </TouchableOpacity>
            </View>

            {templates.length === 0 ? (
              <TouchableOpacity
                className="bg-card border border-dashed border-border rounded-2xl px-5 py-5 mb-8 items-center"
                onPress={openBuilder}
                activeOpacity={0.7}
              >
                <Text className="text-muted text-sm">No templates yet</Text>
                <Text className="text-primary text-sm mt-1">Tap to create one</Text>
              </TouchableOpacity>
            ) : (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                className="mb-8"
                contentContainerStyle={{ gap: 12, paddingRight: 4 }}
              >
                {templates.map(t => (
                  <TouchableOpacity
                    key={t.id}
                    className="bg-card border border-border rounded-2xl px-5 py-4 w-44"
                    onPress={() => handleStart(t.name, t.id)}
                    onLongPress={() => deleteTemplate(t)}
                    activeOpacity={0.7}
                  >
                    <Text className="text-white font-semibold text-sm mb-2" numberOfLines={1}>
                      {t.name}
                    </Text>
                    {t.exercises.slice(0, 3).map(e => (
                      <Text key={e.exerciseId} className="text-muted text-xs" numberOfLines={1}>
                        {e.exerciseName} × {e.sets}
                      </Text>
                    ))}
                    {t.exercises.length > 3 && (
                      <Text className="text-muted text-xs">+{t.exercises.length - 3} more</Text>
                    )}
                    <Text className="text-primary text-xs mt-3 font-medium">Tap to start →</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}
          </>
        )}

        {/* Name Input */}
        <Text className="text-textSecondary text-sm mb-2 ml-1">Workout Name</Text>
        <TextInput
          className="bg-card text-white px-4 py-4 rounded-2xl text-base border border-border mb-6"
          placeholder="e.g. Push Day"
          placeholderTextColor="#8e8e93"
          value={name}
          onChangeText={setName}
          returnKeyType="done"
          onSubmitEditing={() => name.trim() && handleStart(name.trim())}
        />

        {/* Quick Select */}
        <Text className="text-textSecondary text-sm mb-3 ml-1">Quick Select</Text>
        <View className="flex-row flex-wrap gap-2 mb-8">
          {QUICK_NAMES.map((n) => (
            <TouchableOpacity
              key={n}
              className="bg-card border border-border rounded-xl px-4 py-3"
              onPress={() => handleStart(n)}
              activeOpacity={0.7}
            >
              <Text className="text-white text-sm">{n}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Start Button */}
        <TouchableOpacity
          className="bg-primary rounded-2xl py-4 items-center"
          onPress={() => handleStart(name.trim() || 'Workout')}
          disabled={loading}
          activeOpacity={0.85}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text className="text-white font-semibold text-base">Start Session</Text>
          )}
        </TouchableOpacity>
      </ScrollView>

      {/* ── Template Builder Modal ── */}
      <Modal visible={builderVisible} transparent animationType="slide">
        <View className="flex-1 justify-end bg-black/60">
          <View
            className="bg-surface rounded-t-3xl px-6 pt-6 pb-10 border-t border-border"
            style={{ maxHeight: '80%' }}
          >
            <Text className="text-white font-bold text-xl mb-1">New Template</Text>

            {builderStep === 'name' ? (
              <>
                <Text className="text-muted text-sm mb-6">Give your template a name</Text>
                <Text className="text-textSecondary text-sm mb-2 ml-1">Template Name</Text>
                <TextInput
                  className="bg-card text-white px-4 py-4 rounded-2xl text-base border border-border mb-6"
                  placeholder="e.g. Push Day"
                  placeholderTextColor="#8e8e93"
                  value={builderName}
                  onChangeText={setBuilderName}
                  autoFocus
                  returnKeyType="next"
                  onSubmitEditing={() => builderName.trim() && setBuilderStep('exercises')}
                />
                <TouchableOpacity
                  className="bg-primary rounded-2xl py-4 items-center mb-3"
                  onPress={() => builderName.trim() && setBuilderStep('exercises')}
                  activeOpacity={0.85}
                >
                  <Text className="text-white font-semibold text-base">Next →</Text>
                </TouchableOpacity>
                <TouchableOpacity className="py-3 items-center" onPress={() => setBuilderVisible(false)}>
                  <Text className="text-muted text-base">Cancel</Text>
                </TouchableOpacity>
              </>
            ) : (
              <>
                <Text className="text-muted text-sm mb-4">{builderName}</Text>
                <ScrollView style={{ maxHeight: 280 }} showsVerticalScrollIndicator={false}>
                  {builderExercises.length === 0 ? (
                    <View className="py-6 items-center">
                      <Text className="text-muted text-sm">Add exercises below</Text>
                    </View>
                  ) : (
                    builderExercises.map((ex, i) => (
                      <View
                        key={ex.exerciseId}
                        className="flex-row items-center bg-card border border-border rounded-xl px-4 py-3 mb-2"
                      >
                        <Text className="text-white text-sm flex-1" numberOfLines={1}>
                          {ex.exerciseName}
                        </Text>
                        <TouchableOpacity
                          onPress={() => setBuilderExercises(prev =>
                            prev.map((e, idx) => idx === i ? { ...e, sets: Math.max(1, e.sets - 1) } : e)
                          )}
                          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        >
                          <Text className="text-muted text-lg px-2">−</Text>
                        </TouchableOpacity>
                        <Text className="text-white text-sm w-6 text-center">{ex.sets}</Text>
                        <TouchableOpacity
                          onPress={() => setBuilderExercises(prev =>
                            prev.map((e, idx) => idx === i ? { ...e, sets: e.sets + 1 } : e)
                          )}
                          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        >
                          <Text className="text-primary text-lg px-2">+</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          onPress={() => setBuilderExercises(prev => prev.filter((_, idx) => idx !== i))}
                          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                          className="ml-2"
                        >
                          <Text className="text-danger text-sm">✕</Text>
                        </TouchableOpacity>
                      </View>
                    ))
                  )}
                </ScrollView>
                <TouchableOpacity
                  className="flex-row items-center py-3 mb-4"
                  onPress={() => { setPickerSearch(''); setPickerVisible(true); }}
                  activeOpacity={0.7}
                >
                  <Text className="text-primary text-sm font-medium">+ Add Exercise</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  className="bg-primary rounded-2xl py-4 items-center mb-3"
                  onPress={saveTemplate}
                  disabled={builderSaving || builderExercises.length === 0}
                  activeOpacity={0.85}
                >
                  {builderSaving ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text className="text-white font-semibold text-base">Save Template</Text>
                  )}
                </TouchableOpacity>
                <TouchableOpacity className="py-2 items-center" onPress={() => setBuilderStep('name')}>
                  <Text className="text-muted text-sm">← Back</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>
      </Modal>

      {/* ── Exercise Picker (for builder) ── */}
      <Modal visible={pickerVisible} transparent animationType="slide">
        <SafeAreaView className="flex-1 bg-surface" edges={['top', 'bottom']}>
          <View className="px-6 pt-4 pb-3 border-b border-border flex-row items-center gap-x-3">
            <TextInput
              className="flex-1 bg-card text-white px-4 py-3 rounded-xl text-base border border-border"
              placeholder="Search exercises..."
              placeholderTextColor="#8e8e93"
              value={pickerSearch}
              onChangeText={setPickerSearch}
              autoFocus
            />
            <TouchableOpacity onPress={() => setPickerVisible(false)}>
              <Text className="text-muted text-base">Cancel</Text>
            </TouchableOpacity>
          </View>
          {loadingPicker ? (
            <View className="flex-1 items-center justify-center">
              <ActivityIndicator color="#6366f1" />
            </View>
          ) : (
            <FlatList
              data={pickerExercises}
              keyExtractor={(item) => item.id}
              contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 8, paddingBottom: 40 }}
              ItemSeparatorComponent={() => <View className="h-px bg-border" />}
              renderItem={({ item }) => (
                <TouchableOpacity
                  className="py-4"
                  onPress={() => addToBuilder(item)}
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
