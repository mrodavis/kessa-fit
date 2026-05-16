import { View, ViewProps } from 'react-native';

interface CardProps extends ViewProps {
  children: React.ReactNode;
  className?: string;
}

export function Card({ children, className = '', ...props }: CardProps) {
  return (
    <View
      className={`bg-card rounded-2xl border border-border ${className}`}
      {...props}
    >
      {children}
    </View>
  );
}
