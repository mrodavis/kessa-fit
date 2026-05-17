import { Stack } from 'expo-router';

export default function AppLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: '#0a0a0a' },
        animation: 'slide_from_right',
      }}
    >
      <Stack.Screen name="(tabs)" options={{ animation: 'none' }} />
      <Stack.Screen name="workout/start" />
      <Stack.Screen name="workout/logger" />
      <Stack.Screen name="workout/[id]" />
      <Stack.Screen name="exercise/[id]" />
    </Stack>
  );
}
