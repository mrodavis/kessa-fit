import { View, Text, TextInput, TextInputProps } from 'react-native';

interface InputProps extends TextInputProps {
  label?: string;
  error?: string;
}

export function Input({ label, error, ...props }: InputProps) {
  return (
    <View className="w-full">
      {label && (
        <Text className="text-textSecondary text-sm mb-2 ml-1">{label}</Text>
      )}
      <TextInput
        className={`bg-card text-white px-4 py-4 rounded-2xl text-base border ${error ? 'border-danger' : 'border-border'}`}
        placeholderTextColor="#8e8e93"
        {...props}
      />
      {error && (
        <Text className="text-danger text-xs mt-1 ml-1">{error}</Text>
      )}
    </View>
  );
}
