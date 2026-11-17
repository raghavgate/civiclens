// Versioned, deterministic scenario models. They run in the browser on ephemeral inputs;
// no financial value entered here is ever sent to a server.
export const MODEL_VERSION = 'civiclens-model-2';
export const SCENARIO_MODELS = { rent_budget: 'rent_budget', mortgage_cost: 'mortgage_cost', property_tax: 'prop13_property_tax' };
export const INTENTS = ['rent_budget', 'mortgage_cost', 'property_tax', 'policy_evidence', 'unsupported'];

export function payment(principal, annualRate, years=30) {
  if (![principal,annualRate,years].every(Number.isFinite)||principal<0||annualRate<0||years<=0) throw new RangeError('Invalid loan inputs');
  const n=years*12, r=annualRate/1200;
  return r===0 ? principal/n : principal*r/(-Math.expm1(-n*Math.log1p(r)));
}
export function calculate({income,rent,utilities,price,down,rate,tax,insurance,maintenance,hoa,pmi}) {
  const values=[income,rent,utilities,price,down,rate,tax,insurance,maintenance,hoa,pmi];
  if (!values.every(Number.isFinite)||income<=0||values.slice(1).some(v=>v<0)||down>100) throw new RangeError('Invalid household inputs');
  const principal=price*(1-down/100), pi=payment(principal,rate);
  const parts={ 'Principal & interest':pi,'Property tax':price*tax/1200,'Home insurance':insurance,'Maintenance reserve':price*maintenance/1200,'HOA':hoa,'Mortgage insurance':down<20?principal*pmi/1200:0,'Utilities':utilities };
  const owning=Object.values(parts).reduce((a,b)=>a+b,0), renting=rent+utilities, monthlyIncome=income/12;
  return {principal,pi,parts,owning,renting,monthlyIncome,rentShare:renting/monthlyIncome*100,ownShare:owning/monthlyIncome*100,benchmark:monthlyIncome*.3};
}

// California Proposition 13 sketch: tax base set at purchase price, grows by the lesser of inflation or 2% a year
// (Cal. Const. art. XIII A §2(b)); general levy capped at 1% (§1(a)) plus any voter-approved local rate.
// Ignores declines in value, exemptions, supplemental assessments, and parcel taxes.
export function propertyTax({price, years, inflation, localRate, marketGrowth}) {
  const values=[price,years,inflation,localRate,marketGrowth];
  if (!values.every(Number.isFinite)||price<0||years<0||years>60||!Number.isInteger(years)||localRate<0) throw new RangeError('Invalid property tax inputs');
  const factor=Math.min(Math.max(inflation,0),2)/100, rate=(1+localRate)/100, rows=[];
  let assessed=price, market=price;
  for (let y=0; y<=years; y++) {
    rows.push({year:y,assessed,market,tax:assessed*rate,reassessedTax:market*rate});
    assessed=assessed*(1+factor); market=market*(1+marketGrowth/100);
  }
  const last=rows[rows.length-1];
  return {rows,rate:rate*100,annualTax:last.tax,ifReassessed:last.reassessedTax,gap:last.reassessedTax-last.tax};
}

// Deterministic keyword router: the offline fallback when no planner is reachable, and the mock planner in tests.
export function routeQuestion(question) {
  const q=question.toLowerCase().trim();
  const domain=/\b(health|insurance|coverage|medi-?cal|covered california|uninsured|mandate)\b/.test(q)?'healthcare'
    :/\b(property tax|prop(osition)? ?13|assess(ed|ment)?|reassess\w*)\b/.test(q)?'tax'
    :/\b(rent|rents|rental|tenant|landlord|housing|home|house|mortgage|buy|buying|zoning|afford\w*)\b/.test(q)?'housing':null;
  if (!domain) return {intent:'unsupported',domain:null};
  if (/\b(landlord|raise|increase|evict\w*|bill|law|laws|legal|legislation|statute|cap|caps|capped|penalty|rule|rules|allowed|require[sd]?|policy|policies|proposition|prop 13|ab ?\d+|sb ?\d+)\b/.test(q)) return {intent:'policy_evidence',domain};
  if (domain==='tax') return {intent:'property_tax',domain};
  if (domain==='healthcare') return {intent:'policy_evidence',domain};
  if (/\b(buy|buying|mortgage|house|home|interest|rate)\b/.test(q)) return {intent:'mortgage_cost',domain};
  return {intent:'rent_budget',domain};
}
