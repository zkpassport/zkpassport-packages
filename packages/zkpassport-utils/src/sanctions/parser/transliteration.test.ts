// ICAO Doc 9303 Part 3, §6: transliteration of national characters into the MRZ alphabet.
import { describe, expect, test } from "bun:test"
import { containsArabic, containsCyrillic, isMrzName, transliterate } from "./transliteration"

describe("Latin characters with diacritics and ligatures (ICAO 9303-3 §6)", () => {
  // Where ICAO allows a choice, the issuing states' practice is followed (AE/OE/UE/AA).
  const cases: Array<[string, string]> = [
    ["Å", "AA"],
    ["Ä", "AE"],
    ["Æ", "AE"],
    ["Ö", "OE"],
    ["Ø", "OE"],
    ["Ü", "UE"],
    ["ß", "SS"],
    ["Þ", "TH"],
    ["Ð", "D"],
    ["Œ", "OE"],
    ["Ñ", "N"],
    ["Ł", "L"],
    ["Č", "C"],
    ["Š", "S"],
    ["Ž", "Z"],
    ["É", "E"],
    ["Ç", "C"],
    ["İ", "I"],
    ["Ĳ", "IJ"],
  ]

  test.each(cases)("%s → %s", (input, expected) => {
    expect(transliterate(input)).toBe(expected)
  })

  test("lower-case letters map exactly like their upper-case forms", () => {
    expect(transliterate("å ä æ ö ø ü þ ð œ ñ ł č š ž é ç")).toBe(
      "AA AE AE OE OE UE TH D OE N L C S Z E C",
    )
    expect(transliterate("ı")).toBe("I")
  })

  test("names keep their word structure", () => {
    expect(transliterate("Jörg Müller-Lüdenscheidt")).toBe("JOERG MUELLER-LUEDENSCHEIDT")
    expect(transliterate("José García Núñez")).toBe("JOSE GARCIA NUNEZ")
    expect(transliterate("Václav Čapek")).toBe("VACLAV CAPEK")
  })
})

describe("Cyrillic characters (ICAO 9303-3 §6)", () => {
  test.each([
    ["ГОРЛОВ", "GORLOV"],
    ["Захарова", "ZAKHAROVA"],
    ["Жуков", "ZHUKOV"],
    ["Цветков", "TSVETKOV"],
    ["Чайка", "CHAIKA"],
    ["Шишкин", "SHISHKIN"],
    ["Щукин", "SHCHUKIN"],
    ["Юрий", "IURII"],
    ["Яна", "IANA"],
    ["Ёлкин", "ELKIN"],
    ["Объедков", "OBIEEDKOV"], // Ъ → IE, then Е → E
    ["Крылов", "KRYLOV"],
    ["Эдуард", "EDUARD"],
    ["Хабаров", "KHABAROV"],
  ])("%s → %s", (input, expected) => {
    expect(transliterate(input)).toBe(expected)
  })

  test("Serbian and Macedonian letters", () => {
    expect(transliterate("Ђорђе Ћирић")).toBe("DORDE CIRIC")
    expect(transliterate("Ѓорѓи Љубомир Његош Џамбаз")).toBe("GORGI LJUBOMIR NJEGOSH DZAMBAZ")
  })

  test("Ukrainian and Belarusian letters", () => {
    expect(transliterate("Євген Їжакевич Ґалаґан")).toBe("IEVGEN IZHAKEVICH GALAGAN")
    expect(transliterate("Ўладзімір Іванавіч Шэршань")).toBe("ULADZIMIR IVANAVICH SHERSHAN")
  })

  test("the soft sign has no MRZ representation and is dropped", () => {
    expect(transliterate("ЕВГЕНЬЕВИЧ")).toBe("EVGENEVICH")
    expect(transliterate("Игорь")).toBe("IGOR")
  })

  test("a mixed-script name is transliterated word by word", () => {
    expect(transliterate("PETER ИГОРЕВИЧ NOVAK")).toBe("PETER IGOREVICH NOVAK")
    expect(transliterate("ANNA ALEKSANDROVNA СМИРНОВА")).toBe("ANNA ALEKSANDROVNA SMIRNOVA")
  })

  test("detection", () => {
    expect(containsCyrillic("Смирнова")).toBe(true)
    expect(containsCyrillic("Smirnova")).toBe(false)
  })
})

describe("Arabic characters (ICAO 9303-3 §6)", () => {
  test("letters are mapped one by one, using the X-prefixed codes where ICAO defines them", () => {
    // م → M, ح → XH, م → M, د → D
    expect(transliterate("محمد")).toBe("MXHMD")
    // ن → N, ا → A, ص → XSS, ر → R
    expect(transliterate("ناصر")).toBe("NAXSSR")
    // ع → E, ل → L, ي → Y
    expect(transliterate("علي")).toBe("ELY")
  })

  test("shadda doubles the previous letter (ICAO 9303-3 §6 note 3 examples)", () => {
    expect(transliterate("عبّاس")).toBe("EBBAS")
    expect(transliterate("فضّة")).toBe("FXDZXDZXAH")
  })

  test("teh marbuta is XTA inside a word and XAH at the end of one", () => {
    // ف ا ط م ة → F A XTT M + XAH
    expect(transliterate("فاطمة")).toBe("FAXTTMXAH")
    expect(transliterate("فاطمة علي")).toBe("FAXTTMXAH ELY")
    expect(transliterate("فاطمة-علي")).toBe("FAXTTMXAH-ELY")
    expect(transliterate("ةا")).toBe("XTAA")
  })

  test("detection", () => {
    expect(containsArabic("ناصر")).toBe(true)
    expect(containsArabic("Nasser")).toBe(false)
  })
})

describe("punctuation and whitespace", () => {
  test("apostrophes and quotation marks in any form are omitted, not replaced", () => {
    expect(transliterate("O'Neil")).toBe("ONEIL")
    expect(transliterate("D’Souza")).toBe("DSOUZA")
    expect(transliterate("N`Dour")).toBe("NDOUR")
    expect(transliterate("Saʼid")).toBe("SAID")
    expect(transliterate('"Nickname"')).toBe("NICKNAME")
  })

  test("ICAO 9303-3 §4.6 examples: apostrophe joins, comma separates components", () => {
    expect(transliterate("D’ARTAGNAN")).toBe("DARTAGNAN")
    expect(transliterate("ERIKSSON, ANNA MARIA")).toBe("ERIKSSON ANNA MARIA")
    expect(transliterate("ANNA, MARIA")).toBe("ANNA MARIA")
  })

  test("all other punctuation is omitted without a filler in its place", () => {
    expect(transliterate("Toussaint Jr.")).toBe("TOUSSAINT JR")
    expect(transliterate("Nadim S. Al-Dajani")).toBe("NADIM S AL-DAJANI")
    expect(transliterate("Kanniappan, Jr")).toBe("KANNIAPPAN JR")
    expect(transliterate("Aleksandr (Sasha) Ivanov")).toBe("ALEKSANDR SASHA IVANOV")
    expect(transliterate("Ali/Aly Hassan")).toBe("ALIALY HASSAN")
    expect(transliterate("Smith_Jones")).toBe("SMITHJONES")
  })

  test("Unicode dashes are the MRZ hyphen", () => {
    expect(transliterate("Mary‐Ann")).toBe("MARY-ANN")
    expect(transliterate("Mary–Ann")).toBe("MARY-ANN")
  })

  test("hyphens and spaces are kept for the MRZ formatter; runs of whitespace collapse", () => {
    expect(transliterate("  Jane \t  Doe ")).toBe("JANE DOE")
    expect(transliterate("Mary-Ann")).toBe("MARY-ANN")
  })
})

describe("Unicode normalisation", () => {
  test("decomposed accents are composed before lookup", () => {
    expect(transliterate("José")).toBe("JOSE") // e + combining acute
    expect(transliterate("Müller")).toBe("MUELLER") // u + combining diaeresis → Ü → UE
  })

  test("accents on letters without a precomposed form are omitted", () => {
    expect(transliterate("Zákharov")).toBe("ZAKHAROV")
  })

  test("bidirectional controls and other format characters carry no text", () => {
    expect(transliterate("‫Jane‬ Doe‎")).toBe("JANE DOE")
  })

  test("Arabic vowel signs and tatweel are omitted; presentation forms map to base letters", () => {
    expect(transliterate("مُحَمَد")).toBe("MXHMD") // with damma and fatha
    expect(transliterate("مُحَمَّد")).toBe("MXHMMD") // shadda doubles the meem
    expect(transliterate("كـمـال")).toBe("KMAL") // with tatweel
    expect(transliterate("ﻣﺤﻤﺪ")).toBe("MXHMD") // presentation forms of محمد
  })

  test("full-width letters become ASCII", () => {
    expect(transliterate("ＪＡＮＥ")).toBe("JANE")
  })

  test("Romanian comma-below letters map like their cedilla forms", () => {
    expect(transliterate("Ștefan Țepeș")).toBe("STEFAN TEPES")
    expect(transliterate("Yiǧidoǧlu")).toBe("YIGIDOGLU")
  })

  test("kra, which sources use as a homoglyph for Cyrillic к, reads as K", () => {
    expect(transliterate("Ниĸолай")).toBe("NIKOLAI")
  })
})

describe("isMrzName", () => {
  test("accepts names in the MRZ alphabet: letters, spaces and hyphens, starting with a letter", () => {
    expect(isMrzName("JANE DOE")).toBe(true)
    expect(isMrzName("AL-SAMPLE")).toBe(true)
    expect(isMrzName("X")).toBe(true)
  })

  test("rejects anything the MRZ name field cannot carry", () => {
    expect(isMrzName("")).toBe(false)
    expect(isMrzName("-JANE")).toBe(false)
    expect(isMrzName("AGENT 007")).toBe(false)
    expect(isMrzName("jane")).toBe(false)
    expect(isMrzName("JOSÉ")).toBe(false)
    expect(isMrzName(transliterate("王小明"))).toBe(false)
  })

  test("transliterate leaves unmappable characters in place so they can be detected", () => {
    expect(transliterate("王小明")).toBe("王小明")
  })
})
