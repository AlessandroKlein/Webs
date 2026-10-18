import type { InputHTMLAttributes } from 'react';

export function TextField({ label, ...props }: InputHTMLAttributes<HTMLInputElement> & { label?: string }) {
  return (
    <div className="field">
      {label && <label>{label}</label>}
      <input className="input" {...props} />
    </div>
  );
}
