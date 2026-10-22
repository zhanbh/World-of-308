// Render script for World of 308 UI Mockups (960x540)
// Generates standalone static HTML pages free of developer jargon / test notes
// and captures them headlessly using Microsoft Edge on Windows.
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const OUTPUT_DIR = path.resolve(__dirname, '../../docs/design/ui-mockups');
const TMP_DIR = path.resolve(__dirname, 'tmp_mockup_pages');

if (!fs.existsSync(TMP_DIR)) {
  fs.mkdirSync(TMP_DIR, { recursive: true });
}
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

// Common CSS styling for all mockups
const BASE_CSS = `
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    width: 960px;
    height: 540px;
    background: #10181e;
    color: #e2ebef;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
    overflow: hidden;
    user-select: none;
    position: relative;
  }
  .bg-panel { background: #19252e; border: 1px solid #344654; }
  .text-dim { color: #8fa2af; }
  .text-gold { color: #fbc02d; }
  .text-cyan { color: #00e5ff; }
  .text-green { color: #69f0ae; }
  .text-purple { color: #ab47bc; }
  .text-blue { color: #42a5f5; }
  .text-orange { color: #ffa726; }
  .text-red { color: #ff5252; }

  .modal-frame {
    position: absolute;
    top: 20px;
    left: 24px;
    width: 912px;
    height: 500px;
    background: #19252e;
    border: 2px solid #5b7c8e;
    border-radius: 6px;
    display: flex;
    flex-direction: column;
    box-shadow: 0 10px 30px rgba(0,0,0,0.8);
    overflow: hidden;
  }
  .modal-header {
    height: 40px;
    background: #141f27;
    border-bottom: 1px solid #344654;
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0 16px;
    font-size: 15px;
    font-weight: bold;
    color: #ffca28;
  }
  .modal-body {
    flex: 1;
    display: flex;
    overflow: hidden;
  }
  .modal-footer {
    height: 42px;
    border-top: 1px solid #2b3a46;
    background: #141f27;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 16px;
    font-size: 12px;
  }
  .btn-action {
    background: #2b4557;
    color: #e2ebef;
    border: 1px solid #5b7c8e;
    padding: 5px 12px;
    border-radius: 4px;
    font-size: 12px;
    cursor: pointer;
  }
  .btn-green {
    background: #2e7d32;
    color: #fff;
    border: 1px solid #4caf50;
    padding: 6px 14px;
    border-radius: 4px;
    font-size: 12px;
    cursor: pointer;
  }

  /* DNF 风格武器强化动态呼吸闪烁动画 */
  @keyframes dnf-blade-breath-pink {
    0%, 100% {
      filter: drop-shadow(0 0 8px #ff4081) drop-shadow(0 0 16px rgba(255,64,129,0.45));
      transform: scale(0.98);
      opacity: 0.85;
    }
    50% {
      filter: drop-shadow(0 0 20px #ff4081) drop-shadow(0 0 36px rgba(240,98,146,0.95)) drop-shadow(0 0 55px rgba(255,64,129,0.7));
      transform: scale(1.02);
      opacity: 1;
    }
  }
  .blade-glow-pink { animation: dnf-blade-breath-pink 1.4s ease-in-out infinite; }

  /* Gear slot representation */
  .gear-slot {
    height: 52px;
    background: #10181e;
    border: 1px solid #344654;
    border-radius: 4px;
    display: flex;
    align-items: center;
    padding: 4px 6px;
    gap: 8px;
    position: relative;
  }
  .gear-icon {
    width: 40px;
    height: 40px;
    border-radius: 3px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 11px;
    font-weight: bold;
    position: relative;
    background: #19252e;
  }
  .gear-icon.purple { border: 2px solid #ab47bc; color: #ab47bc; }
  .gear-icon.blue { border: 2px solid #42a5f5; color: #42a5f5; }
  .gear-icon.green { border: 2px solid #66bb6a; color: #66bb6a; }
  .gear-icon.white { border: 1px solid #b0bec5; color: #b0bec5; }
  .gear-icon img { width: 34px; height: 34px; image-rendering: pixelated; }
  .bag-cell img { width: 38px; height: 38px; image-rendering: pixelated; }
  .enhance-badge {
    position: absolute;
    top: -4px;
    right: -4px;
    background: #ffca28;
    color: #10181e;
    font-size: 10px;
    padding: 1px 3px;
    border-radius: 3px;
    font-weight: bold;
  }
  .dura-bar {
    position: absolute;
    bottom: 1px;
    left: 2px;
    right: 2px;
    height: 3px;
    background: #2b3a46;
    border-radius: 1px;
    overflow: hidden;
  }
  .dura-fill { height: 100%; }
  .dura-normal { background: #69f0ae; }
  .dura-warn { background: #ffd740; }
  .dura-broken { background: #ff5252; }
  .gear-info { display: flex; flex-direction: column; overflow: hidden; flex: 1; }
  .gear-name { font-size: 12px; font-weight: bold; white-space: nowrap; text-overflow: ellipsis; }
  .gear-sub { font-size: 10px; color: #8fa2af; }

  /* Profile layout */
  .profile-left {
    width: 580px;
    height: 100%;
    border-right: 1px solid #2b3a46;
    padding: 12px;
    display: flex;
    flex-direction: column;
    position: relative;
  }
  .paper-doll-wrap {
    flex: 1;
    display: flex;
    justify-content: space-between;
    align-items: center;
    position: relative;
  }
  .doll-col {
    display: flex;
    flex-direction: column;
    gap: 8px;
    width: 140px;
    z-index: 2;
  }
  .doll-center {
    position: absolute;
    left: 170px;
    right: 170px;
    top: 0;
    bottom: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
  }
  .avatar-box {
    width: 180px;
    height: 280px;
    background: radial-gradient(circle, #253947 0%, rgba(16,24,30,0) 75%);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    color: #5b7c8e;
    font-size: 13px;
  }
  .weapon-slot-wrap {
    width: 140px;
    margin-top: 10px;
  }

  .profile-right {
    width: 332px;
    height: 100%;
    display: flex;
    flex-direction: column;
    background: #141f27;
  }
  .tab-bar {
    display: flex;
    border-bottom: 1px solid #2b3a46;
  }
  .tab-btn {
    flex: 1;
    height: 36px;
    background: #19252e;
    color: #8fa2af;
    border: none;
    border-right: 1px solid #2b3a46;
    font-size: 13px;
    cursor: pointer;
  }
  .tab-btn.active { background: #141f27; color: #ffca28; font-weight: bold; }
  .stats-content {
    flex: 1;
    padding: 12px;
    overflow-y: auto;
    font-size: 12px;
    line-height: 1.6;
  }
  .stat-group {
    margin-bottom: 10px;
    padding-bottom: 8px;
    border-bottom: 1px solid #22323e;
  }
  .stat-title {
    color: #ffca28;
    font-size: 12px;
    font-weight: bold;
    margin-bottom: 4px;
  }
  .stat-row { display: flex; justify-content: space-between; }

  /* Tooltip */
  #tooltip-card {
    position: absolute;
    top: 36px;
    right: 340px;
    width: 256px;
    background: #10181edd;
    backdrop-filter: blur(8px);
    border: 2px solid #ab47bc;
    border-radius: 6px;
    padding: 10px;
    font-size: 12px;
    line-height: 1.5;
    box-shadow: 0 10px 25px rgba(0,0,0,0.8);
    z-index: 100;
  }

  /* Bag Grid */
  .bag-grid {
    display: grid;
    grid-template-columns: repeat(5, 54px);
    gap: 6px;
    padding: 8px 0;
  }
  .bag-cell {
    width: 54px;
    height: 54px;
    background: #10181e;
    border: 1px solid #344654;
    border-radius: 4px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 11px;
    position: relative;
    text-align: center;
    padding: 2px;
  }
`;

function wrapHTML(title, content) {
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <title>${title}</title>
  <style>${BASE_CSS}</style>
</head>
<body>
  ${content}
</body>
</html>`;
}

const ICON_DIR = path.resolve(__dirname, '../assets/resources/icons');
function getIconDataUrl(name) {
  const p = path.join(ICON_DIR, name);
  if (fs.existsSync(p)) {
    return 'data:image/png;base64,' + fs.readFileSync(p).toString('base64');
  }
  return '';
}

const icons = {
  weapon: getIconDataUrl('weapon_dual_blades_64.png'),
  chest: getIconDataUrl('armor_chest_64.png'),
  shoulders: getIconDataUrl('armor_shoulders_64.png'),
  pants: getIconDataUrl('armor_pants_64.png'),
  boots: getIconDataUrl('armor_boots_64.png'),
  belt: getIconDataUrl('armor_belt_64.png'),
  necklace: getIconDataUrl('jewelry_necklace_64.png'),
  ring: getIconDataUrl('jewelry_ring_64.png'),
  bracelet: getIconDataUrl('jewelry_bracelet_64.png'),
  book: getIconDataUrl('special_book_64.png'),
  stone: getIconDataUrl('special_stone_64.png'),
  earring: getIconDataUrl('special_earring_64.png'),
  hp: getIconDataUrl('consumable_hp_potion_64.png'),
  mp: getIconDataUrl('consumable_mp_potion_64.png'),
  adamantite: getIconDataUrl('material_adamantite_64.png'),
  souvenir: getIconDataUrl('material_souvenir_64.png')
};

function getArtDataUrl(name) {
  const p = path.resolve(__dirname, '../../docs/art', name);
  if (fs.existsSync(p)) {
    return 'data:image/png;base64,' + fs.readFileSync(p).toString('base64');
  }
  return '';
}
const stanceTownBase64 = getArtDataUrl('warrior-stance-town.png');
const stanceCombatBase64 = getArtDataUrl('warrior-stance-combat.png');
const stancesFullBase64 = getArtDataUrl('warrior-stances-comparison-v1.png');

// Mockup Page Builders
const pages = [
  {
    filename: '01-character-profile-c-key.png',
    title: '个人信息与装备检视',
    html: wrapHTML('个人信息与装备检视', `
      <div class="modal-frame">
        <div class="modal-header">
          <span>[角色信息与装备检视] Lv.15 双刀战士 · 狂暴先驱</span>
          <span class="text-gold">综合装等评分: 1,845 (全服第 1 名)</span>
        </div>
        <div class="modal-body">
          <div class="profile-left">
            <div class="paper-doll-wrap">
              <div class="doll-col">
                <div class="gear-slot">
                  <div class="gear-icon green"><img src="${icons.shoulders}"><div class="dura-bar"><div class="dura-fill dura-normal" style="width:100%"></div></div></div>
                  <div class="gear-info"><div class="gear-name text-green">幽暗护肩</div><div class="gear-sub">Lv.15 耐久 80/80</div></div>
                </div>
                <div class="gear-slot">
                  <div class="gear-icon purple"><img src="${icons.chest}"><div class="dura-bar"><div class="dura-fill dura-normal" style="width:90%"></div></div></div>
                  <div class="gear-info"><div class="gear-name text-purple">幽暗轻甲</div><div class="gear-sub">Lv.15 耐久 90/100</div></div>
                </div>
                <div class="gear-slot">
                  <div class="gear-icon blue"><img src="${icons.belt}"><div class="dura-bar"><div class="dura-fill dura-normal" style="width:94%"></div></div></div>
                  <div class="gear-info"><div class="gear-name text-blue">兽皮腰带</div><div class="gear-sub">Lv.10 耐久 75/80</div></div>
                </div>
                <div class="gear-slot">
                  <div class="gear-icon purple"><img src="${icons.pants}"><div class="dura-bar"><div class="dura-fill dura-broken" style="width:0%"></div></div></div>
                  <div class="gear-info"><div class="gear-name text-purple">幽暗长裤</div><div class="gear-sub text-red">耐久 0/80</div></div>
                </div>
                <div class="gear-slot">
                  <div class="gear-icon green"><img src="${icons.boots}"><div class="dura-bar"><div class="dura-fill dura-warn" style="width:40%"></div></div></div>
                  <div class="gear-info"><div class="gear-name text-green">幽暗战靴</div><div class="gear-sub text-gold">耐久 28/70</div></div>
                </div>
                <div class="gear-slot">
                  <div class="gear-icon blue"><img src="${icons.souvenir}"></div>
                  <div class="gear-info"><div class="gear-name text-blue">疾风徽章</div><div class="gear-sub">主动饰品 (冷却 50秒)</div></div>
                </div>
              </div>

              <div class="doll-center">
                <div class="avatar-box" style="height:270px;justify-content:flex-start;padding-top:8px">
                  <div style="display:flex;gap:4px;margin-bottom:6px">
                    <span style="font-size:10px;padding:2px 8px;background:#ffca28;color:#10181e;border-radius:3px;font-weight:bold">站街形态</span>
                    <span style="font-size:10px;padding:2px 8px;background:#243644;color:#8fa2af;border-radius:3px">战斗状态</span>
                  </div>
                  <div style="position:relative;width:130px;height:160px;display:flex;align-items:center;justify-content:center;overflow:hidden;border-radius:6px;background:rgba(10,16,22,0.6);border:1px solid #2b3a46">
                    <img src="${stanceTownBase64}" style="width:100%;height:100%;object-fit:contain;image-rendering:pixelated;filter:drop-shadow(0 0 10px rgba(255,64,129,0.4))">
                    <div class="blade-glow-pink" style="position:absolute;bottom:4px;width:75px;height:12px;background:radial-gradient(ellipse at center, rgba(255,64,129,0.5) 0%, rgba(255,64,129,0) 70%);border-radius:50%"></div>
                  </div>
                  <div style="font-weight:bold;color:#ffca28;font-size:11px;margin-top:5px">[ 站街形态 · 从容入鞘 ]</div>
                  <div style="font-size:10px;color:#8fa2af;margin-top:2px;text-align:center">双刀收鞘 · 挺拔舒缓待机呼吸</div>
                </div>
                <div class="weapon-slot-wrap">
                  <div class="gear-slot" style="border-color:#ff4081;background:rgba(255,64,129,0.08);box-shadow:0 0 12px rgba(255,64,129,0.6)">
                    <div class="gear-icon purple" style="border-color:#ff4081">
                      <img src="${icons.weapon}"><span class="enhance-badge" style="background:#ff4081;color:#fff">+10</span>
                      <div class="dura-bar"><div class="dura-fill dura-normal" style="width:85%"></div></div>
                    </div>
                    <div class="gear-info"><div class="gear-name" style="color:#ff4081;font-weight:bold">狂暴残虐双刀 +10</div><div class="gear-sub" style="color:#ff80ab">Lv.15 耐久 85/100</div></div>
                  </div>
                </div>
              </div>

              <div class="doll-col">
                <div class="gear-slot">
                  <div class="gear-icon blue"><img src="${icons.necklace}"></div>
                  <div class="gear-info"><div class="gear-name text-blue">秘银项链</div><div class="gear-sub">Lv.15 项链</div></div>
                </div>
                <div class="gear-slot">
                  <div class="gear-icon green"><img src="${icons.bracelet}"></div>
                  <div class="gear-info"><div class="gear-name text-green">守护手镯</div><div class="gear-sub">Lv.15 手镯</div></div>
                </div>
                <div class="gear-slot">
                  <div class="gear-icon blue"><img src="${icons.ring}"></div>
                  <div class="gear-info"><div class="gear-name text-blue">狂暴之戒</div><div class="gear-sub">Lv.15 戒指</div></div>
                </div>
                <div class="gear-slot">
                  <div class="gear-icon blue"><img src="${icons.book}"></div>
                  <div class="gear-info"><div class="gear-name text-blue">战神图腾</div><div class="gear-sub">Lv.15 辅助装备</div></div>
                </div>
                <div class="gear-slot">
                  <div class="gear-icon blue"><img src="${icons.stone}"></div>
                  <div class="gear-info"><div class="gear-name text-blue">元素魔石</div><div class="gear-sub">Lv.15 魔法石</div></div>
                </div>
                <div class="gear-slot">
                  <div class="gear-icon purple">
                    <img src="${icons.earring}"><span class="enhance-badge">+10</span>
                    <div class="dura-bar"><div class="dura-fill dura-normal" style="width:100%"></div></div>
                  </div>
                  <div class="gear-info"><div class="gear-name text-purple">聚能耳环 +10</div><div class="gear-sub">Lv.15 耐久 50/50</div></div>
                </div>
              </div>
            </div>
          </div>

          <div class="profile-right">
            <div class="tab-bar">
              <button class="tab-btn active">详细属性</button>
              <button class="tab-btn">套装效果 (3)</button>
            </div>
            <div class="stats-content">
              <div class="stat-group">
                <div class="stat-title">【核心基础属性】</div>
                <div class="stat-row"><span>力量: 145</span><span>敏捷: 48</span></div>
                <div class="stat-row"><span>智力: 32</span><span>体质: 90</span></div>
              </div>
              <div class="stat-group">
                <div class="stat-title">【进攻属性 · 详细拆解】</div>
                <div class="stat-row"><strong>攻击强度 (AP):</strong><strong class="text-gold">328</strong></div>
                <div class="stat-row text-dim" style="padding-left:8px"><span>- 基础与武器 AP:</span><span>180</span></div>
                <div class="stat-row text-dim" style="padding-left:8px"><span>- 力量换算 AP (0.45):</span><span>+65</span></div>
                <div class="stat-row text-dim" style="padding-left:8px"><span>- 强化追加 AP:</span><span class="text-gold">+48</span></div>
                <div class="stat-row text-dim" style="padding-left:8px"><span>- 装备副属性 AP:</span><span class="text-blue">+35</span></div>
                <div class="stat-row"><span>物理暴击率:</span><span>18.5% (暴伤 150%)</span></div>
                <div class="stat-row"><span>急速等级:</span><span>8.2% (攻速/前摇)</span></div>
                <div class="stat-row"><span>精通等级:</span><span>6.0% (流血增伤)</span></div>
                <div class="stat-row"><span>护甲穿透:</span><span>12 点</span></div>
              </div>
              <div class="stat-group">
                <div class="stat-title">【生存与防御属性】</div>
                <div class="stat-row"><span>最大生命值 (HP):</span><span class="text-green">1,450 / 1,450</span></div>
                <div class="stat-row"><span>物理护甲:</span><span>280 (减伤率 28.5%)</span></div>
                <div class="stat-row"><span>魔法抗性:</span><span>15.0%</span></div>
              </div>
              <div class="stat-group" style="border:none">
                <div class="stat-title">【法力与技能冷却】</div>
                <div class="stat-row"><span>最大法力值 (MP):</span><span class="text-blue">240 / 240</span></div>
                <div class="stat-row"><span>职业技能 CDR:</span><span>5.0%</span></div>
              </div>
            </div>
          </div>
        </div>

        <div id="tooltip-card">
          <div style="font-weight:bold;font-size:13px;color:#ab47bc">★ 狂暴残虐双刀 +10</div>
          <div class="text-dim">稀有 · 单手双刀</div>
          <hr style="border:none;border-top:1px solid #344654;margin:6px 0">
          <div>装备等级: Lv.15 (需求等级: Lv.10)</div>
          <div class="text-gold">已绑定</div>
          <div>耐久: 85/100</div>
          <hr style="border:none;border-top:1px solid #344654;margin:6px 0">
          <div class="text-gold">【基础属性】</div>
          <div>物理攻击力 +85</div>
          <div>力量 +18 · 耐力 +12</div>
          <div class="text-gold" style="margin-top:4px">【强化增益 (+10)】</div>
          <div class="text-cyan">攻击强度 (AP) +24</div>
          <div class="text-gold" style="margin-top:4px">【随机副属性】</div>
          <div class="text-blue">· 物理暴击率 +2.8%</div>
          <div class="text-blue">· 攻击强度 +12</div>
          <hr style="border:none;border-top:1px solid #344654;margin:6px 0">
          <div class="text-purple">【套装: 幽暗密林征服者 (3/5)】</div>
          <div class="text-green">[已激活] (2) 件: 全技能伤害 +8%</div>
          <div class="text-dim">[未激活] (5) 件: 技能范围 +15%，终结技附加地裂</div>
        </div>

        <div class="modal-footer">
          <span class="text-dim">温馨提示：点击穿戴装备可查看详细属性；拖拽消耗品可配置至快捷栏。</span>
          <div>
            <button class="btn-action">打开背包 (B)</button>
            <button class="btn-action">分享配装</button>
          </div>
        </div>
      </div>
    `)
  },
  {
    filename: '02-character-profile-set-bonuses.png',
    title: '个人信息与套装效果',
    html: wrapHTML('个人信息与套装效果', `
      <div class="modal-frame">
        <div class="modal-header">
          <span>[角色信息与装备检视] Lv.15 双刀战士 · 狂暴先驱</span>
          <span class="text-gold">综合装等评分: 1,845</span>
        </div>
        <div class="modal-body">
          <div class="profile-left">
            <div class="paper-doll-wrap">
              <div class="doll-col">
                <div class="gear-slot">
                  <div class="gear-icon green"><img src="${icons.shoulders}"></div>
                  <div class="gear-info"><div class="gear-name text-green">幽暗护肩</div><div class="gear-sub">Lv.15</div></div>
                </div>
                <div class="gear-slot">
                  <div class="gear-icon purple"><img src="${icons.chest}"></div>
                  <div class="gear-info"><div class="gear-name text-purple">幽暗轻甲</div><div class="gear-sub">Lv.15</div></div>
                </div>
                <div class="gear-slot">
                  <div class="gear-icon blue"><img src="${icons.belt}"></div>
                  <div class="gear-info"><div class="gear-name text-blue">兽皮腰带</div><div class="gear-sub">Lv.10</div></div>
                </div>
                <div class="gear-slot">
                  <div class="gear-icon purple"><img src="${icons.pants}"></div>
                  <div class="gear-info"><div class="gear-name text-purple">幽暗长裤</div><div class="gear-sub text-red">耐久 0/80 (暂不计件)</div></div>
                </div>
                <div class="gear-slot">
                  <div class="gear-icon green"><img src="${icons.boots}"></div>
                  <div class="gear-info"><div class="gear-name text-green">幽暗战靴</div><div class="gear-sub">Lv.15</div></div>
                </div>
                <div class="gear-slot">
                  <div class="gear-icon blue"><img src="${icons.souvenir}"></div>
                  <div class="gear-info"><div class="gear-name text-blue">疾风徽章</div><div class="gear-sub">主动饰品</div></div>
                </div>
              </div>

              <div class="doll-center">
                <div style="font-size:36px;margin-bottom:8px">⚔️</div>
                <div class="text-gold" style="font-weight:bold;font-size:14px">[ 激活套装汇总检视 ]</div>
              </div>

              <div class="doll-col">
                <div class="gear-slot">
                  <div class="gear-icon blue"><img src="${icons.necklace}"></div>
                  <div class="gear-info"><div class="gear-name text-blue">秘银项链</div><div class="gear-sub">Lv.15</div></div>
                </div>
                <div class="gear-slot">
                  <div class="gear-icon green"><img src="${icons.bracelet}"></div>
                  <div class="gear-info"><div class="gear-name text-green">守护手镯</div><div class="gear-sub">Lv.15</div></div>
                </div>
                <div class="gear-slot">
                  <div class="gear-icon blue"><img src="${icons.ring}"></div>
                  <div class="gear-info"><div class="gear-name text-blue">狂暴之戒</div><div class="gear-sub">Lv.15</div></div>
                </div>
                <div class="gear-slot">
                  <div class="gear-icon blue"><img src="${icons.book}"></div>
                  <div class="gear-info"><div class="gear-name text-blue">战神图腾</div><div class="gear-sub">Lv.15</div></div>
                </div>
                <div class="gear-slot">
                  <div class="gear-icon blue"><img src="${icons.stone}"></div>
                  <div class="gear-info"><div class="gear-name text-blue">元素魔石</div><div class="gear-sub">Lv.15</div></div>
                </div>
                <div class="gear-slot">
                  <div class="gear-icon purple"><img src="${icons.earring}"><span class="enhance-badge">+10</span></div>
                  <div class="gear-info"><div class="gear-name text-purple">聚能耳环 +10</div><div class="gear-sub">Lv.15</div></div>
                </div>
              </div>
            </div>
            <div style="display:flex;justify-content:center;margin-top:10px">
              <div class="gear-slot" style="width:220px;border-color:#ff4081;box-shadow:0 0 14px rgba(255,64,129,0.7);background:rgba(255,64,129,0.08)">
                <div class="gear-icon purple" style="border-color:#ff4081"><img src="${icons.weapon}"><span class="enhance-badge" style="background:#ff4081;color:#fff">+10</span></div>
                <div class="gear-info">
                  <div class="gear-name" style="color:#ff4081;font-weight:bold;text-shadow:0 0 6px rgba(255,64,129,0.5)">狂暴残虐双刀 +10</div>
                  <div class="gear-sub" style="color:#ff80ab">Lv.15 · +10突破粉光</div>
                </div>
              </div>
            </div>
          </div>

          <div class="profile-right">
            <div class="tab-bar">
              <button class="tab-btn">详细属性</button>
              <button class="tab-btn active">套装效果 (3套)</button>
            </div>
            <div class="stats-content">
              <div class="stat-group">
                <div class="stat-title text-purple">【幽暗密林征服者】(防具套 3/5)</div>
                <div class="text-dim" style="font-size:11px">生效件数: 3 件 (幽暗长裤耐久 0/80，暂未生效)</div>
                <div class="text-green" style="margin-top:4px">[已激活] (2) 件效果:</div>
                <div style="padding-left:8px">- 全职业技能伤害提升 8%</div>
                <div class="text-dim" style="margin-top:4px">[未激活] (5) 件效果:</div>
                <div class="text-dim" style="padding-left:8px">- 技能攻击范围扩大 15%，施放崩山裂地斩时终结附加地裂冲击波</div>
              </div>

              <div class="stat-group">
                <div class="stat-title text-blue">【疾风守护饰品套】(首饰套 3/3)</div>
                <div class="text-green">[已激活] (3) 件效果:</div>
                <div style="padding-left:8px">- 全主属性(力量/敏捷/智力) +15</div>
                <div style="padding-left:8px">- 攻击强度 +20，物理暴击率与急速各 +3%</div>
              </div>

              <div class="stat-group" style="border:none">
                <div class="stat-title text-purple">【远古贤者之契】(特殊装备套 2/3)</div>
                <div class="text-dim">[未激活] (3) 件效果:</div>
                <div class="text-dim" style="padding-left:8px">- 全主属性 +20，攻击强度 +25，职业技能冷却减少 8%</div>
              </div>
            </div>
          </div>
        </div>

        <div class="modal-footer">
          <span class="text-dim">温馨提示：穿戴装备耐久降为 0 时套装效果暂停生效；在铁匠铺修理后自动恢复。</span>
          <button class="btn-action">返回属性</button>
        </div>
      </div>
    `)
  },
  {
    filename: '03-inventory-quickswap-b-key.png',
    title: '角色背包与换装',
    html: wrapHTML('角色背包与换装', `
      <div class="modal-frame">
        <div class="modal-header">
          <span>[角色背包与换装] (快捷键 B)</span>
          <span class="text-gold">金币: 1,250 | 点券: 0</span>
        </div>
        <div class="modal-body">
          <div style="width:420px;padding:12px;border-right:1px solid #2b3a46">
            <div style="font-weight:bold;color:#ffca28;margin-bottom:8px">穿戴装备概览 (13 槽)</div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;font-size:12px">
              <div class="gear-slot"><div class="gear-icon green"><img src="${icons.shoulders}"></div><span>幽暗护肩 (Lv.15)</span></div>
              <div class="gear-slot"><div class="gear-icon blue"><img src="${icons.necklace}"></div><span>秘银项链 (Lv.15)</span></div>
              <div class="gear-slot"><div class="gear-icon purple"><img src="${icons.chest}"></div><span>幽暗轻甲 (Lv.15)</span></div>
              <div class="gear-slot"><div class="gear-icon green"><img src="${icons.bracelet}"></div><span>守护手镯 (Lv.15)</span></div>
              <div class="gear-slot"><div class="gear-icon blue"><img src="${icons.belt}"></div><span>兽皮腰带 (Lv.10)</span></div>
              <div class="gear-slot"><div class="gear-icon blue"><img src="${icons.ring}"></div><span>狂暴之戒 (Lv.15)</span></div>
              <div class="gear-slot"><div class="gear-icon purple"><img src="${icons.pants}"></div><span>幽暗长裤 (Lv.15)</span></div>
              <div class="gear-slot"><div class="gear-icon blue"><img src="${icons.book}"></div><span>战神图腾 (Lv.15)</span></div>
              <div class="gear-slot"><div class="gear-icon green"><img src="${icons.boots}"></div><span>幽暗战靴 (Lv.15)</span></div>
              <div class="gear-slot"><div class="gear-icon blue"><img src="${icons.stone}"></div><span>元素魔石 (Lv.15)</span></div>
              <div class="gear-slot"><div class="gear-icon blue"><img src="${icons.souvenir}"></div><span>疾风徽章</span></div>
              <div class="gear-slot"><div class="gear-icon purple"><img src="${icons.earring}"></div><span>聚能耳环 +10</span></div>
            </div>
            <div style="margin-top:8px">
              <div class="gear-slot" style="border-color:#ff4081;box-shadow:0 0 10px rgba(255,64,129,0.5)">
                <div class="gear-icon purple" style="border-color:#ff4081"><img src="${icons.weapon}"></div>
                <span style="color:#ff80ab;font-weight:bold">狂暴残虐双刀 +10</span>
              </div>
            </div>
          </div>

          <div style="flex:1;padding:12px;display:flex;flex-direction:column">
            <div style="display:flex;justify-content:space-between;margin-bottom:8px">
              <span style="font-weight:bold;color:#ffca28">背包物品 (20/20 格 · 已满)</span>
              <button class="btn-action" style="padding:2px 8px">+20 格扩容 (2000 金币)</button>
            </div>
            <div style="position:relative">
              <div class="bag-grid">
                <div class="bag-cell text-purple" style="border-color:#ab47bc"><img src="${icons.chest}"></div>
                <div class="bag-cell text-green" style="border-color:#66bb6a"><img src="${icons.weapon}"></div>
                <div class="bag-cell text-blue" style="border-color:#42a5f5"><img src="${icons.mp}"><span style="position:absolute;bottom:2px;right:3px;font-size:9px;color:#00e5ff">x20</span></div>
                <div class="bag-cell text-red" style="border-color:#ff5252"><img src="${icons.hp}"><span style="position:absolute;bottom:2px;right:3px;font-size:9px;color:#ff5252">x20</span></div>
                <div class="bag-cell text-gold" style="border-color:#ffca28"><img src="${icons.adamantite}"><span style="position:absolute;bottom:2px;right:3px;font-size:9px;color:#fbc02d">x15</span></div>
                <div class="bag-cell text-dim"><img src="${icons.adamantite}"><span style="position:absolute;bottom:2px;right:3px;font-size:9px;color:#8fa2af">x5</span></div>
                <div class="bag-cell text-dim"><img src="${icons.belt}"><span style="position:absolute;bottom:2px;right:3px;font-size:9px;color:#8fa2af">x10</span></div>
                <div class="bag-cell text-purple" style="border-color:#ab47bc"><img src="${icons.ring}"><span style="position:absolute;top:2px;left:2px;font-size:8px;color:#ffca28">[已绑]</span></div>
                <div class="bag-cell text-blue" style="border-color:#42a5f5"><img src="${icons.boots}"></div>
                <div class="bag-cell text-green" style="border-color:#66bb6a"><img src="${icons.pants}"></div>
                <div class="bag-cell text-cyan" style="border-color:#00e5ff"><img src="${icons.souvenir}"><span style="position:absolute;bottom:2px;right:3px;font-size:9px;color:#00e5ff">x5</span></div>
                <div class="bag-cell text-blue"><img src="${icons.earring}"><span style="position:absolute;bottom:2px;right:3px;font-size:9px;color:#8fa2af">x6</span></div>
                <div class="bag-cell text-blue"><img src="${icons.stone}"><span style="position:absolute;bottom:2px;right:3px;font-size:9px;color:#8fa2af">x3</span></div>
                <div class="bag-cell text-blue"><img src="${icons.book}"><span style="position:absolute;bottom:2px;right:3px;font-size:9px;color:#8fa2af">x4</span></div>
                <div class="bag-cell text-purple"><img src="${icons.necklace}"></div>
                <div class="bag-cell text-dim">(空)</div>
                <div class="bag-cell text-dim">(空)</div>
                <div class="bag-cell text-dim">(空)</div>
                <div class="bag-cell text-dim">(空)</div>
                <div class="bag-cell text-dim">(空)</div>
              </div>

              <!-- 背包选中未绑定装备浮层 (展示装备绑定规则) -->
              <div style="position:absolute;top:10px;right:10px;width:170px;background:#10181edd;border:1px solid #ab47bc;border-radius:4px;padding:8px;font-size:11px;line-height:1.4;box-shadow:0 8px 20px rgba(0,0,0,0.8)">
                <div class="text-purple" style="font-weight:bold">幽暗轻甲</div>
                <div class="text-dim">稀有 · 胸甲 (防具)</div>
                <hr style="border:none;border-top:1px solid #344654;margin:4px 0">
                <div>需求等级: Lv.15</div>
                <div class="text-gold">装备绑定</div>
                <div class="text-dim" style="font-size:10px">(穿戴时提示绑定角色)</div>
                <div>耐久: 100/100</div>
              </div>
            </div>

            <div style="margin-top:auto;padding-top:8px;border-top:1px solid #2b3a46;font-size:12px">
              <span class="text-dim">消耗品快捷位 (长按拖拽绑定):</span>
              <span style="margin-left:8px;padding:3px 6px;background:#10181e;border:1px solid #ffca28;border-radius:3px">[格1: 初级生命药]</span>
              <span style="margin-left:4px;padding:3px 6px;background:#10181e;border:1px solid #42a5f5;border-radius:3px">[格2: 初级法力药]</span>
              <span style="margin-left:4px;padding:3px 6px;background:#10181e;border:1px dashed #5b7c8e;border-radius:3px">[格3: 空]</span>
            </div>
          </div>
        </div>

        <div class="modal-footer">
          <span class="text-dim">温馨提示：未绑定装备在穿戴前将提示确认并绑定角色；背包已满时换装原格互换。</span>
          <button class="btn-action">整理背包</button>
        </div>
      </div>
    `)
  },
  {
    filename: '04-blacksmith-repair-ui.png',
    title: '铁匠林纳克斯·装备修理',
    html: wrapHTML('铁匠林纳克斯·装备修理', `
      <div class="modal-frame">
        <div class="modal-header">
          <span>铁匠铺 · 装备修理 (林纳克斯)</span>
          <span>持有金币: 1,250</span>
        </div>
        <div class="modal-body">
          <div style="flex:1;padding:16px;border-right:1px solid #2b3a46">
            <div style="font-weight:bold;color:#ffca28;font-size:14px;margin-bottom:12px">【当前选中装备修理】</div>
            <div style="background:#10181e;border:1px solid #344654;padding:12px;border-radius:4px;margin-bottom:16px">
              <div class="text-purple" style="font-size:14px;font-weight:bold">狂暴残虐双刀 +10</div>
              <div class="text-gold" style="margin-top:6px">当前耐久: 85 / 100</div>
              <div>单点修理费: 2 金币 / 点</div>
              <div>缺失耐久: 15 点 | 单件修理总价: <span class="text-gold">30 金币</span></div>
            </div>
            <button class="btn-action" style="width:100%;padding:10px">修复当前装备 (30 金币)</button>
            <hr style="border:none;border-top:1px solid #2b3a46;margin:16px 0">
            <div style="font-weight:bold;color:#ffca28;font-size:14px;margin-bottom:8px">【当前穿戴一键全修】</div>
            <div class="text-dim" style="font-size:12px;margin-bottom:8px">磨损装备: 3 件 | 所需总修理费: 256 金币</div>
            <button class="btn-green" style="width:100%;padding:10px">当前穿戴一键全修 (256 金币)</button>
          </div>
          <div style="width:400px;padding:16px;overflow-y:auto">
            <div style="display:flex;gap:8px;margin-bottom:12px">
              <button class="tab-btn active" style="flex:1;padding:6px;font-size:12px">● 当前穿戴 (7件)</button>
              <button class="tab-btn" style="flex:1;padding:6px;font-size:12px">○ 背包磨损 (2件)</button>
            </div>
            <div style="font-weight:bold;color:#ffca28;margin-bottom:8px">当前穿戴耐久概览:</div>
            <div style="display:flex;flex-direction:column;gap:6px;font-size:12px">
              <div class="gear-slot">
                <div class="gear-icon purple" style="width:28px;height:28px"><img src="${icons.weapon}" style="width:24px;height:24px"></div>
                <span>狂暴残虐双刀 +10</span>
                <span class="text-green" style="margin-left:auto;font-weight:bold">85/100</span>
              </div>
              <div class="gear-slot">
                <div class="gear-icon purple" style="width:28px;height:28px"><img src="${icons.chest}" style="width:24px;height:24px"></div>
                <span>幽暗轻甲</span>
                <span class="text-green" style="margin-left:auto;font-weight:bold">90/100</span>
              </div>
              <div class="gear-slot">
                <div class="gear-icon purple" style="width:28px;height:28px"><img src="${icons.pants}" style="width:24px;height:24px"></div>
                <span>幽暗长裤</span>
                <strong class="text-red" style="margin-left:auto">0/80</strong>
              </div>
              <div class="gear-slot">
                <div class="gear-icon green" style="width:28px;height:28px"><img src="${icons.shoulders}" style="width:24px;height:24px"></div>
                <span>幽暗护肩</span>
                <span class="text-green" style="margin-left:auto;font-weight:bold">80/80</span>
              </div>
              <div class="gear-slot">
                <div class="gear-icon blue" style="width:28px;height:28px"><img src="${icons.belt}" style="width:24px;height:24px"></div>
                <span>兽皮腰带</span>
                <span class="text-green" style="margin-left:auto;font-weight:bold">75/80</span>
              </div>
              <div class="gear-slot">
                <div class="gear-icon green" style="width:28px;height:28px"><img src="${icons.boots}" style="width:24px;height:24px"></div>
                <span>幽暗战靴</span>
                <strong class="text-gold" style="margin-left:auto">28/70</strong>
              </div>
              <div class="gear-slot">
                <div class="gear-icon purple" style="width:28px;height:28px"><img src="${icons.earring}" style="width:24px;height:24px"></div>
                <span>聚能耳环 +10</span>
                <span class="text-green" style="margin-left:auto;font-weight:bold">50/50</span>
              </div>
            </div>
            <div class="text-dim" style="font-size:11px;margin-top:12px">提示：可切换至【背包磨损】单独修理单件；【当前穿戴一键全修】仅修当前穿戴装备，绝不连带修理背包磨损。</div>
          </div>
        </div>

        <div class="modal-footer">
          <span class="text-dim">温馨提示：装备耐久降为 0 后属性与套装效果将完全失效，请及时修理。</span>
          <button class="btn-action">关闭</button>
        </div>
      </div>
    `)
  },
  {
    filename: '05-blacksmith-enhancement-ui.png',
    title: '铁匠玛丽·装备强化',
    html: wrapHTML('铁匠玛丽·装备强化', `
      <div class="modal-frame">
        <div class="modal-header">
          <span>玛丽工坊 · 装备强化</span>
          <span>持有金币: 35,000 | 精金: 25</span>
        </div>
        <div class="modal-body" style="padding:16px;display:flex;gap:16px">
          <div style="flex:1;background:#10181e;border:1px solid #344654;border-radius:6px;padding:16px;display:flex;flex-direction:column;align-items:center">
            <div style="display:flex;align-items:center;gap:12px;margin:8px 0 12px">
              <div class="gear-icon purple" style="width:48px;height:48px;border-color:#ff4081;box-shadow:0 0 14px rgba(255,64,129,0.8)"><img src="${icons.weapon}" style="width:38px;height:38px"></div>
              <div style="font-size:22px;font-weight:bold;color:#ffca28">🔥 玛丽强化祭坛 🔥</div>
            </div>
            <div style="display:inline-block;padding:8px 18px;border:2px solid #ff4081;box-shadow:0 0 16px rgba(255,64,129,0.7);background:rgba(255,64,129,0.08);border-radius:6px;margin-bottom:12px;text-align:center">
              <span class="text-purple" style="font-size:15px;font-weight:bold">狂暴残虐双刀 +10</span>
              <span style="color:#ff4081;font-weight:bold;margin:0 8px">===></span>
              <span style="color:#ff4081;font-size:15px;font-weight:bold;text-shadow:0 0 8px #ff4081">狂暴残虐双刀 +11</span>
              <div style="font-size:11px;color:#ff80ab;margin-top:4px">✨ 突破+10质变，凝聚专属耀眼粉光特效</div>
            </div>
            <div class="text-gold" style="margin:6px 0;font-size:13px">属性变化: 基础攻击力 80 (+24) ===> 80 (+32)</div>
            <div style="display:flex;align-items:center;gap:16px;margin:8px 0 12px;font-size:12px">
              <div style="display:flex;align-items:center;gap:6px">
                <img src="${icons.adamantite}" style="width:22px;height:22px">
                <span>消耗精金: <strong class="text-gold">10</strong> (拥有: 25)</span>
              </div>
              <div style="display:flex;align-items:center;gap:6px">
                <span style="font-size:14px">🪙</span>
                <span>消耗金币: <strong class="text-gold">20,000</strong></span>
              </div>
            </div>
            <div style="background:#22323e;padding:8px 14px;border-radius:4px;font-size:12px;margin-bottom:14px;display:flex;align-items:center;gap:8px">
              <input type="checkbox" id="souvenir-chk" checked>
              <img src="${icons.souvenir}" style="width:22px;height:22px">
              <label for="souvenir-chk">放入【强化纪念品】提高本次成功率 (拥有: 12个，本次消耗: 5个)</label>
            </div>
            <div class="text-dim" style="font-size:11px;margin-bottom:16px;text-align:center">
              提示：武器强化阶梯特效（+1~10蓝光、+10~13粉光、+13~15橙光、+15~20紫光）；+10以内失败不掉级，+11/+12失败退回+10，+13及以上失败损毁返还纪念品。
            </div>
            <button class="btn-action" style="padding:10px 28px;font-size:14px;background:#d84315;border-color:#ff7043">开始强化</button>
          </div>
        </div>

        <div class="modal-footer">
          <span class="text-dim">温馨提示：武器与耳环可进行强化；强化等级越高，提供的攻击强度越显著。</span>
          <button class="btn-action">离开</button>
        </div>
      </div>
    `)
  },
  {
    filename: '06-merchant-shop-ui.png',
    title: '微风杂货铺·商人买卖',
    html: wrapHTML('微风杂货铺·商人买卖', `
      <div class="modal-frame">
        <div class="modal-header">
          <span>微风杂货铺 · 常驻买卖</span>
          <span>持有金币: 1,250</span>
        </div>
        <div class="modal-body" style="padding:16px;display:flex;gap:16px">
          <div style="flex:1;background:#10181e;border:1px solid #344654;padding:12px;border-radius:4px">
            <div style="font-weight:bold;color:#ffca28;margin-bottom:8px">【商人常驻商品】</div>
            <div style="display:flex;flex-direction:column;gap:6px;font-size:12px">
              <div style="display:flex;justify-content:space-between;align-items:center;padding:6px 8px;background:#19252e;border-radius:4px">
                <div style="display:flex;align-items:center;gap:8px">
                  <div class="gear-icon" style="width:28px;height:28px;border:1px solid #ef5350"><img src="${icons.hp}" style="width:22px;height:22px"></div>
                  <span>初级生命药水 · 单价: 50 金币</span>
                </div>
                <button class="btn-action">购买 x1</button>
              </div>
              <div style="display:flex;justify-content:space-between;align-items:center;padding:6px 8px;background:#19252e;border-radius:4px">
                <div style="display:flex;align-items:center;gap:8px">
                  <div class="gear-icon" style="width:28px;height:28px;border:1px solid #42a5f5"><img src="${icons.mp}" style="width:22px;height:22px"></div>
                  <span>初级法力药水 · 单价: 40 金币</span>
                </div>
                <button class="btn-action">购买 x1</button>
              </div>
              <div style="display:flex;justify-content:space-between;align-items:center;padding:6px 8px;background:#19252e;border-radius:4px">
                <div style="display:flex;align-items:center;gap:8px">
                  <div class="gear-icon" style="width:28px;height:28px;border:1px solid #8fa2af"><img src="${icons.weapon}" style="width:22px;height:22px"></div>
                  <span>白铁双刀 (Lv.1) · 单价: 100 金币</span>
                </div>
                <button class="btn-action">购买</button>
              </div>
            </div>
          </div>

          <div style="flex:1;background:#10181e;border:1px solid #344654;padding:12px;border-radius:4px;display:flex;flex-direction:column">
            <div style="font-weight:bold;color:#ffca28;margin-bottom:8px">【物品出售回收】</div>
            <div style="background:#19252e;padding:10px;border-radius:4px;font-size:12px;margin-bottom:12px">
              <div class="text-dim">已选中物品: <span style="color:#fff">粗糙铁矿 x5</span></div>
              <div style="margin-top:4px">收购单价: 5 金币</div>
              <div style="margin-top:4px">出售可得: <span class="text-gold">25 金币</span></div>
              <div style="margin-top:8px">
                <button class="btn-action" style="background:#c62828;border-color:#ef5350">确认出售 (25 金币)</button>
              </div>
            </div>
            <div class="text-dim" style="font-size:11px;line-height:1.6;margin-top:auto">
              · 点选右侧背包中未穿戴的物品即可放入出售区。<br>
              · 装备回收价格由品级与装等决定，强化与词条不增加售价。<br>
              · 物品出售后直接回收，不提供历史购回，请确认后再行出售。
            </div>
          </div>
        </div>

        <div class="modal-footer">
          <span class="text-dim">温馨提示：穿戴中的装备无法直接出售，若需出售请先在背包中卸下。</span>
          <button class="btn-action">离开</button>
        </div>
      </div>
    `)
  },
  {
    filename: '07-bank-vault-ui.png',
    title: '王国储蓄银行金库',
    html: wrapHTML('王国储蓄银行金库', `
      <div class="modal-frame">
        <div class="modal-header">
          <span>王国储蓄银行 · 金库服务</span>
          <span>金库与背包 (双 5 列网格联动)</span>
        </div>
        <div class="modal-body" style="padding:16px;position:relative">
          <div style="display:flex;gap:16px;width:100%">
            <!-- 左侧：金库 -->
            <div style="flex:1;border-right:1px solid #2b3a46;padding-right:16px">
              <div class="tab-bar" style="margin-bottom:10px">
                <button class="tab-btn active" style="font-size:11px;padding:4px 8px">● 个人金库 (独立)</button>
                <button class="tab-btn" style="font-size:11px;padding:4px 8px">○ 账号金库 (共享)</button>
              </div>
              <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
                <span class="text-gold" style="font-size:12px;font-weight:bold">金库容量: 20/20 格</span>
                <button class="btn-action" style="padding:2px 8px;font-size:11px">+20 格扩容</button>
              </div>
              <div style="display:grid;grid-template-columns:repeat(5, 52px);gap:6px">
                <div class="bag-cell text-purple"><img src="${icons.souvenir}"></div>
                <div class="bag-cell text-gold"><img src="${icons.stone}"></div>
                <div class="bag-cell text-blue"><img src="${icons.stone}"><span style="position:absolute;bottom:2px;right:3px;font-size:9px;color:#8fa2af">x10</span></div>
                <div class="bag-cell text-dim"><img src="${icons.adamantite}"><span style="position:absolute;bottom:2px;right:3px;font-size:9px;color:#8fa2af">x50</span></div>
                <div class="bag-cell text-gold"><img src="${icons.adamantite}"><span style="position:absolute;bottom:2px;right:3px;font-size:9px;color:#fbc02d">x25</span></div>
                <div class="bag-cell text-dim">(空)</div>
                <div class="bag-cell text-dim">(空)</div>
                <div class="bag-cell text-dim">(空)</div>
                <div class="bag-cell text-dim">(空)</div>
                <div class="bag-cell text-dim">(空)</div>
                <div class="bag-cell text-dim" style="color:#546e7a">[锁]</div>
                <div class="bag-cell text-dim" style="color:#546e7a">[锁]</div>
                <div class="bag-cell text-dim" style="color:#546e7a">[锁]</div>
                <div class="bag-cell text-dim" style="color:#546e7a">[锁]</div>
                <div class="bag-cell text-dim" style="color:#546e7a">[锁]</div>
                <div class="bag-cell text-dim" style="color:#546e7a">[锁]</div>
                <div class="bag-cell text-dim" style="color:#546e7a">[锁]</div>
                <div class="bag-cell text-dim" style="color:#546e7a">[锁]</div>
                <div class="bag-cell text-dim" style="color:#546e7a">[锁]</div>
                <div class="bag-cell text-dim" style="color:#546e7a">[锁]</div>
              </div>
              <div style="margin-top:10px">
                <button class="btn-action" style="padding:4px 10px;font-size:11px">整理金库</button>
              </div>
            </div>

            <!-- 右侧：角色背包 -->
            <div style="flex:1">
              <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;height:26px">
                <span class="text-gold" style="font-size:12px;font-weight:bold">角色背包 (15/20 格)</span>
                <span class="text-dim" style="font-size:11px">持有金币: 35,000</span>
              </div>
              <div style="display:grid;grid-template-columns:repeat(5, 52px);gap:6px">
                <div class="bag-cell text-purple"><img src="${icons.chest}"></div>
                <div class="bag-cell text-green"><img src="${icons.weapon}"></div>
                <div class="bag-cell text-blue"><img src="${icons.mp}"><span style="position:absolute;bottom:2px;right:3px;font-size:9px;color:#00e5ff">x20</span></div>
                <div class="bag-cell text-red"><img src="${icons.hp}"><span style="position:absolute;bottom:2px;right:3px;font-size:9px;color:#ff5252">x20</span></div>
                <div class="bag-cell text-gold" style="border-color:#ffca28;box-shadow:0 0 6px #ffca28"><img src="${icons.adamantite}"><span style="position:absolute;bottom:2px;right:3px;font-size:9px;color:#fbc02d">x15</span></div>
                <div class="bag-cell text-dim"><img src="${icons.adamantite}"><span style="position:absolute;bottom:2px;right:3px;font-size:9px;color:#8fa2af">x5</span></div>
                <div class="bag-cell text-dim"><img src="${icons.belt}"><span style="position:absolute;bottom:2px;right:3px;font-size:9px;color:#8fa2af">x10</span></div>
                <div class="bag-cell text-purple"><img src="${icons.ring}"></div>
                <div class="bag-cell text-blue"><img src="${icons.boots}"></div>
                <div class="bag-cell text-green"><img src="${icons.pants}"></div>
                <div class="bag-cell text-cyan"><img src="${icons.souvenir}"><span style="position:absolute;bottom:2px;right:3px;font-size:9px;color:#00e5ff">x5</span></div>
                <div class="bag-cell text-blue"><img src="${icons.earring}"><span style="position:absolute;bottom:2px;right:3px;font-size:9px;color:#8fa2af">x6</span></div>
                <div class="bag-cell text-blue"><img src="${icons.stone}"><span style="position:absolute;bottom:2px;right:3px;font-size:9px;color:#8fa2af">x3</span></div>
                <div class="bag-cell text-dim">(空)</div>
                <div class="bag-cell text-dim">(空)</div>
                <div class="bag-cell text-dim">(空)</div>
                <div class="bag-cell text-dim">(空)</div>
                <div class="bag-cell text-dim">(空)</div>
                <div class="bag-cell text-dim">(空)</div>
                <div class="bag-cell text-dim">(空)</div>
              </div>
              <div style="margin-top:10px;display:flex;gap:8px">
                <button class="btn-action" style="padding:4px 10px;font-size:11px">存入选中项</button>
                <button class="btn-action" style="padding:4px 10px;font-size:11px">取出选中项</button>
              </div>
            </div>
          </div>

          <!-- 数量转移悬浮窗 (演示堆叠道具存入金库) -->
          <div style="position:absolute;top:50%;left:50%;transform:translate(-50%, -50%);background:#16232c;border:2px solid #ffca28;border-radius:6px;padding:12px 18px;box-shadow:0 8px 30px rgba(0,0,0,0.85);z-index:20;width:250px;text-align:center">
            <div style="font-weight:bold;color:#ffca28;font-size:12px;margin-bottom:6px">转移物品数量</div>
            <div style="font-size:11px;color:#e2ebef;margin-bottom:8px">精金 (背包: 15 / 默认整叠)</div>
            <div style="display:flex;justify-content:center;align-items:center;gap:6px;margin-bottom:10px">
              <button class="btn-action" style="padding:2px 8px">-</button>
              <div style="width:48px;text-align:center;background:#0d1419;border:1px solid #344654;color:#ffca28;font-weight:bold;padding:3px;border-radius:3px;font-size:12px">15</div>
              <button class="btn-action" style="padding:2px 8px">+</button>
              <button class="btn-action" style="padding:2px 6px;font-size:10px">最大</button>
            </div>
            <div style="display:flex;gap:8px;justify-content:center">
              <button class="btn-green" style="padding:4px 12px;font-size:11px">确认存入</button>
              <button class="btn-action" style="padding:4px 12px;font-size:11px">取消</button>
            </div>
          </div>
        </div>

        <div class="modal-footer">
          <span class="text-dim">温馨提示：账号金库严禁存入【角色绑定】道具；支持拖拽与数量弹窗转移。</span>
          <button class="btn-action">离开金库</button>
        </div>
      </div>
    `)
  },
  {
    filename: '08-mailbox-and-pending-rewards.png',
    title: '信件与奖励收发所',
    html: wrapHTML('信件与奖励收发所', `
      <div class="modal-frame">
        <div class="modal-header">
          <span>信件与奖励收发所 (旅店门口)</span>
          <span>角色背包: 18/20</span>
        </div>
        <div class="modal-body" style="padding:16px;flex-direction:column">
          <div class="tab-bar" style="margin-bottom:12px">
            <button class="tab-btn active">● 系统信箱</button>
            <button class="tab-btn">○ 通关待领</button>
          </div>
          <div style="display:flex;flex-direction:column;gap:8px">
            <div style="background:#10181e;border:1px solid #344654;padding:12px;border-radius:4px;display:flex;justify-content:space-between;align-items:center">
              <div>
                <div class="text-gold" style="font-weight:bold">[系统信件] 新手冒险家启程补给</div>
                <div class="text-dim" style="font-size:11px;margin-top:3px">附件: 初级生命药水 x8, 初级法力药水 x8, 复活纹章 x10 (剩余时间: 29天)</div>
              </div>
              <div style="display:flex;gap:6px">
                <button class="btn-green">领取附件</button>
                <button class="btn-action" style="opacity:0.4">删除</button>
              </div>
            </div>

            <div style="background:#10181e;border:1px solid #344654;padding:12px;border-radius:4px;display:flex;justify-content:space-between;align-items:center">
              <div>
                <div class="text-gold" style="font-weight:bold">[副本奖励] 幽暗密林通关奖励</div>
                <div class="text-dim" style="font-size:11px;margin-top:3px">附件: 精炼双刀 (已绑定) (永久安全保存)</div>
              </div>
              <button class="btn-green">提取至背包</button>
            </div>
          </div>
        </div>

        <div class="modal-footer">
          <span class="text-dim">温馨提示：背包空间不足时将尽可能领取可容纳的附件；包含附件的邮件无法手动删除。</span>
          <button class="btn-action">一键领取</button>
        </div>
      </div>
    `)
  },
  {
    filename: '09-leaderboard-inspect-mode.png',
    title: '全服冒险家战力排行榜',
    html: wrapHTML('全服冒险家战力排行榜', `
      <div class="modal-frame">
        <div class="modal-header">
          <span>全服冒险家战力评分榜</span>
          <span>我的排名: 第 1 名 (评分: 1,845)</span>
        </div>
        <div class="modal-body" style="padding:16px;flex-direction:column">
          <table style="width:100%;font-size:12px;border-collapse:collapse">
            <thead>
              <tr style="color:#ffca28;text-align:left;border-bottom:1px solid #344654">
                <th style="padding:8px">排名</th><th>角色名</th><th>职业</th><th>装备评分</th><th>达成时间</th>
              </tr>
            </thead>
            <tbody>
              <tr style="border-bottom:1px solid #22323e">
                <td style="padding:8px" class="text-gold">1</td><td class="text-purple" style="font-weight:bold">狂暴先驱</td><td>双刀战士</td><td>1,845</td><td>2026-10-19 14:20:11</td>
              </tr>
              <tr style="border-bottom:1px solid #22323e">
                <td style="padding:8px">2</td><td>疾风暴雨</td><td>双刀战士</td><td>1,845</td><td>2026-10-19 16:05:40</td>
              </tr>
              <tr style="border-bottom:1px solid #22323e">
                <td style="padding:8px">3</td><td>追风游侠</td><td>弓箭猎人</td><td>1,720</td><td>2026-10-18 20:11:05</td>
              </tr>
              <tr style="border-bottom:1px solid #22323e">
                <td style="padding:8px">4</td><td>暗影猎手</td><td>弓箭猎人</td><td>1,650</td><td>2026-10-19 09:30:00</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div class="modal-footer">
          <span class="text-dim">温馨提示：点击榜单中的玩家可查看其装备配置与属性面板；相同评分按达成时间先后排序。</span>
          <button class="btn-action">刷新排行</button>
        </div>
      </div>
    `)
  },
  {
    filename: '10-town-safety-hud.png',
    title: '城镇安全区常驻 HUD',
    html: wrapHTML('城镇安全区常驻 HUD', `
      <div style="width:100%;height:100%;position:relative;padding:14px">
        <div style="display:flex;align-items:center;gap:10px">
          <div style="width:48px;height:48px;background:#2b4557;border:2px solid #ffca28;border-radius:4px;display:flex;align-items:center;justify-content:center;font-size:24px">👤</div>
          <div>
            <div class="text-gold" style="font-weight:bold;font-size:14px">Lv.15 狂暴先驱 [双刀战士]</div>
            <div style="width:170px;height:8px;background:#3e1b1b;margin-top:3px;border-radius:2px"><div style="width:100%;height:100%;background:#e54b4b"></div></div>
            <div style="width:170px;height:6px;background:#132636;margin-top:2px;border-radius:2px"><div style="width:100%;height:100%;background:#2b82c9"></div></div>
          </div>
        </div>

        <div style="position:absolute;top:14px;right:20px;display:flex;gap:14px;font-size:12px;align-items:center">
          <span class="text-gold">金币: 1,250</span>
          <span class="text-cyan">点券: 0</span>
          <span style="background:#19252e;padding:3px 8px;border:1px solid #344654;border-radius:3px">信箱 [红点]</span>
          <span style="background:#19252e;padding:3px 8px;border:1px solid #344654;border-radius:3px">待领 [红点]</span>
        </div>

        <!-- 城镇中央 2.5D 站街角色展示 (手持 +10 武器呼吸光晕与粒子) -->
        <div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-42%);display:flex;flex-direction:column;align-items:center">
          <div style="background:rgba(16,24,30,0.85);border:1px solid #ff4081;padding:2px 10px;border-radius:12px;font-size:11px;margin-bottom:8px;box-shadow:0 0 10px rgba(255,64,129,0.4)">
            <span class="text-gold" style="font-weight:bold">狂暴先驱</span> <span style="color:#ff80ab">(【站街形态】· +10 双刀腰间收鞘呼吸光芒中)</span>
          </div>
          <div style="position:relative;width:140px;height:170px;display:flex;align-items:center;justify-content:center">
            <img src="${stanceTownBase64}" style="width:100%;height:100%;object-fit:contain;image-rendering:pixelated;filter:drop-shadow(0 0 12px rgba(255,64,129,0.55));z-index:2">
            <div class="blade-glow-pink" style="position:absolute;bottom:4px;width:90px;height:16px;background:radial-gradient(ellipse at center, rgba(255,64,129,0.6) 0%, rgba(255,64,129,0) 70%);border-radius:50%"></div>
          </div>
          <div style="background:rgba(20,31,39,0.85);border:1px solid #344654;padding:4px 12px;border-radius:4px;font-size:11px;color:#8fa2af;margin-top:6px">
            ✨ 站街形态 (Town Stance)：站姿挺拔从容，双刀收鞘入胯/背负，武器以 1.4s 周期一闪一闪温和呼吸闪烁，同屏玩家皆可清晰可见
          </div>
        </div>

        <div style="position:absolute;bottom:24px;left:24px;width:100px;height:100px;border:2px dashed #344654;border-radius:50px;display:flex;align-items:center;justify-content:center">
          <div style="width:40px;height:40px;background:#2b4557;border-radius:20px"></div>
        </div>

        <div style="position:absolute;bottom:24px;right:24px;display:flex;flex-direction:column;gap:8px">
          <button class="btn-action" style="padding:8px 18px">背包 (B)</button>
          <button class="btn-action" style="padding:8px 18px;border-color:#ffca28;color:#ffca28">角色 (C)</button>
          <button class="btn-action" style="padding:8px 18px">全服排行</button>
        </div>
      </div>
    `)
  },
  {
    filename: '11-dungeon-combat-hud.png',
    title: '副本战斗态 HUD',
    html: wrapHTML('副本战斗态 HUD', `
      <div style="width:100%;height:100%;position:relative;padding:14px">
        <div style="position:absolute;top:14px;left:50%;transform:translateX(-50%);display:flex;align-items:center;gap:12px">
          <div style="border:1px solid #e53935;background:#2b1b1b;padding:6px 14px;border-radius:4px;font-size:13px">
            <strong class="text-gold">Boss: 蛮荒牛头巨兽</strong> <span style="margin-left:8px">HP: 80 / 80</span>
          </div>
          <button class="btn-action">退出副本</button>
        </div>

        <div style="display:flex;align-items:center;gap:8px">
          <div style="width:40px;height:40px;background:#2b4557;border:1px solid #ffca28;border-radius:4px;display:flex;align-items:center;justify-content:center">👤</div>
          <div>
            <div class="text-gold" style="font-weight:bold;font-size:12px">Lv.15 狂暴先驱 (双刀战士)</div>
            <div style="width:140px;height:6px;background:#3e1b1b;margin-top:2px;border-radius:2px"><div style="width:85%;height:100%;background:#e54b4b"></div></div>
            <div style="width:140px;height:4px;background:#132636;margin-top:2px;border-radius:2px"><div style="width:70%;height:100%;background:#2b82c9"></div></div>
          </div>
        </div>

        <!-- 副本中央战士战斗姿态与挥砍刀光展示 -->
        <div style="position:absolute;top:48%;left:45%;transform:translate(-50%,-45%);display:flex;flex-direction:column;align-items:center">
          <div style="background:rgba(16,24,30,0.85);border:1px solid #ff4081;padding:2px 10px;border-radius:12px;font-size:11px;margin-bottom:8px;box-shadow:0 0 10px rgba(255,64,129,0.4)">
            <span class="text-gold" style="font-weight:bold">狂暴先驱</span> <span style="color:#ff80ab">(【战斗状态】· 双刀出鞘持刃戒备)</span>
          </div>
          <div style="position:relative;width:170px;height:150px;display:flex;align-items:center;justify-content:center">
            <img src="${stanceCombatBase64}" style="width:100%;height:100%;object-fit:contain;image-rendering:pixelated;filter:drop-shadow(0 0 18px rgba(255,64,129,0.85));z-index:2">
            <div style="position:absolute;top:6px;right:-15px;color:#ff4081;font-size:13px;font-weight:bold;text-shadow:0 0 10px #ff4081;z-index:3">CRIT! 4,280</div>
          </div>
          <div style="background:rgba(20,31,39,0.85);border:1px solid #ff4081;padding:4px 12px;border-radius:4px;font-size:11px;color:#ff80ab;margin-top:6px">
            💥 战斗状态 (Combat Stance)：压低重心，双手持刃迎敌，普攻挥砍与四大技能完全继承当前 +10 强化粉光
          </div>
        </div>

        <!-- 左下角移动虚拟摇杆 -->
        <div style="position:absolute;bottom:24px;left:24px;width:110px;height:110px;background:rgba(255,255,255,0.06);border:2px solid rgba(255,255,255,0.25);border-radius:55px;display:flex;align-items:center;justify-content:center">
          <div style="width:48px;height:48px;background:rgba(255,255,255,0.3);border:2px solid rgba(255,255,255,0.6);border-radius:24px;box-shadow:0 0 10px rgba(0,0,0,0.5)"></div>
          <span style="position:absolute;bottom:-18px;font-size:10px;color:#8fa2af">虚拟摇杆</span>
        </div>

        <!-- 药水快捷栏 (至少 48x48px 触控格) -->
        <div style="position:absolute;bottom:24px;right:270px;display:flex;gap:10px">
          <div style="width:48px;height:48px;background:#10181e;border:1px solid #ffca28;border-radius:6px;display:flex;flex-direction:column;align-items:center;justify-content:center;font-size:11px">
            <span>血药</span><span class="text-gold" style="font-weight:bold">50</span>
          </div>
          <div style="width:48px;height:48px;background:#10181e;border:1px solid #42a5f5;border-radius:6px;display:flex;flex-direction:column;align-items:center;justify-content:center;font-size:11px">
            <span>蓝药</span><span class="text-cyan" style="font-weight:bold">20</span>
          </div>
          <div style="width:48px;height:48px;background:#10181e;border:1px dashed #546e7a;border-radius:6px;display:flex;align-items:center;justify-content:center;font-size:11px;color:#546e7a">
            空
          </div>
        </div>

        <!-- 右下角技能与动作按键区 -->
        <div style="position:absolute;bottom:24px;right:24px;width:230px;height:230px">
          <!-- 独立主动饰品按键 (52px) -->
          <div style="position:absolute;top:6px;right:75px;width:52px;height:52px;background:#1a3344;border:2px solid #00e5ff;box-shadow:0 0 10px rgba(0,229,255,0.5);border-radius:26px;display:flex;flex-direction:column;align-items:center;justify-content:center;font-size:11px;font-weight:bold;color:#00e5ff;cursor:pointer">
            <span>饰品</span><span style="font-size:9px">疾风</span>
          </div>

          <!-- 普攻大按键 (84px) -->
          <div style="position:absolute;bottom:6px;right:6px;width:84px;height:84px;background:#e53935;box-shadow:0 0 16px rgba(229,57,53,0.7);border-radius:42px;display:flex;align-items:center;justify-content:center;font-size:16px;font-weight:bold;cursor:pointer;border:2px solid #ff7961">普攻 A</div>

          <!-- 四技能按键 (64~72px 触控圈) -->
          <div style="position:absolute;bottom:6px;left:10px;width:64px;height:64px;background:#243a4a;border:2px solid #42a5f5;border-radius:32px;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:bold">十字 E</div>
          <div style="position:absolute;top:85px;left:30px;width:64px;height:64px;background:#243a4a;border:2px solid #42a5f5;border-radius:32px;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:bold">崩山 F</div>
          <div style="position:absolute;top:20px;left:95px;width:64px;height:64px;background:#243a4a;border:2px solid #42a5f5;border-radius:32px;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:bold">拔刀 Q</div>
          <div style="position:absolute;bottom:90px;right:85px;width:66px;height:66px;background:#bf360c;border:2px solid #ff7043;box-shadow:0 0 12px rgba(255,112,67,0.6);border-radius:33px;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:bold">大崩 G</div>
        </div>
      </div>
    `)
  },
  {
    filename: '12-dungeon-difficulty-portal.png',
    title: '副本难度选择界面',
    html: wrapHTML('副本难度选择界面', `
      <div class="modal-frame">
        <div class="modal-header">
          <span>选择挑战难度: 幽暗密林 (区间 Lv.1 ~ Lv.15)</span>
          <button class="btn-action">X 关闭</button>
        </div>
        <div class="modal-body" style="padding:16px;gap:16px">
          <div style="flex:1;border:1px solid #344654;background:#10181e;padding:12px;border-radius:4px;display:flex;flex-direction:column">
            <div style="height:180px;border:1px dashed #546e7a;display:flex;align-items:center;justify-content:center;color:#546e7a;font-size:13px;margin-bottom:12px">
              [ 幽暗密林原画概念区 380×200 ]
            </div>
            <div style="font-size:12px;color:#cfd8dc;line-height:1.6">
              幽暗密林深处潜藏着狂暴的兽人与魔化野猪，林地尽头的牛头巨兽正在肆虐。
            </div>
            <div style="margin-top:auto;font-size:12px;color:#8fa2af;line-height:1.7">
              <div>- 掉落倾向: 优秀装备、基础锻造材料</div>
              <div>- 首通奖励: 稀有饰品、金币礼包</div>
            </div>
          </div>

          <div style="flex:1;display:flex;flex-direction:column;gap:8px">
            <div style="font-weight:bold;color:#ffca28;font-size:13px;margin-bottom:4px">请选择难度 (账号共享解锁进度):</div>
            <div style="border:2px solid #ffca28;background:#1a2730;padding:10px 14px;border-radius:4px;display:flex;justify-content:space-between;align-items:center">
              <div>
                <div style="font-weight:bold;color:#fff">● 普通</div>
                <div class="text-dim" style="font-size:11px">推荐等级: Lv.10+</div>
              </div>
              <span class="text-green" style="font-size:12px">已解锁</span>
            </div>

            <div style="border:1px solid #344654;background:#141f27;padding:10px 14px;border-radius:4px;display:flex;justify-content:space-between;align-items:center">
              <div>
                <div style="font-weight:bold;color:#b0bec5">○ 冒险</div>
                <div class="text-dim" style="font-size:11px">推荐等级: Lv.15+</div>
              </div>
              <span class="text-green" style="font-size:12px">已解锁</span>
            </div>

            <div style="border:1px solid #22323e;background:#0d1419;padding:10px 14px;border-radius:4px;display:flex;justify-content:space-between;align-items:center;opacity:0.6">
              <div>
                <div style="font-weight:bold;color:#78909c">○ 勇士</div>
                <div class="text-dim" style="font-size:11px">推荐等级: Lv.20+</div>
              </div>
              <span class="text-red" style="font-size:12px">未解锁</span>
            </div>

            <div style="border:1px solid #22323e;background:#0d1419;padding:10px 14px;border-radius:4px;display:flex;justify-content:space-between;align-items:center;opacity:0.6">
              <div>
                <div style="font-weight:bold;color:#78909c">○ 王者</div>
                <div class="text-dim" style="font-size:11px">推荐等级: Lv.25+</div>
              </div>
              <span class="text-red" style="font-size:12px">未解锁</span>
            </div>

            <button class="btn-green" style="margin-top:auto;padding:12px;font-size:14px;font-weight:bold">进入挑战</button>
          </div>
        </div>

        <div class="modal-footer">
          <span class="text-dim">温馨提示：进入副本需穿戴完好武器；通关可获得丰厚经验与装备奖励。</span>
        </div>
      </div>
    `)
  },
  {
    filename: '14-character-stances-town-vs-combat.png',
    title: '角色双形态对比 (站街 vs 战斗)',
    html: wrapHTML('角色双形态对比 (站街 vs 战斗)', `
      <div class="modal-frame">
        <div class="modal-header">
          <span>双刀战士角色双形态对比规范 (Town Stance vs Combat Stance)</span>
          <span class="text-gold">站街从容入鞘 · 战斗出鞘瞬发 (0ms 延迟)</span>
        </div>
        <div class="modal-body" style="padding:14px;flex-direction:column;align-items:center">
          <div style="width:100%;border:1px solid #344654;border-radius:6px;overflow:hidden;background:#0d1419;box-shadow:0 4px 20px rgba(0,0,0,0.6);display:flex;justify-content:center">
            <img src="${stancesFullBase64}" style="max-width:100%;max-height:340px;object-fit:contain;display:block">
          </div>
          <div style="display:flex;gap:14px;width:100%;margin-top:10px">
            <div style="flex:1;background:#141f27;border:1px solid #344654;padding:10px;border-radius:4px">
              <div style="font-weight:bold;color:#ffca28;margin-bottom:4px;font-size:12px">【站街形态 (Town Stance)】</div>
              <div style="font-size:11px;color:#8fa2af;line-height:1.5">挺拔站姿从容展现身形，双刀收鞘入胯两侧；1.4s 舒缓周期在刀鞘处呼吸微闪，同屏玩家清晰可见。</div>
            </div>
            <div style="flex:1;background:#141f27;border:1px solid #ff4081;padding:10px;border-radius:4px">
              <div style="font-weight:bold;color:#ff4081;margin-bottom:4px;font-size:12px">【战斗状态 (Combat Stance)】</div>
              <div style="font-size:11px;color:#ff80ab;line-height:1.5">压低重心微屈膝前倾，双手持刃戒备；刀刃全域炽粉流光迸发；脱战5s自动收刀，任何攻击0ms瞬发切入！</div>
            </div>
          </div>
        </div>
      </div>
    `)
  }
];

// Step 1: Write all static HTML pages to TMP_DIR
console.log('Writing static HTML pages...');
pages.forEach(p => {
  const htmlPath = path.join(TMP_DIR, p.filename.replace('.png', '.html'));
  fs.writeFileSync(htmlPath, p.html, 'utf8');
});
console.log(`Wrote ${pages.length} HTML pages to ${TMP_DIR}`);

// Step 2: Generate PowerShell capture script
const ps1Path = path.join(__dirname, 'capture-mockups.ps1');
const ps1Lines = [
  '$edge = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe"',
  `$outDir = "${OUTPUT_DIR.replace(/\\/g, '\\\\')}"`,
  `$tmpDir = "${TMP_DIR.replace(/\\/g, '\\\\')}"`
];

pages.forEach(p => {
  const htmlFile = p.filename.replace('.png', '.html');
  const outFile = p.filename;
  ps1Lines.push(`Write-Host "Capturing ${outFile}..."`);
  ps1Lines.push(`$args = @("--headless=new", "--disable-gpu", "--virtual-time-budget=500", "--hide-scrollbars", "--window-size=960,540", "--screenshot=$outDir\\${outFile}", "file:///$tmpDir/${htmlFile}")`);
  ps1Lines.push(`Start-Process -FilePath $edge -ArgumentList $args -Wait -NoNewWindow`);
});

fs.writeFileSync(ps1Path, ps1Lines.join('\r\n'), 'utf8');
console.log('Generated capture script: ' + ps1Path);

console.log('Rendering mockups headlessly via PowerShell...');
const psResult = spawnSync('powershell.exe', ['-ExecutionPolicy', 'Bypass', '-File', ps1Path], {
  encoding: 'utf8',
  timeout: 300000
});

if (psResult.stdout) console.log(psResult.stdout);
if (psResult.stderr) console.error(psResult.stderr);

// Clean up ps1 and tmp directory
if (fs.existsSync(ps1Path)) fs.unlinkSync(ps1Path);
fs.rmSync(TMP_DIR, { recursive: true, force: true });
console.log('Cleaned up temporary HTML and script files.');
console.log('ALL MOCKUPS SUCCESSFULLY RENDERED.');
