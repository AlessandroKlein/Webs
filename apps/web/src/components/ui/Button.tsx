import type { ButtonHTMLAttributes } from 'react';

type Variant = 'primary' | 'secondary' | 'ghost';

export function Button({
  variant = 'primary',
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  const variantClass = variant === 'secondary' ? 'secondary' : variant === 'ghost' ? 'ghost' : '';
  return <button className={`btn ${variantClass} ${className}`.trim()} {...props} />;
}
