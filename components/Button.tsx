import { TouchableOpacity, Text, ActivityIndicator } from 'react-native';

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost';

interface ButtonProps {
  label: string;
  onPress: () => void;
  variant?: Variant;
  loading?: boolean;
  disabled?: boolean;
  fullWidth?: boolean;
}

const variantStyles: Record<Variant, string> = {
  primary: 'bg-primary',
  secondary: 'bg-card border border-border',
  danger: 'bg-danger',
  ghost: 'bg-transparent',
};

const labelStyles: Record<Variant, string> = {
  primary: 'text-white font-semibold',
  secondary: 'text-white font-semibold',
  danger: 'text-white font-semibold',
  ghost: 'text-primary font-semibold',
};

export function Button({
  label,
  onPress,
  variant = 'primary',
  loading = false,
  disabled = false,
  fullWidth = true,
}: ButtonProps) {
  return (
    <TouchableOpacity
      className={`rounded-2xl py-4 items-center ${variantStyles[variant]} ${fullWidth ? 'w-full' : ''} ${disabled || loading ? 'opacity-50' : ''}`}
      onPress={onPress}
      disabled={disabled || loading}
      activeOpacity={0.85}
    >
      {loading ? (
        <ActivityIndicator color="#fff" />
      ) : (
        <Text className={`text-base ${labelStyles[variant]}`}>{label}</Text>
      )}
    </TouchableOpacity>
  );
}
