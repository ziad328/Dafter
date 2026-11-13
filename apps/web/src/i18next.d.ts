import 'i18next';
import type { resources } from '@dafter/i18n';

// Keys are typed from the Arabic file, so t('missing.key') is a compile error.
declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: 'common';
    resources: (typeof resources)['ar'];
  }
}
