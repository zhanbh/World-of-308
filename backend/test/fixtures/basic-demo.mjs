import {basicFixture} from './basic-fixture.mjs';
const h=await basicFixture();h.clock.now=()=>2013;
const command=await h.command([{kind:'basic',pressed:true}],100,'demo-basic'),result=await h.service.execute(command),events=await h.results('demo-basic');
const page=await h.service.query({...h.base,payload:{...h.base.payload,checkpointRevision:result.outcome.data.checkpointRevision}});
console.log(JSON.stringify({capabilities:h.profile.capabilities,result,events,confirmed:page},null,2));
