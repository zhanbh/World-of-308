import {repairFixture} from './repair-fixture.mjs';
export const WEAR_SLOTS=['weapon','shoulder','chest','pants','belt','boots','earring'];
export async function allWornFixture(options={}){
 const f=await repairFixture(options);
 await f.store.run(async tx=>{
  const c=await tx.get(f.characterId),w=await tx.get(f.weaponId);
  for(const slot of ['shoulder','chest','pants','belt','boots','earring','bracelet','necklace','ring','subEquip','magicStone','trinket']){
   const id='all-worn-'+slot;c.equipped[slot]=id;
   tx.set(id,{...w,id,sourceKey:id,sourceLocator:{kind:'grant',grantId:id},slotKind:slot,location:{kind:'equipped',characterId:c.id,slotId:slot},durability:WEAR_SLOTS.includes(slot)?{...w.durability,current:30}:{wearEnabled:false,current:null,max:null,policyRef:'none'}});
  }
  tx.set(c.id,{...c,version:c.version+1});
  for(const [kind,id] of [['backpack','all-worn-bag'],['personalVault','all-worn-vault']]){
   const container=kind==='backpack'?await tx.get(c.backpackId):await tx.get(c.personalVaultId);
   tx.set(id,{...w,id,sourceKey:id,sourceLocator:{kind:'grant',grantId:id},location:{kind:'container',containerId:container.id},durability:{...w.durability,current:1}});
   const slots={...container.slots,0:{kind:'equipment',itemId:id,sortHeader:{itemLevel:10,quality:'white',slotKind:'weapon'}}};if(kind==='backpack')for(let n=1;n<100;n++)slots[n]={kind:'stack',stackId:'admitted-all-stack-'+n,templateRef:{id:'ore',version:1},quantity:20,binding:{kind:'none'},traceRef:'admitted-all-trace-'+n};
   tx.set(container.id,{...container,version:container.version+1,...kind==='backpack'?{capacity:100,stage:4}:{},slots});
  }
 });
 const quoteAll=(context=f.contextId)=>f.service.query({...f.auth,query:'service.quote',requestId:'all-worn-quote',payload:{characterId:f.characterId,contextId:context,serviceIntent:{command:'equipment.repair',payload:{characterId:f.characterId,contextId:context,target:{kind:'allWorn'},quoteRef:'unquoted'}}}});
 const allCommand=(q,context=f.contextId)=>({...f.auth,command:'equipment.repair',operationId:'all-worn-repair',expected:q.data.targetVersions,payload:{characterId:f.characterId,contextId:context,target:{kind:'allWorn'},quoteRef:q.data.quoteRef}});
 return {...f,quoteAll,allCommand};
}
