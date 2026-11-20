(function () {
  'use strict';

  const GRID_SIZE = 9;
  const START_POS = { r: 0, c: 0 };
  const BOSS_POS = { r: 8, c: 8 };
  const DICE_PER_STAGE = 4;
  const MAX_CONTENT_PER_DIE = 3;
  const MIN_TOTAL_COMBAT_FACES = 10; // 4骰24面，战斗面>=10 => 非战斗面<=14 < 最短路径15格

  const DIRS = {
    north: { dr: -1, dc: 0, opposite: 'south' },
    east:  { dr: 0,  dc: 1, opposite: 'west'  },
    south: { dr: 1,  dc: 0, opposite: 'north' },
    west:  { dr: 0,  dc: -1, opposite: 'east' },
  };
  const DIR_ORDER = ['north', 'east', 'south', 'west'];

  // 标准骰子标号：idx 0..5 => 1..6 号面，严格 1对6、2对5、3对4
  const CUBE_SLOT_META = [
    { id: 0, num: 1, oppId: 5, oppNum: 6, pairText: '1对6' },
    { id: 1, num: 2, oppId: 4, oppNum: 5, pairText: '2对5' },
    { id: 2, num: 3, oppId: 3, oppNum: 4, pairText: '3对4' },
    { id: 3, num: 4, oppId: 2, oppNum: 3, pairText: '4对3' },
    { id: 4, num: 5, oppId: 1, oppNum: 2, pairText: '5对2' },
    { id: 5, num: 6, oppId: 0, oppNum: 1, pairText: '6对1' },
  ];

  const STAGES = [
    {
      index: 0,
      name: '碎石回廊',
      nameJa: '砕石の回廊',
      enemyScale: 1.0,
      rewardScale: 1.0,
      clearGold: 35,
      entryHeal: 0,
      boss: {
        name: '巨岩领主',
        nameJa: '巨岩の領主',
        hp: 92,
        atk: 22,
        def: 9,
        desc: '镇守回廊尽头的岩石魔像。若逃避过多战斗导致攻防不足，将无法击穿其石甲。',
        descJa: '回廊の奥に座す岩の魔像。戦闘を避けすぎて攻撃・防御が足りないと、その石甲を貫けない。',
      },
    },
    {
      index: 1,
      name: '熔火棋盘',
      nameJa: '溶炎の盤面',
      enemyScale: 1.45,
      rewardScale: 1.35,
      clearGold: 50,
      entryHeal: 35,
      boss: {
        name: '灰烬督军',
        nameJa: '灰燼の督軍',
        hp: 150,
        atk: 36,
        def: 18,
        desc: '身披熔岩重铠的深渊统帅，善用改造后的骰子规划路线方能取胜。',
        descJa: '熔岩の鎧をまとう深淵の統帥。改造したダイスで賢く道を敷く者だけが勝てる。',
      },
    },
    {
      index: 2,
      name: '星界王座',
      nameJa: '星界の玉座',
      enemyScale: 1.92,
      rewardScale: 1.7,
      clearGold: 80,
      entryHeal: 45,
      boss: {
        name: '终焉执政官',
        nameJa: '終焉の執政官',
        hp: 220,
        atk: 52,
        def: 28,
        desc: '迷宫尽头的最终裁决者。合理利用分岔规避与攻防成长完成最后一战。',
        descJa: '迷宮の果てにいる最後の裁定者。分岐回避と攻防の成長を使いこなし、最後の戦いへ。',
      },
    },
  ];

  const FACE_TEMPLATES = {
    empty_road: {
      key: 'empty_road',
      category: 'empty_road',
      name: '空地道路',
      nameJa: '空地通路',
      shortName: '空地',
      shortNameJa: '空地',
      icon: 'road_dot',
      desc: '干净安全的石板空地，无任何事件，可用于快速铺路与制造分岔。',
      descJa: '何も起きない安全な石畳。素早く道を敷いたり分岐を作ったりできます。',
    },
    combat_skirmisher: {
      key: 'combat_skirmisher',
      category: 'combat',
      name: '游荡骸骨',
      nameJa: '彷徨う骸骨',
      shortName: '骸骨战',
      shortNameJa: '骸骨戦',
      icon: 'sword',
      baseEnemy: { hp: 24, atk: 10, def: 2 },
      reward: { atk: 2, def: 1, gold: 13, hp: 0 },
      desc: '基础低损战斗。击败稳定获得 +2 ATK / +1 DEF 与魔晶。',
      descJa: '基本の低損戦闘。撃破で安定して +2 ATK / +1 DEF と魔晶を獲得。',
    },
    combat_armored: {
      key: 'combat_armored',
      category: 'combat',
      name: '重甲魔像',
      nameJa: '重甲ゴーレム',
      shortName: '重甲战',
      shortNameJa: '重甲戦',
      icon: 'shield_sword',
      baseEnemy: { hp: 26, atk: 13, def: 5 },
      reward: { atk: 1, def: 3, gold: 16, hp: 0 },
      desc: '高防怪物。提升攻击后再迎战战损更低；击败大幅提升防御。',
      descJa: '高防御の敵。先に攻撃を上げると損耗を抑えやすい。撃破で大幅に防御強化。',
    },
    combat_berserk: {
      key: 'combat_berserk',
      category: 'combat',
      name: '狂暴魔犬',
      nameJa: '凶暴魔犬',
      shortName: '高危战',
      shortNameJa: '高危戦',
      icon: 'skull_blade',
      baseEnemy: { hp: 34, atk: 19, def: 3 },
      reward: { atk: 4, def: 2, gold: 25, hp: 0 },
      desc: '高危强敌！前期直面会大失血，推荐用十字/T形展开将其甩到不走的岔路上规避！',
      descJa: '高リスクの強敵！序盤の正面突破は大失血。十字/T字分岐で行かない側へ捨てる回避が推奨！',
    },
    combat_shrine_guard: {
      key: 'combat_shrine_guard',
      category: 'combat',
      name: '秘境守卫',
      nameJa: '秘境の守衛',
      shortName: '奇遇战',
      shortNameJa: '奇遇戦',
      icon: 'star',
      triggersEvent: true,
      baseEnemy: { hp: 22, atk: 11, def: 2 },
      reward: { atk: 1, def: 0, gold: 10, hp: 0 },
      desc: '看守古老遗迹的轻装守卫。击败后除战利品外，立即触发一次【命运奇遇】抉择！',
      descJa: '古い遺跡を守る軽装の衛兵。撃破で戦利品に加えて【命运奇遇】が即発生！',
    },
    treasure_basic: {
      key: 'treasure_basic',
      category: 'treasure',
      name: '秘银宝箱',
      nameJa: 'ミスリル宝箱',
      shortName: '秘银箱',
      shortNameJa: '秘銀箱',
      icon: 'chest',
      tier: 1,
      desc: '开启后从三件秘宝中任选其一（+攻击 / +防御 / +生命上限与回复）。',
      descJa: '秘宝3つから1つ選択（+攻撃 / +防御 / +HP上限＆回復）。',
    },
    heal_basic: {
      key: 'heal_basic',
      category: 'heal',
      name: '治愈灵泉',
      nameJa: '癒しの霊泉',
      shortName: '灵泉',
      shortNameJa: '霊泉',
      icon: 'chalice',
      healAmount: 38,
      bonusMaxHp: 6,
      desc: '恢复 38 点生命值；若生命回满，额外提升 6 点生命上限。',
      descJa: 'HPを38回復。全快すれば上限がさらに+6。',
    },
    event_basic: {
      key: 'event_basic',
      category: 'event',
      name: '命运奇遇',
      nameJa: '運命の奇遇',
      shortName: '奇遇',
      shortNameJa: '奇遇',
      icon: 'star',
      tier: 1,
      shopCost: 22,
      desc: '触发迷宫随机奇遇（流浪铁匠或古老祭坛），用魔晶或生命换取高额属性。',
      descJa: 'ランダムな奇遇（流浪の鍛冶屋か古の祭壇）。魔晶や体力を対価に高い強化を。',
    },

    combat_bounty: {
      key: 'combat_bounty',
      category: 'combat',
      name: '悬赏恶徒',
      nameJa: '賞金首の悪徒',
      shortName: '悬赏战',
      shortNameJa: '懸賞戦',
      icon: 'bounty',
      shopCost: 26,
      baseEnemy: { hp: 28, atk: 12, def: 3 },
      reward: { atk: 2, def: 2, gold: 30, hp: 0 },
      desc: '【进阶战斗】攻守适中的悬赏怪，击败同时 +2 ATK / +2 DEF 并获大量魔晶。',
      descJa: '【上位戦闘】攻守バランスの良い賞金首。撃破で +2 ATK / +2 DEF と大量魔晶。',
    },
    combat_duelist: {
      key: 'combat_duelist',
      category: 'combat',
      name: '剑术傀儡',
      nameJa: '剣術傀儡',
      shortName: '剑傀战',
      shortNameJa: '傀儡戦',
      icon: 'sword',
      shopCost: 24,
      baseEnemy: { hp: 30, atk: 11, def: 1 },
      reward: { atk: 4, def: 0, gold: 15, hp: 0 },
      desc: '【进阶战斗】低护甲试炼机关，击败直接提升 4 点基础攻击力。',
      descJa: '【上位戦闘】低装甲の試練傀儡。撃破で基礎攻撃力が一気に+4。',
    },
    combat_paladin: {
      key: 'combat_paladin',
      category: 'combat',
      name: '圣盾残魂',
      nameJa: '聖盾の残魂',
      shortName: '圣盾战',
      shortNameJa: '聖盾戦',
      icon: 'shield_sword',
      shopCost: 26,
      baseEnemy: { hp: 26, atk: 12, def: 4 },
      reward: { atk: 1, def: 3, gold: 14, hp: 14 },
      desc: '【进阶战斗】击败获得 +1 ATK / +3 DEF，并恢复 14 点生命值。',
      descJa: '【上位戦闘】撃破で +1 ATK / +3 DEF、さらに HP を14回復。',
    },
    treasure_royal: {
      key: 'treasure_royal',
      category: 'treasure',
      name: '皇家宝库',
      nameJa: '王家の宝庫',
      shortName: '皇家箱',
      shortNameJa: '王家箱',
      icon: 'chest_crown',
      tier: 2,
      shopCost: 32,
      desc: '【进阶宝物】高阶遗物三选一（+6 ATK / +6 DEF / +40 生命与上限）。',
      descJa: '【上位宝物】高位の遺物3択（+6 ATK / +6 DEF / +40 HP＆上限）。',
    },
    heal_sacred: {
      key: 'heal_sacred',
      category: 'heal',
      name: '女神圣泉',
      nameJa: '女神の聖泉',
      shortName: '圣泉',
      shortNameJa: '聖泉',
      icon: 'chalice',
      healAmount: 55,
      bonusMaxHp: 12,
      shopCost: 28,
      desc: '【进阶回复】恢复 55 点生命值，并直接提升 12 点生命上限。',
      descJa: '【上位回復】HPを55回復し、上限を直接+12。',
    },
  };

  const WORKSHOP_RUNE_KEYS = [
    'empty_road',
    'combat_bounty',
    'combat_duelist',
    'combat_paladin',
    'treasure_royal',
    'heal_sacred',
    'event_basic',
  ];

  function createInitialDiceBag() {
    return [
      {
        id: 0,
        title: '1号寻宝骰',
        titleJa: '①宝探しダイス',
        shortTitle: '①寻宝',
        shortTitleJa: '①宝物',
        faces: ['empty_road', 'combat_skirmisher', 'treasure_basic', 'empty_road', 'combat_armored', 'empty_road'],
      },
      {
        id: 1,
        title: '2号灵泉骰',
        titleJa: '②霊泉ダイス',
        shortTitle: '②灵泉',
        shortTitleJa: '②霊泉',
        faces: ['heal_basic', 'empty_road', 'combat_skirmisher', 'combat_berserk', 'empty_road', 'empty_road'],
      },
      {
        id: 2,
        title: '3号奇遇骰',
        titleJa: '③奇遇ダイス',
        shortTitle: '③奇遇',
        shortTitleJa: '③奇遇',
        faces: ['empty_road', 'combat_skirmisher', 'empty_road', 'empty_road', 'combat_berserk', 'combat_shrine_guard'],
      },
      {
        id: 3,
        title: '4号历练骰',
        titleJa: '④修練ダイス',
        shortTitle: '④历练',
        shortTitleJa: '④修練',
        faces: ['combat_skirmisher', 'empty_road', 'combat_armored', 'empty_road', 'empty_road', 'combat_berserk'],
      },
    ];
  }

  // =========================================================================
  // i18n 辅助
  // =========================================================================
  const isJa = () => window.I18N.lang === 'ja';
  function tplName(tpl) { return isJa() && tpl.nameJa ? tpl.nameJa : tpl.name; }
  function tplShort(tpl) { return isJa() && tpl.shortNameJa ? tpl.shortNameJa : tpl.shortName; }
  function tplDesc(tpl) { return isJa() && tpl.descJa ? tpl.descJa : tpl.desc; }
  function objName(o) { return isJa() && o.nameJa ? o.nameJa : o.name; }
  function objShort(o) { return isJa() && o.shortTitleJa ? o.shortTitleJa : (o.shortTitle || o.name); }
  function dieTitle(d) { return isJa() && d.titleJa ? d.titleJa : d.title; }
  function dieShort(d) { return isJa() && d.shortTitleJa ? d.shortTitleJa : d.shortTitle; }

  // =========================================================================
  // WebAudio 轻量合成音效
  // =========================================================================
  let audioCtx = null;
  function playTone(freq, duration, type = 'sine', gainVal = 0.055, slideTo = null) {
    try {
      if (!audioCtx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        audioCtx = new AC();
      }
      if (audioCtx.state === 'suspended') audioCtx.resume();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
      if (slideTo) {
        osc.frequency.exponentialRampToValueAtTime(slideTo, audioCtx.currentTime + duration);
      }
      gain.gain.setValueAtTime(gainVal, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + duration);
    } catch (_) {}
  }

  function sfxRoll() {
    playTone(250, 0.08, 'triangle', 0.07, 470);
    setTimeout(() => playTone(390, 0.1, 'triangle', 0.06, 560), 70);
  }
  function sfxFold() { playTone(520, 0.065, 'sine', 0.05, 670); }
  function sfxRotate() { playTone(350, 0.055, 'triangle', 0.045, 420); }
  function sfxCombat() {
    playTone(170, 0.11, 'sawtooth', 0.06, 95);
    setTimeout(() => playTone(260, 0.09, 'triangle', 0.06, 180), 75);
  }
  function sfxGood() {
    playTone(440, 0.09, 'sine', 0.06, 660);
    setTimeout(() => playTone(660, 0.14, 'sine', 0.06, 880), 80);
  }

  // =========================================================================
  // 纯几何 SVG 图标库
  // =========================================================================
  function getSvgIcon(icon, size = 20) {
    const common = `width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"`;
    switch (icon) {
      case 'road_dot':
        return `<svg ${common}><rect x="8" y="8" width="8" height="8" rx="2" stroke-opacity="0.45"/></svg>`;
      case 'start':
        return `<svg ${common}><circle cx="12" cy="12" r="8"/><polygon points="12 7 15 12 12 17 9 12" fill="currentColor"/></svg>`;
      case 'boss':
        return `<svg ${common}><path d="M4 18L6 8l6 4 6-4 2 10H4z"/><line x1="4" y1="21" x2="20" y2="21"/><circle cx="12" cy="6" r="1.5" fill="currentColor"/></svg>`;
      case 'sword':
        return `<svg ${common}><polyline points="14.5 17.5 3 6 3 3 6 3 17.5 14.5"/><line x1="13" y1="19" x2="19" y2="13"/><line x1="16" y1="16" x2="20" y2="20"/><line x1="19" y1="21" x2="21" y2="19"/></svg>`;
      case 'shield_sword':
        return `<svg ${common}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="9" y1="11" x2="15" y2="11"/></svg>`;
      case 'skull_blade':
        return `<svg ${common}><path d="M6 4l12 12"/><path d="M18 4L6 16"/><circle cx="12" cy="12" r="4" fill="#2a1621"/><line x1="4" y1="18" x2="8" y2="14"/><line x1="20" y1="18" x2="16" y2="14"/></svg>`;
      case 'bounty':
        return `<svg ${common}><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/><line x1="12" y1="2" x2="12" y2="5"/><line x1="12" y1="19" x2="12" y2="22"/><line x1="2" y1="12" x2="5" y2="12"/><line x1="19" y1="12" x2="22" y2="12"/></svg>`;
      case 'chest':
        return `<svg ${common}><rect x="3" y="8" width="18" height="12" rx="2"/><path d="M3 12h18"/><path d="M7 8V6a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v2"/><rect x="10.5" y="10.5" width="3" height="4" rx="0.5"/></svg>`;
      case 'chest_crown':
        return `<svg ${common}><rect x="3" y="9" width="18" height="11" rx="2"/><path d="M3 13h18"/><path d="M7 6l2.5 2L12 5l2.5 3L17 6"/></svg>`;
      case 'chalice':
        return `<svg ${common}><path d="M12 3c-4 4.5-6 7.5-6 10.5a6 6 0 0 0 12 0C18 10.5 16 7.5 12 3z"/><line x1="12" y1="11" x2="12" y2="16"/><line x1="9.5" y1="13.5" x2="14.5" y2="13.5"/></svg>`;
      case 'star':
        return `<svg ${common}><polygon points="12 2 14.8 8.8 22 9.5 16.5 14.2 18.2 21.3 12 17.5 5.8 21.3 7.5 14.2 2 9.5 9.2 8.8 12 2"/></svg>`;
      default:
        return `<svg ${common}><rect x="6" y="6" width="12" height="12" rx="2"/></svg>`;
    }
  }

  function categoryColor(cat) {
    switch (cat) {
      case 'empty_road': return '#6c80a6';
      case 'combat': return '#ff7a7a';
      case 'treasure': return '#f4b350';
      case 'heal': return '#52d697';
      case 'event': return '#b58cff';
      default: return '#9aa8c2';
    }
  }

  function categoryLabel(cat) {
    return t(`cat.${cat}`);
  }

  // =========================================================================
  // 标准正方体 1~6 号面（1对6、2对5、3对4）三维旋转与展开拓扑引擎
  // =========================================================================
  function getBaseOrientationForBottom(bottomFaceId) {
    switch (bottomFaceId) {
      case 0: return { down: 0, up: 5, north: 1, south: 4, east: 2, west: 3 };
      case 5: return { down: 5, up: 0, north: 1, south: 4, east: 3, west: 2 };
      case 1: return { down: 1, up: 4, north: 5, south: 0, east: 2, west: 3 };
      case 4: return { down: 4, up: 1, north: 0, south: 5, east: 2, west: 3 };
      case 2: return { down: 2, up: 3, north: 1, south: 4, east: 5, west: 0 };
      case 3: return { down: 3, up: 2, north: 1, south: 4, east: 0, west: 5 };
      default: return { down: 0, up: 5, north: 1, south: 4, east: 2, west: 3 };
    }
  }

  function rotateOrientationCW(ori, steps = 1) {
    let cur = { ...ori };
    const norm = ((steps % 4) + 4) % 4;
    for (let i = 0; i < norm; i++) {
      cur = {
        down: cur.down,
        up: cur.up,
        east: cur.north,
        south: cur.east,
        west: cur.south,
        north: cur.west,
      };
    }
    return cur;
  }

  function rollOrientation(ori, dir) {
    switch (dir) {
      case 'north':
        return { down: ori.north, north: ori.up, up: ori.south, south: ori.down, east: ori.east, west: ori.west };
      case 'south':
        return { down: ori.south, south: ori.up, up: ori.north, north: ori.down, east: ori.east, west: ori.west };
      case 'east':
        return { down: ori.east, east: ori.up, up: ori.west, west: ori.down, north: ori.north, south: ori.south };
      case 'west':
        return { down: ori.west, west: ori.up, up: ori.east, east: ori.down, north: ori.north, south: ori.south };
      default:
        return { ...ori };
    }
  }

  function inBounds(r, c) {
    return r >= 0 && r < GRID_SIZE && c >= 0 && c < GRID_SIZE;
  }

  function isCellEmptyForUnfold(board, r, c) {
    return inBounds(r, c) && board[r][c].kind === 'empty';
  }

  function canCompleteSixFaces(unfoldedList, board) {
    if (unfoldedList.length === 6) return true;
    const usedFaces = new Set(unfoldedList.map((u) => u.faceId));
    const usedCells = new Set(unfoldedList.map((u) => `${u.r},${u.c}`));

    for (let i = 0; i < unfoldedList.length; i++) {
      const u = unfoldedList[i];
      for (const dir of DIR_ORDER) {
        const nextFaceId = u.orientation[dir];
        if (usedFaces.has(nextFaceId)) continue;
        const nr = u.r + DIRS[dir].dr;
        const nc = u.c + DIRS[dir].dc;
        const key = `${nr},${nc}`;
        if (!isCellEmptyForUnfold(board, nr, nc) || usedCells.has(key)) continue;

        const nextNode = {
          faceId: nextFaceId,
          r: nr,
          c: nc,
          orientation: rollOrientation(u.orientation, dir),
          parentIndex: i,
          dirFromParent: dir,
        };
        unfoldedList.push(nextNode);
        const ok = canCompleteSixFaces(unfoldedList, board);
        unfoldedList.pop();
        if (ok) return true;
      }
    }
    return false;
  }

  function canAnchorCompleteAnyRotation(r, c, bottomFaceId, board) {
    if (!isCellEmptyForUnfold(board, r, c)) return false;
    const baseOri = getBaseOrientationForBottom(bottomFaceId);
    for (let rot = 0; rot < 4; rot++) {
      const ori = rotateOrientationCW(baseOri, rot);
      const init = [{ faceId: ori.down, r, c, orientation: ori, parentIndex: -1, dirFromParent: null }];
      if (canCompleteSixFaces(init, board)) return true;
    }
    return false;
  }

  // =========================================================================
  // 魔塔确定性战斗数学模拟
  // =========================================================================
  function scaleEnemyForStage(baseEnemy, stageIdx) {
    const scale = STAGES[stageIdx].enemyScale;
    return {
      hp: Math.round(baseEnemy.hp * scale),
      atk: Math.round(baseEnemy.atk * scale),
      def: Math.round(baseEnemy.def * (stageIdx === 0 ? 1 : scale * 0.92)),
    };
  }

  function scaleRewardForStage(reward, stageIdx) {
    const scale = STAGES[stageIdx].rewardScale;
    return {
      atk: reward.atk ? Math.max(1, Math.round(reward.atk * (stageIdx === 0 ? 1 : 1 + stageIdx * 0.35))) : 0,
      def: reward.def ? Math.max(1, Math.round(reward.def * (stageIdx === 0 ? 1 : 1 + stageIdx * 0.35))) : 0,
      gold: Math.round((reward.gold || 0) * scale),
      hp: Math.round((reward.hp || 0) * scale),
    };
  }

  function simulateMagicTowerCombat(hero, enemy) {
    const heroHitDmg = Math.max(1, hero.atk - enemy.def);
    const hitsToKill = Math.ceil(enemy.hp / heroHitDmg);
    const enemyAttacks = Math.max(0, hitsToKill - 1);
    const enemyHitDmg = Math.max(0, enemy.atk - hero.def);
    const hpLoss = enemyAttacks * enemyHitDmg;
    const remainHp = hero.hp - hpLoss;
    return { heroHitDmg, hitsToKill, enemyAttacks, enemyHitDmg, hpLoss, remainHp, survivable: remainHp > 0 };
  }

  // =========================================================================
  // 游戏主状态机
  // =========================================================================
  const state = {
    stageIdx: 0,
    hero: { hp: 100, maxHp: 100, atk: 12, def: 4, gold: 0 },
    diceBag: createInitialDiceBag(),
    diceUsed: [false, false, false, false],
    activeDieIdx: 0,

    phase: 'ROLL',
    rolledBottomId: null,
    rotationSteps: 0,
    anchorPos: null,
    unfolded: [],
    unfoldCursorIdx: 0,

    playerPos: { ...START_POS },
    hasMovedThisTurn: false,
    board: [],
    foughtCombats: 0,
    logs: [],
    walkQueue: [],
    isWalking: false,
    activeModalChoices: [],
    modalReopen: null,

    workshopFreeTokens: 0,
    workshopDieIdx: 0,
    workshopSelectedSlot: 0,
    workshopPreviewOnly: false,
  };

  function getActiveDie() {
    return state.diceBag[state.activeDieIdx];
  }

  function getActiveFaceKey(faceId) {
    return getActiveDie().faces[faceId];
  }

  function getActiveFaceTpl(faceId) {
    return FACE_TEMPLATES[getActiveFaceKey(faceId)];
  }

  function getUnusedDiceCount() {
    return state.diceUsed.filter((u) => !u).length;
  }

  function pickFirstUnusedDieIndex() {
    const idx = state.diceUsed.findIndex((u) => !u);
    return idx >= 0 ? idx : 0;
  }

  function cloneDiceBag(bag) {
    return bag.map((d) => ({ ...d, faces: [...d.faces] }));
  }

  function createEmptyBoard() {
    const b = [];
    for (let r = 0; r < GRID_SIZE; r++) {
      const row = [];
      for (let c = 0; c < GRID_SIZE; c++) {
        row.push({
          r, c,
          kind: 'empty',
          faceKey: null,
          faceNum: null,
          visited: false,
          consumed: false,
          isAnchor: false,
          links: { north: false, east: false, south: false, west: false },
        });
      }
      b.push(row);
    }
    b[START_POS.r][START_POS.c].kind = 'start';
    b[START_POS.r][START_POS.c].visited = true;
    b[BOSS_POS.r][BOSS_POS.c].kind = 'boss';
    return b;
  }

  function addLog(key, params, type = '') {
    state.logs.unshift({ key, params: params || {}, type });
    if (state.logs.length > 40) state.logs.pop();
  }

  let stageStartSnapshot = null;

  function saveStageSnapshot() {
    stageStartSnapshot = {
      stageIdx: state.stageIdx,
      hero: { ...state.hero },
      diceBag: cloneDiceBag(state.diceBag),
    };
  }

  function initStage(stageIdx, fromSnapshot = false) {
    if (fromSnapshot && stageStartSnapshot) {
      state.stageIdx = stageStartSnapshot.stageIdx;
      state.hero = { ...stageStartSnapshot.hero };
      state.diceBag = cloneDiceBag(stageStartSnapshot.diceBag);
    } else {
      state.stageIdx = stageIdx;
      const st = STAGES[stageIdx];
      if (st.entryHeal > 0) {
        state.hero.hp = Math.min(state.hero.maxHp, state.hero.hp + st.entryHeal);
      }
      saveStageSnapshot();
    }

    state.diceUsed = [false, false, false, false];
    state.activeDieIdx = 0;
    state.phase = 'ROLL';
    state.rolledBottomId = null;
    state.rotationSteps = 0;
    state.anchorPos = null;
    state.unfolded = [];
    state.unfoldCursorIdx = 0;
    state.playerPos = { ...START_POS };
    state.hasMovedThisTurn = false;
    state.board = createEmptyBoard();
    state.foughtCombats = 0;
    state.walkQueue = [];
    state.isWalking = false;

    const st = STAGES[state.stageIdx];
    addLog('log.enterStage', { n: state.stageIdx + 1, name: objName(st) }, 'log-gold');
    closeModal();
    renderAll();
  }

  function startNewRun() {
    state.hero = { hp: 100, maxHp: 100, atk: 12, def: 4, gold: 0 };
    state.diceBag = createInitialDiceBag();
    state.logs = [];
    initStage(0, false);
  }

  function triggerCubeAnim(cls) {
    const cubeEl = document.getElementById('cube3d');
    if (!cubeEl) return;
    cubeEl.classList.remove('anim-roll', 'anim-rot-cw', 'anim-rot-ccw');
    void cubeEl.offsetWidth;
    if (cls) cubeEl.classList.add(cls);
  }

  // =========================================================================
  // 阶段 1：投掷当前选中的骰子
  // =========================================================================
  function handleRollDie() {
    if (state.phase !== 'ROLL') return;
    if (state.diceUsed[state.activeDieIdx]) {
      state.activeDieIdx = pickFirstUnusedDieIndex();
      if (state.diceUsed[state.activeDieIdx]) return;
    }

    state.diceUsed[state.activeDieIdx] = true;
    state.rolledBottomId = Math.floor(Math.random() * 6);
    state.rotationSteps = 0;
    state.anchorPos = null;
    state.unfolded = [];
    state.unfoldCursorIdx = 0;

    sfxRoll();
    triggerCubeAnim('anim-roll');

    const die = getActiveDie();
    const bottomNum = state.rolledBottomId + 1;
    const oppNum = 7 - bottomNum;
    const tpl = getActiveFaceTpl(state.rolledBottomId);
    addLog('log.roll', { die: dieTitle(die), num: bottomNum, face: tplShort(tpl), opp: oppNum }, 'log-gold');

    const candidates = getPlacementCandidates();
    const anyValid = candidates.some((c) => c.valid);
    state.phase = 'PLACE';
    renderAll();

    if (!anyValid) {
      setTimeout(() => {
        showEndModal(false, 'end.reasonSpace', {});
      }, 300);
    }
  }

  function getPlacementCandidates() {
    const res = [];
    const { r, c } = state.playerPos;
    for (const dir of DIR_ORDER) {
      const nr = r + DIRS[dir].dr;
      const nc = c + DIRS[dir].dc;
      if (!inBounds(nr, nc)) continue;
      if (state.board[nr][nc].kind !== 'empty') continue;
      const valid = canAnchorCompleteAnyRotation(nr, nc, state.rolledBottomId, state.board);
      res.push({ r: nr, c: nc, dir, valid });
    }
    return res;
  }

  // =========================================================================
  // 阶段 2：放置底面 + 旋转 + 方向键/鼠标交互式展开
  // =========================================================================
  function getCurrentAnchorOrientation() {
    const base = getBaseOrientationForBottom(state.rolledBottomId ?? 0);
    return rotateOrientationCW(base, state.rotationSteps);
  }

  function placeAnchorAt(r, c) {
    if (state.phase !== 'PLACE' && state.phase !== 'UNFOLD') return;
    if (!canAnchorCompleteAnyRotation(r, c, state.rolledBottomId, state.board)) return;

    const base = getBaseOrientationForBottom(state.rolledBottomId);
    for (let offset = 0; offset < 4; offset++) {
      const tryRot = (state.rotationSteps + offset) % 4;
      const ori = rotateOrientationCW(base, tryRot);
      const init = [{ faceId: ori.down, r, c, orientation: ori, parentIndex: -1, dirFromParent: null }];
      if (canCompleteSixFaces(init, state.board)) {
        state.rotationSteps = tryRot;
        state.anchorPos = { r, c };
        state.unfolded = init;
        state.unfoldCursorIdx = 0;
        state.phase = 'UNFOLD';
        sfxFold();
        renderAll();
        return;
      }
    }
  }

  function placeAnchorByDir(dir) {
    if (state.phase !== 'PLACE') return;
    const nr = state.playerPos.r + DIRS[dir].dr;
    const nc = state.playerPos.c + DIRS[dir].dc;
    if (!inBounds(nr, nc)) return;
    placeAnchorAt(nr, nc);
  }

  function rotatePlacedDie(deltaSteps) {
    if (state.phase !== 'UNFOLD' && state.phase !== 'PLACE') return;
    if (state.rolledBottomId === null) return;

    state.rotationSteps = ((state.rotationSteps + deltaSteps) % 4 + 4) % 4;
    sfxRotate();
    triggerCubeAnim(deltaSteps > 0 ? 'anim-rot-cw' : 'anim-rot-ccw');

    if (state.phase === 'UNFOLD' && state.anchorPos && state.unfolded.length > 0) {
      const newRootOri = getCurrentAnchorOrientation();
      const rebuilt = [
        {
          faceId: newRootOri.down,
          r: state.anchorPos.r,
          c: state.anchorPos.c,
          orientation: newRootOri,
          parentIndex: -1,
          dirFromParent: null,
        },
      ];
      for (let i = 1; i < state.unfolded.length; i++) {
        const prevNode = state.unfolded[i];
        const parent = rebuilt[prevNode.parentIndex];
        const dir = prevNode.dirFromParent;
        const nextOri = rollOrientation(parent.orientation, dir);
        rebuilt.push({
          faceId: nextOri.down,
          r: prevNode.r,
          c: prevNode.c,
          orientation: nextOri,
          parentIndex: prevNode.parentIndex,
          dirFromParent: dir,
        });
      }
      state.unfolded = rebuilt;
    }
    renderAll();
  }

  function handleArrowUnfold(dir) {
    if (state.phase !== 'UNFOLD' || state.unfolded.length === 0) return;

    const curIdx = Math.min(state.unfoldCursorIdx, state.unfolded.length - 1);
    const cur = state.unfolded[curIdx];
    const nr = cur.r + DIRS[dir].dr;
    const nc = cur.c + DIRS[dir].dc;

    const existingIdx = state.unfolded.findIndex((u) => u.r === nr && u.c === nc);
    if (existingIdx !== -1) {
      state.unfoldCursorIdx = existingIdx;
      sfxRotate();
      renderAll();
      return;
    }

    if (state.unfolded.length >= 6) return;

    const usedFaces = new Set(state.unfolded.map((u) => u.faceId));
    const usedCells = new Set(state.unfolded.map((u) => `${u.r},${u.c}`));
    const nextFaceId = cur.orientation[dir];

    if (
      !usedFaces.has(nextFaceId) &&
      isCellEmptyForUnfold(state.board, nr, nc) &&
      !usedCells.has(`${nr},${nc}`)
    ) {
      const nextOri = rollOrientation(cur.orientation, dir);
      const nextNode = {
        faceId: nextFaceId,
        r: nr,
        c: nc,
        orientation: nextOri,
        parentIndex: curIdx,
        dirFromParent: dir,
      };
      if (canCompleteSixFaces([...state.unfolded, nextNode], state.board)) {
        state.unfolded.push(nextNode);
        state.unfoldCursorIdx = state.unfolded.length - 1;
        sfxFold();
        renderAll();
        return;
      }
    }

    const allGhosts = Array.from(getGhostUnfoldMap().values()).filter(
      (g) => g.completable && g.dirFromParent === dir
    );
    if (allGhosts.length === 1) {
      const g = allGhosts[0];
      state.unfolded.push({
        faceId: g.faceId,
        r: g.r,
        c: g.c,
        orientation: g.orientation,
        parentIndex: g.parentIndex,
        dirFromParent: g.dirFromParent,
      });
      state.unfoldCursorIdx = state.unfolded.length - 1;
      sfxFold();
      renderAll();
    }
  }

  function getGhostUnfoldMap() {
    const map = new Map();
    if (state.phase !== 'UNFOLD' || state.unfolded.length === 0 || state.unfolded.length >= 6) {
      return map;
    }

    const usedFaces = new Set(state.unfolded.map((u) => u.faceId));
    const usedCells = new Set(state.unfolded.map((u) => `${u.r},${u.c}`));

    const order = [];
    const curIdx = Math.min(state.unfoldCursorIdx, state.unfolded.length - 1);
    order.push(curIdx);
    for (let i = 0; i < state.unfolded.length; i++) {
      if (i !== curIdx) order.push(i);
    }

    for (const pIdx of order) {
      const u = state.unfolded[pIdx];
      for (const dir of DIR_ORDER) {
        const nextFaceId = u.orientation[dir];
        if (usedFaces.has(nextFaceId)) continue;
        const nr = u.r + DIRS[dir].dr;
        const nc = u.c + DIRS[dir].dc;
        const key = `${nr},${nc}`;
        if (!isCellEmptyForUnfold(state.board, nr, nc) || usedCells.has(key)) continue;

        const nextOri = rollOrientation(u.orientation, dir);
        const nextNode = {
          faceId: nextFaceId,
          r: nr,
          c: nc,
          orientation: nextOri,
          parentIndex: pIdx,
          dirFromParent: dir,
        };
        const completable = canCompleteSixFaces([...state.unfolded, nextNode], state.board);

        const existing = map.get(key);
        if (!existing || (!existing.completable && completable)) {
          map.set(key, { ...nextNode, completable });
        }
      }
    }
    return map;
  }

  function isUnfoldedLeaf(index) {
    if (index <= 0 || index >= state.unfolded.length) return false;
    return !state.unfolded.some((u) => u.parentIndex === index);
  }

  function removeUnfoldedLeaf(index) {
    if (!isUnfoldedLeaf(index)) return;
    const parentIdx = state.unfolded[index].parentIndex;
    state.unfolded.splice(index, 1);
    for (let i = 0; i < state.unfolded.length; i++) {
      if (state.unfolded[i].parentIndex > index) {
        state.unfolded[i].parentIndex -= 1;
      }
    }
    state.unfoldCursorIdx = Math.max(0, Math.min(parentIdx, state.unfolded.length - 1));
    sfxFold();
    renderAll();
  }

  function undoLastUnfoldStep() {
    if (state.phase !== 'UNFOLD') return;
    if (state.unfolded.length > 1) {
      const removed = state.unfolded.pop();
      state.unfoldCursorIdx = Math.max(0, Math.min(removed.parentIndex, state.unfolded.length - 1));
      sfxFold();
      renderAll();
    } else {
      state.anchorPos = null;
      state.unfolded = [];
      state.unfoldCursorIdx = 0;
      state.phase = 'PLACE';
      renderAll();
    }
  }

  function resetUnfoldToAnchor() {
    if (state.phase !== 'UNFOLD' || state.unfolded.length <= 1) return;
    state.unfolded = [state.unfolded[0]];
    state.unfoldCursorIdx = 0;
    sfxFold();
    renderAll();
  }

  function reselectAnchor() {
    if (state.phase !== 'UNFOLD') return;
    state.anchorPos = null;
    state.unfolded = [];
    state.unfoldCursorIdx = 0;
    state.phase = 'PLACE';
    renderAll();
  }

  function isPassableKind(kind) {
    return kind === 'start' || kind === 'road' || kind === 'boss';
  }

  // 所有正交相邻道路格自动互连（不局限于骰子展开顺序）
  function rebuildAllAdjacentLinks() {
    for (let r = 0; r < GRID_SIZE; r++) {
      for (let c = 0; c < GRID_SIZE; c++) {
        const cell = state.board[r][c];
        cell.links = { north: false, east: false, south: false, west: false };
        if (!isPassableKind(cell.kind)) continue;
        for (const dir of DIR_ORDER) {
          const nr = r + DIRS[dir].dr;
          const nc = c + DIRS[dir].dc;
          if (inBounds(nr, nc) && isPassableKind(state.board[nr][nc].kind)) {
            cell.links[dir] = true;
          }
        }
      }
    }
  }

  function confirmUnfoldedRoad() {
    if (state.phase !== 'UNFOLD' || state.unfolded.length !== 6) return;

    const die = getActiveDie();
    for (let i = 0; i < state.unfolded.length; i++) {
      const u = state.unfolded[i];
      const cell = state.board[u.r][u.c];
      cell.kind = 'road';
      cell.faceKey = die.faces[u.faceId];
      cell.faceNum = u.faceId + 1;
      cell.visited = false;
      cell.consumed = false;
      cell.isAnchor = i === 0;
    }

    rebuildAllAdjacentLinks();

    state.unfolded = [];
    state.anchorPos = null;
    state.hasMovedThisTurn = false;
    state.phase = 'MOVE';
    sfxGood();
    addLog('log.roadDone', {});
    renderAll();
  }

  // =========================================================================
  // 阶段 3：单向移动（全相邻连通 + 方向键单步 + 鼠标智能寻路）
  // =========================================================================
  function estimateCellStepCost(cell) {
    if (cell.kind !== 'road' || !cell.faceKey) return 1;
    const tpl = FACE_TEMPLATES[cell.faceKey];
    if (tpl && tpl.category === 'combat') {
      const sim = simulateMagicTowerCombat(state.hero, scaleEnemyForStage(tpl.baseEnemy, state.stageIdx));
      return sim.hpLoss * 1000 + 1;
    }
    return 1;
  }

  function getReachableForwardPaths() {
    const paths = new Map();
    const bestCost = new Map();
    if (state.phase !== 'MOVE') return paths;

    const startKey = `${state.playerPos.r},${state.playerPos.c}`;
    bestCost.set(startKey, 0);
    const pq = [{ r: state.playerPos.r, c: state.playerPos.c, cost: 0, path: [] }];

    while (pq.length > 0) {
      pq.sort((a, b) => a.cost - b.cost);
      const cur = pq.shift();
      const curKey = `${cur.r},${cur.c}`;
      if (cur.cost > (bestCost.get(curKey) ?? Infinity)) continue;

      const cell = state.board[cur.r][cur.c];
      for (const dir of DIR_ORDER) {
        if (!cell.links[dir]) continue;
        const nr = cur.r + DIRS[dir].dr;
        const nc = cur.c + DIRS[dir].dc;
        const key = `${nr},${nc}`;
        const nextCell = state.board[nr][nc];

        if (nextCell.kind === 'boss') {
          const nextCost = cur.cost + 1;
          if (nextCost < (bestCost.get(key) ?? Infinity)) {
            bestCost.set(key, nextCost);
            paths.set(key, [...cur.path, { r: nr, c: nc }]);
          }
        } else if (nextCell.kind === 'road' && !nextCell.visited) {
          const nextCost = cur.cost + estimateCellStepCost(nextCell);
          if (nextCost < (bestCost.get(key) ?? Infinity)) {
            bestCost.set(key, nextCost);
            const nextPath = [...cur.path, { r: nr, c: nc }];
            paths.set(key, nextPath);
            pq.push({ r: nr, c: nc, cost: nextCost, path: nextPath });
          }
        }
      }
    }
    return paths;
  }

  function handleArrowMove(dir) {
    if (state.phase !== 'MOVE' || state.isWalking) return;
    const curCell = state.board[state.playerPos.r][state.playerPos.c];
    if (!curCell.links[dir]) return;
    const nr = state.playerPos.r + DIRS[dir].dr;
    const nc = state.playerPos.c + DIRS[dir].dc;
    const target = state.board[nr][nc];
    if (target.kind === 'boss' || (target.kind === 'road' && !target.visited)) {
      state.walkQueue = [{ r: nr, c: nc }];
      processNextWalkStep();
    }
  }

  function handleMoveTargetClick(r, c) {
    if (state.phase !== 'MOVE' || state.isWalking) return;
    const paths = getReachableForwardPaths();
    const path = paths.get(`${r},${c}`);
    if (!path || path.length === 0) return;

    state.walkQueue = [...path];
    processNextWalkStep();
  }

  function processNextWalkStep() {
    if (state.walkQueue.length === 0) {
      state.isWalking = false;
      renderAll();
      return;
    }

    state.isWalking = true;
    const step = state.walkQueue.shift();
    const targetCell = state.board[step.r][step.c];

    if (targetCell.kind === 'boss') {
      state.walkQueue = [];
      state.isWalking = false;
      state.playerPos = { r: step.r, c: step.c };
      triggerBossBattle();
      return;
    }

    state.playerPos = { r: step.r, c: step.c };
    state.hasMovedThisTurn = true;
    targetCell.visited = true;

    if (!targetCell.consumed && targetCell.faceKey) {
      targetCell.consumed = true;
      const shouldPauseQueue = resolveRoadTileEffect(targetCell.faceKey);
      renderAll();
      if (shouldPauseQueue) {
        state.isWalking = false;
        return;
      }
    } else {
      sfxFold();
      renderAll();
    }

    if (state.walkQueue.length > 0) {
      setTimeout(processNextWalkStep, 145);
    } else {
      state.isWalking = false;
      renderAll();
    }
  }

  function resolveRoadTileEffect(faceKey) {
    const tpl = FACE_TEMPLATES[faceKey];
    if (!tpl || tpl.category === 'empty_road') {
      playTone(420, 0.04, 'sine', 0.03, 460);
      return false;
    }

    if (tpl.category === 'combat') {
      const enemy = scaleEnemyForStage(tpl.baseEnemy, state.stageIdx);
      const reward = scaleRewardForStage(tpl.reward, state.stageIdx);
      const sim = simulateMagicTowerCombat(state.hero, enemy);
      sfxCombat();

      state.hero.hp = Math.max(0, state.hero.hp - sim.hpLoss);
      state.foughtCombats += 1;

      if (state.hero.hp <= 0) {
        addLog('log.combatDeath', { name: tplName(tpl), loss: sim.hpLoss }, 'log-combat');
        state.walkQueue = [];
        setTimeout(() => {
          showEndModal(false, 'end.reasonCombat', { name: tplName(tpl), loss: sim.hpLoss });
        }, 120);
        return true;
      }

      state.hero.atk += reward.atk;
      state.hero.def += reward.def;
      state.hero.gold += reward.gold;
      if (reward.hp > 0) {
        state.hero.hp = Math.min(state.hero.maxHp, state.hero.hp + reward.hp);
      }

      const gains = [];
      if (reward.atk) gains.push(`+${reward.atk} ATK`);
      if (reward.def) gains.push(`+${reward.def} DEF`);
      if (reward.hp) gains.push(`+${reward.hp} HP`);
      if (reward.gold) gains.push(`+${reward.gold} ${t('panel.goldUnit')}`);
      addLog('log.combatWin', { name: tplName(tpl), loss: sim.hpLoss, gains: gains.join(' / ') }, 'log-combat');

      if (tpl.triggersEvent) {
        showMysteryEventModal(1);
        return true;
      }
      return false;
    }

    if (tpl.category === 'heal') {
      sfxGood();
      if (tpl.key === 'heal_sacred') {
        state.hero.maxHp += tpl.bonusMaxHp;
        const before = state.hero.hp;
        state.hero.hp = Math.min(state.hero.maxHp, state.hero.hp + tpl.healAmount);
        addLog('log.healSacred', { name: tplName(tpl), bonus: tpl.bonusMaxHp, heal: state.hero.hp - before }, 'log-good');
      } else {
        const raw = state.hero.hp + tpl.healAmount;
        if (raw >= state.hero.maxHp) {
          state.hero.maxHp += tpl.bonusMaxHp;
          state.hero.hp = Math.min(state.hero.maxHp, raw);
          addLog('log.healMax', { name: tplName(tpl), bonus: tpl.bonusMaxHp }, 'log-good');
        } else {
          state.hero.hp = raw;
          addLog('log.healNormal', { name: tplName(tpl), heal: tpl.healAmount }, 'log-good');
        }
      }
      return false;
    }

    if (tpl.category === 'treasure') {
      sfxGood();
      showTreasureModal(tpl.tier || 1);
      return true;
    }

    if (tpl.category === 'event') {
      sfxGood();
      showMysteryEventModal(tpl.tier || 1);
      return true;
    }

    return false;
  }

  function countRemainingAvoidedCombats() {
    const reachable = new Set();
    const queue = [{ r: state.playerPos.r, c: state.playerPos.c }];
    const seen = new Set([`${state.playerPos.r},${state.playerPos.c}`]);
    while (queue.length > 0) {
      const cur = queue.shift();
      const cell = state.board[cur.r][cur.c];
      for (const dir of DIR_ORDER) {
        if (!cell.links[dir]) continue;
        const nr = cur.r + DIRS[dir].dr;
        const nc = cur.c + DIRS[dir].dc;
        const k = `${nr},${nc}`;
        if (seen.has(k)) continue;
        const ncCell = state.board[nr][nc];
        if (ncCell.kind === 'road' && !ncCell.visited) {
          reachable.add(k);
          seen.add(k);
          queue.push({ r: nr, c: nc });
        }
      }
    }

    let avoided = 0;
    for (let r = 0; r < GRID_SIZE; r++) {
      for (let c = 0; c < GRID_SIZE; c++) {
        const cell = state.board[r][c];
        if (
          cell.kind === 'road' &&
          !cell.visited &&
          FACE_TEMPLATES[cell.faceKey].category === 'combat' &&
          !reachable.has(`${r},${c}`)
        ) {
          avoided += 1;
        }
      }
    }
    return avoided;
  }

  function hasEmptyGridNeighbor(r, c) {
    for (const dir of DIR_ORDER) {
      const nr = r + DIRS[dir].dr;
      const nc = c + DIRS[dir].dc;
      if (inBounds(nr, nc) && state.board[nr][nc].kind === 'empty') return true;
    }
    return false;
  }

  function isAdjacentToBoss(r, c) {
    return Math.abs(r - BOSS_POS.r) + Math.abs(c - BOSS_POS.c) === 1;
  }

  function minStepsToBossNeighbor(r, c) {
    const manhattanToBoss = Math.abs(BOSS_POS.r - r) + Math.abs(BOSS_POS.c - c);
    return Math.max(0, manhattanToBoss - 1);
  }

  function endMovementTurn() {
    if (state.phase !== 'MOVE' || !state.hasMovedThisTurn) return;

    if (isAdjacentToBoss(state.playerPos.r, state.playerPos.c)) {
      triggerBossBattle();
      return;
    }

    if (getUnusedDiceCount() <= 0) {
      const distLeft = minStepsToBossNeighbor(state.playerPos.r, state.playerPos.c);
      const avoided = countRemainingAvoidedCombats();
      showEndModal(false, 'end.reasonDice', {
        steps: distLeft,
        fought: state.foughtCombats,
        avoided,
      });
      return;
    }

    state.activeDieIdx = pickFirstUnusedDieIndex();
    state.phase = 'ROLL';
    state.rolledBottomId = null;
    addLog('log.endTurn', { die: dieTitle(getActiveDie()) });
    renderAll();
  }

  // =========================================================================
  // 弹窗系统
  // =========================================================================
  const modalBackdrop = document.getElementById('modalBackdrop');
  const modalDialog = document.getElementById('modalDialog');

  function openModal(html, choiceCallbacks = [], reopenFn = null) {
    state.activeModalChoices = choiceCallbacks;
    state.modalReopen = reopenFn;
    modalDialog.innerHTML = html;
    modalBackdrop.classList.remove('hidden');
  }

  function closeModal() {
    state.activeModalChoices = [];
    state.modalReopen = null;
    modalBackdrop.classList.add('hidden');
    modalDialog.innerHTML = '';
  }

  function resumeAfterEventModal() {
    closeModal();
    renderAll();
    if (state.walkQueue.length > 0 && state.phase === 'MOVE') {
      setTimeout(processNextWalkStep, 150);
    }
  }

  function showTreasureModal(tier) {
    const s = state.stageIdx;
    const atkGain = (tier === 2 ? 6 : 4) + s;
    const defGain = (tier === 2 ? 6 : 4) + s;
    const hpGain = (tier === 2 ? 40 : 28) + s * 6;

    const pickAtk = () => {
      state.hero.atk += atkGain;
      addLog('log.treasureAtk', { v: atkGain }, 'log-gold');
      sfxGood();
      resumeAfterEventModal();
    };
    const pickDef = () => {
      state.hero.def += defGain;
      addLog('log.treasureDef', { v: defGain }, 'log-gold');
      sfxGood();
      resumeAfterEventModal();
    };
    const pickHp = () => {
      state.hero.maxHp += hpGain;
      state.hero.hp += hpGain;
      addLog('log.treasureHp', { v: hpGain }, 'log-gold');
      sfxGood();
      resumeAfterEventModal();
    };

    openModal(
      `
      <h2 class="modal-title">${t(tier === 2 ? 'modal.treasureTitle2' : 'modal.treasureTitle1')}</h2>
      <p class="modal-sub">${t('modal.treasureSub')}</p>
      <div class="choice-grid">
        <div class="choice-card" id="trOptAtk">
          <div>
            <h3>${t('modal.trAtk')}</h3>
            <p>${t('modal.trAtkDesc')}</p>
          </div>
          <span class="badge badge-ok">${t('modal.trAtkGain', { v: atkGain })}</span>
        </div>
        <div class="choice-card" id="trOptDef">
          <div>
            <h3>${t('modal.trDef')}</h3>
            <p>${t('modal.trDefDesc')}</p>
          </div>
          <span class="badge badge-accent">${t('modal.trDefGain', { v: defGain })}</span>
        </div>
        <div class="choice-card" id="trOptHp">
          <div>
            <h3>${t('modal.trHp')}</h3>
            <p>${t('modal.trHpDesc')}</p>
          </div>
          <span class="badge badge-gold">${t('modal.trHpGain', { v: hpGain })}</span>
        </div>
      </div>
    `,
      [pickAtk, pickDef, pickHp],
      () => showTreasureModal(tier)
    );

    document.getElementById('trOptAtk').onclick = pickAtk;
    document.getElementById('trOptDef').onclick = pickDef;
    document.getElementById('trOptHp').onclick = pickHp;
  }

  function showMysteryEventModal(tier, forcedKind) {
    const kind = forcedKind !== undefined ? forcedKind : Math.floor(Math.random() * 2);
    if (kind === 0) {
      const cost = 15;
      const canBuy = state.hero.gold >= cost;
      const opt1 = canBuy
        ? () => {
            state.hero.gold -= cost;
            state.hero.atk += 3;
            state.hero.def += 2;
            addLog('log.smithBuy', { cost, atk: 3, def: 2 }, 'log-event');
            sfxGood();
            resumeAfterEventModal();
          }
        : null;
      const opt2 = () => {
        state.hero.atk += 2;
        state.hero.def += 1;
        state.hero.gold += 10;
        addLog('log.smithFree', { atk: 2, def: 1, gold: 10 }, 'log-event');
        sfxGood();
        resumeAfterEventModal();
      };

      openModal(
        `
        <h2 class="modal-title">${t('modal.smithTitle')}</h2>
        <p class="modal-sub">${t('modal.smithSub', { gold: state.hero.gold })}</p>
        <div class="choice-grid">
          <div class="choice-card ${canBuy ? '' : 'disabled'}" id="evSmithBuy">
            <div>
              <h3>${t('modal.smithOpt1', { cost })}</h3>
              <p>${t('modal.smithOpt1Desc')}</p>
            </div>
            <span class="badge badge-gold">${t('modal.smithOpt1Gain', { atk: 3, def: 2 })}</span>
          </div>
          <div class="choice-card" id="evSmithFree">
            <div>
              <h3>${t('modal.smithOpt2')}</h3>
              <p>${t('modal.smithOpt2Desc')}</p>
            </div>
            <span class="badge badge-ok">${t('modal.smithOpt2Gain', { atk: 2, def: 1, gold: 10 })}</span>
          </div>
        </div>
      `,
        [opt1, opt2],
        () => showMysteryEventModal(tier, 0)
      );
      if (opt1) document.getElementById('evSmithBuy').onclick = opt1;
      document.getElementById('evSmithFree').onclick = opt2;
    } else {
      const hpCost = 16;
      const canSacrifice = state.hero.hp > hpCost + 5;
      const opt1 = canSacrifice
        ? () => {
            state.hero.hp -= hpCost;
            state.hero.atk += 3;
            state.hero.def += 2;
            addLog('log.altarBlood', { cost: hpCost, atk: 3, def: 2 }, 'log-event');
            sfxGood();
            resumeAfterEventModal();
          }
        : null;
      const opt2 = () => {
        state.hero.hp = Math.min(state.hero.maxHp, state.hero.hp + 22);
        state.hero.gold += 12;
        addLog('log.altarPray', { gold: 12 }, 'log-event');
        sfxGood();
        resumeAfterEventModal();
      };

      openModal(
        `
        <h2 class="modal-title">${t('modal.altarTitle')}</h2>
        <p class="modal-sub">${t('modal.altarSub', { hp: state.hero.hp })}</p>
        <div class="choice-grid">
          <div class="choice-card ${canSacrifice ? '' : 'disabled'}" id="evAltarBlood">
            <div>
              <h3>${t('modal.altarOpt1', { cost: hpCost })}</h3>
              <p>${t('modal.altarOpt1Desc', { need: hpCost + 5 })}</p>
            </div>
            <span class="badge badge-danger">${t('modal.altarOpt1Gain', { cost: hpCost, atk: 3, def: 2 })}</span>
          </div>
          <div class="choice-card" id="evAltarPray">
            <div>
              <h3>${t('modal.altarOpt2')}</h3>
              <p>${t('modal.altarOpt2Desc')}</p>
            </div>
            <span class="badge badge-ok">${t('modal.altarOpt2Gain', { heal: 22, gold: 12 })}</span>
          </div>
        </div>
      `,
        [opt1, opt2],
        () => showMysteryEventModal(tier, 1)
      );
      if (opt1) document.getElementById('evAltarBlood').onclick = opt1;
      document.getElementById('evAltarPray').onclick = opt2;
    }
  }

  function triggerBossBattle() {
    const st = STAGES[state.stageIdx];
    const boss = st.boss;
    const sim = simulateMagicTowerCombat(state.hero, boss);
    sfxCombat();

    const win = sim.survivable;
    const hpBefore = state.hero.hp;
    state.hero.hp = Math.max(0, state.hero.hp - sim.hpLoss);

    if (win) {
      state.hero.gold += st.clearGold;
      addLog('log.bossWin', { name: objName(boss), loss: sim.hpLoss, gold: st.clearGold }, 'log-gold');
    } else {
      addLog('log.bossLose', { name: objName(boss), loss: sim.hpLoss, hp: hpBefore }, 'log-combat');
    }
    renderAll();
    showBossResultModal(hpBefore, win, sim);
  }

  function showBossResultModal(hpBefore, win, sim) {
    const st = STAGES[state.stageIdx];
    const boss = st.boss;
    const isFinalStage = state.stageIdx >= STAGES.length - 1;

    openModal(
      `
      <h2 class="modal-title">${t(win ? 'modal.bossWin' : 'modal.bossLose', { name: objName(boss) })}</h2>
      <p class="modal-sub">${isJa() && boss.descJa ? boss.descJa : boss.desc}</p>
      <div class="duel-box">
        <div class="duel-versus">
          <div class="duel-fighter">
            <strong>${t('modal.duelHero')}</strong>
            <span>${t('modal.duelStats', { hp: hpBefore, atk: state.hero.atk, def: state.hero.def })}</span>
          </div>
          <span class="badge ${win ? 'badge-ok' : 'badge-danger'}">VS</span>
          <div class="duel-fighter">
            <strong>${objName(boss)}</strong>
            <span>${t('modal.duelBossStats', { hp: boss.hp, atk: boss.atk, def: boss.def })}</span>
          </div>
        </div>
        <p style="font-size:12.5px; color: var(--text-dim); text-align:center;">
          ${t('modal.duelLine', { dmg: sim.heroHitDmg, hits: sim.hitsToKill, n: sim.enemyAttacks, dmg2: sim.enemyHitDmg })}
          <b style="color:${win ? 'var(--emerald)' : '#ff7a7a'}">${t('modal.duelLoss', { loss: sim.hpLoss })}</b>
        </p>
      </div>
      ${
        win
          ? `<p class="modal-sub" style="margin-bottom:4px;">${
              isFinalStage ? t('modal.winNoteFinal') : t('modal.winNoteNext', { gold: st.clearGold })
            }</p>`
          : `<p class="modal-sub" style="margin-bottom:4px;">${t('modal.loseNote')}</p>`
      }
      <div class="modal-footer">
        ${
          win
            ? isFinalStage
              ? `<button class="btn btn-primary" id="btnBossAllClear">${t('modal.playAgain')}</button>`
              : `<button class="btn btn-primary" id="btnEnterWorkshop">${t('modal.toWorkshop')}</button>`
            : `<button class="btn btn-ghost" id="btnBossRetryStage">${t('modal.retryStage')}</button>
               <button class="btn btn-primary" id="btnBossRestartRun">${t('modal.newRun')}</button>`
        }
      </div>
    `,
      [],
      () => showBossResultModal(hpBefore, win, sim)
    );

    if (win) {
      if (isFinalStage) {
        document.getElementById('btnBossAllClear').onclick = () => startNewRun();
      } else {
        document.getElementById('btnEnterWorkshop').onclick = () => {
          state.workshopFreeTokens = 1;
          state.workshopPreviewOnly = false;
          state.workshopDieIdx = 0;
          state.workshopSelectedSlot = 0;
          openDiceWorkshopModal();
        };
      }
    } else {
      document.getElementById('btnBossRetryStage').onclick = () => initStage(state.stageIdx, true);
      document.getElementById('btnBossRestartRun').onclick = () => startNewRun();
    }
  }

  function showEndModal(victory, reasonKey, reasonParams) {
    state.phase = 'ENDED';
    openModal(
      `
      <h2 class="modal-title">${t('end.title')}</h2>
      <p class="modal-sub">${t(reasonKey, reasonParams)}</p>
      <div class="modal-footer">
        <button class="btn btn-ghost" id="btnEndRetryStage">${t('modal.retryStage')}</button>
        <button class="btn btn-primary" id="btnEndNewRun">${t('modal.newRun')}</button>
      </div>
    `,
      [],
      () => showEndModal(victory, reasonKey, reasonParams)
    );
    document.getElementById('btnEndRetryStage').onclick = () => initStage(state.stageIdx, true);
    document.getElementById('btnEndNewRun').onclick = () => startNewRun();
  }

  // =========================================================================
  // 局外骰子改造工坊
  // =========================================================================
  function countDieContentFaces(faces) {
    return faces.filter((k) => k !== 'empty_road').length;
  }

  function countBagTotalCombatFaces(bag = state.diceBag) {
    let total = 0;
    for (const d of bag) {
      for (const k of d.faces) {
        if (FACE_TEMPLATES[k].category === 'combat') total += 1;
      }
    }
    return total;
  }

  function openDiceWorkshopModal() {
    const isPreview = state.workshopPreviewOnly;
    const curDie = state.diceBag[state.workshopDieIdx];
    const selSlot = state.workshopSelectedSlot;
    const selTpl = FACE_TEMPLATES[curDie.faces[selSlot]];
    const contentCount = countDieContentFaces(curDie.faces);
    const totalCombat = countBagTotalCombatFaces();

    const dieTabsHtml = state.diceBag
      .map((d, idx) => {
        const cNum = countDieContentFaces(d.faces);
        return `
          <div class="die-tab ${idx === state.workshopDieIdx ? 'active' : ''}" data-ws-die="${idx}">
            <div>${dieTitle(d)}</div>
            <div style="font-size:10px; opacity:0.8;">${t('die.contentCount', { c: cNum })}</div>
          </div>
        `;
      })
      .join('');

    const slotRowsHtml = curDie.faces
      .map((key, idx) => {
        const tpl = FACE_TEMPLATES[key];
        const meta = CUBE_SLOT_META[idx];
        const isSel = idx === selSlot;
        return `
          <div class="ws-slot-item ${isSel ? 'selected' : ''}" data-ws-slot="${idx}">
            <div style="display:flex; align-items:center; gap:8px;">
              <span style="color:${categoryColor(tpl.category)}; display:flex;">${getSvgIcon(tpl.icon, 18)}</span>
              <div>
                <div style="font-weight:700; font-size:12.5px;">${t('ws.faceNum', { num: meta.num })} ${tplName(tpl)}</div>
                <div style="font-size:11px; color:var(--text-muted);">${t('ws.stdDice', { pair: meta.pairText, cat: categoryLabel(tpl.category) })}</div>
              </div>
            </div>
            <div>
              ${
                !isSel
                  ? `<button class="btn btn-ghost btn-sm" data-swap-with="${idx}">${t('ws.swapWith', { num: selSlot + 1 })}</button>`
                  : `<span class="badge badge-gold">${t('ws.selected')}</span>`
              }
            </div>
          </div>
        `;
      })
      .join('');

    const runeRowsHtml = WORKSHOP_RUNE_KEYS.map((runeKey) => {
      const rune = FACE_TEMPLATES[runeKey];
      const isFreeEmpty = runeKey === 'empty_road';
      const cost = isFreeEmpty ? 0 : state.workshopFreeTokens > 0 ? 0 : rune.shopCost;
      const canAfford = state.hero.gold >= cost;

      const simBag = cloneDiceBag(state.diceBag);
      simBag[state.workshopDieIdx].faces[selSlot] = runeKey;
      const nextContent = countDieContentFaces(simBag[state.workshopDieIdx].faces);
      const nextTotalCombat = countBagTotalCombatFaces(simBag);

      const exceedsContentCap = nextContent > MAX_CONTENT_PER_DIE;
      const violatesCombatFloor = nextTotalCombat < MIN_TOTAL_COMBAT_FACES;
      const alreadySame = curDie.faces[selSlot] === runeKey;
      const disabled = !canAfford || exceedsContentCap || violatesCombatFloor || alreadySame;

      let btnLabel = isFreeEmpty
        ? t('ws.imprintEmpty')
        : state.workshopFreeTokens > 0
          ? t('ws.imprintFree')
          : t('ws.imprintCost', { cost });
      if (alreadySame) btnLabel = t('ws.imprintSame');
      else if (exceedsContentCap) btnLabel = t('ws.imprintCap');
      else if (violatesCombatFloor) btnLabel = t('ws.imprintFloor', { min: MIN_TOTAL_COMBAT_FACES });

      return `
        <div class="ws-rune-item">
          <div style="display:flex; align-items:center; gap:9px;">
            <span style="color:${categoryColor(rune.category)}; display:flex;">${getSvgIcon(rune.icon, 19)}</span>
            <div>
              <div style="font-weight:700; font-size:12.5px;">
                ${tplName(rune)}
                <span class="badge badge-muted" style="margin-left:4px;">${categoryLabel(rune.category)}</span>
              </div>
              <div style="font-size:11.5px; color:var(--text-dim);">${tplDesc(rune)}</div>
            </div>
          </div>
          <button class="btn btn-sm ${disabled ? 'btn-ghost' : 'btn-primary'}" data-imprint-rune="${runeKey}" ${disabled ? 'disabled' : ''}>
            ${btnLabel}
          </button>
        </div>
      `;
    }).join('');

    openModal(
      `
      <h2 class="modal-title">${t('ws.title')} ${isPreview ? t('ws.titlePreview') : t('ws.titleNext', { n: state.stageIdx + 2 })}</h2>
      <p class="modal-sub">${t('ws.sub', {
        gold: state.hero.gold,
        free: state.workshopFreeTokens > 0 ? t('ws.freeToken', { n: state.workshopFreeTokens }) : '',
        combat: totalCombat,
        min: MIN_TOTAL_COMBAT_FACES,
      })}</p>

      <div class="dice-bag-tabs" style="margin-bottom:12px;">${dieTabsHtml}</div>

      <div class="workshop-layout">
        <div>
          <h3 style="font-size:13px; margin-bottom:8px; color:var(--gold);">
            ${t('ws.col1', { die: dieTitle(curDie), c: contentCount, max: MAX_CONTENT_PER_DIE })}
          </h3>
          <div class="ws-face-grid">${slotRowsHtml}</div>
        </div>
        <div>
          <h3 style="font-size:13px; margin-bottom:8px; color:var(--gold);">
            ${t('ws.col2', { face: `${t('ws.faceNum', { num: selSlot + 1 })} ${tplName(selTpl)}` })}
          </h3>
          <div class="ws-shop-list">${runeRowsHtml}</div>
        </div>
      </div>

      <div class="modal-footer">
        ${
          isPreview
            ? `<button class="btn btn-primary" id="btnCloseWorkshopPreview">${t('ws.backBtn')}</button>`
            : `<button class="btn btn-emerald" id="btnProceedNextStage">${t('ws.nextBtn', { n: state.stageIdx + 2 })}</button>`
        }
      </div>
    `,
      [],
      () => openDiceWorkshopModal()
    );

    modalDialog.querySelectorAll('[data-ws-die]').forEach((tab) => {
      tab.onclick = () => {
        state.workshopDieIdx = Number(tab.getAttribute('data-ws-die'));
        state.workshopSelectedSlot = 0;
        openDiceWorkshopModal();
      };
    });

    modalDialog.querySelectorAll('[data-ws-slot]').forEach((el) => {
      el.onclick = (e) => {
        if (e.target.closest('[data-swap-with]')) return;
        state.workshopSelectedSlot = Number(el.getAttribute('data-ws-slot'));
        openDiceWorkshopModal();
      };
    });

    modalDialog.querySelectorAll('[data-swap-with]').forEach((btn) => {
      btn.onclick = (e) => {
        e.stopPropagation();
        const targetIdx = Number(btn.getAttribute('data-swap-with'));
        const a = state.workshopSelectedSlot;
        const arr = curDie.faces;
        const tmp = arr[a];
        arr[a] = arr[targetIdx];
        arr[targetIdx] = tmp;
        state.workshopSelectedSlot = targetIdx;
        sfxRotate();
        renderAll();
        openDiceWorkshopModal();
      };
    });

    modalDialog.querySelectorAll('[data-imprint-rune]').forEach((btn) => {
      btn.onclick = () => {
        const runeKey = btn.getAttribute('data-imprint-rune');
        const rune = FACE_TEMPLATES[runeKey];
        if (runeKey !== 'empty_road') {
          if (state.workshopFreeTokens > 0) {
            state.workshopFreeTokens -= 1;
          } else {
            if (state.hero.gold < rune.shopCost) return;
            state.hero.gold -= rune.shopCost;
          }
        }
        curDie.faces[state.workshopSelectedSlot] = runeKey;
        sfxGood();
        renderAll();
        openDiceWorkshopModal();
      };
    });

    const closeBtn = document.getElementById('btnCloseWorkshopPreview');
    if (closeBtn) {
      closeBtn.onclick = () => {
        closeModal();
        renderAll();
      };
    }
    const nextBtn = document.getElementById('btnProceedNextStage');
    if (nextBtn) {
      nextBtn.onclick = () => initStage(state.stageIdx + 1, false);
    }
  }

  function showHelpModal() {
    openModal(
      `
      <h2 class="modal-title">${t('help.title')}</h2>
      <div class="rules-article">
        <h3>${t('help.h1')}</h3>
        <ul>
          <li>${t('help.h1l1')}</li>
          <li>${t('help.h1l2')}</li>
          <li>${t('help.h1l3')}</li>
        </ul>
        <h3>${t('help.h2')}</h3>
        <ul>
          <li>${t('help.h2l1')}</li>
          <li>${t('help.h2l2')}</li>
          <li>${t('help.h2l3')}</li>
          <li>${t('help.h2l4')}</li>
        </ul>
        <h3>${t('help.h3')}</h3>
        <p>${t('help.h3p')}</p>
      </div>
      <div class="modal-footer">
        <button class="btn btn-primary" id="btnCloseHelp">${t('help.close')}</button>
      </div>
    `,
      [],
      () => showHelpModal()
    );
    document.getElementById('btnCloseHelp').onclick = () => closeModal();
  }

  // =========================================================================
  // 界面渲染
  // =========================================================================
  function inspectFaceOrCell(title, tagText, bodyHtml) {
    document.getElementById('inspectorTitle').textContent = title;
    document.getElementById('inspectorTag').textContent = tagText;
    document.getElementById('inspectorBody').innerHTML = bodyHtml;
  }

  function inspectTemplate(faceKey, contextNote = '') {
    const tpl = FACE_TEMPLATES[faceKey];
    if (!tpl) return;
    if (tpl.category === 'combat') {
      const enemy = scaleEnemyForStage(tpl.baseEnemy, state.stageIdx);
      const reward = scaleRewardForStage(tpl.reward, state.stageIdx);
      const sim = simulateMagicTowerCombat(state.hero, enemy);
      const verdict = sim.survivable
        ? `<span class="ins-safe">${t('ins.verdictOk', { loss: sim.hpLoss, remain: sim.remainHp })}</span>`
        : `<span class="ins-danger">${t('ins.verdictLethal', { loss: sim.hpLoss })}</span>`;

      const lootParts = [];
      if (reward.atk) lootParts.push(t('ins.gainAtk', { v: reward.atk }));
      if (reward.def) lootParts.push(t('ins.gainDef', { v: reward.def }));
      if (reward.hp) lootParts.push(t('ins.gainHp', { v: reward.hp }));
      if (reward.gold) lootParts.push(t('ins.gainGold', { v: reward.gold }));

      inspectFaceOrCell(
        `${tplName(tpl)}${contextNote ? ` · ${contextNote}` : ''}`,
        t('ins.combatTag'),
        `
          <div class="ins-stat-line">
            <span>${t('ins.statLine', { hp: enemy.hp, atk: enemy.atk, def: enemy.def })}</span>
          </div>
          <div>${t('ins.simLine', { dmg: sim.heroHitDmg, hits: sim.hitsToKill, n: sim.enemyAttacks, dmg2: sim.enemyHitDmg })}</div>
          <div>${verdict}</div>
          <div class="ins-highlight">${t('ins.loot', {
            gains: lootParts.join(''),
            extra: tpl.triggersEvent ? t('ins.extraEvent') : '',
          })}</div>
        `
      );
    } else {
      inspectFaceOrCell(
        `${tplName(tpl)}${contextNote ? ` · ${contextNote}` : ''}`,
        categoryLabel(tpl.category),
        `<div>${tplDesc(tpl)}</div>`
      );
    }
  }

  function renderTopAndLeftPanels() {
    const st = STAGES[state.stageIdx];
    const leftCount = getUnusedDiceCount();
    document.getElementById('stageNameText').textContent = t('hud.stageFormat', {
      n: state.stageIdx + 1,
      total: STAGES.length,
      name: objName(st),
    });
    document.getElementById('diceLeftText').textContent = `${leftCount} / ${DICE_PER_STAGE}`;

    const pipsEl = document.getElementById('dicePips');
    pipsEl.innerHTML = '';
    for (let i = 0; i < DICE_PER_STAGE; i++) {
      const d = document.createElement('span');
      d.className = `dice-pip ${state.diceUsed[i] ? 'used' : ''}`;
      pipsEl.appendChild(d);
    }

    const minSteps = minStepsToBossNeighbor(state.playerPos.r, state.playerPos.c);
    document.getElementById('minStepsText').textContent =
      minSteps === 0 ? t('hud.minStepsArrived') : `${minSteps}`;

    document.getElementById('heroGoldBadge').textContent = `${state.hero.gold} ${t('panel.goldUnit')}`;
    document.getElementById('heroHpText').textContent = `${state.hero.hp} / ${state.hero.maxHp}`;
    const hpPct = Math.max(0, Math.min(100, (state.hero.hp / state.hero.maxHp) * 100));
    const hpBar = document.getElementById('heroHpBar');
    hpBar.style.width = `${hpPct}%`;
    hpBar.classList.toggle('low', hpPct <= 35);

    document.getElementById('heroAtkText').textContent = state.hero.atk;
    document.getElementById('heroDefText').textContent = state.hero.def;
    const avoided = countRemainingAvoidedCombats();
    document.getElementById('combatCountText').textContent = `${state.foughtCombats} / ${avoided}`;

    const boss = st.boss;
    const bossSim = simulateMagicTowerCombat(state.hero, boss);
    document.getElementById('bossTitleText').textContent = t('boss.cardTitle', { name: objName(boss) });
    document.getElementById('bossHpText').textContent = boss.hp;
    document.getElementById('bossAtkText').textContent = boss.atk;
    document.getElementById('bossDefText').textContent = boss.def;

    const verdictBadge = document.getElementById('bossVerdictBadge');
    const bossSimText = document.getElementById('bossSimText');
    if (bossSim.survivable) {
      verdictBadge.className = 'badge badge-ok';
      verdictBadge.textContent = t('boss.canWin');
      bossSimText.innerHTML = t('boss.simWin', { loss: bossSim.hpLoss, remain: bossSim.remainHp });
    } else {
      verdictBadge.className = 'badge badge-danger';
      verdictBadge.textContent = t('boss.tooWeak');
      bossSimText.innerHTML = t('boss.simLose', { loss: bossSim.hpLoss, gap: bossSim.hpLoss - state.hero.hp + 1 });
    }

    document.getElementById('logList').innerHTML = state.logs
      .slice(0, 14)
      .map((item) => `<li class="${item.type}">${t(item.key, item.params)}</li>`)
      .join('');
  }

  function renderPhaseControls() {
    document.querySelectorAll('.p-step').forEach((el) => {
      el.classList.toggle('active', el.getAttribute('data-step') === state.phase);
    });

    const descEl = document.getElementById('phaseDescText');
    const ctrlEl = document.getElementById('phaseControls');
    ctrlEl.innerHTML = '';

    if (state.phase === 'ROLL') {
      const die = getActiveDie();
      descEl.textContent = t('phase.rollDesc', { die: dieTitle(die) });
      const btn = document.createElement('button');
      btn.className = 'btn btn-primary';
      btn.textContent = t('phase.rollBtn', { die: dieShort(die) });
      btn.onclick = handleRollDie;
      ctrlEl.appendChild(btn);
    } else if (state.phase === 'PLACE') {
      const bNum = state.rolledBottomId + 1;
      const bTpl = getActiveFaceTpl(state.rolledBottomId);
      descEl.textContent = t('phase.placeDesc', { num: bNum, face: tplShort(bTpl) });

      const rotCCW = document.createElement('button');
      rotCCW.className = 'btn btn-sm';
      rotCCW.textContent = t('phase.rotCCW');
      rotCCW.onclick = () => rotatePlacedDie(-1);

      const rotCW = document.createElement('button');
      rotCW.className = 'btn btn-sm';
      rotCW.textContent = t('phase.rotCW');
      rotCW.onclick = () => rotatePlacedDie(1);

      ctrlEl.append(rotCCW, rotCW);
    } else if (state.phase === 'UNFOLD') {
      const count = state.unfolded.length;
      descEl.textContent = count < 6 ? t('phase.unfoldDesc', { count }) : t('phase.unfoldDone');

      const btnCCW = document.createElement('button');
      btnCCW.className = 'btn btn-sm';
      btnCCW.textContent = t('phase.rotCCW');
      btnCCW.onclick = () => rotatePlacedDie(-1);

      const btnCW = document.createElement('button');
      btnCW.className = 'btn btn-sm';
      btnCW.textContent = t('phase.rotCW');
      btnCW.onclick = () => rotatePlacedDie(1);

      const btnUndo = document.createElement('button');
      btnUndo.className = 'btn btn-ghost btn-sm';
      btnUndo.textContent = t('phase.undo');
      btnUndo.onclick = undoLastUnfoldStep;

      const btnReset = document.createElement('button');
      btnReset.className = 'btn btn-ghost btn-sm';
      btnReset.textContent = t('phase.reset');
      btnReset.disabled = count <= 1;
      btnReset.onclick = resetUnfoldToAnchor;

      const btnReanchor = document.createElement('button');
      btnReanchor.className = 'btn btn-ghost btn-sm';
      btnReanchor.textContent = t('phase.reanchor');
      btnReanchor.onclick = reselectAnchor;

      const btnConfirm = document.createElement('button');
      btnConfirm.className = 'btn btn-emerald';
      btnConfirm.textContent = t('phase.confirm');
      btnConfirm.disabled = count !== 6;
      btnConfirm.onclick = confirmUnfoldedRoad;

      ctrlEl.append(btnCCW, btnCW, btnUndo, btnReset, btnReanchor, btnConfirm);
    } else if (state.phase === 'MOVE') {
      const adjBoss = isAdjacentToBoss(state.playerPos.r, state.playerPos.c);
      const trappedNext = !adjBoss && !hasEmptyGridNeighbor(state.playerPos.r, state.playerPos.c);

      if (adjBoss) {
        descEl.textContent = t('phase.moveBoss');
      } else if (!state.hasMovedThisTurn) {
        descEl.textContent = t('phase.moveStart');
      } else if (trappedNext) {
        descEl.textContent = t('phase.moveTrapped');
      } else {
        descEl.textContent = t('phase.moveGo');
      }

      if (adjBoss) {
        const btnBoss = document.createElement('button');
        btnBoss.className = 'btn btn-crimson';
        btnBoss.textContent = t('phase.bossBtn');
        btnBoss.onclick = () => triggerBossBattle();
        ctrlEl.appendChild(btnBoss);
      } else {
        const btnEndMove = document.createElement('button');
        btnEndMove.className = 'btn btn-primary';
        btnEndMove.textContent = getUnusedDiceCount() > 0 ? t('phase.endMove') : t('phase.endMoveLast');
        btnEndMove.disabled =
          !state.hasMovedThisTurn || state.isWalking || (trappedNext && getReachableForwardPaths().size > 0);
        btnEndMove.onclick = endMovementTurn;
        ctrlEl.appendChild(btnEndMove);
      }
    }
  }

  function renderBoard() {
    const gridEl = document.getElementById('gridBoard');
    gridEl.innerHTML = '';

    const placeCandidates = state.phase === 'PLACE' ? getPlacementCandidates() : [];
    const placeMap = new Map(placeCandidates.map((p) => [`${p.r},${p.c}`, p]));

    const unfoldedMap = new Map();
    state.unfolded.forEach((u, idx) => unfoldedMap.set(`${u.r},${u.c}`, { ...u, idx }));

    const ghostMap = getGhostUnfoldMap();
    const reachablePaths = getReachableForwardPaths();

    for (let r = 0; r < GRID_SIZE; r++) {
      for (let c = 0; c < GRID_SIZE; c++) {
        const key = `${r},${c}`;
        const cell = state.board[r][c];
        const div = document.createElement('div');
        div.className = 'grid-cell';
        div.setAttribute('data-cell-key', key);

        // 1. 走廊连接桥
        for (const dir of DIR_ORDER) {
          if (cell.links[dir]) {
            const link = document.createElement('span');
            const isBossDoor =
              cell.kind === 'boss' ||
              (inBounds(r + DIRS[dir].dr, c + DIRS[dir].dc) &&
                state.board[r + DIRS[dir].dr][c + DIRS[dir].dc].kind === 'boss');
            link.className = `corridor-link dir-${dir} ${isBossDoor ? 'boss-link' : ''}`;
            div.appendChild(link);
          }
        }

        // 2. 格面基础内容
        if (cell.kind === 'empty' && !unfoldedMap.has(key) && !ghostMap.has(key) && !placeMap.has(key)) {
          div.innerHTML += `<span class="coord-tag">${r},${c}</span>`;
        }

        if (cell.kind === 'start') {
          div.classList.add('cell-start');
          div.innerHTML += `
            <div class="tile-icon-wrap" style="color:var(--cyan)">${getSvgIcon('start', 21)}</div>
            <span class="tile-short-label">${t('grid.start')}</span>
          `;
        } else if (cell.kind === 'boss') {
          div.classList.add('cell-boss');
          const boss = STAGES[state.stageIdx].boss;
          const bossSim = simulateMagicTowerCombat(state.hero, boss);
          div.innerHTML += `
            <span class="dmg-badge ${bossSim.survivable ? 'safe' : 'lethal'}">-${bossSim.hpLoss}</span>
            <div class="tile-icon-wrap" style="color:#ff6b7a">${getSvgIcon('boss', 22)}</div>
            <span class="tile-short-label">${t('grid.boss')}</span>
          `;
          div.onmouseenter = () => {
            inspectFaceOrCell(
              t('ins.bossTitle', { name: objName(boss) }),
              t('ins.bossTag'),
              `
                <div class="ins-stat-line">
                  <span>HP <b>${boss.hp}</b></span>
                  <span>ATK <b>${boss.atk}</b></span>
                  <span>DEF <b>${boss.def}</b></span>
                </div>
                <div>${isJa() && boss.descJa ? boss.descJa : boss.desc}</div>
                <div class="${bossSim.survivable ? 'ins-safe' : 'ins-danger'}">
                  ${t('ins.bossLine', { loss: bossSim.hpLoss })}
                </div>
              `
            );
          };
        } else if (cell.kind === 'road') {
          const tpl = FACE_TEMPLATES[cell.faceKey];
          div.classList.add('cell-road', `type-${tpl.category}`);
          if (cell.visited) div.classList.add('visited');

          if (cell.faceNum) {
            div.innerHTML += `<span class="face-num-chip">${cell.faceNum}</span>`;
          }

          if (tpl.category === 'empty_road') {
            div.innerHTML += `
              <span class="tile-short-label" style="color:${cell.visited ? 'var(--text-muted)' : '#8fa3c7'}; font-weight:500;">
                ${cell.visited ? '' : t('grid.empty')}
              </span>
            `;
          } else {
            if (!cell.visited && tpl.category === 'combat') {
              const sim = simulateMagicTowerCombat(state.hero, scaleEnemyForStage(tpl.baseEnemy, state.stageIdx));
              const cls = !sim.survivable ? 'lethal' : sim.hpLoss >= 25 ? 'warn' : 'safe';
              div.innerHTML += `<span class="dmg-badge ${cls}">-${sim.hpLoss}</span>`;
            }
            div.innerHTML += `
              <div class="tile-icon-wrap" style="color:${categoryColor(tpl.category)}">${getSvgIcon(tpl.icon, 20)}</div>
              <span class="tile-short-label">${cell.visited ? t('grid.settled') : tplShort(tpl)}</span>
            `;
          }
          div.onmouseenter = () =>
            inspectTemplate(
              cell.faceKey,
              t('ins.roadCtx', {
                num: cell.faceNum,
                state: cell.visited ? t('ins.roadVisited') : t('ins.roadUnvisited'),
              })
            );
        }

        // 3. 放置底面候选格
        if (placeMap.has(key)) {
          const cand = placeMap.get(key);
          const bKey = getActiveFaceKey(state.rolledBottomId);
          const bNum = state.rolledBottomId + 1;
          if (cand.valid) {
            div.classList.add('place-candidate');
            div.innerHTML += `
              <span class="face-num-chip">${bNum}</span>
              <span class="tile-short-label" style="color:var(--gold)">${t('grid.placeHint', { num: bNum })}</span>
            `;
            div.onclick = () => placeAnchorAt(r, c);
            div.onmouseenter = () => inspectTemplate(bKey, t('ins.placeCtx', { num: bNum }));
          } else {
            div.classList.add('place-blocked');
            div.innerHTML += `<span class="tile-short-label" style="color:#ff7a7a">${t('grid.blocked')}</span>`;
          }
        }

        // 4. 正在展开的骰面与幽灵候选格
        if (unfoldedMap.has(key)) {
          const u = unfoldedMap.get(key);
          const fKey = getActiveFaceKey(u.faceId);
          const tpl = FACE_TEMPLATES[fKey];
          const fNum = u.faceId + 1;
          const isCursor = u.idx === state.unfoldCursorIdx;
          const leaf = isUnfoldedLeaf(u.idx);

          div.classList.add('unfolding-placed', `type-${tpl.category}`);
          if (u.idx === 0) div.classList.add('is-anchor');
          if (isCursor) div.classList.add('unfold-cursor-active');
          if (leaf) div.classList.add('can-undo-leaf');

          // 预览所有正交相邻连通桥
          for (const dir of DIR_ORDER) {
            const nr = r + DIRS[dir].dr;
            const nc = c + DIRS[dir].dc;
            if (!inBounds(nr, nc)) continue;
            const nKey = `${nr},${nc}`;
            if (unfoldedMap.has(nKey) || isPassableKind(state.board[nr][nc].kind)) {
              const isBossAdj = state.board[nr][nc].kind === 'boss';
              div.innerHTML += `<span class="corridor-link ${isBossAdj ? 'boss-link' : 'preview-link'} dir-${dir}"></span>`;
            }
          }

          div.innerHTML += `<span class="face-num-chip">${fNum}</span>`;

          if (tpl.category === 'combat') {
            const sim = simulateMagicTowerCombat(state.hero, scaleEnemyForStage(tpl.baseEnemy, state.stageIdx));
            const cls = !sim.survivable ? 'lethal' : sim.hpLoss >= 25 ? 'warn' : 'safe';
            div.innerHTML += `<span class="dmg-badge ${cls}">-${sim.hpLoss}</span>`;
          }

          if (tpl.category === 'empty_road') {
            div.innerHTML += `<span class="tile-short-label" style="color:#b8c8e6">${t('grid.empty')}</span>`;
          } else {
            div.innerHTML += `
              <div class="tile-icon-wrap" style="color:${categoryColor(tpl.category)}">${getSvgIcon(tpl.icon, 20)}</div>
              <span class="tile-short-label">${tplShort(tpl)}</span>
            `;
          }

          if (u.idx === 0) {
            div.innerHTML += `<span class="anchor-tag">${t('grid.anchor')}</span>`;
          }

          div.onmouseenter = () =>
            inspectTemplate(
              fKey,
              isCursor ? t('ins.cursorCtx', { num: fNum }) : t('ins.leafCtx', { num: fNum })
            );

          div.onclick = () => {
            if (state.unfoldCursorIdx !== u.idx) {
              state.unfoldCursorIdx = u.idx;
              sfxRotate();
              renderAll();
            } else if (leaf) {
              removeUnfoldedLeaf(u.idx);
            }
          };
        } else if (ghostMap.has(key)) {
          const g = ghostMap.get(key);
          const fKey = getActiveFaceKey(g.faceId);
          const tpl = FACE_TEMPLATES[fKey];
          const fNum = g.faceId + 1;
          div.classList.add('unfold-ghost');
          if (!g.completable) div.classList.add('dead-branch-ghost');

          div.innerHTML += `<span class="face-num-chip">${fNum}</span>`;

          if (tpl.category === 'combat') {
            const sim = simulateMagicTowerCombat(state.hero, scaleEnemyForStage(tpl.baseEnemy, state.stageIdx));
            const cls = !sim.survivable ? 'lethal' : sim.hpLoss >= 25 ? 'warn' : 'safe';
            div.innerHTML += `<span class="dmg-badge ${cls}">-${sim.hpLoss}</span>`;
          }

          if (tpl.category === 'empty_road') {
            div.innerHTML += `<span class="tile-short-label" style="color:#9ad8f5">${t('grid.empty')}</span>`;
          } else {
            div.innerHTML += `
              <div class="tile-icon-wrap" style="color:${categoryColor(tpl.category)}; opacity:0.88">${getSvgIcon(tpl.icon, 18)}</div>
              <span class="tile-short-label" style="color:#bdeaff">${tplShort(tpl)}</span>
            `;
          }

          div.onmouseenter = () =>
            inspectTemplate(
              fKey,
              g.completable ? t('ins.ghostCtx', { num: fNum }) : t('ins.ghostDead', { num: fNum })
            );

          if (g.completable) {
            div.onclick = () => {
              state.unfolded.push({
                faceId: g.faceId,
                r: g.r,
                c: g.c,
                orientation: g.orientation,
                parentIndex: g.parentIndex,
                dirFromParent: g.dirFromParent,
              });
              state.unfoldCursorIdx = state.unfolded.length - 1;
              sfxFold();
              renderAll();
            };
          }
        }

        // 5. 移动阶段可达格（悬停高亮行进路线）
        if (reachablePaths.has(key)) {
          div.classList.add(cell.kind === 'boss' ? 'move-boss-ready' : 'move-reachable');
          const hoverPath = reachablePaths.get(key);
          div.addEventListener('mouseenter', () => {
            gridEl.querySelectorAll('.move-path-hover').forEach((el) => el.classList.remove('move-path-hover'));
            hoverPath.forEach((step) => {
              const stepEl = gridEl.querySelector(`[data-cell-key="${step.r},${step.c}"]`);
              if (stepEl) stepEl.classList.add('move-path-hover');
            });
          });
          div.addEventListener('mouseleave', () => {
            gridEl.querySelectorAll('.move-path-hover').forEach((el) => el.classList.remove('move-path-hover'));
          });
          div.onclick = () => handleMoveTargetClick(r, c);
        }

        // 6. 勇者棋子
        if (state.playerPos.r === r && state.playerPos.c === c) {
          const token = document.createElement('div');
          token.className = 'hero-token';
          token.textContent = '勇';
          div.appendChild(token);
        }

        gridEl.appendChild(div);
      }
    }
  }

  function renderRightCubeAndCrossShowcase() {
    const activeDie = getActiveDie();
    document.getElementById('activeDieTitle').textContent = t('die.titleFormat', { die: dieTitle(activeDie) });

    // 1. 骰子切换栏
    const tabsEl = document.getElementById('diceBagTabs');
    tabsEl.innerHTML = '';
    state.diceBag.forEach((d, idx) => {
      const tab = document.createElement('div');
      tab.className = `die-tab ${idx === state.activeDieIdx ? 'active' : ''} ${state.diceUsed[idx] && state.phase === 'ROLL' ? 'used' : ''}`;
      tab.textContent = dieShort(d);
      tab.title =
        state.phase === 'ROLL' && !state.diceUsed[idx]
          ? t('die.switchTip', { die: dieTitle(d) })
          : dieTitle(d);
      if (state.phase === 'ROLL' && !state.diceUsed[idx]) {
        tab.onclick = () => {
          state.activeDieIdx = idx;
          sfxRotate();
          renderAll();
        };
      }
      tabsEl.appendChild(tab);
    });

    // 2. 十字展开图朝向
    const isPreRollView = state.phase === 'ROLL' || state.rolledBottomId === null;
    const ori = isPreRollView
      ? getBaseOrientationForBottom(0)
      : state.unfolded.length > 0
        ? state.unfolded[0].orientation
        : getCurrentAnchorOrientation();

    const badge = document.getElementById('rolledBottomBadge');
    const crossModeLabel = document.getElementById('crossModeLabel');
    const progressEl = document.getElementById('unfoldProgressText');

    if (isPreRollView) {
      badge.textContent = t('die.preRollBadge');
      badge.className = 'badge badge-accent';
      crossModeLabel.textContent = t('die.crossPreLabel');
      const contentFaces = countDieContentFaces(activeDie.faces);
      progressEl.textContent = t('die.progressPre', { c: contentFaces, e: 6 - contentFaces });
    } else {
      const bNum = state.rolledBottomId + 1;
      const bf = getActiveFaceTpl(state.rolledBottomId);
      badge.textContent = t('die.bottomBadge', { num: bNum, face: tplShort(bf) });
      badge.className = 'badge badge-gold';
      crossModeLabel.textContent = t('die.crossCurLabel');
      progressEl.textContent =
        state.phase === 'UNFOLD'
          ? t('die.progressUnfold', { n: state.unfolded.length })
          : t('die.progressDone');
    }

    const unfoldedIds = new Set(state.unfolded.map((u) => u.faceId));
    const crossLayout = [
      null,
      { slot: 'north', posHint: isPreRollView ? '' : t('c.north').slice(0, 1) },
      null,
      { slot: 'west', posHint: isPreRollView ? '' : t('c.west').slice(0, 1) },
      { slot: 'down', posHint: isPreRollView ? '' : t('grid.anchor') },
      { slot: 'east', posHint: isPreRollView ? '' : t('c.east').slice(0, 1) },
      null,
      { slot: 'south', posHint: isPreRollView ? '' : t('c.south').slice(0, 1) },
      null,
      null,
      { slot: 'up', posHint: isPreRollView ? '' : t('slot.up').slice(0, 1) },
      null,
    ];

    const crossGrid = document.getElementById('miniCrossGrid');
    crossGrid.innerHTML = '';
    crossLayout.forEach((item) => {
      const card = document.createElement('div');
      if (!item) {
        card.className = 'cross-face-card empty-pad';
        crossGrid.appendChild(card);
        return;
      }
      const fId = ori[item.slot];
      const fNum = fId + 1;
      const fKey = activeDie.faces[fId];
      const tpl = FACE_TEMPLATES[fKey];
      const isEmptyRoad = tpl.category === 'empty_road';
      const isCenter = item.slot === 'down' && !isPreRollView;
      const isPlaced = unfoldedIds.has(fId);

      card.className = [
        'cross-face-card',
        isEmptyRoad ? 'is-empty-face' : '',
        isCenter ? 'slot-center-bottom' : '',
        isPlaced ? 'slot-unfolded' : '',
      ].join(' ');

      let dmgText = item.posHint;
      if (tpl.category === 'combat') {
        const sim = simulateMagicTowerCombat(state.hero, scaleEnemyForStage(tpl.baseEnemy, state.stageIdx));
        dmgText = `-${sim.hpLoss}`;
      }

      card.innerHTML = `
        <span class="cf-num-badge">${fNum}</span>
        <span class="cf-pos-hint" style="${tpl.category === 'combat' ? 'color:#ff8585;font-weight:700;' : ''}">${dmgText}</span>
        ${
          isEmptyRoad
            ? `<span class="cf-title" style="color:#6e82a8; font-weight:500; margin-top:6px;">${t('grid.empty')}</span>`
            : `
              <span style="color:${categoryColor(tpl.category)}; display:flex; margin-top:4px;">${getSvgIcon(tpl.icon, 18)}</span>
              <span class="cf-title" style="color:${categoryColor(tpl.category)}">${tplShort(tpl)}</span>
            `
        }
      `;
      card.onmouseenter = () =>
        inspectTemplate(fKey, t('ins.crossCtx', { die: dieTitle(activeDie), num: fNum, opp: 7 - fNum }));
      crossGrid.appendChild(card);
    });

    // 3. 3D 辅助立体骰子
    const cubeEl = document.getElementById('cube3d');
    cubeEl.querySelectorAll('.cube-face').forEach((faceEl) => {
      const slot = faceEl.getAttribute('data-cube-slot');
      const faceId = ori[slot];
      const fNum = faceId + 1;
      const tpl = FACE_TEMPLATES[activeDie.faces[faceId]];
      faceEl.classList.toggle('is-bottom-slot', slot === 'down' && !isPreRollView);
      faceEl.innerHTML = `
        <span class="cf-dir">[${fNum}]</span>
        <span style="color:${categoryColor(tpl.category)}; display:flex;">${getSvgIcon(tpl.icon, 18)}</span>
        <span class="cf-name" style="color:${tpl.category === 'empty_road' ? '#7b8fb5' : 'var(--text-main)'}">${tplShort(tpl)}</span>
      `;
    });

    // 4. 键位速查 + 反全规避实时统计
    let remainingNonCombat = 0;
    state.diceBag.forEach((d, idx) => {
      const includeThis =
        !state.diceUsed[idx] ||
        (idx === state.activeDieIdx && (state.phase === 'PLACE' || state.phase === 'UNFOLD'));
      if (includeThis) {
        remainingNonCombat += d.faces.filter((k) => FACE_TEMPLATES[k].category !== 'combat').length;
      }
    });
    const distNeeded = minStepsToBossNeighbor(state.playerPos.r, state.playerPos.c);

    document.getElementById('guardMetrics').innerHTML = `
      <div class="kbd-hint-box">
        <div><span class="kbd-chip">Space</span> ${t('guard.kbd1')}</div>
        <div><span class="kbd-chip">↑ ↓ ← →</span> ${t('guard.kbd2')}</div>
        <div><span class="kbd-chip">Q</span> <span class="kbd-chip">E</span> ${t('guard.kbd3')} &nbsp;·&nbsp; <span class="kbd-chip">Z</span> ${t('guard.kbd4')}</div>
      </div>
      <div class="guard-stat-row">
        <span>${t('guard.statMax')}</span>
        <b style="color:${remainingNonCombat < distNeeded ? 'var(--amber)' : 'var(--emerald)'}">${remainingNonCombat} ${t('guard.unit')}</b>
      </div>
      <div class="guard-stat-row">
        <span>${t('guard.statNeed')}</span>
        <b>${distNeeded} ${t('guard.unit')}</b>
      </div>
      <p style="font-size:11.5px; line-height:1.38;">
        ${t('guard.note', { n: 24 - countBagTotalCombatFaces() })}
      </p>
    `;
  }

  function renderAll() {
    renderTopAndLeftPanels();
    renderPhaseControls();
    renderBoard();
    renderRightCubeAndCrossShowcase();
  }

  // =========================================================================
  // 语言切换
  // =========================================================================
  function toggleLanguage() {
    const next = window.I18N.lang === 'ja' ? 'zh' : 'ja';
    window.I18N.setLang(next);
    if (state.modalReopen) {
      state.modalReopen();
    } else {
      closeModal();
    }
    renderAll();
  }

  // =========================================================================
  // 键盘与顶部按钮
  // =========================================================================
  document.getElementById('btnLang').onclick = toggleLanguage;
  document.getElementById('btnHelp').onclick = showHelpModal;
  document.getElementById('btnPreviewWorkshop').onclick = () => {
    state.workshopPreviewOnly = true;
    state.workshopDieIdx = state.activeDieIdx;
    state.workshopSelectedSlot = 0;
    openDiceWorkshopModal();
  };
  document.getElementById('btnRestartStage').onclick = () => initStage(state.stageIdx, true);
  document.getElementById('btnNewRun').onclick = () => startNewRun();

  document.getElementById('gridBoard').addEventListener('contextmenu', (e) => {
    if (state.phase === 'UNFOLD') {
      e.preventDefault();
      undoLastUnfoldStep();
    }
  });

  function mapKeyToDir(e) {
    switch (e.key) {
      case 'ArrowUp':
      case 'w':
      case 'W':
        return 'north';
      case 'ArrowDown':
      case 's':
      case 'S':
        return 'south';
      case 'ArrowLeft':
      case 'a':
      case 'A':
        return 'west';
      case 'ArrowRight':
      case 'd':
      case 'D':
        return 'east';
      default:
        return null;
    }
  }

  window.addEventListener('keydown', (e) => {
    if (!modalBackdrop.classList.contains('hidden')) {
      if (['1', '2', '3'].includes(e.key)) {
        const idx = Number(e.key) - 1;
        const fn = state.activeModalChoices[idx];
        if (typeof fn === 'function') {
          e.preventDefault();
          fn();
        }
      }
      return;
    }

    const dir = mapKeyToDir(e);
    if (dir) {
      e.preventDefault();
      if (state.phase === 'PLACE') {
        placeAnchorByDir(dir);
      } else if (state.phase === 'UNFOLD') {
        handleArrowUnfold(dir);
      } else if (state.phase === 'MOVE') {
        handleArrowMove(dir);
      }
      return;
    }

    const key = e.key.toLowerCase();
    if (key === 'q') {
      rotatePlacedDie(-1);
    } else if (key === 'e') {
      rotatePlacedDie(1);
    } else if (key === 'z' || e.key === 'Backspace') {
      if (state.phase === 'UNFOLD') {
        e.preventDefault();
        undoLastUnfoldStep();
      }
    } else if (e.code === 'Space') {
      e.preventDefault();
      if (state.phase === 'ROLL') {
        handleRollDie();
      } else if (state.phase === 'UNFOLD' && state.unfolded.length === 6) {
        confirmUnfoldedRoad();
      } else if (state.phase === 'MOVE') {
        if (isAdjacentToBoss(state.playerPos.r, state.playerPos.c)) {
          triggerBossBattle();
        } else if (state.hasMovedThisTurn) {
          endMovementTurn();
        }
      }
    }
  });

  // 启动：应用静态 i18n 标签 + 新开局
  window.I18N.applyStatic();
  startNewRun();
})();
