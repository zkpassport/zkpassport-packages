/**
 * ICAO Doc 9303 transliteration into the MRZ alphabet.
 *
 * The machine readable zone admits only A-Z, 0-9 and the filler "<" (Part 3, §4.6). Part 3, §6
 * gives the transliteration of national characters: Latin letters with diacritics and ligatures,
 * Cyrillic and Arabic. Names in the sanctions tree are hashed as MRZ bytes, so a name must go
 * through exactly this mapping before it can match what a passport carries.
 */
import {
  ARABIC_TRANSLITERATION,
  CYRILLIC_TRANSLITERATION,
  LATIN_TRANSLITERATION,
} from "./transliteration-tables"

export { ARABIC_TRANSLITERATION, CYRILLIC_TRANSLITERATION, LATIN_TRANSLITERATION }

/**
 * ICAO 9303-3 §4.6: "Punctuation characters are not allowed in the MRZ." An apostrophe is omitted
 * and the parts it separated are joined (D’ARTAGNAN → DARTAGNAN); a comma separating name
 * components becomes a filler; a hyphen becomes a filler; "all other punctuation characters shall
 * be omitted from the MRZ (i.e. no filler character shall be inserted in their place)".
 *
 * Omitted outright: apostrophes and quotation marks in every form, periods, parentheses, slashes
 * and the like.
 */
const OMITTED_PUNCTUATION = /['‘’‚‛′‵`´ʼʻʽʾʿˈˊˋ"“”„‟.()[\]{}/\\_|!?*+=&#%@~^]/g

/**
 * Commas (and semicolons, used the same way) separate name components and become a space, which
 * the MRZ formatter turns into a filler. Hyphens and spaces are kept for the formatter.
 */
const SEPARATOR_PUNCTUATION = /[,;:]/g

/** Unicode hyphens and dashes (U+2010–U+2015, minus sign) are the MRZ hyphen */
const DASHES = /[‐-―−]/g

/**
 * Characters that carry no text: bidirectional embedding controls and other format characters
 * (Unicode category Cf) that sources leave around right-to-left names, and the Arabic tatweel
 * (kashida, U+0640) that only stretches a word visually.
 */
const FORMAT_CHARACTERS = /[\p{Cf}ـ]/gu

/**
 * Combining marks (Unicode category Mn) left after NFKC composition: Arabic vowel signs
 * (tashkeel, "not encoded" in ICAO's Arabic table), and accents on letters that have no
 * precomposed form. ICAO omits diacritics that have no transliteration. The shadda is the one
 * exception and is handled in {@link transliterate}.
 */
const COMBINING_MARKS = /(?!ّ)\p{Mn}/gu

const ARABIC_TEH_MARBUTA = "ة"
/** Shadda marks a doubled consonant: ICAO repeats the previous letter's transliteration */
const ARABIC_SHADDA = "ّ"
const ARABIC_BLOCK = /[؀-ۿ]/
const CYRILLIC_BLOCK = /[Ѐ-ӿ]/

/**
 * Characters the MRZ name field can hold before the formatter replaces separators: letters,
 * spaces (between name parts) and hyphens (within a part).
 */
const MRZ_NAME_ALPHABET = /^[A-Z][A-Z -]*$/

export function containsCyrillic(text: string): boolean {
  return CYRILLIC_BLOCK.test(text)
}

export function containsArabic(text: string): boolean {
  return ARABIC_BLOCK.test(text)
}

/**
 * Transliterate a name into the MRZ alphabet:
 *
 * 1. normalise to NFKC, so decomposed accents become precomposed letters, Arabic presentation
 *    forms become their base letters and full-width letters become ASCII;
 * 2. remove format characters (bidirectional controls, tatweel) and combining marks (Arabic
 *    vowel signs, accents without a precomposed letter);
 * 3. apply the ICAO punctuation rules (§4.6): omit apostrophes, quotation marks, periods and other
 *    punctuation without a filler; treat commas as component separators; unify dashes to "-";
 * 4. upper-case (Unicode-aware, so "ß" becomes "SS" and "é" is looked up as "É");
 * 5. map every character through the ICAO Latin, Cyrillic and Arabic tables, treating a teh
 *    marbuta at the end of a word as "XAH" and a shadda as a doubling of the previous letter
 *    (ICAO 9303-3 §6, Arabic table notes 2 and 3);
 * 6. collapse runs of whitespace to a single space and trim.
 *
 * Characters with no mapping are kept as they are, so callers can detect names that cannot be
 * represented in the MRZ with {@link isMrzName}.
 *
 * ICAO's Cyrillic table lists language-dependent alternatives (Ukrainian word-initial Є → YE,
 * Belarusian Ё → IO, Serbian Ж → Z, ...). The sources do not say which language a name is in, so
 * the general column is used throughout.
 */
export function transliterate(text: string): string {
  const cleaned = text
    .normalize("NFKC")
    .replace(FORMAT_CHARACTERS, "")
    .replace(COMBINING_MARKS, "")
    .replace(OMITTED_PUNCTUATION, "")
    .replace(SEPARATOR_PUNCTUATION, " ")
    .replace(DASHES, "-")
  let out = ""
  let last = "" // transliteration of the previous character, for the shadda
  const chars = Array.from(cleaned)
  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i]
    if (ch === ARABIC_SHADDA) {
      out += last
      continue
    }
    if (ch === ARABIC_TEH_MARBUTA) {
      // a shadda may sit between the letter and the end of the word
      const next = chars[i + 1] === ARABIC_SHADDA ? chars[i + 2] : chars[i + 1]
      const atWordEnd = next === undefined || /[\s-]/.test(next)
      last = atWordEnd ? "XAH" : "XTA"
      out += last
      continue
    }
    const upper = ch.toUpperCase()
    // toUpperCase may expand one code point into several (ß → SS); map each
    last = ""
    for (const u of Array.from(upper)) {
      const mapped =
        LATIN_TRANSLITERATION[u] ?? CYRILLIC_TRANSLITERATION[u] ?? ARABIC_TRANSLITERATION[u]
      last += mapped !== undefined ? mapped : u
    }
    out += last
  }
  return out.replace(/\s+/g, " ").trim()
}

/**
 * Whether a transliterated string consists only of characters the MRZ name field can carry
 * (A-Z, space and hyphen, starting with a letter).
 */
export function isMrzName(text: string): boolean {
  return MRZ_NAME_ALPHABET.test(text)
}
