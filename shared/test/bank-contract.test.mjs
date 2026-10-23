import test from 'node:test';
import assert from 'node:assert/strict';
import {parseAssetQuery,parseAssetQueryResponse,parseAssetResponse} from '../src/protocol/asset-v2.ts';
const auth={protocolVersion:2,sessionId:'session',sessionEpoch:1,requestId:'view'};
const view=(kind,id)=>({containerId:id,version:0,kind,owner:kind==='accountVault'?{kind:'account'}:{kind:'character',characterId:'role'},capacity:kind==='accountVault'?100:20,unlockStage:kind==='accountVault'?null:0,slots:[]});
const versions=[{kind:'character',id:'role',version:1},{kind:'container',id:'bag',version:0},{kind:'container',id:'vault',version:0},{kind:'wallet',id:'wallet',version:0}];
const snapshot=()=>({requestId:'view',serverTime:1000,versions, data:{characterId:'role',characterVersion:1,backpack:view('backpack','bag'),vault:view('accountVault','vault'),wallet:{walletId:'wallet',version:0,gold:'100',points:'5'}}});
test('bank query requires bank context and bank snapshot validates paired scopes and versions',()=>{
 assert.throws(()=>parseAssetQuery({...auth,query:'bank.get',payload:{characterId:'role',vaultKind:'accountVault'}}));
 assert.equal(parseAssetQueryResponse('bank.get',snapshot()).data.vault.kind,'accountVault');
 const wrong=snapshot();wrong.data.vault=view('backpack','vault');assert.throws(()=>parseAssetQueryResponse('bank.get',wrong));
 const stale=snapshot();stale.versions=versions.slice(1);assert.throws(()=>parseAssetQueryResponse('bank.get',stale));
});
test('expansion quote supports no bank context but requires coherent nonzero costs',()=>{
 assert.equal(parseAssetQuery({...auth,query:'inventory.expansionQuote',payload:{characterId:'role',containerId:'bag',targetStage:1}}).query,'inventory.expansionQuote');
 const q={requestId:'view',serverTime:1000,versions:[],data:{containerId:'bag',targetStage:1,nextCapacity:40,configRef:{id:'prices',version:1},quoteRef:'quote',costs:[{currency:'gold',amount:'100'}]}};
 assert.equal(parseAssetQueryResponse('inventory.expansionQuote',q).data.nextCapacity,40);
 assert.throws(()=>parseAssetQueryResponse('inventory.expansionQuote',{...q,data:{...q.data,nextCapacity:60}}));assert.throws(()=>parseAssetQueryResponse('inventory.expansionQuote',{...q,data:{...q.data,costs:[{currency:'gold',amount:'0'}]}}));
});
test('available capacity hint is bounded and confined to transfer-full refusals',()=>{
 const r={operationId:'op',serverTime:1000,replayed:false,outcome:{status:'rejected',code:'CONTAINER_FULL',availableCapacity:2}};
 assert.equal(parseAssetResponse('inventory.transfer',r).outcome.availableCapacity,2);assert.throws(()=>parseAssetResponse('inventory.expand',r));assert.throws(()=>parseAssetResponse('inventory.transfer',{...r,outcome:{...r.outcome,code:'BINDING_RESTRICTED'}}));
});
