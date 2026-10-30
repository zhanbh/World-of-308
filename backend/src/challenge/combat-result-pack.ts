// Physical storage only; original JSON values and public pages are retained.
export const RESULT_PACK_PAGES=1024;
export const RESULT_PACK_BYTES=1048576;
export const RESULT_DECODED_BYTES=33554432;
export interface PackedEvents {encoding:'gzip-json-v1';eventCount:number;decodedBytes:number;data:string}
const invalid=():never=>{throw new TypeError('RESULT_PACK');};
function base64(bytes:Uint8Array):string{
    let binary='';for(let i=0;i<bytes.length;i+=32768)binary+=String.fromCharCode(...bytes.subarray(i,i+32768));
    return btoa(binary);
}
export async function packEvents(events:unknown[]):Promise<PackedEvents>{
    if(events.length>32768)invalid();
    const bytes=new TextEncoder().encode(JSON.stringify(events));if(bytes.length>RESULT_DECODED_BYTES)invalid();
    const stream=new Blob([bytes]).stream().pipeThrough(new CompressionStream('gzip'));
    const compressed=new Uint8Array(await new Response(stream).arrayBuffer());
    if(compressed.length>RESULT_PACK_BYTES)invalid();
    return {encoding:'gzip-json-v1',eventCount:events.length,decodedBytes:bytes.length,data:base64(compressed)};
}
export async function unpackEvents(raw:PackedEvents,start=0,count=32768):Promise<unknown[]>{
    if(!raw||Object.keys(raw).sort().join(',')!=='data,decodedBytes,encoding,eventCount'||raw.encoding!=='gzip-json-v1'||!Number.isSafeInteger(raw.eventCount)||raw.eventCount<0||raw.eventCount>32768||!Number.isSafeInteger(raw.decodedBytes)||raw.decodedBytes<2||raw.decodedBytes>RESULT_DECODED_BYTES||typeof raw.data!=='string'||raw.data.length>1398104||!Number.isSafeInteger(start)||start<0||!Number.isSafeInteger(count)||count<0||count>32768)invalid();
    if(raw.data.length%4!==0||!/^[A-Za-z0-9+/]*={0,2}$/.test(raw.data))invalid();
    let binary:string;try{binary=atob(raw.data);}catch{return invalid();}
    const bytes=Uint8Array.from(binary,c=>c.charCodeAt(0));if(base64(bytes)!==raw.data)invalid();
    const reader=new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip')).getReader();
    const chunks:Uint8Array[]=[];let length=0;
    try{
        while(true){const next=await reader.read();if(next.done)break;length+=next.value.length;
            if(length>raw.decodedBytes||length>RESULT_DECODED_BYTES){await reader.cancel();invalid();}chunks.push(next.value);
        }
    }catch{await reader.cancel().catch(()=>{});return invalid();}
    if(length!==raw.decodedBytes)invalid();
    const decoded=new Uint8Array(length);let offset=0;for(const chunk of chunks){decoded.set(chunk,offset);offset+=chunk.length;}
    let events:unknown;try{events=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(decoded));}catch{return invalid();}
    if(!Array.isArray(events)||events.length!==raw.eventCount)return invalid();
    return events.slice(start,start+count);
}
