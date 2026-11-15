import { useRef, useState } from 'react';
import { DEFAULT_TEMPLATES, fillTemplate, unknownPlaceholder } from '@dafter/contracts';
import { useTranslation } from 'react-i18next';
import {
  type MessageTemplate,
  useListMessageTemplatesQuery,
  useUpdateMessageTemplateMutation,
} from '@/api/generated';
import { FormError } from '@/components/Field';
import { Panel } from '@/components/Page';
import { Button } from '@/components/ui/button';
import type { resources } from '@dafter/i18n';
import { errorKey } from '@/lib/session';

type Locale = 'ar' | 'en';
const LOCALES: Locale[] = ['ar', 'en'];
// The placeholder names the API sends, as typed i18n keys (labels and sample values).
type Part = keyof (typeof resources)['ar']['common']['messages']['placeholders'];

/**
 * The wording parents get, per trigger and language (owner edits; assistant reads). The preview
 * uses the same fill function as the API, with sample values in that language.
 */
export function MessageWording({ canEdit }: { canEdit: boolean }) {
  const { t } = useTranslation();
  const list = useListMessageTemplatesQuery();
  if (!list.data) return <FormError message={list.error && t(errorKey(list.error))} />;
  return (
    <Panel className="grid gap-3 p-5">
      <h2 className="font-semibold">{t('messages.wording.title')}</h2>
      <p className="text-sm text-muted-foreground">{t('messages.wording.hint')}</p>
      {list.data.map((tpl) => (
        <TriggerWording key={tpl.trigger} tpl={tpl} canEdit={canEdit} />
      ))}
    </Panel>
  );
}

function TriggerWording({ tpl, canEdit }: { tpl: MessageTemplate; canEdit: boolean }) {
  const { t } = useTranslation();
  const [update, saving] = useUpdateMessageTemplateMutation();
  const [text, setText] = useState<Record<Locale, string>>({
    ar: tpl.ar.custom ?? tpl.ar.default,
    en: tpl.en.custom ?? tpl.en.default,
  });
  const [invalid, setInvalid] = useState<{ locale: Locale; placeholder: string }>();
  // "Saved" shows until the text changes again.
  const [dirty, setDirty] = useState(false);
  const custom = tpl.ar.custom !== null || tpl.en.custom !== null;

  const save = async (next: Record<Locale, string | null>) => {
    for (const locale of LOCALES) {
      const placeholder = next[locale] && unknownPlaceholder(tpl.trigger, next[locale]);
      if (placeholder) return setInvalid({ locale, placeholder });
    }
    setInvalid(undefined);
    setDirty(false);
    // The default text is sent as null, so a later change of the default reaches this center.
    const body = {
      ar: next.ar === tpl.ar.default ? null : next.ar,
      en: next.en === tpl.en.default ? null : next.en,
    };
    await update({ trigger: tpl.trigger, updateMessageTemplateRequest: body });
  };
  const reset = () => {
    setText({ ar: tpl.ar.default, en: tpl.en.default });
    void save({ ar: null, en: null });
  };

  return (
    <details className="rounded-lg border p-3">
      <summary className="flex min-h-10 cursor-pointer items-center gap-2 font-medium">
        {t(`messages.triggers.${tpl.trigger}`)}
        {custom && (
          <span className="ms-auto rounded-full bg-muted px-2 py-0.5 text-xs">
            {t('messages.wording.custom')}
          </span>
        )}
      </summary>
      <div className="mt-3 grid gap-4">
        {LOCALES.map((locale) => (
          <LocaleText
            key={locale}
            tpl={tpl}
            locale={locale}
            value={text[locale]}
            canEdit={canEdit}
            onChange={(v) => {
              setText({ ...text, [locale]: v });
              setDirty(true);
            }}
          />
        ))}
        <FormError
          message={
            invalid
              ? t('messages.wording.unknown', {
                  placeholder: `{${invalid.placeholder}}`,
                  language: t(`messages.wording.language.${invalid.locale}`),
                })
              : saving.error && t(errorKey(saving.error))
          }
        />
        {saving.isSuccess && !invalid && !dirty && (
          <p role="status" className="text-sm text-present">
            {t('messages.wording.saved')}
          </p>
        )}
        {canEdit && (
          <div className="flex flex-wrap gap-2">
            <Button disabled={saving.isLoading} onClick={() => void save(text)}>
              {t('messages.wording.save')}
            </Button>
            <Button variant="outline" disabled={saving.isLoading} onClick={reset}>
              {t('messages.wording.reset')}
            </Button>
          </div>
        )}
      </div>
    </details>
  );
}

function LocaleText({
  tpl,
  locale,
  value,
  canEdit,
  onChange,
}: {
  tpl: MessageTemplate;
  locale: Locale;
  value: string;
  canEdit: boolean;
  onChange: (v: string) => void;
}) {
  const { t, i18n } = useTranslation();
  const box = useRef<HTMLTextAreaElement>(null);
  const id = `${tpl.trigger}-${locale}`;
  // Sample values in the message's own language, whatever the screen's language is.
  const sample = i18n.getFixedT(locale);
  const values = Object.fromEntries(
    tpl.placeholders.map((p) => [
      p,
      p === 'wasWere' && locale === 'ar' ? '' : sample(`messages.sample.${p as Part}`),
    ]),
  );
  // Puts `{name}` at the cursor and keeps the focus in the box.
  const insert = (name: string) => {
    const el = box.current!;
    const at = el.selectionStart ?? value.length;
    const next = `${value.slice(0, at)}{${name}}${value.slice(el.selectionEnd ?? at)}`;
    onChange(next);
    el.focus();
  };

  return (
    <div className="grid gap-2">
      <label htmlFor={id} className="text-sm font-medium">
        {t(`messages.wording.language.${locale}`)}
      </label>
      <textarea
        ref={box}
        id={id}
        dir={locale === 'ar' ? 'rtl' : 'ltr'}
        lang={locale}
        rows={3}
        maxLength={500}
        readOnly={!canEdit}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-xl border border-input bg-card p-3 text-base md:text-sm"
      />
      {canEdit && (
        <div
          role="group"
          aria-label={t('messages.wording.insert')}
          className="flex flex-wrap gap-1.5"
        >
          {tpl.placeholders
            // "was/were" is English grammar; Arabic doesn't need it.
            .filter((p) => locale === 'en' || p !== 'wasWere')
            .map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => insert(p)}
                className="rounded-full bg-muted px-2.5 py-1 text-xs"
              >
                {t(`messages.placeholders.${p as Part}`)}
              </button>
            ))}
        </div>
      )}
      <p
        data-testid={`preview-${id}`}
        dir={locale === 'ar' ? 'rtl' : 'ltr'}
        lang={locale}
        className="rounded-lg bg-muted/60 p-3 text-sm"
      >
        {fillTemplate(value.trim() || DEFAULT_TEMPLATES[tpl.trigger][locale], values)}
      </p>
    </div>
  );
}
