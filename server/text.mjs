// Small text utilities shared by retrieval and validation. Deterministic, dependency-free.
const STOP = new Set(('a an and are as at be been by can could do does for from had has have how i if in into is it its ' +
  'me my of on or our so than that the their them then there these they this those to under up was we were what when ' +
  'which who why will with would you your about any all also may might more most must not only other over per such ' +
  'shall should each some very').split(' '));

const WORD_NUMBERS = { one: '1', two: '2', three: '3', four: '4', five: '5', six: '6', seven: '7', eight: '8', nine: '9', ten: '10', twelve: '12' };

export function stem(w) {
  return w.replace(/(ies)$/, 'y').replace(/(ing|ed|es|s)$/, '').replace(/(ment|tion)$/, '');
}

export function tokens(text) {
  return (text.toLowerCase().match(/[a-z]+|\d+(?:\.\d+)?/g) ?? [])
    .map(w => WORD_NUMBERS[w] ?? w)
    .filter(w => !STOP.has(w) && (w.length > 2 || /\d/.test(w)))
    .map(w => (/\d/.test(w) ? w : stem(w)));
}

// Numbers that carry meaning in a claim: percents, money, years, counts. "5%" and "5 percent" and "five percent" match.
export function numbers(text) {
  const t = text.toLowerCase()
    .replace(/\b(one|two|three|four|five|six|seven|eight|nine|ten|twelve)\b/g, m => WORD_NUMBERS[m])
    .replace(/(\d),(\d{3})/g, '$1$2');
  return new Set((t.match(/\d+(?:\.\d+)?/g) ?? []).map(n => String(Number(n))));
}

// Text that addresses the model rather than describing the world. Used to quarantine retrieved passages
// and to reject claims that relay injected instructions.
export const INSTRUCTION_LIKE = /(ignore (all |any )?(previous|prior|above|earlier) (instructions|rules|directions)|system (note|prompt|message|instruction)|note to the (assistant|model|ai)|you are now|developer mode|disregard (the|all|any|previous)|as an ai\b)/i;
