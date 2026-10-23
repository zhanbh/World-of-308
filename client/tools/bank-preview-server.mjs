/** Explicit ephemeral localhost ST09 test profile. No live player, production price or deployment. */
import { pathToFileURL } from 'node:url';
import { createBankFixture } from '../../backend/test/fixtures/bank-fixture.mjs';
import { createPreviewServer } from './inventory-preview-server.mjs';
export async function createBankPreview(){
 const f=await createBankFixture();await f.fund();
 await f.seed({0:f.stack('preview-hp',15),6:f.stack('preview-bound',5,{kind:'character',accountId:f.account().id,characterId:f.characterId}),18:{kind:'equipment',itemId:'preview-sword',sortHeader:{itemLevel:10,quality:'blue',slotKind:'weapon'}}});
 await f.seed({0:f.stack('preview-vault-hp',18)},'personalVault');
 await f.store.run(tx=>tx.set('preview-sword',{schemaVersion:2,id:'preview-sword',accountId:f.account().id,holderCharacterId:f.characterId,sourceKey:'isolated-preview-gear',sourceOrdinal:0,sourceLocator:{kind:'grant',grantId:'isolated-preview-gear'},templateRef:{id:'preview:sword',version:1},slotKind:'weapon',itemLevel:10,quality:'blue',rolledAffixes:[],setRef:null,binding:{kind:'none'},enhancementLevel:0,durability:{wearEnabled:true,current:20,max:100,policyRef:'test'},location:{kind:'container',containerId:f.bag().id},lifecycle:'active',version:0,createdAt:1000,updatedAt:1000}));
 return{bootstrap:{previewInstanceId:crypto.randomUUID(),identity:{sessionId:f.session.sessionId,sessionEpoch:f.session.sessionEpoch,characterId:f.characterId},contextId:f.contextId,templateLabels:{potion:'生命药水','preview:sword':'试用长剑','preview-sword':'试用长剑'},priceProfile:'isolated-test'},rpc:request=>Object.hasOwn(request,'query')?f.service.query(request):f.service.execute(request)};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){const port=Number(process.argv[2]??8789);if(!Number.isInteger(port)||port<1024||port>65535)throw Error('INVALID_PORT');const server=createPreviewServer(await createBankPreview());server.listen(port,'127.0.0.1',()=>console.log(`ST09 isolated bank preview http://127.0.0.1:${port}; TEST prices, ephemeral assets.`));}
