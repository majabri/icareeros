/**
 * geoTokens — compact geography stoplist for the JD extractor.
 *
 * Purpose: back-stop the paragraph-level location-sentence strip so that
 * pure city / state / country tokens NEVER surface as extracted skills.
 * The Cohere CISO capture surfaced "New York City", "Montreal", "Seoul",
 * "Germany", "Paris" in `missing_skills` from a "we have offices in…"
 * paragraph — this module is the last line of defence when the paragraph
 * strip misses (unusual heading structure, mid-sentence lists, etc.).
 *
 * Design constraints:
 *   - Compact by design. This is NOT a comprehensive gazetteer. A tight
 *     list of the ~150 place names that regularly leak from JD prose is
 *     the sweet spot — big enough to catch the real leaks, small enough
 *     to keep false-positives (real-skill collisions) near zero.
 *   - Word-bounded matching. "US" matches when it's alone; NOT when it's
 *     inside "USB" or "SUS".
 *   - Compound-safe. `isPureGeography` returns true ONLY when every
 *     non-glue token in the candidate is a geography term. A candidate
 *     with even one non-geo token survives.
 *       "New York City"       → true  (drops)
 *       "Germany"             → true  (drops)
 *       "Seoul"               → true  (drops)
 *       "New York SHIELD Act" → false (SHIELD/Act non-geo → survives)
 *       "AWS Seoul region"    → false (AWS non-geo → survives)
 *       "California CCPA"     → false (CCPA non-geo → survives)
 *       "US federal law"      → false (federal/law non-geo → survives)
 */

/** Whitespace, commas, hyphens, slashes, ampersands — token boundaries in a
 *  candidate that aren't tokens themselves. */
const GLUE_RE = /^[\s,\-\/&()]+$/;

/**
 * Suffix tokens that appear in place descriptions and, on their own, aren't
 * skills either. Kept separate from the main list so we can reason about
 * "City", "County", etc. as pure disambiguators.
 */
const GEO_SUFFIX_TOKENS = new Set<string>([
  "city", "county", "state", "province", "region", "district",
  "borough", "township", "prefecture", "metro", "metropolitan",
  "area", "downtown", "area,",
]);

/**
 * Location modifiers — "remote", "hybrid", "onsite" — commonly extracted
 * from location paragraphs and used as filters, never skills.
 */
const GEO_MODIFIER_TOKENS = new Set<string>([
  "remote", "remote-first", "remote first",
  "hybrid", "hybrid-remote", "hybrid remote",
  "onsite", "on-site", "on site", "in-office", "in office",
  "wfh", "work from home", "work-from-home",
  "distributed", "global",
]);

/**
 * Countries (with common short-forms) that regularly appear in "we have
 * offices in …" and "hire from …" prose. Adding more only pays back when
 * a specific one actually leaks.
 */
const COUNTRY_TOKENS = new Set<string>([
  "us", "usa", "u.s.", "u.s.a.", "united states", "america",
  "uk", "u.k.", "united kingdom", "britain", "great britain",
  "canada", "canadian",
  "mexico", "mexican",
  "brazil", "brazilian",
  "argentina", "chile", "colombia", "peru",
  "germany", "german",
  "france", "french",
  "spain", "spanish",
  "italy", "italian",
  "netherlands", "dutch", "holland",
  "belgium", "belgian",
  "switzerland", "swiss",
  "austria", "austrian",
  "sweden", "swedish",
  "norway", "norwegian",
  "denmark", "danish",
  "finland", "finnish",
  "ireland", "irish",
  "portugal", "portuguese",
  "poland", "polish",
  "russia", "russian",
  "ukraine", "ukrainian",
  "turkey", "turkish",
  "greece", "greek",
  "israel", "israeli",
  "uae", "u.a.e.", "united arab emirates",
  "saudi arabia", "saudi",
  "qatar", "qatari",
  "egypt", "egyptian",
  "south africa",
  "kenya",
  "nigeria",
  "india", "indian",
  "china", "chinese", "prc",
  "hong kong",
  "taiwan", "taiwanese",
  "japan", "japanese",
  "south korea", "korea", "korean",
  "singapore", "singaporean",
  "malaysia", "malaysian",
  "indonesia", "indonesian",
  "thailand", "thai",
  "vietnam", "vietnamese",
  "philippines", "filipino",
  "australia", "australian",
  "new zealand",
]);

/**
 * Cities that appear most often in office-list prose. Not a gazetteer;
 * this is intentionally the ~60 that recur in tech-JD offices sections.
 */
const CITY_TOKENS = new Set<string>([
  // North America
  "new york", "new york city", "nyc", "manhattan", "brooklyn",
  "san francisco", "sf", "bay area",
  "los angeles", "la", "san diego", "san jose", "silicon valley",
  "seattle", "portland",
  "chicago", "detroit", "minneapolis",
  "austin", "dallas", "houston", "san antonio",
  "atlanta", "miami", "orlando", "tampa",
  "boston", "cambridge",
  "washington", "washington dc", "d.c.", "dc",
  "denver", "salt lake city", "phoenix",
  "toronto", "montreal", "vancouver", "ottawa", "calgary",
  "mexico city", "guadalajara",
  // South America
  "são paulo", "sao paulo", "rio de janeiro", "buenos aires", "bogotá", "bogota", "lima", "santiago",
  // Europe
  "london", "manchester", "edinburgh", "dublin",
  "paris", "lyon", "marseille",
  "berlin", "munich", "hamburg", "frankfurt",
  "amsterdam", "rotterdam",
  "brussels",
  "madrid", "barcelona",
  "milan", "rome",
  "zurich", "geneva",
  "stockholm", "copenhagen", "oslo", "helsinki",
  "warsaw", "prague", "budapest",
  "vienna",
  "lisbon",
  // Middle East / Africa
  "tel aviv", "jerusalem",
  "dubai", "abu dhabi",
  "istanbul",
  "cairo",
  "cape town", "johannesburg",
  "nairobi", "lagos",
  // Asia / Pacific
  "mumbai", "bangalore", "bengaluru", "delhi", "new delhi", "hyderabad", "chennai", "pune",
  "beijing", "shanghai", "shenzhen", "guangzhou",
  "seoul",
  "tokyo", "osaka", "kyoto",
  "singapore",
  "kuala lumpur",
  "jakarta",
  "bangkok",
  "manila",
  "sydney", "melbourne", "brisbane",
  "auckland",
]);

/**
 * US states — full names + 2-letter abbrevs. Included because JDs
 * occasionally list "we hire in California, Texas, New York, Florida"
 * and every one of those tokens would leak otherwise.
 */
const US_STATE_TOKENS = new Set<string>([
  "alabama", "al", "alaska", "ak", "arizona", "az", "arkansas", "ar",
  "california", "ca", "colorado", "co", "connecticut", "ct",
  "delaware", "de", "florida", "fl", "georgia", "ga",
  "hawaii", "hi", "idaho", "id", "illinois", "il", "indiana", "in",
  "iowa", "ia", "kansas", "ks", "kentucky", "ky", "louisiana", "la",
  "maine", "me", "maryland", "md", "massachusetts", "ma",
  "michigan", "mi", "minnesota", "mn", "mississippi", "ms",
  "missouri", "mo", "montana", "mt", "nebraska", "ne", "nevada", "nv",
  "new hampshire", "nh", "new jersey", "nj", "new mexico", "nm",
  "north carolina", "nc", "north dakota", "nd",
  "ohio", "oh", "oklahoma", "ok", "oregon", "or",
  "pennsylvania", "pa", "rhode island", "ri",
  "south carolina", "sc", "south dakota", "sd",
  "tennessee", "tn", "texas", "tx", "utah", "ut",
  "vermont", "vt", "virginia", "va",
  "washington state", "wa",
  "west virginia", "wv", "wisconsin", "wi", "wyoming", "wy",
]);

// NOTE ON US-STATE 2-LETTER CODES: many of them collide with real skills
// or English words ("IN", "OR", "IT", "MA", "LA", "ID"). To avoid dropping
// legitimate skills, the 2-letter codes are ONLY treated as geo when the
// candidate ALSO contains at least one longer geo token. See
// `isPureGeography` for the implementation.
const AMBIGUOUS_2_LETTER = new Set<string>([
  "al", "ak", "ar", "az", "ca", "co", "ct", "de", "fl", "ga",
  "hi", "id", "il", "in", "ia", "ks", "ky", "la", "me", "md",
  "ma", "mi", "mn", "ms", "mo", "mt", "ne", "nv", "nh", "nj",
  "nm", "ny", "nc", "nd", "oh", "ok", "or", "pa", "ri", "sc",
  "sd", "tn", "tx", "ut", "vt", "va", "wa", "wv", "wi", "wy",
]);

/** All geo tokens folded together, lowercased. */
const ALL_GEO_TOKENS = new Set<string>([
  ...GEO_SUFFIX_TOKENS,
  ...GEO_MODIFIER_TOKENS,
  ...COUNTRY_TOKENS,
  ...CITY_TOKENS,
  ...US_STATE_TOKENS,
]);

/**
 * `isPureGeography(candidate)` — true when the candidate contains only
 * geography terms + glue. False when even one non-geo tokenised phrase
 * is present.
 *
 * Handles multi-word entries in the set ("new york city", "hong kong",
 * "washington dc") by greedy longest-prefix matching. Case-insensitive.
 *
 * Ambiguous 2-letter US state codes (LA, IN, OR, MA, …) count as geo
 * only when the candidate ALSO contains a longer geo term. This prevents
 * "IN" (state abbrev) from killing "LangChain IN Production" without a
 * gazetteer that knows "LangChain".
 */
export function isPureGeography(candidate: string): boolean {
  if (!candidate) return false;
  const cleaned = candidate.trim().toLowerCase();
  if (!cleaned) return false;

  // Tokenise on whitespace and commas — keep hyphenated words intact
  // because many places are hyphenated ("tel-aviv", "on-site").
  const tokens = cleaned.split(/[\s,\/&()]+/).map(t => t.replace(/[.]/g, "")).filter(t => t.length > 0 && !GLUE_RE.test(t));
  if (tokens.length === 0) return false;

  // Greedy longest-match: try up to 3 tokens at a time.
  let hasUnambiguousGeo = false;
  let sawNonGeo = false;
  let i = 0;
  while (i < tokens.length) {
    let matched = false;
    for (let len = Math.min(3, tokens.length - i); len >= 1; len--) {
      const phrase = tokens.slice(i, i + len).join(" ");
      if (ALL_GEO_TOKENS.has(phrase)) {
        matched = true;
        // Track whether we saw at least one unambiguous (>=3-char or
        // multi-word) geo hit — this promotes 2-letter state codes
        // in the SAME candidate from ambiguous → geo.
        if (len > 1 || phrase.length > 2) hasUnambiguousGeo = true;
        i += len;
        break;
      }
    }
    if (!matched) {
      const solo = tokens[i];
      if (AMBIGUOUS_2_LETTER.has(solo)) {
        // Wait until we've scanned the whole candidate before deciding.
        i += 1;
      } else {
        sawNonGeo = true;
        i += 1;
      }
    }
  }
  if (sawNonGeo) return false;

  // If we only saw ambiguous 2-letter tokens with no anchor, DO NOT drop.
  // "IN" alone → survives (probably "IN" the preposition or a false-token).
  // "IN, TX" alone → survives (still ambiguous; better to keep than kill).
  // "California, TX" → drops (unambiguous "California" anchors "TX").
  if (!hasUnambiguousGeo) {
    // Every token was ambiguous 2-letter. Not confident enough to drop.
    return false;
  }
  return true;
}

/**
 * Sentence-level patterns marking a line as location prose. Used by the
 * jdExtractor preprocessing pass to null out these lines before candidate
 * extraction. Match any of these → blank the line.
 */
export const LOCATION_SENTENCE_PATTERNS: RegExp[] = [
  /\boffices?\s+in\b/i,
  /\bhubs?\s+in\b/i,
  /\blocations?\s+in\b/i,
  /\bheadquartered\s+in\b/i,
  /\bbased\s+in\b/i,
  /\blocated\s+in\b/i,
  /\bwith\s+(?:offices?|hubs?|locations?|teams?)\s+in\b/i,
  /\bwe\s+(?:have|hire|work)\s+(?:from|in)\b/i,
  /\bhiring\s+in\b/i,
  /\bopen\s+to\s+(?:remote|hybrid|onsite)\b/i,
];

/**
 * Strip location prose from a JD text. Replaces matching sentences with a
 * single space, preserving line count so section slicing stays aligned.
 *
 * Sentences are split on `. ` `! ` `? ` — the same shape as prose text.
 * Bullet items are handled by the caller's chunking step; those are
 * covered by the token-level backstop.
 */
export function stripLocationSentences(text: string): string {
  if (!text) return text;
  return text
    .split(/\r?\n/)
    .map(line => {
      // Split line into "sentences" on ". ", "! ", "? ".
      const parts = line.split(/(?<=[.!?])\s+/);
      const kept = parts.filter(part => {
        for (const re of LOCATION_SENTENCE_PATTERNS) {
          if (re.test(part)) return false;
        }
        return true;
      });
      return kept.join(" ").trim();
    })
    .join("\n");
}
