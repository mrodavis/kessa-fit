import { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Dimensions,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, {
  Polyline,
  Path,
  Circle,
  Line,
  Text as SvgText,
  Defs,
  LinearGradient,
  Stop,
} from 'react-native-svg';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { UNIT_KEY } from '@/constants';

interface SessionPoint {
  date: string;
  maxWeightKg: number;
  totalSets: number;
}

// ── SVG Line Chart ──────────────────────────────────────────
const PAD = { l: 48, r: 16, t: 16, b: 36 };
const CHART_H = 180;

function formatShortDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function LineChart({ data, useLbs }: { data: SessionPoint[]; useLbs: boolean }) {
  const chartW = Dimensions.get('window').width - 48; // account for px-6 + card px-3

  const weights = data.map(d =>
    useLbs ? Math.round(d.maxWeightKg * 2.20462) : d.maxWeightKg
  );
  const minW = Math.min(...weights);
  const maxW = Math.max(...weights);
  const wRange = maxW - minW || 10;

  const xOf = (i: number) =>
    PAD.l + (i / Math.max(data.length - 1, 1)) * (chartW - PAD.l - PAD.r);
  const yOf = (w: number) =>
    PAD.t + (1 - (w - minW) / wRange) * (CHART_H - PAD.t - PAD.b);

  const pts = weights.map((w, i) => ({ x: xOf(i), y: yOf(w), w, date: data[i].date }));
  const polyStr = pts.map(p => `${p.x},${p.y}`).join(' ');
  const fillD =
    pts.length > 1
      ? [
          `M ${pts[0].x},${CHART_H - PAD.b}`,
          ...pts.map(p => `L ${p.x},${p.y}`),
          `L ${pts[pts.length - 1].x},${CHART_H - PAD.b}`,
          'Z',
        ].join(' ')
      : '';

  // 3 horizontal guides
  const guides = [maxW, minW + wRange / 2, minW];

  // x-axis labels: first, middle (if >2), last
  const xLabels = [
    { i: 0 },
    ...(data.length > 2 ? [{ i: Math.floor((data.length - 1) / 2) }] : []),
    ...(data.length > 1 ? [{ i: data.length - 1 }] : []),
  ];

  return (
    <Svg width={chartW} height={CHART_H}>
      <Defs>
        <LinearGradient id="grad" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#6366f1" stopOpacity="0.25" />
          <Stop offset="1" stopColor="#6366f1" stopOpacity="0" />
        </LinearGradient>
      </Defs>

      {/* Grid lines */}
      {guides.map((w, i) => (
        <Line
          key={i}
          x1={PAD.l}
          y1={yOf(w)}
          x2={chartW - PAD.r}
          y2={yOf(w)}
          stroke="#2c2c2e"
          strokeWidth="1"
        />
      ))}

      {/* Fill */}
      {fillD ? <Path d={fillD} fill="url(#grad)" /> : null}

      {/* Line */}
      {pts.length > 1 && (
        <Polyline
          points={polyStr}
          fill="none"
          stroke="#6366f1"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}

      {/* Dots */}
      {pts.map((p, i) => (
        <Circle key={i} cx={p.x} cy={p.y} r={4} fill="#6366f1" />
      ))}

      {/* Y labels */}
      {guides.map((w, i) => (
        <SvgText
          key={i}
          x={PAD.l - 6}
          y={yOf(w) + 4}
          fontSize="10"
          fill="#8e8e93"
          textAnchor="end"
        >
          {Math.round(w)}
        </SvgText>
      ))}

      {/* X labels */}
      {xLabels.map(({ i }) => (
        <SvgText
          key={i}
          x={xOf(i)}
          y={CHART_H - 6}
          fontSize="10"
          fill="#8e8e93"
          textAnchor="middle"
        >
          {formatShortDate(data[i].date)}
        </SvgText>
      ))}
    </Svg>
  );
}
// ────────────────────────────────────────────────────────────

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  if (date.toDateString() === today.toDateString()) return 'Today';
  if (date.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function ExerciseProgressScreen() {
  const { id: exerciseId, name } = useLocalSearchParams<{ id: string; name: string }>();
  const router = useRouter();
  const { user } = useAuth();

  const [sessions, setSessions] = useState<SessionPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [useLbs, setUseLbs] = useState(true);

  useEffect(() => {
    import('@react-native-async-storage/async-storage').then(({ default: AS }) => {
      AS.getItem(UNIT_KEY)
        .then(val => { if (val !== null) setUseLbs(val === 'lbs'); })
        .catch(() => {});
    });
  }, []);

  useEffect(() => {
    if (!user) return;

    const fetchData = async () => {
      const { data: workouts } = await supabase
        .from('workouts')
        .select('id, started_at')
        .eq('user_id', user.id)
        .not('finished_at', 'is', null)
        .order('started_at', { ascending: true });

      if (!workouts?.length) { setLoading(false); return; }

      const { data: sets } = await supabase
        .from('workout_sets')
        .select('weight_kg, reps, workout_id')
        .eq('exercise_id', exerciseId)
        .in('workout_id', workouts.map(w => w.id));

      if (!sets?.length) { setLoading(false); return; }

      const sessionData: SessionPoint[] = workouts
        .filter(w => sets.some(s => s.workout_id === w.id))
        .map(w => {
          const ws = sets.filter(s => s.workout_id === w.id);
          return {
            date: w.started_at,
            maxWeightKg: Math.max(...ws.map(s => s.weight_kg ?? 0)),
            totalSets: ws.length,
          };
        });

      setSessions(sessionData);
      setLoading(false);
    };

    fetchData();
  }, [exerciseId, user]);

  const displayWeight = (kg: number) =>
    useLbs ? `${Math.round(kg * 2.20462)} lbs` : `${kg} kg`;

  const prKg = sessions.length ? Math.max(...sessions.map(s => s.maxWeightKg)) : 0;
  const latestKg = sessions.length ? sessions[sessions.length - 1].maxWeightKg : 0;
  const prevKg = sessions.length >= 2 ? sessions[sessions.length - 2].maxWeightKg : null;
  const trendKg = prevKg != null ? latestKg - prevKg : null;

  const chartData = sessions.slice(-12);

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
          <Text className="text-white text-2xl font-bold tracking-tight">{name}</Text>
          <Text className="text-muted text-sm mt-1">Progress over time</Text>
        </View>

        {loading ? (
          <View className="items-center py-16">
            <ActivityIndicator color="#6366f1" size="large" />
          </View>
        ) : sessions.length === 0 ? (
          <View className="mx-6 bg-card rounded-2xl border border-border px-6 py-10 items-center">
            <Text className="text-muted text-sm text-center">
              No completed sessions for this exercise yet.{'\n'}Log some sets and finish a workout to see your progress.
            </Text>
          </View>
        ) : (
          <>
            {/* Stats */}
            <View className="flex-row px-6 mb-6" style={{ gap: 12 }}>
              <View className="flex-1 bg-card border border-border rounded-2xl px-4 py-4">
                <Text className="text-white font-bold text-base">{displayWeight(prKg)}</Text>
                <Text className="text-muted text-xs mt-1">Personal Record</Text>
              </View>
              <View className="flex-1 bg-card border border-border rounded-2xl px-4 py-4">
                <Text className="text-white font-bold text-base">{sessions.length}</Text>
                <Text className="text-muted text-xs mt-1">Sessions</Text>
              </View>
              <View className="flex-1 bg-card border border-border rounded-2xl px-4 py-4">
                {trendKg != null ? (
                  <Text
                    className={`font-bold text-base ${
                      trendKg > 0 ? 'text-success' : trendKg < 0 ? 'text-danger' : 'text-white'
                    }`}
                  >
                    {trendKg > 0 ? '+' : ''}
                    {displayWeight(Math.abs(trendKg))}
                  </Text>
                ) : (
                  <Text className="text-white font-bold text-base">—</Text>
                )}
                <Text className="text-muted text-xs mt-1">vs Last Session</Text>
              </View>
            </View>

            {/* Chart */}
            <View className="mx-6 bg-card border border-border rounded-2xl px-3 pt-4 pb-3 mb-6">
              <Text className="text-muted text-xs font-semibold uppercase tracking-widest mb-4 ml-1">
                Max Weight · Last {chartData.length} Session{chartData.length !== 1 ? 's' : ''}
              </Text>
              {chartData.length >= 2 ? (
                <LineChart data={chartData} useLbs={useLbs} />
              ) : (
                <View className="items-center py-8">
                  <Text className="text-muted text-sm text-center">
                    Complete at least 2 sessions{'\n'}to see your progress chart.
                  </Text>
                </View>
              )}
            </View>

            {/* Session History */}
            <View className="px-6">
              <Text className="text-white font-semibold text-lg mb-4">Session History</Text>
              <View style={{ gap: 10 }}>
                {[...sessions].reverse().map((session, i) => {
                  const isPR = session.maxWeightKg === prKg;
                  return (
                    <View
                      key={i}
                      className={`rounded-2xl border px-5 py-4 flex-row items-center justify-between ${
                        isPR ? 'border-primary/40' : 'bg-card border-border'
                      }`}
                      style={isPR ? { backgroundColor: '#0f0f2e' } : undefined}
                    >
                      <View>
                        <Text className="text-white font-medium text-sm">
                          {formatDate(session.date)}
                          {isPR && <Text className="text-primary"> ★</Text>}
                        </Text>
                        <Text className="text-muted text-xs mt-0.5">{session.totalSets} sets</Text>
                      </View>
                      <Text className="text-primary font-bold">{displayWeight(session.maxWeightKg)}</Text>
                    </View>
                  );
                })}
              </View>
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
