import '../global.css';
import { useEffect } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useAuth } from '@/hooks/useAuth';

function RouteGuard({ children }: { children: React.ReactNode }) {
  const { session, loading } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;

    const inAuthGroup = segments[0] === '(auth)';

    if (!session && !inAuthGroup) {
      router.replace('/(auth)/login');
    } else if (session && inAuthGroup) {
      router.replace('/(app)/(tabs)');
    }
  }, [session, loading, segments]);

  return <>{children}</>;
}

export default function RootLayout() {
  return (
    <RouteGuard>
      <StatusBar style="light" />
      <Stack screenOptions={{ headerShown: false }} />
    </RouteGuard>
  );
}
