import type {DropCoordinator} from './net/DropCoordinator.ts';
import type {ClearReceipt} from '../../../shared/src/protocol/scene-v2.ts';
export const LOOT_COLORS={white:'#e8e6da',green:'#68da8b',blue:'#72b7ff',purple:'#c18aff',orange:'#ffa454'} as const;
export class LootVictoryHUDModel {
 drops:{dropId:string;x:number;y:number;name:string;color:string;near:boolean}[]=[];
 victory:{title:string;elapsed:string;kills:number;gold:string;xp:number;equipment:string;routeMessage:string}|null=null;
 notice='';
 flipProgress=0;
 fadeAlpha=0;
 private source:string|null=null;
 private noticeRemaining=0;
 private code:string|null=null;
 private fade=false;
 sync(drop:DropCoordinator['state'],receipt:ClearReceipt|null,confirmed:{x:string;y:string}|null){
  this.drops=(drop.view?.data.drops??[]).filter(d=>!d.collected).map(d=>({dropId:d.dropId,x:d.x,y:d.y,name:`${d.templateId} ×${d.quantity}`,color:LOOT_COLORS[d.quality],near:confirmed!==null&&(BigInt(confirmed.x)-BigInt(d.x))**2n+(BigInt(confirmed.y)-BigInt(d.y))**2n<=32000n**2n}));
  if(drop.code==='BAG_FULL'&&this.code!=='BAG_FULL'){this.notice='背包已满';this.noticeRemaining=2;}
  this.code=drop.code;
  if(receipt){if(this.source!==receipt.sourceKey){this.source=receipt.sourceKey;this.flipProgress=0;}
   this.victory={title:'胜利 · 首领已击败',elapsed:`${(receipt.elapsedMs/1000).toFixed(1)} 秒`,kills:receipt.kills,gold:receipt.gold,xp:receipt.xp,equipment:`${receipt.equipment.templateRef} · Lv.${receipt.equipment.itemLevel}`,routeMessage:receipt.route==='pending'?'背包已满，已暂存至待领奖励':'已放入背包'};
  }else {this.victory=null;this.source=null;this.flipProgress=0;}
 }
 get nearest(){return this.drops.find(d=>d.near)??null;}
 beginFade(){this.fade=true;}
 update(dt:number){const delta=Math.max(0,Math.min(dt,.1));if(this.victory)this.flipProgress=Math.min(1,this.flipProgress+Math.max(0,dt)/.3);if(this.fade)this.fadeAlpha=Math.min(1,this.fadeAlpha+delta*2);this.noticeRemaining=Math.max(0,this.noticeRemaining-delta);if(this.noticeRemaining===0)this.notice='';}
}
