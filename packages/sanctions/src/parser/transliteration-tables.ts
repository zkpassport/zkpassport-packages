// Transliteration tables for the ICAO 9303 machine readable zone (MRZ), which admits only A-Z,
// 0-9 and the filler "<". Sources: ICAO Doc 9303 Part 3 (8th edition, 2021), section 6,
// "Transliteration of multinational Latin-based characters", "Transliteration of Cyrillic
// characters" and "Transliteration of Arabic characters":
// https://www.icao.int/sites/default/files/publications/DocSeries/9303_p3_cons_en.pdf
// Keys are the upper-case code points; callers upper-case input before lookup so lower-case
// letters map identically.
// Where ICAO offers a choice (e.g. Ä → AE or A), the table follows the practice of the issuing
// states that use the character (AE, OE, UE, AA), as the tree must match real passports.

/**
 * Latin letters outside A-Z (ICAO 9303-3 §6, Table "multinational Latin-based characters")
 */
export const LATIN_TRANSLITERATION: Record<string, string> = {
  "\u00C0": "A", // À latin capital letter a with grave
  "\u00C1": "A", // Á latin capital letter a with acute
  "\u00C2": "A", // Â latin capital letter a with circumflex
  "\u00C3": "A", // Ã latin capital letter a with tilde
  "\u00C4": "AE", // Ä latin capital letter a with diaeresis
  "\u00C5": "AA", // Å latin capital letter a with ring above
  "\u00C6": "AE", // Æ latin capital letter ae
  "\u00C7": "C", // Ç latin capital letter c with cedilla
  "\u00C8": "E", // È latin capital letter e with grave
  "\u00C9": "E", // É latin capital letter e with acute
  "\u00CA": "E", // Ê latin capital letter e with circumflex
  "\u00CB": "E", // Ë latin capital letter e with diaeresis
  "\u00CC": "I", // Ì latin capital letter i with grave
  "\u00CD": "I", // Í latin capital letter i with acute
  "\u00CE": "I", // Î latin capital letter i with circumflex
  "\u00CF": "I", // Ï latin capital letter i with diaeresis
  "\u00D0": "D", // Ð latin capital letter eth
  "\u00D1": "N", // Ñ latin capital letter n with tilde
  "\u00D2": "O", // Ò latin capital letter o with grave
  "\u00D3": "O", // Ó latin capital letter o with acute
  "\u00D4": "O", // Ô latin capital letter o with circumflex
  "\u00D5": "O", // Õ latin capital letter o with tilde
  "\u00D6": "OE", // Ö latin capital letter o with diaeresis
  "\u00D8": "OE", // Ø latin capital letter o with stroke
  "\u00D9": "U", // Ù latin capital letter u with grave
  "\u00DA": "U", // Ú latin capital letter u with acute
  "\u00DB": "U", // Û latin capital letter u with circumflex
  "\u00DC": "UE", // Ü latin capital letter u with diaeresis
  "\u00DD": "Y", // Ý latin capital letter y with acute
  "\u00DE": "TH", // Þ latin capital letter thorn
  "\u00DF": "SS", // ß latin small letter sharp s
  "\u0100": "A", // Ā latin capital letter a with macron
  "\u0102": "A", // Ă latin capital letter a with breve
  "\u0104": "A", // Ą latin capital letter a with ogonek
  "\u0106": "C", // Ć latin capital letter c with acute
  "\u0108": "C", // Ĉ latin capital letter c with circumflex
  "\u010A": "C", // Ċ latin capital letter c with dot above
  "\u010C": "C", // Č latin capital letter c with caron
  "\u010E": "D", // Ď latin capital letter d with caron
  "\u0110": "D", // Đ latin capital letter d with stroke
  "\u0112": "E", // Ē latin capital letter e with macron
  "\u0114": "E", // Ĕ latin capital letter e with breve
  "\u0116": "E", // Ė latin capital letter e with dot above
  "\u0118": "E", // Ę latin capital letter e with ogonek
  "\u011A": "E", // Ě latin capital letter e with caron
  "\u011C": "G", // Ĝ latin capital letter g with circumflex
  "\u011E": "G", // Ğ latin capital letter g with breve
  "\u0120": "G", // Ġ latin capital letter g with dot above
  "\u0122": "G", // Ģ latin capital letter g with cedilla
  "\u0124": "H", // Ĥ latin capital letter h with circumflex
  "\u0126": "H", // Ħ latin capital letter h with stroke
  "\u0128": "I", // Ĩ latin capital letter i with tilde
  "\u012A": "I", // Ī latin capital letter i with macron
  "\u012C": "I", // Ĭ latin capital letter i with breve
  "\u012E": "I", // Į latin capital letter i with ogonek
  "\u0130": "I", // İ latin capital letter i with dot above
  "\u0131": "I", // ı latin small letter dotless i
  "\u0132": "IJ", // Ĳ latin capital ligature ij
  "\u0134": "J", // Ĵ latin capital letter j with circumflex
  "\u0136": "K", // Ķ latin capital letter k with cedilla
  "\u0139": "L", // Ĺ latin capital letter l with acute
  "\u013B": "L", // Ļ latin capital letter l with cedilla
  "\u013D": "L", // Ľ latin capital letter l with caron
  "\u013F": "L", // Ŀ latin capital letter l with middle dot
  "\u0141": "L", // Ł latin capital letter l with stroke
  "\u0143": "N", // Ń latin capital letter n with acute
  "\u0145": "N", // Ņ latin capital letter n with cedilla
  "\u0147": "N", // Ň latin capital letter n with caron
  "\u014A": "N", // Ŋ latin capital letter eng
  "\u014C": "O", // Ō latin capital letter o with macron
  "\u014E": "O", // Ŏ latin capital letter o with breve
  "\u0150": "O", // Ő latin capital letter o with double acute
  "\u0152": "OE", // Œ latin capital ligature oe
  "\u0154": "R", // Ŕ latin capital letter r with acute
  "\u0156": "R", // Ŗ latin capital letter r with cedilla
  "\u0158": "R", // Ř latin capital letter r with caron
  "\u015A": "S", // Ś latin capital letter s with acute
  "\u015C": "S", // Ŝ latin capital letter s with circumflex
  "\u015E": "S", // Ş latin capital letter s with cedilla
  "\u0160": "S", // Š latin capital letter s with caron
  "\u0162": "T", // Ţ latin capital letter t with cedilla
  "\u0164": "T", // Ť latin capital letter t with caron
  "\u0166": "T", // Ŧ latin capital letter t with stroke
  "\u0168": "U", // Ũ latin capital letter u with tilde
  "\u016A": "U", // Ū latin capital letter u with macron
  "\u016C": "U", // Ŭ latin capital letter u with breve
  "\u016E": "U", // Ů latin capital letter u with ring above
  "\u0170": "U", // Ű latin capital letter u with double acute
  "\u0172": "U", // Ų latin capital letter u with ogonek
  "\u0174": "W", // Ŵ latin capital letter w with circumflex
  "\u0176": "Y", // Ŷ latin capital letter y with circumflex
  "\u0178": "Y", // Ÿ latin capital letter y with diaeresis
  "\u0179": "Z", // Ź latin capital letter z with acute
  "\u017B": "Z", // Ż latin capital letter z with dot above
  "\u017D": "Z", // Ž latin capital letter z with caron
  "\u1E9E": "SS", // ẞ latin capital letter sharp s
  // Not in ICAO's Latin table; derived from the rows for the cedilla forms Ş → S and Ţ → T,
  // which Romanian typography rendered as comma-below letters, and Ğ → G for the caron form.
  "\u0218": "S", // Ș latin capital letter s with comma below
  "\u021A": "T", // Ț latin capital letter t with comma below
  "\u01E6": "G", // Ǧ latin capital letter g with caron
  // ĸ (kra) has no ICAO mapping; in sanctions sources it only occurs as a homoglyph for
  // Cyrillic к inside Cyrillic names (e.g. "Ниĸолай"), so it is read as K
  "\u0138": "K", // ĸ latin small letter kra
}

/**
 * Cyrillic letters (ICAO 9303-3 §6, Table "Cyrillic characters"). The soft sign Ь has no MRZ representation and is dropped.
 */
export const CYRILLIC_TRANSLITERATION: Record<string, string> = {
  "\u0401": "E", // Ё cyrillic capital letter io
  "\u0402": "D", // Ђ cyrillic capital letter dje
  "\u0404": "IE", // Є cyrillic capital letter ukrainian ie
  "\u0405": "DZ", // Ѕ cyrillic capital letter dze
  "\u0406": "I", // І cyrillic capital letter byelorussian-ukrainian i
  "\u0407": "I", // Ї cyrillic capital letter yi
  "\u0408": "J", // Ј cyrillic capital letter je
  "\u0409": "LJ", // Љ cyrillic capital letter lje
  "\u040A": "NJ", // Њ cyrillic capital letter nje
  "\u040C": "K", // Ќ cyrillic capital letter kje
  "\u040E": "U", // Ў cyrillic capital letter short u
  "\u040F": "DZ", // Џ cyrillic capital letter dzhe
  "\u0410": "A", // А cyrillic capital letter a
  "\u0411": "B", // Б cyrillic capital letter be
  "\u0412": "V", // В cyrillic capital letter ve
  "\u0413": "G", // Г cyrillic capital letter ghe
  "\u0414": "D", // Д cyrillic capital letter de
  "\u0415": "E", // Е cyrillic capital letter ie
  "\u0416": "ZH", // Ж cyrillic capital letter zhe
  "\u0417": "Z", // З cyrillic capital letter ze
  "\u0418": "I", // И cyrillic capital letter i
  "\u0419": "I", // Й cyrillic capital letter short i
  "\u041A": "K", // К cyrillic capital letter ka
  "\u041B": "L", // Л cyrillic capital letter el
  "\u041C": "M", // М cyrillic capital letter em
  "\u041D": "N", // Н cyrillic capital letter en
  "\u041E": "O", // О cyrillic capital letter o
  "\u041F": "P", // П cyrillic capital letter pe
  "\u0420": "R", // Р cyrillic capital letter er
  "\u0421": "S", // С cyrillic capital letter es
  "\u0422": "T", // Т cyrillic capital letter te
  "\u0423": "U", // У cyrillic capital letter u
  "\u0424": "F", // Ф cyrillic capital letter ef
  "\u0425": "KH", // Х cyrillic capital letter ha
  "\u0426": "TS", // Ц cyrillic capital letter tse
  "\u0427": "CH", // Ч cyrillic capital letter che
  "\u0428": "SH", // Ш cyrillic capital letter sha
  "\u0429": "SHCH", // Щ cyrillic capital letter shcha
  "\u042A": "IE", // Ъ cyrillic capital letter hard sign
  "\u042B": "Y", // Ы cyrillic capital letter yeru
  "\u042D": "E", // Э cyrillic capital letter e
  "\u042E": "IU", // Ю cyrillic capital letter yu
  "\u042F": "IA", // Я cyrillic capital letter ya
  "\u046A": "U", // Ѫ cyrillic capital letter big yus
  "\u0474": "Y", // Ѵ cyrillic capital letter izhitsa
  "\u0490": "G", // Ґ cyrillic capital letter ghe with upturn
  "\u0492": "G", // Ғ cyrillic capital letter ghe with stroke
  "\u04BA": "C", // Һ cyrillic capital letter shha
  "\u042C": "", // Ь cyrillic capital letter soft sign
  // Not in ICAO's Cyrillic table. Serbian and Macedonian passports use the Latin alphabets of
  // those languages, whose equivalents are in the Latin table: Ћ = Ć → C, Ѓ = Ǵ → G.
  "\u040B": "C", // Ћ cyrillic capital letter tshe (Serbian)
  "\u0403": "G", // Ѓ cyrillic capital letter gje (Macedonian)
}

/**
 * Arabic letters (ICAO 9303-3 §6, Table "Arabic characters"). ة (teh marbuta) is XTA inside a word and XAH at the end of one; see transliterate().
 */
export const ARABIC_TRANSLITERATION: Record<string, string> = {
  "\u0621": "XE", // ء arabic letter hamza
  "\u0622": "XAA", // آ arabic letter alef with madda above
  "\u0623": "XAE", // أ arabic letter alef with hamza above
  "\u0624": "U", // ؤ arabic letter waw with hamza above
  "\u0625": "I", // إ arabic letter alef with hamza below
  "\u0626": "XI", // ئ arabic letter yeh with hamza above
  "\u0627": "A", // ا arabic letter alef
  "\u0628": "B", // ب arabic letter beh
  "\u0629": "XTA", // ة arabic letter teh marbuta
  "\u062A": "T", // ت arabic letter teh
  "\u062B": "XTH", // ث arabic letter theh
  "\u062C": "J", // ج arabic letter jeem
  "\u062D": "XH", // ح arabic letter hah
  "\u062E": "XKH", // خ arabic letter khah
  "\u062F": "D", // د arabic letter dal
  "\u0630": "XDH", // ذ arabic letter thal
  "\u0631": "R", // ر arabic letter reh
  "\u0632": "Z", // ز arabic letter zain
  "\u0633": "S", // س arabic letter seen
  "\u0634": "XSH", // ش arabic letter sheen
  "\u0635": "XSS", // ص arabic letter sad
  "\u0636": "XDZ", // ض arabic letter dad
  "\u0637": "XTT", // ط arabic letter tah
  "\u0638": "XZZ", // ظ arabic letter zah
  "\u0639": "E", // ع arabic letter ain
  "\u063A": "G", // غ arabic letter ghain
  "\u0641": "F", // ف arabic letter feh
  "\u0642": "Q", // ق arabic letter qaf
  "\u0643": "K", // ك arabic letter kaf
  "\u0644": "L", // ل arabic letter lam
  "\u0645": "M", // م arabic letter meem
  "\u0646": "N", // ن arabic letter noon
  "\u0647": "H", // ه arabic letter heh
  "\u0648": "W", // و arabic letter waw
  "\u0649": "XAY", // ى arabic letter alef maksura
  "\u064A": "Y", // ي arabic letter yeh
  "\u0671": "XXA", // ٱ arabic letter alef wasla
  "\u0679": "XXT", // ٹ arabic letter tteh
  "\u067C": "XRT", // ټ arabic letter teh with ring
  "\u067E": "P", // پ arabic letter peh
  "\u0681": "XKE", // ځ arabic letter hah with hamza above
  "\u0685": "XXH", // څ arabic letter hah with three dots above
  "\u0686": "XC", // چ arabic letter tcheh
  "\u0688": "XXD", // ڈ arabic letter ddal
  "\u0689": "XDR", // ډ arabic letter dal with ring
  "\u0691": "XXR", // ڑ arabic letter rreh
  "\u0693": "XRR", // ړ arabic letter reh with ring
  "\u0696": "XRX", // ږ arabic letter reh with dot below and dot above
  "\u0698": "XJ", // ژ arabic letter jeh
  "\u069A": "XXS", // ښ arabic letter seen with dot below and dot above
  "\u06A9": "XKK", // ک arabic letter keheh
  "\u06AB": "XXK", // ګ arabic letter kaf with ring
  "\u06AD": "XNG", // ڭ arabic letter ng
  "\u06AF": "XGG", // گ arabic letter gaf
  "\u06BA": "XNN", // ں arabic letter noon ghunna
  "\u06BC": "XXN", // ڼ arabic letter noon with ring
  "\u06BE": "XDO", // ھ arabic letter heh doachashmee
  "\u06C0": "XYH", // ۀ arabic letter heh with yeh above
  "\u06C1": "XXG", // ہ arabic letter heh goal
  "\u06C2": "XGE", // ۂ arabic letter heh goal with hamza above
  "\u06C3": "XTG", // ۃ arabic letter teh marbuta goal
  "\u06CC": "XYA", // ی arabic letter farsi yeh
  "\u06CD": "XXY", // ۍ arabic letter yeh with tail
  "\u06D0": "Y", // ې arabic letter e
  "\u06D2": "XYB", // ے arabic letter yeh barree
  "\u06D3": "XBE", // ۓ arabic letter yeh barree with hamza above
}
