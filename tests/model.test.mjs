import test from 'node:test';import assert from 'node:assert/strict';import {payment,calculate,routeQuestion} from '../dist/model.mjs';
const base={income:75000,rent:2200,utilities:150,price:400000,down:20,rate:6.5,tax:1.1,insurance:150,maintenance:1,hoa:0,pmi:.5};
test('known amortization reference: 100k at 6% for 30 years',()=>assert.ok(Math.abs(payment(100000,6)-599.550525)<.00001));
test('zero interest and fully paid home',()=>{assert.equal(payment(360000,0),1000);assert.equal(payment(0,6.5),0)});
test('rent cost, gross income share, and reference',()=>{const r=calculate(base);assert.equal(r.renting,2350);assert.equal(r.rentShare,37.6);assert.equal(r.benchmark,1875)});
test('ownership includes all modeled costs and PMI threshold',()=>{const r=calculate(base);assert.equal(r.parts['Mortgage insurance'],0);assert.ok(Math.abs(r.owning-(r.pi+400000*.011/12+150+400000*.01/12+150))<1e-8);const low=calculate({...base,down:10});assert.equal(low.parts['Mortgage insurance'],150)});
test('rate increase raises payment; reducing rent changes only rent',()=>{assert.ok(calculate({...base,rate:7.5}).owning>calculate(base).owning);assert.equal(calculate({...base,rent:1980}).renting,2130)});
test('reject invalid model inputs',()=>{for(const change of [{income:0},{down:101},{rate:-1},{rent:NaN}])assert.throws(()=>calculate({...base,...change}),RangeError);assert.throws(()=>payment(100,5,0),RangeError)});
test('question routing supports bounded intents and abstains',()=>{assert.equal(routeQuestion('Could I afford to buy?'),'buy');assert.equal(routeQuestion('Why is my rent so expensive?'),'rent');assert.equal(routeQuestion('Who should I vote for?'),'unsupported')});
