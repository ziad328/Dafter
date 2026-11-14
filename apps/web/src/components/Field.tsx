import { type ComponentProps, useId } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

type Props = ComponentProps<typeof Input> & { label: string; error?: string };

/** Label, input and its translated error, wired for screen readers. */
export function Field({ label, error, ...input }: Props) {
  const id = useId();
  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        aria-invalid={!!error}
        aria-describedby={error ? `${id}-error` : undefined}
        {...input}
      />
      {error && (
        <p id={`${id}-error`} className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

type SelectProps = ComponentProps<'select'> & { label: string; error?: string };

/** Native select styled like Input: the phone's own picker is the fastest on small screens. */
export function SelectField({ label, error, className, children, ...select }: SelectProps) {
  const id = useId();
  return (
    <div className={cn('grid gap-2', className)}>
      <Label htmlFor={id}>{label}</Label>
      <select
        id={id}
        aria-invalid={!!error}
        aria-describedby={error ? `${id}-error` : undefined}
        className="h-11 w-full min-w-0 rounded-xl border border-input bg-card px-2 text-base shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 aria-invalid:border-destructive md:text-sm"
        {...select}
      >
        {children}
      </select>
      {error && (
        <p id={`${id}-error`} className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

export function FormError({ message }: { message?: string }) {
  return message ? (
    <p role="alert" className="text-sm text-destructive">
      {message}
    </p>
  ) : null;
}

export function Skeleton() {
  return <div aria-hidden className="h-40 animate-pulse rounded-xl bg-muted" />;
}
