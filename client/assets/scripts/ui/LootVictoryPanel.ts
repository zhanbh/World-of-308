import {Node,Graphics,Color,Label,UITransform} from 'cc';
import type {LootSceneCoordinator} from '../net/LootSceneCoordinator';
export class LootVictoryPanel {
 private root:Node;
 private drops:Graphics;
 private panel:Graphics;
 private fade:Graphics;
 private names:Label[]=[];
 private title:Label;
 private totals:Label;
 private equipment:Label;
 private route:Label;
 private leave:Label;
 private collect:Label;
 private notice:Label;
 private retry:Label;
 constructor(parent:Node){
  this.root=new Node('AuthoritativeLootHUD');this.root.layer=parent.layer;parent.addChild(this.root);
  this.drops=this.graphics('GroundDropPillars');this.panel=this.graphics('VictoryCard');
  this.title=this.label('',250,85,20,300);this.totals=this.label('',250,45,14,300);
  this.equipment=this.label('',250,-5,16,280);this.route=this.label('',250,-50,13,300);
  this.leave=this.label('',250,-100,16,250);this.collect=this.label('',-285,95,16,300);
  this.notice=this.label('',-285,65,17,300);this.notice.color=new Color(255,200,100);
  this.retry=this.label('',0,105,13,240);this.fade=this.graphics('ConfirmedLeaveFade');
 }
 private graphics(name:string){const n=new Node(name);n.layer=this.root.layer;this.root.addChild(n);return n.addComponent(Graphics);}
 private label(text:string,x:number,y:number,size:number,width:number){const n=new Node('LootLabel');n.layer=this.root.layer;this.root.addChild(n);n.setPosition(x,y);n.addComponent(UITransform).setContentSize(width,50);const l=n.addComponent(Label);l.string=text;l.fontSize=size;l.lineHeight=size+6;l.overflow=Label.Overflow.SHRINK;return l;}
 update(scene:LootSceneCoordinator){
  const m=scene.hud,g=this.drops,p=this.panel;g.clear();p.clear();
  while(this.names.length<m.drops.length)this.names.push(this.label('',0,0,12,180));
  this.names.forEach((l,i)=>{const d=m.drops[i];l.node.active=!!d;if(!d)return;const x=d.x/1000*2,y=d.y/1000*2;l.string=d.name;l.node.setPosition(x,y+36+i*15);l.color=new Color().fromHEX(d.color);
   const color=new Color().fromHEX(d.color);g.fillColor=new Color(color.r,color.g,color.b,d.near?140:70);g.rect(x-5,y+5,10,30);g.fill();g.fillColor=color;g.moveTo(x,y+18);g.lineTo(x+7,y+10);g.lineTo(x,y+2);g.lineTo(x-7,y+10);g.close();g.fill();if(d.near){g.strokeColor=color;g.lineWidth=2;g.ellipse(x,y,16,6);g.stroke();}
  });
  const v=m.victory;this.title.node.active=this.totals.node.active=this.equipment.node.active=this.route.node.active=this.leave.node.active=!!v;
  if(v){p.fillColor=new Color(20,32,40,235);p.roundRect(85,-125,330,240,12);p.fill();p.strokeColor=new Color(241,202,106);p.lineWidth=2;p.roundRect(85,-125,330,240,12);p.stroke();
   this.title.string=v.title;this.totals.string=`${v.elapsed} · 击杀 ${v.kills}\n金币 ${v.gold} · 经验 ${v.xp}`;
   const flip=Math.max(.05,Math.abs(Math.cos(m.flipProgress*Math.PI)));this.equipment.node.setScale(flip,1,1);this.equipment.string=m.flipProgress<.5?'通关装备 · 翻牌中':v.equipment;
   this.route.string=v.routeMessage;this.leave.string=scene.terminal.state.status==='unknown'?'结果待恢复 · 点击重试':scene.terminal.state.status==='closed'?'已离开副本':scene.busy?'请等待当前操作…':'离开副本 [L]';
  }
  this.collect.string=scene.busy?'正在确认操作…':m.nearest?'拾取附近掉落 [P]':'靠近掉落物（32px）';this.notice.string=m.notice;
  const needsRetry=scene.movement.state.status==='unknown'||scene.movement.state.status==='error'||scene.drops.state.status==='unknown'||scene.terminal.state.status==='unknown'||scene.terminal.state.status==='failed';this.retry.string=needsRetry?'网络结果待确认 · 重试 [V]':'';
  // Ground labels are created lazily; keep the confirmation fade above all labels.
  this.fade.node.setSiblingIndex(this.root.children.length-1);this.fade.clear();if(m.fadeAlpha>0){this.fade.fillColor=new Color(0,0,0,Math.round(255*m.fadeAlpha));this.fade.rect(-480,-270,960,540);this.fade.fill();}
 }
 hitTest(x:number,y:number):'collect'|'leave'|'retry'|null{if(Math.abs(x+285)<150&&Math.abs(y-95)<20)return 'collect';if(Math.abs(x-250)<150&&Math.abs(y+100)<22)return 'leave';if(Math.abs(x)<120&&Math.abs(y-105)<20)return 'retry';return null;}
 dispose(){this.root.destroy();}
}
