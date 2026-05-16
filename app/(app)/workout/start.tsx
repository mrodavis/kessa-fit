import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';

const QUICK_NAMES = ['Push Day', 'Pull Day', 'Leg Day', 'Upper Body', 'Lower Body', 'Full Body'];

export default function StartWorkoutScreen() {
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const { user } = useAuth();
  const router = useRouter();

  const handleStart = async (workoutName: string) => {
    if (!user) return;
    setLoading(true);
    const { data, error } = await supabase
      .from('workouts')
      .insert({ user_id: user.id, name: workoutName, started_at: new Date().toISOString() })
      .select()
      .single();

    setLoading(false);

    if (error) {
      Alert.alert('Error', error.message);
      return;
    }
    router.push({ pathname: '/(app)/workout/logger', params: { workoutId: data.id, workoutName: data.name } });
  };

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top']}>
      <View className="flex-1 px-6">
        {/* Header */}
        <View className="flex-row items-center pt-4 mb-8">
          <TouchableOpacity onPress={() => router.back()} className="mr-4 p-2 -ml-2">
            <Text className="text-primary text-base">← Back</Text>
          </TouchableOpacity>
          <Text className="text-white text-xl font-bold">New Workout</Text>
        </View>

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
      </View>
    </SafeAreaView>
  );
}
