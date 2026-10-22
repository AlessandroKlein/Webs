import type { CSSProperties, HTMLAttributes, ReactNode } from 'react';
import { cn } from './cn';

function CardRoot({
  children,
  className = '',
  style,
  ...props
}: { children?: ReactNode; className?: string; style?: CSSProperties } & HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('card', className)} style={style} {...props}>
      {children}
    </div>
  );
}

function CardHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('flex flex-col gap-1.5 pb-4', className)} {...props} />;
}

function CardTitle({ className, ...props }: HTMLAttributes<HTMLHeadingElement>) {
  return <h3 className={cn('text-base font-semibold leading-none tracking-tight', className)} {...props} />;
}

function CardDescription({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn('text-sm text-muted', className)} {...props} />;
}

function CardContent({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('pt-0', className)} {...props} />;
}

function CardFooter({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('flex items-center gap-2 pt-4', className)} {...props} />;
}

/**
 * Contenedor de superficie con subcomponentes (Header/Title/Description/
 * Content/Footer) en el estilo composable de shadcn/ui. La variante plana
 * `<Card>…</Card>` mantiene compatibilidad con el uso existente.
 */
export const Card = Object.assign(CardRoot, {
  Header: CardHeader,
  Title: CardTitle,
  Description: CardDescription,
  Content: CardContent,
  Footer: CardFooter,
});
