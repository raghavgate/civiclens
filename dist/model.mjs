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
export function routeQuestion(question) {
  const q=question.toLowerCase().trim();
  if (/\b(buy|buying|mortgage|house|home|interest|rate)\b/.test(q)) return 'buy';
  if (/\b(rent|rents|rental|housing|afford|affordable|affordability|zoning|supply)\b/.test(q)) return 'rent';
  return 'unsupported';
}
