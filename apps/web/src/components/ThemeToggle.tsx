import { Moon, Sun } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { useTheme } from '@/lib/theme';

/** Light or dark; the label names the mode a tap switches to. */
export function ThemeToggle({ className, withLabel }: { className?: string; withLabel?: boolean }) {
  const { t } = useTranslation();
  const { theme, toggle } = useTheme();
  const label = t(theme === 'dark' ? 'shell.lightMode' : 'shell.darkMode');
  const Icon = theme === 'dark' ? Sun : Moon;
  return (
    <Button
      variant={withLabel ? 'outline' : 'ghost'}
      size={withLabel ? 'default' : 'icon-sm'}
      aria-label={withLabel ? undefined : label}
      className={className}
      onClick={toggle}
    >
      <Icon aria-hidden />
      {withLabel && label}
    </Button>
  );
}
