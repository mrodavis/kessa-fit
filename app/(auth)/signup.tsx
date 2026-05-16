import { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Alert,
  ScrollView,
} from 'react-native';
import { Link } from 'expo-router';
import { supabase } from '@/lib/supabase';

export default function SignupScreen() {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSignup = async () => {
    if (!fullName || !email || !password) {
      Alert.alert('Error', 'Please fill in all fields.');
      return;
    }
    if (password.length < 8) {
      Alert.alert('Error', 'Password must be at least 8 characters.');
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName } },
    });
    setLoading(false);
    if (error) {
      Alert.alert('Sign Up Failed', error.message);
    } else {
      Alert.alert('Check your email', 'We sent you a confirmation link.');
    }
  };

  return (
    <KeyboardAvoidingView
      className="flex-1 bg-background"
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        contentContainerStyle={{ flexGrow: 1 }}
        keyboardShouldPersistTaps="handled"
      >
        <View className="flex-1 justify-end px-6 pb-12">
          <View className="mb-10">
            <Text className="text-4xl font-bold text-white tracking-tight">Create account</Text>
            <Text className="text-muted text-base mt-2">Start your fitness journey today.</Text>
          </View>

          <View className="gap-y-4">
            <View>
              <Text className="text-textSecondary text-sm mb-2 ml-1">Full Name</Text>
              <TextInput
                className="bg-card text-white px-4 py-4 rounded-2xl text-base border border-border"
                placeholder="Alex Johnson"
                placeholderTextColor="#8e8e93"
                value={fullName}
                onChangeText={setFullName}
                autoComplete="name"
              />
            </View>

            <View>
              <Text className="text-textSecondary text-sm mb-2 ml-1">Email</Text>
              <TextInput
                className="bg-card text-white px-4 py-4 rounded-2xl text-base border border-border"
                placeholder="you@example.com"
                placeholderTextColor="#8e8e93"
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                keyboardType="email-address"
                autoComplete="email"
              />
            </View>

            <View>
              <Text className="text-textSecondary text-sm mb-2 ml-1">Password</Text>
              <TextInput
                className="bg-card text-white px-4 py-4 rounded-2xl text-base border border-border"
                placeholder="Min. 8 characters"
                placeholderTextColor="#8e8e93"
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                autoComplete="new-password"
              />
            </View>

            <TouchableOpacity
              className="bg-primary rounded-2xl py-4 items-center mt-2"
              onPress={handleSignup}
              disabled={loading}
              activeOpacity={0.85}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text className="text-white font-semibold text-base">Create Account</Text>
              )}
            </TouchableOpacity>
          </View>

          <View className="flex-row justify-center mt-8">
            <Text className="text-muted">Already have an account? </Text>
            <Link href="/(auth)/login" asChild>
              <TouchableOpacity>
                <Text className="text-primary font-semibold">Sign In</Text>
              </TouchableOpacity>
            </Link>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
