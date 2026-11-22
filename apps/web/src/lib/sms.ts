/**
 * How many SMS a text costs. GSM-7 (Latin): 160 characters, or 153 per part when split; the
 * extension characters (^{}\[~]|€) take two. Anything else, Arabic included, is UCS-2: 70, or 67
 * per part. Counted in UTF-16 units, as phones do (an emoji is two).
 */
const GSM =
  '@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !"#¤%&\'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà';
const GSM_EXT = '^{}[~]|€\\';

export function smsParts(text: string): { length: number; parts: number; unicode: boolean } {
  const unicode = [...text].some((ch) => !GSM.includes(ch) && !GSM_EXT.includes(ch));
  const length = unicode
    ? text.length
    : [...text].reduce((n, ch) => n + (GSM_EXT.includes(ch) ? 2 : 1), 0);
  const [one, many] = unicode ? [70, 67] : [160, 153];
  const parts = length === 0 ? 0 : length <= one ? 1 : Math.ceil(length / many);
  return { length, parts, unicode };
}
