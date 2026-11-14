import { Check, ChevronDown } from 'lucide-react';
import { Select as SelectPrimitive } from 'radix-ui';
import {
  Children,
  type ComponentProps,
  isValidElement,
  type ReactNode,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { useTranslation } from 'react-i18next';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

type Props = ComponentProps<typeof Input> & { label: string; error?: string; hint?: string };

/** Label, input and its translated error, wired for screen readers. */
export function Field({ label, error, hint, ...input }: Props) {
  const id = useId();
  const note = error ? `${id}-error` : hint ? `${id}-hint` : undefined;
  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} aria-invalid={!!error} aria-describedby={note} {...input} />
      {error ? (
        <p id={`${id}-error`} className="text-sm text-destructive">
          {error}
        </p>
      ) : (
        hint && (
          <p id={`${id}-hint`} className="text-sm text-muted-foreground">
            {hint}
          </p>
        )
      )}
    </div>
  );
}

type SelectProps = ComponentProps<'select'> & { label: string; error?: string };
type Option = { value: string; label: ReactNode; disabled?: boolean };

/**
 * A custom dropdown (Radix Select: keyboard, screen readers, RTL) over a hidden native <select>.
 * The native select keeps the old API, so forms still `register` it and pass <option> children;
 * picking an item writes to it and fires a real change event, which is what the form reads.
 * The <option value=""> child, if any, becomes the placeholder.
 */
export function SelectField({ label, error, className, children, ref, ...select }: SelectProps) {
  const id = useId();
  const { i18n } = useTranslation();
  const native = useRef<HTMLSelectElement | null>(null);
  const options: Option[] = Children.toArray(children)
    .filter(isValidElement<ComponentProps<'option'>>)
    .map((o) => ({
      value: String(o.props.value ?? ''),
      label: o.props.children,
      disabled: o.props.disabled,
    }));
  const placeholder = options.find((o) => o.value === '')?.label;
  const [value, setValue] = useState('');
  // The form sets the native value through its ref (defaults, reset), and options can arrive
  // late; read it back whenever the option list changes.
  const optionKey = options.map((o) => o.value).join('|');
  useLayoutEffect(() => {
    if (native.current) setValue(native.current.value);
  }, [optionKey, select.value]);

  const setRef = (el: HTMLSelectElement | null) => {
    native.current = el;
    if (typeof ref === 'function') ref(el);
    else if (ref) ref.current = el;
  };
  const pick = (v: string) => {
    const el = native.current;
    if (!el) return;
    el.value = v;
    el.dispatchEvent(new Event('change', { bubbles: true }));
    setValue(v);
  };

  return (
    <div className={cn('grid gap-2', className)}>
      <Label htmlFor={id}>{label}</Label>
      <select
        ref={setRef}
        aria-hidden
        tabIndex={-1}
        className="sr-only"
        {...select}
        onChange={(e) => {
          select.onChange?.(e);
          setValue(e.target.value);
        }}
      >
        {children}
      </select>
      <SelectPrimitive.Root
        value={value || undefined}
        onValueChange={pick}
        dir={i18n.dir()}
        disabled={select.disabled}
      >
        <SelectPrimitive.Trigger
          id={id}
          aria-invalid={!!error}
          aria-describedby={error ? `${id}-error` : undefined}
          className="group flex h-11 w-full min-w-0 items-center justify-between gap-2 rounded-xl border border-input bg-card px-3 text-start text-base shadow-xs outline-none transition-colors hover:border-ink/40 focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-50 aria-invalid:border-destructive data-placeholder:text-muted-foreground md:text-sm"
        >
          <span className="truncate">
            <SelectPrimitive.Value placeholder={placeholder} />
          </span>
          <SelectPrimitive.Icon asChild>
            <ChevronDown
              aria-hidden
              className="size-4 shrink-0 text-muted-foreground transition-transform duration-200 group-data-[state=open]:rotate-180"
            />
          </SelectPrimitive.Icon>
        </SelectPrimitive.Trigger>
        <SelectPrimitive.Portal>
          <SelectPrimitive.Content
            position="popper"
            sideOffset={6}
            className="z-50 max-h-(--radix-select-content-available-height) min-w-(--radix-select-trigger-width) overflow-hidden rounded-xl border bg-popover text-popover-foreground shadow-lg data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=top]:slide-in-from-bottom-2"
          >
            <SelectPrimitive.Viewport className="max-h-72 p-1">
              {options
                .filter((o) => o.value !== '')
                .map((o) => (
                  <SelectPrimitive.Item
                    key={o.value}
                    value={o.value}
                    disabled={o.disabled}
                    className="relative flex cursor-pointer items-center rounded-lg py-2.5 ps-9 pe-3 text-sm outline-none select-none data-disabled:opacity-50 data-highlighted:bg-ink-soft data-highlighted:text-ink data-[state=checked]:font-semibold"
                  >
                    <SelectPrimitive.ItemIndicator className="absolute start-3 inline-flex">
                      <Check className="size-4 text-ink" aria-hidden />
                    </SelectPrimitive.ItemIndicator>
                    <SelectPrimitive.ItemText>{o.label}</SelectPrimitive.ItemText>
                  </SelectPrimitive.Item>
                ))}
            </SelectPrimitive.Viewport>
          </SelectPrimitive.Content>
        </SelectPrimitive.Portal>
      </SelectPrimitive.Root>
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
