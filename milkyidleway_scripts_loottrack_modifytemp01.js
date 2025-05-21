// ==UserScript==
// @name         Milkyway Idle - Current Loot Tracker
// @namespace    https://milkywayidle.com/
// @version      2.1
// @description  Tracks loot with overlay, total coin value via ask prices, improved UI/CSS, and fixed display logic.
// @match        https://www.milkywayidle.com/*
// @grant        none
// @license      MIT
// @downloadURL https://update.greasyfork.cc/scripts/531302/Milkyway%20Idle%20-%20Current%20Loot%20Tracker.user.js
// @updateURL https://update.greasyfork.cc/scripts/531302/Milkyway%20Idle%20-%20Current%20Loot%20Tracker.meta.js
// ==/UserScript==

//BigKitten改自Current Loot Tracker插件, 做了以下改变:
//主要改变:
//a1.原物品排序位按获取的数量排序; 改为按照物品价格排序, 金币固定位第一位, 物品价格需联网取自: https://raw.githubusercontent.com/holychikenz/MWIApi/main/medianmarket.json;
//a2.原物品面板只显示1个人的物品, 按下顶部的1至3个人的姓名面板进行切换; 改为同时显示3个人的物品, 顶部姓名面板目前无用但不取消;
//a3.增加快捷键反引号"`", 即数字键1左边的按键, 可以快捷开启和关闭面板;
//a4.增加快捷键"\", 即回车键上方的按键, 可快速自动按下顶部所有角色的姓名, 效果会清理目前所有角色获取物品的+1+2+3等号;
//a5.增加物品图标, 在原本的物品名称前增加图标;
//a6.增加中文物品名, 物品的名称由英文改为中文;
//次要改变:
//b1.获取物品的+1+2+3+n符号取消闪烁效果, 从蓝色改为绿色;
//b2.高于100k的物品使用橙色标记
//尚未完成
//c1.获取的每一行物品的价格需要跟在每一行物品数量的后方.

(function () {
  "use strict";

  const playerLootData = {};
  const previousLootCounts = {};
  const lastBattleLoot = {};
  let myPlayerName = null;
  let activePlayer = null;
  let selfTabSelected = false;
  let isMinimized = localStorage.getItem("lootOverlayMinimized") === "true";
  let isLootListMinimized =
    localStorage.getItem("lootListMinimized") === "true";
  let overlayReady = false;
  let marketData = {};

  //定时器, 定期点击3个角色面板, 刷新所有的+号
  //let autoSwitchTimeout = null;

  // 在全局作用域添加颜色索引变量
  let colorIndex = 0; // 新增

  fetch(
    "https://raw.githubusercontent.com/holychikenz/MWIApi/main/medianmarket.json"
  )
    .then((response) => {
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      return response.json();
    })
    .then((data) => {
      marketData = data;
      console.log("[LootTracker] Market data loaded successfully.");
      if (activePlayer && document.getElementById("lootOverlay")) {
        updateLootDisplay(activePlayer);
      }
    })
    .catch((err) =>
      console.error("[LootTracker] Failed to load market data:", err)
    );

  function formatGold(value) {
    const numValue = Number(value) || 0;
    return Math.round(numValue).toLocaleString() + "";
  }

  function detectPlayerName() {
    const nameDiv =
      document.querySelector(".CharacterStatus_playerName__XXXXX") ||
      document.querySelector(".CharacterName_name__1amXp[data-name]");

    if (nameDiv) {
      myPlayerName = nameDiv.dataset.name || nameDiv.textContent.trim();
      if (
        overlayReady &&
        myPlayerName &&
        playerLootData[myPlayerName] &&
        !selfTabSelected
      ) {
        selfTabSelected = true;
        switchTab(myPlayerName);
      }
    } else {
      setTimeout(detectPlayerName, 1000);
    }
  }

  function createOverlay() {
    if (overlayReady || document.getElementById("lootOverlay")) return;
    overlayReady = true;

    const panel = document.createElement("div");
    panel.id = "lootOverlay";
    panel.style.top = localStorage.getItem("lootOverlayTop") || "100px";
    panel.style.left = localStorage.getItem("lootOverlayLeft") || "20px";

    panel.innerHTML = `
        <div id="lootHeader">
          <span id="lootTitle">📦 Current Loot</span>
          <div id="lootHeaderButtons">
            <button id="lootExportBtn" class="loot-btn" data-tooltip="Export current player's loot as CSV">CSV</button>
            <button id="lootClearBtn" class="loot-btn" data-tooltip="Close Plugin">×</button>
            <button id="lootMinBtn" class="loot-btn" data-tooltip="Minimize/Restore Overlay">
              ${isMinimized ? "+" : "−"}
            </button>
          </div>
        </div>
        <div id="lootContent">
          <div id="lootTabs"></div>
          <div id="lootToggleHeader">
          </div>
          <div id="columnsContainer">  <!-- 新增横向容器 -->
              <div id="lootTotals"></div>
          </div>
          <div id="lootBottomDragger">
            <div class="drag-spacer"></div>
          </div>
        </div>
      `;

    document.body.appendChild(panel);

    const style = document.createElement("style");
    style.textContent = `
        #lootOverlay {
          position: fixed;
          width: auto;
          min-width: 320px; /* 最小宽度保证基本可用性 */
          max-width: 95vw;  /* 最大不超过视口宽度的95% */
          /* right: 20px;      添加右侧定位 */
          background: rgba(30, 30, 30, 0.95);
          color: #fff;
          font-family: monospace;
          font-size: 13px;
          border: 1px solid #555;
          border-radius: 8px;
          z-index: 99999;
          user-select: none;
          box-shadow: 0 4px 10px rgba(0,0,0,0.4);
        }
        #lootHeader {
          display: flex; justify-content: space-between; align-items: center;
          padding: 6px 10px; background: rgba(20, 20, 20, 0.85);
          border-bottom: 1px solid #333; border-radius: 8px 8px 0 0; cursor: move;
        }
        #lootTitle { font-weight: bold; }
        #lootHeaderButtons { display: flex; gap: 4px; }
        .loot-btn {
          background: none; border: none; color: #aaa; cursor: pointer;
          font-size: 14px; padding: 0 3px; position: relative;
        }
        .loot-btn:hover { color: #fff; }
        .loot-btn:hover::after {
          content: attr(data-tooltip); position: absolute; left: 50%; top: 110%;
          transform: translateX(-50%); background: #222; color: #fff; padding: 4px 8px;
          font-size: 11px; border-radius: 4px; white-space: nowrap; opacity: 0.95;
          pointer-events: none; z-index: 100000;
        }
        #lootContent {
          overflow: hidden; transition: max-height 0.3s ease-out, opacity 0.3s ease-out;
          will-change: max-height, opacity;
        }
        #lootTabs {
          display: flex; flex-wrap: wrap; padding: 5px 10px; gap: 6px;
          border-bottom: 1px solid #333; background: rgba(24, 24, 24, 0.8); min-height: 26px;
        }
        #lootTabs button {
          background: none; border: 1px solid #444; color: #aaa; padding: 2px 6px;
          font-family: monospace; cursor: pointer; border-radius: 4px; font-size: 12px;
          transition: background-color 0.2s, color 0.2s, border-color 0.2s;
        }
        #lootTabs button:hover { background-color: #555; color: #fff; }
        #lootTabs button.active {
          background: #4caf50; color: #fff; border-color: #4caf50; font-weight: bold;
        }
        #lootToggleHeader {
          padding: 6px 10px; cursor: pointer; font-weight: bold; border-bottom: 1px solid #333;
          background: rgba(28, 28, 28, 0.8);
        }
        #lootToggleHeader:hover { background: rgba(40, 40, 40, 0.9); }
        #lootToggleIcon { display: inline-block; transition: transform 0.2s ease-out; margin-left: 5px; }
        #lootBottomDragger {
          padding: 6px 10px; cursor: move; border-top: 1px solid #444;
          background: rgba(20, 20, 20, 0.85); border-radius: 0 0 8px 8px;
        }
        #lootRevenueLine {
          font-weight: bold; color: gold; cursor: inherit; padding-bottom: 4px;
          white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
        }
        .drag-spacer { height: 8px; cursor: inherit; }
        @keyframes lootFlashText { 0% { color: #b6ffb8; transform: scale(1.02); } 100% { color: white; transform: scale(1); } }
        .flashLoot { animation: lootFlashText 1s ease-out; }

        .fadeGain {
          color: lime; font-weight: bold; font-size: 10px; vertical-align: super;
          /* opacity: 1; transition: opacity 2s ease-out; */
          margin-left: 3px; display: inline-block;
        }

        .persistent-gain {
          color: #00ff00;
          font-weight: bold;
          animation: persistentPulse 10s infinite;
        }

        /* 横向布局容器 */
        #columnsContainer {
          overflow-x: auto;
          overflow-y: auto; /* 纵向滚动 */
          padding: 0 10px;
          max-height: 160vh;
          max-width: calc(100vw - 60px); /* 根据视口动态计算 */
        }

        #lootTotals {
          overflow-y: visible; /* 取消纵向滚动 */
          max-height: none !important; /* 移除高度限制 */
          display: flex;
          gap: 20px;
          padding: 10px 5px;
          min-width: fit-content; /* 确保宽度足够 */
          flex-wrap: nowrap; /* 禁止换行 */
        }

        /* 单个玩家列 */
        .player-column {
          min-width: 220px;  /* 最小列宽 */
          flex-shrink: 0;    /* 禁止列压缩 */
          background: rgba(40,40,40,0.3);
          border-radius: 6px;
          padding: 8px;
          border: 1px solid #444;
          height: fit-content; /* 高度自适应 */
        }

        .player-header {
          font-weight: bold;
          color: #4caf50;
          margin-bottom: 8px;
          padding: 4px;
          text-align: center;
          position: sticky;
          left: 0;
        }

        /* 物品列表 */
        .item-list {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        /* 响应式调整 */
        @media (max-width: 600px) {
          .player-column {
            min-width: 180px;
          }
        }

        /* 新增玩家区块样式 */
        .player-section {
          margin-bottom: 15px;
          border-bottom: 1px solid #444;
          padding-bottom: 10px;
          background: rgba(40, 40, 40, 0.2);
          border-radius: 4px;
          padding: 8px;
        }

        .player-section:last-child {
          margin-bottom: 0;
          border-bottom: none;
        }

        .player-header {
          font-weight: bold;
          color: #4caf50;
          margin: -4px 0 6px 0;
          padding: 4px 8px;
          background: rgba(76, 175, 80, 0.1);
          border-radius: 4px;
          display: inline-block;
          border: 1px solid rgba(76, 175, 80, 0.3);
        }

        /* 调整总容器高度 */
        #lootTotals {
          max-height: 80vh !important; /* 占据视口60%高度 */
          overflow-y: auto;
        }

        .item-name {
          color: #eee;
        }

        .item-count {
          color: #4caf50;
          float: right;
      }

        /* 物品行细节 */
        .item-row {
          display: flex;
          justify-content: space-between;
          padding: 4px 8px;
          background: rgba(50, 50, 50, 0.3);
          border-radius: 4px;
          transition: background 0.2s;
        }

        .item-row:hover {
          background: rgba(80, 80, 80, 0.4);
        }

        .item-name {
          color: #ddd;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        /* 调整图标尺寸 */
        .item-icon {
          width: 24px;
          height: 24px;
          margin-right: 1px; /* 适当调整图标与文字的间距 */
        }

        .item-count {
          /* color: #4caf50; */
          color: #2196F3; /* 使用Material Design蓝色 */
          margin-left: 8px;
        }

        .total-line {
           text-align: center;
           font-weight: bold;    /* 粗体 */
           color: #FFD700;       /* 黄色十六进制代码 */
           /* 或者使用颜色名称：color: gold; */
         padding: 4px 0;
         }

        .no-loot {
          color: #666;
          text-align: center;
          padding: 8px;
      }
      `;
    // 在样式标签添加标识（在创建style元素后添加）
    style.setAttribute('data-mw-loot-tracker', 'true');

    document.head.appendChild(style);

    const content = document.getElementById("lootContent");
    const lootTotals = document.getElementById("lootTotals");
    content.style.maxHeight = isMinimized ? "0" : "1000px";
    content.style.opacity = isMinimized ? "0" : "1";
    lootTotals.style.maxHeight = isLootListMinimized ? "0" : "400px";
    lootTotals.style.opacity = isLootListMinimized ? "0" : "1";
    lootTotals.style.padding = isLootListMinimized ? "0 10px" : "10px";

    document.getElementById("lootMinBtn").onclick = () => {
      isMinimized = !isMinimized;
      content.style.maxHeight = isMinimized ? "0" : "1000px";
      content.style.opacity = isMinimized ? "0" : "1";
      document.getElementById("lootMinBtn").textContent = isMinimized
        ? "+"
        : "−";
      localStorage.setItem("lootOverlayMinimized", isMinimized);
    };
    document.getElementById("lootToggleHeader").onclick = () => {
      isLootListMinimized = !isLootListMinimized;
      lootTotals.style.maxHeight = isLootListMinimized ? "0" : "400px";
      lootTotals.style.opacity = isLootListMinimized ? "0" : "1";
      lootTotals.style.padding = isLootListMinimized ? "0 10px" : "10px";
      //document.getElementById("lootToggleIcon").textContent = isLootListMinimized ? "▲" : "▼";
      localStorage.setItem("lootListMinimized", isLootListMinimized);
    };
    const exportBtn = document.getElementById("lootExportBtn");
    exportBtn.onclick = () => {
      if (
        !activePlayer ||
        !playerLootData[activePlayer] ||
        Object.keys(playerLootData[activePlayer]).length === 0
      ) {
        alert("No loot data available for the active player to export.");
        return;
      }
      try {
        const dataToExport = playerLootData[activePlayer];
        const csvContent = Object.entries(dataToExport)
          .map(([hrid, count]) => {
            let itemName = hrid.replace("/items/", "").replace(/_/g, " ");
            itemName = `"${itemName.replace(/"/g, '""')}"`;
            return `${itemName},${count}`;
          })
          .join("\n");
        const csvOutput = "Item Name,Count\n" + csvContent;
        navigator.clipboard
          .writeText(csvOutput)
          .then(() => {
            const originalText = exportBtn.textContent;
            exportBtn.textContent = "Copied!";
            exportBtn.style.color = "#4caf50";
            setTimeout(() => {
              exportBtn.textContent = originalText;
              exportBtn.style.color = "";
            }, 1500);
          })
          .catch((err) => {
            console.error(
              "[LootTracker] Failed to copy CSV to clipboard:",
              err
            );
            alert("Failed to copy CSV. See console.");
          });
      } catch (error) {
        console.error("[LootTracker] Error generating CSV:", error);
        alert("Error generating CSV data.");
      }
    };

    document.getElementById("lootClearBtn").onclick = () => {
        // 移除覆盖层元素
        const overlay = document.getElementById("lootOverlay");
        if (overlay) overlay.remove();

        // 移除添加的样式
        const styles = document.querySelectorAll('style[data-mw-loot-tracker]');
        styles.forEach(style => style.remove());

        // 移除所有事件监听
        document.removeEventListener("keydown", handleKeyPress);
        //window.removeEventListener("LootTrackerBattle", battleHandler);
        //window.removeEventListener("LootTrackerWSClosed", wsCloseHandler);
        //window.removeEventListener("LootTrackerCombatReset", combatResetHandler);

        // 清理全局状态
        overlayReady = false;
        playerLootData = {};
        previousLootCounts = {};
        lastBattleLoot = {};

        console.log("[LootTracker] Plugin closed successfully.");
    };

    let dragging = false;
    let offsetX = 0;
    let offsetY = 0;
    function beginDrag(e) {
      if (e.target.closest("button")) return;
      dragging = true;
      panel.style.transition = "none";
      offsetX = e.clientX - panel.offsetLeft;
      offsetY = e.clientY - panel.offsetTop;
      document.body.style.userSelect = "none";
      document.body.style.cursor = "move";
    }
    document
      .getElementById("lootHeader")
      .addEventListener("mousedown", beginDrag);
    document
      .getElementById("lootBottomDragger")
      .addEventListener("mousedown", beginDrag);
    document.addEventListener("mousemove", (e) => {
      if (!dragging) return;
      const newX = Math.max(
        0,
        Math.min(window.innerWidth - panel.offsetWidth, e.clientX - offsetX)
      );
      const newY = Math.max(
        0,
        Math.min(window.innerHeight - panel.offsetHeight, e.clientY - offsetY)
      );
      panel.style.left = `${newX}px`;
      panel.style.top = `${newY}px`;
    });
    document.addEventListener("mouseup", () => {
      if (!dragging) return;
      dragging = false;
      panel.style.transition = "";
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
      localStorage.setItem("lootOverlayTop", panel.style.top);
      localStorage.setItem("lootOverlayLeft", panel.style.left);
    });

    // 添加键盘事件监听
    document.addEventListener("keydown", handleKeyPress);

    console.log("[LootTracker] Overlay created.");
  }

  // 新增键盘处理函数
  function handleKeyPress(e) {
    // 检查是否按的反引号键 (兼容不同浏览器)
    if (e.key === "`" || e.key === "Backquote") {
      e.preventDefault();
      toggleMinimize();
    }

      // 新增反斜杠键处理（\键）
      if (e.key === '\\') {
          e.preventDefault();
          triggerTabSwitch();
      }
  }

    // 触发函数
    function triggerTabSwitch() {
        colorIndex = (colorIndex + 1) % 3; // 颜色索引循环
        const tabs = document.querySelectorAll('#lootTabs button');
        if (tabs.length >= 3) {
            tabs[0].click();
            setTimeout(() => tabs[1].click(), 100);
            setTimeout(() => tabs[2].click(), 200);
        }
    }

  // 封装最小化切换逻辑
  function toggleMinimize() {
    if (!document.getElementById("lootOverlay")) return;

    isMinimized = !isMinimized;
    const content = document.getElementById("lootContent");
    const minBtn = document.getElementById("lootMinBtn");

    // 执行原有切换逻辑
    content.style.maxHeight = isMinimized ? "0" : "1000px";
    content.style.opacity = isMinimized ? "0" : "1";
    minBtn.textContent = isMinimized ? "+" : "−";
    localStorage.setItem("lootOverlayMinimized", isMinimized);
  }

  // 翻译函数优化
  function translateItemHrid(itemHrid) {
    // 直接匹配完整hrid路径
    const chinese = itemNames[itemHrid];
    // 处理特殊情况：带复数形式的物品
    const baseHrid = itemHrid.replace(/s$/, '');
    const baseChinese = itemNames[baseHrid];
    // 组合最终显示名称
    return chinese ||
           (baseChinese ? `${baseChinese}(复数)` :
           itemHrid.split('/').pop().replace(/_/g, ' '));
  }

  // 在排序前添加物品价值获取逻辑
  function getItemValue(itemHrid, count, marketDataAvailable) {
    let itemValue = 0
    // 处理金币特殊类型
    if (itemHrid === '/items/coin'){
      itemValue = count;
    } else if (marketDataAvailable) {
      const nameRaw = itemHrid.replace("/items/", "").replace(/_/g, " ");
      const marketKey = nameRaw.split(" ").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
      if (marketData.market[marketKey]?.ask) {
          itemValue = marketData.market[marketKey].ask;
      }
    }
    return itemValue;
}

  function updateLootDisplay(playerName) {
    document.querySelectorAll(`.persistent-gain[data-player="${playerName}"]`).forEach(el => el.remove());

    const colors = ['#00ff00', '#ffff00', '#ff0000']; // 绿/黄/红
    const container = document.getElementById("lootTotals");
    const revenueLine = document.getElementById("lootRevenueLine");

    if (!container) {
      console.error(
        "[LootTracker] updateLootDisplay: Could not find #lootTotals element!"
      );
      if (revenueLine) revenueLine.textContent = "Total Value: Error (UI)";
      return;
    }
    if (!revenueLine) {
      console.warn(
        "[LootTracker] updateLootDisplay: Could not find #lootRevenueLine element."
      );
    }
    if (!playerLootData[playerName]) {
      container.innerHTML = "<i>Waiting for player data...</i>";
      if (revenueLine) revenueLine.textContent = "Total Value: N/A";
      return;
    }
    if (!previousLootCounts[playerName]) previousLootCounts[playerName] = {};

    const currentLoot = playerLootData[playerName];

    //const sorted = Object.entries(currentLoot).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    const sorted = Object.entries(currentLoot).sort((a, b) => {a[0].localeCompare(b[0]);});
    //const sorted = Object.entries(currentLoot).map(([hrid, count]) => ({hrid, count, value: getItemValue(hrid, count, marketDataAvailable)})).sort((a, b) => b.value - a.value || a.hrid.localeCompare(b.hrid));

    let html = "";
    let totalRevenue = 0;
    let marketDataAvailable =
      marketData &&
      marketData.market &&
      Object.keys(marketData.market).length > 0;

    // 遍历所有玩家
    Object.keys(playerLootData).forEach(playerName => {
      let totalRevenueEach = 0;
      const playerData = playerLootData[playerName];
      // const sorted = Object.entries(playerData).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
      // const sorted = Object.entries(playerData).sort((a, b) => {a[0].localeCompare(b[0]);});
      // const sorted = Object.entries(playerData).sort((a, b) => getItemValue(b[0], b[1], marketDataAvailable) - getItemValue(a[0], a[1], marketDataAvailable) || a[0].localeCompare(b[0]));
      const sorted = Object.entries(playerData).sort((a, b) => {
          // 强制金币排在第一位
          const aIsCoin = a[0] === '/items/coin';
          const bIsCoin = b[0] === '/items/coin';
          if (aIsCoin && !bIsCoin) return -1;
          if (!aIsCoin && bIsCoin) return 1;
          // 非金币物品按原有逻辑排序
          return getItemValue(b[0], b[1], marketDataAvailable) - getItemValue(a[0], a[1], marketDataAvailable) || a[0].localeCompare(b[0]);
      });

      // 开始玩家列
      html += `<div class="player-column">`;
      html += `<div class="item-list">`;
      //html += `<div class="player-header">${playerName}</div>`;

      if (sorted.length === 0) {
          html += '<div class="no-loot">No loot tracked yet.</div>';
          totalRevenueEach = 0;
      } else {
          sorted.forEach(([itemHrid, count]) => {
              const prevDisplayCount = previousLootCounts[playerName][itemHrid] || 0;
              const lastBattleStartCount = lastBattleLoot[playerName] && lastBattleLoot[playerName][itemHrid] ? lastBattleLoot[playerName][itemHrid] : prevDisplayCount;
              const gain = count - lastBattleStartCount;
              const flash = count > prevDisplayCount;
              const nameRaw = itemHrid.replace("/items/", "").replace(/_/g, " ");
              const name = translateItemHrid(itemHrid);
              const gainHTML = gain > 0 ? `<span class="persistent-gain" data-item="${itemHrid}" data-player="${playerName}">+${gain}</span>` : "";

              //const currentColor = colors[colorIndex % 3];
              //const gainHTML = gain > 0 ? `<span class="persistent-gain" style="color: ${currentColor}" data-item="${itemHrid}" data-player="${playerName}">+${gain}</span>` : "";

              let itemValue = 0;
              let priceFound = false;
              let isHighValue = false; //价值判断
              let singleItemValue = -1;
              if (itemHrid.endsWith("/coin")) {
                  itemValue = count;
                  priceFound = true;
              } else if (marketDataAvailable) {
                  const marketKey = nameRaw
                  .split(" ")
                  .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
                  .join(" ");
                  if (marketData.market[marketKey]?.ask) {
                      singleItemValue = marketData.market[marketKey].ask;
                      isHighValue = singleItemValue > 100000; //价值判断
                      itemValue = count * singleItemValue;
                      priceFound = true;
                  }
              }
              totalRevenueEach += itemValue;

              //价值判断决定颜色
              const nameColor = isHighValue ? "#FFA500" : "#ddd"; //颜色切换
              //"red"       // 红色 (#FF0000)
              //"blue"      // 蓝色 (#0000FF)
              //"green"     // 绿色 (#008000)
              //"orange"    // 橙色 (#FFA500)
              //"purple"    // 标准紫色 (#800080)
              //"cyan"      // 青色 (#00FFFF)
              //"teal"      // 蓝绿色 (#008080)
              //"gold"      // 金色 (#FFD700)

              if (itemHrid.endsWith("/coin")) {
                  html += `
                    <div class="item-row">
                      <svg class="item-icon">
                        <svg width="15px" height="15px">
                        <use href="/static/media/items_sprite.6d12eb9d.svg#${itemHrid.replace("/items/", "")}"></use>
                      </svg>
                      <span class="item-name" style="color: ${nameColor}">${name}</span></span>
                      <span class="item-count">× ${count}${gainHTML}</span>
                    </div>`;
              }else if (singleItemValue >= 100000){
                  html += `
                    <div class="item-row">
                      <svg class="item-icon">
                        <svg width="15px" height="15px">
                        <use href="/static/media/items_sprite.6d12eb9d.svg#${itemHrid.replace("/items/", "")}"></use>
                      </svg>
                      <span class="item-name" style="color: ${nameColor}">${name} (${Math.floor(itemValue / 1000)}k)</span></span>
                      <span class="item-count">× ${count}${gainHTML}</span>
                    </div>`;

              }else {
                  html += `
                    <div class="item-row">
                      <svg class="item-icon">
                        <svg width="15px" height="15px">
                        <use href="/static/media/items_sprite.6d12eb9d.svg#${itemHrid.replace("/items/", "")}"></use>
                      </svg>
                      <span class="item-name" style="color: ${nameColor}">${name}</span></span>
                      <span class="item-count">× ${count}${gainHTML}</span>
                    </div>`;
              }

              /*
              html += `
                <div class="item-row">
                  <svg class="item-icon">
                    <svg width="16px" height="16px">
                    <use href="/static/media/items_sprite.6d12eb9d.svg#${itemHrid.replace("/items/", "")}"></use>
                  </svg>
                  <span class="item-name">${name}</span>
                  <span class="item-count">× ${count}${gainHTML}</span>
                </div>`;
              */

              previousLootCounts[playerName][itemHrid] = count;
          });
      }

      const hasNonCoinItems = sorted.some(([hrid]) => !hrid.endsWith("/coin"));
      let finalRevenueText = "";
      if (!marketDataAvailable && hasNonCoinItems && sorted.length > 0) {
         finalRevenueText = `未取到Github市价数据`;
      } else if (sorted.length === 0) {
        finalRevenueText = `总价值: ${formatGold(0)}`;
      } else {
        finalRevenueText = `总价值: ${formatGold(totalRevenueEach)}`;
      }

      html += `
         <div class="total-line">
           ${finalRevenueText}
           ${!hasNonCoinItems ? '' : '<span class="market-note">(市场价)</span>'}
         </div>`;

      html += `</div></div>`; // 关闭item-list和player-column
    });

    // 更新容器
    container.innerHTML = html;
    if (
      lastBattleLoot[playerName] &&
      Object.keys(lastBattleLoot[playerName]).length > 0
    ) {
      lastBattleLoot[playerName] = {};
    }
  }

  function switchTab(playerName) {
    activePlayer = playerName;
    updateLootDisplay(playerName); // 强制刷新显示
    document.querySelectorAll("#lootTabs button").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.name === playerName);
    });
  }

  function addTab(player) {
    const playerName = player.name;
    const lootMap = player.totalLootMap || {};
    const container = document.getElementById("lootTabs");
    if (!container) {
      console.error("[LootTracker] Loot tabs container not found!");
      return;
    }
    if (!playerLootData[playerName]) playerLootData[playerName] = {};
    if (!previousLootCounts[playerName]) previousLootCounts[playerName] = {};
    if (!lastBattleLoot[playerName]) lastBattleLoot[playerName] = {};

    let tabNeedsUpdate = false;
    for (const key in lootMap) {
      const { itemHrid, count } = lootMap[key];
      if (playerLootData[playerName][itemHrid] !== count) {
        lastBattleLoot[playerName][itemHrid] =
          playerLootData[playerName][itemHrid] || 0;
        playerLootData[playerName][itemHrid] = count;
        tabNeedsUpdate = true;
      }
    }

    let tabButton = container.querySelector(
      `button[data-name="${playerName}"]`
    );
    if (!tabButton) {
      tabButton = document.createElement("button");
      tabButton.textContent = playerName;
      tabButton.dataset.name = playerName;
      tabButton.onclick = () => switchTab(playerName);
      container.appendChild(tabButton);

      if (!activePlayer) activePlayer = playerName;
    }

    if (playerName === myPlayerName && !selfTabSelected) {
      triggerTabSwitch; //触发标签切换
      selfTabSelected = true;
      switchTab(playerName); // 触发UI更新
      tabNeedsUpdate = false;
    } else if (playerName === activePlayer && tabNeedsUpdate) {
      updateLootDisplay(playerName);
    }
    if (playerName === activePlayer) {
      document.querySelectorAll("#lootTabs button").forEach((btn) => {btn.classList.toggle("active", btn.dataset.name === activePlayer);});
    }
  }

  function clearAllLootData() {
    console.log("[LootTracker] Clearing all loot data.");

    for (const p in playerLootData) {
      playerLootData[p] = {};
      previousLootCounts[p] = {};
      lastBattleLoot[p] = {};
    }

    const tabsContainer = document.getElementById("lootTabs");
    const totalsContainer = document.getElementById("lootTotals");
    const revenueLine = document.getElementById("lootRevenueLine");

    if (tabsContainer) tabsContainer.innerHTML = "";
    if (totalsContainer) totalsContainer.innerHTML = "<i>Loot data cleared.</i>";
    if (revenueLine) revenueLine.textContent = "Total Value: N/A";

    activePlayer = null;
    selfTabSelected = false;

    document.removeEventListener("keydown", handleKeyPress);
  }

  // 在卸载脚本时移除监听
  window.addEventListener("beforeunload", () => {
    document.removeEventListener("keydown", handleKeyPress);
  });

  (function injectWebSocketInterceptor() {
    const scriptId = "milkyway-websocket-interceptor";

    if (document.getElementById(scriptId)) return;

    const s = document.createElement("script");
    s.id = scriptId;
    s.textContent = `
          (function() {

            if (window.originalWebSocket) { return; }
            window.originalWebSocket = window.WebSocket;


            window.WebSocket = new Proxy(window.originalWebSocket, {
              construct(target, args) {

                const wsInstance = new target(...args);
                try {
                    const url = args[0];

                    if (typeof url === 'string' && (url.includes("api.milkywayidle.com/ws") || url.includes("api-test.milkywayidle.com/ws"))) {


                        wsInstance.addEventListener("message", (event) => {
                          try {
                            const data = JSON.parse(event.data);

                            if (data.type === "new_battle" && data.players) {

                              window.dispatchEvent(new CustomEvent("LootTrackerBattle", { detail: data }));
                            }

                            else if ( data.type === "new_character_action" && data.newCharacterActionData?.shouldClearQueue && data.newCharacterActionData.actionHrid?.startsWith("/actions/combat/") ) {

                              window.dispatchEvent(new CustomEvent("LootTrackerCombatReset"));
                            }
                          } catch (parseOrDispatchError) {
                              console.error('[LootTracker WS Interceptor] Error processing message:', parseOrDispatchError, 'Raw Data:', event.data);
                          }
                        });


                        wsInstance.addEventListener("open", () => {

                        });


                        wsInstance.addEventListener("close", (event) => {

                            console.log(\`[LootTracker WS Interceptor] Target WebSocket connection closed. Code: \${event.code}, Reason: \${event.reason}. Dispatching LootTrackerWSClosed event.\`);

                            window.dispatchEvent(new CustomEvent("LootTrackerWSClosed", {
                                detail: { code: event.code, reason: event.reason }
                            }));
                        });


                        wsInstance.addEventListener("error", (event) => {
                            console.error('[LootTracker WS Interceptor] Target WebSocket error:', event);
                        });

                    }
                } catch (proxyConstructError) {
                    console.error('[LootTracker WS Interceptor] Error setting up WebSocket proxy:', proxyConstructError);
                }

                return wsInstance;
              }
            });

            console.log('[LootTracker WS Interceptor] WebSocket Proxy installed.');
          })();
        `;

    (document.head || document.documentElement).appendChild(s);
  })();

  window.addEventListener("LootTrackerBattle", (e) => {
    if (!overlayReady) {
      console.warn(
        "[LootTracker] Overlay not ready when battle event received, skipping update."
      );
      return;
    }
    const data = e.detail;

    if (data && data.players && Array.isArray(data.players)) {
      data.players.forEach((player) => {
        if (player && player.name) {
          addTab(player);
        } else {
          console.warn(
            "[LootTracker] Player data missing name in battle event:",
            player
          );
        }
      });
    } else {
      console.warn(
        "[LootTracker] Invalid data received in LootTrackerBattle event:",
        data
      );
    }
  });

  window.addEventListener("LootTrackerWSClosed", (e) => {
    console.log(
      `[LootTracker] Detected WebSocket closure (Code: ${e.detail?.code}, Reason: ${e.detail?.reason}). Clearing all loot data and resetting player name.`
    );

    myPlayerName = null;

    activePlayer = null;
    selfTabSelected = false;

    if (overlayReady) {
      clearAllLootData();
    } else {
      console.warn(
        "[LootTracker] WebSocket closed, but overlay not ready. Data should be clear on next init."
      );
    }
  });

  window.addEventListener("LootTrackerCombatReset", (e) => {
    if (!overlayReady) {
      console.warn(
        "[LootTracker] Overlay not ready when reset event received, skipping clear."
      );
      return;
    }
    console.log("[LootTracker] Calling clearAllLootData due to combat reset.");
    clearAllLootData();
  });

  function initialize() {
    console.log("[LootTracker] Initializing...");
    createOverlay();
    detectPlayerName();
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initialize);
  } else {
    initialize();
  }

  // 中英物品名称对照字典（示例部分）
  const itemNames = {
  "/items/coin": "\u91d1\u5e01",
  "/items/task_token": "\u4efb\u52a1\u4ee3\u5e01",
  "/items/chimerical_token": "\u5947\u5e7b\u4ee3\u5e01",
  "/items/sinister_token": "\u9634\u68ee\u4ee3\u5e01",
  "/items/enchanted_token": "\u79d8\u6cd5\u4ee3\u5e01",
  "/items/cowbell": "\u725b\u94c3",
  "/items/bag_of_10_cowbells": "\u725b\u94c3\u888b (10\u4e2a)",
  "/items/purples_gift": "\u5c0f\u7d2b\u725b\u7684\u793c\u7269",
  "/items/small_meteorite_cache": "\u5c0f\u9668\u77f3\u8231",
  "/items/medium_meteorite_cache": "\u4e2d\u9668\u77f3\u8231",
  "/items/large_meteorite_cache": "\u5927\u9668\u77f3\u8231",
  "/items/small_artisans_crate": "\u5c0f\u5de5\u5320\u5323",
  "/items/medium_artisans_crate": "\u4e2d\u5de5\u5320\u5323",
  "/items/large_artisans_crate": "\u5927\u5de5\u5320\u5323",
  "/items/small_treasure_chest": "\u5c0f\u5b9d\u7bb1",
  "/items/medium_treasure_chest": "\u4e2d\u5b9d\u7bb1",
  "/items/large_treasure_chest": "\u5927\u5b9d\u7bb1",
  "/items/chimerical_chest": "\u5947\u5e7b\u5b9d\u7bb1",
  "/items/sinister_chest": "\u9634\u68ee\u5b9d\u7bb1",
  "/items/enchanted_chest": "\u79d8\u6cd5\u5b9d\u7bb1",
  "/items/blue_key_fragment": "\u84dd\u8272\u94a5\u5319\u788e\u7247",
  "/items/green_key_fragment": "\u7eff\u8272\u94a5\u5319\u788e\u7247",
  "/items/purple_key_fragment": "\u7d2b\u8272\u94a5\u5319\u788e\u7247",
  "/items/white_key_fragment": "\u767d\u8272\u94a5\u5319\u788e\u7247",
  "/items/orange_key_fragment": "\u6a59\u8272\u94a5\u5319\u788e\u7247",
  "/items/brown_key_fragment": "\u68d5\u8272\u94a5\u5319\u788e\u7247",
  "/items/stone_key_fragment": "\u77f3\u5934\u94a5\u5319\u788e\u7247",
  "/items/dark_key_fragment": "\u9ed1\u6697\u94a5\u5319\u788e\u7247",
  "/items/burning_key_fragment": "\u71c3\u70e7\u94a5\u5319\u788e\u7247",
  "/items/chimerical_entry_key": "\u5947\u5e7b\u94a5\u5319",
  "/items/chimerical_chest_key": "\u5947\u5e7b\u5b9d\u7bb1\u94a5\u5319",
  "/items/sinister_entry_key": "\u9634\u68ee\u94a5\u5319",
  "/items/sinister_chest_key": "\u9634\u68ee\u5b9d\u7bb1\u94a5\u5319",
  "/items/enchanted_entry_key": "\u79d8\u6cd5\u94a5\u5319",
  "/items/enchanted_chest_key": "\u79d8\u6cd5\u5b9d\u7bb1\u94a5\u5319",
  "/items/donut": "\u751c\u751c\u5708",
  "/items/blueberry_donut": "\u84dd\u8393\u751c\u751c\u5708",
  "/items/blackberry_donut": "\u9ed1\u8393\u751c\u751c\u5708",
  "/items/strawberry_donut": "\u8349\u8393\u751c\u751c\u5708",
  "/items/mooberry_donut": "\u54de\u8393\u751c\u751c\u5708",
  "/items/marsberry_donut": "\u706b\u661f\u8393\u751c\u751c\u5708",
  "/items/spaceberry_donut": "\u592a\u7a7a\u8393\u751c\u751c\u5708",
  "/items/cupcake": "\u7eb8\u676f\u86cb\u7cd5",
  "/items/blueberry_cake": "\u84dd\u8393\u86cb\u7cd5",
  "/items/blackberry_cake": "\u9ed1\u8393\u86cb\u7cd5",
  "/items/strawberry_cake": "\u8349\u8393\u86cb\u7cd5",
  "/items/mooberry_cake": "\u54de\u8393\u86cb\u7cd5",
  "/items/marsberry_cake": "\u706b\u661f\u8393\u86cb\u7cd5",
  "/items/spaceberry_cake": "\u592a\u7a7a\u8393\u86cb\u7cd5",
  "/items/gummy": "\u8f6f\u7cd6",
  "/items/apple_gummy": "\u82f9\u679c\u8f6f\u7cd6",
  "/items/orange_gummy": "\u6a59\u5b50\u8f6f\u7cd6",
  "/items/plum_gummy": "\u674e\u5b50\u8f6f\u7cd6",
  "/items/peach_gummy": "\u6843\u5b50\u8f6f\u7cd6",
  "/items/dragon_fruit_gummy": "\u706b\u9f99\u679c\u8f6f\u7cd6",
  "/items/star_fruit_gummy": "\u6768\u6843\u8f6f\u7cd6",
  "/items/yogurt": "\u9178\u5976",
  "/items/apple_yogurt": "\u82f9\u679c\u9178\u5976",
  "/items/orange_yogurt": "\u6a59\u5b50\u9178\u5976",
  "/items/plum_yogurt": "\u674e\u5b50\u9178\u5976",
  "/items/peach_yogurt": "\u6843\u5b50\u9178\u5976",
  "/items/dragon_fruit_yogurt": "\u706b\u9f99\u679c\u9178\u5976",
  "/items/star_fruit_yogurt": "\u6768\u6843\u9178\u5976",
  "/items/milking_tea": "\u6324\u5976\u8336",
  "/items/foraging_tea": "\u91c7\u6458\u8336",
  "/items/woodcutting_tea": "\u4f10\u6728\u8336",
  "/items/cooking_tea": "\u70f9\u996a\u8336",
  "/items/brewing_tea": "\u51b2\u6ce1\u8336",
  "/items/alchemy_tea": "\u70bc\u91d1\u8336",
  "/items/enhancing_tea": "\u5f3a\u5316\u8336",
  "/items/cheesesmithing_tea": "\u5976\u916a\u953b\u9020\u8336",
  "/items/crafting_tea": "\u5236\u4f5c\u8336",
  "/items/tailoring_tea": "\u7f1d\u7eab\u8336",
  "/items/super_milking_tea": "\u8d85\u7ea7\u6324\u5976\u8336",
  "/items/super_foraging_tea": "\u8d85\u7ea7\u91c7\u6458\u8336",
  "/items/super_woodcutting_tea": "\u8d85\u7ea7\u4f10\u6728\u8336",
  "/items/super_cooking_tea": "\u8d85\u7ea7\u70f9\u996a\u8336",
  "/items/super_brewing_tea": "\u8d85\u7ea7\u51b2\u6ce1\u8336",
  "/items/super_alchemy_tea": "\u8d85\u7ea7\u70bc\u91d1\u8336",
  "/items/super_enhancing_tea": "\u8d85\u7ea7\u5f3a\u5316\u8336",
  "/items/super_cheesesmithing_tea": "\u8d85\u7ea7\u5976\u916a\u953b\u9020\u8336",
  "/items/super_crafting_tea": "\u8d85\u7ea7\u5236\u4f5c\u8336",
  "/items/super_tailoring_tea": "\u8d85\u7ea7\u7f1d\u7eab\u8336",
  "/items/ultra_milking_tea": "\u7a76\u6781\u6324\u5976\u8336",
  "/items/ultra_foraging_tea": "\u7a76\u6781\u91c7\u6458\u8336",
  "/items/ultra_woodcutting_tea": "\u7a76\u6781\u4f10\u6728\u8336",
  "/items/ultra_cooking_tea": "\u7a76\u6781\u70f9\u996a\u8336",
  "/items/ultra_brewing_tea": "\u7a76\u6781\u51b2\u6ce1\u8336",
  "/items/ultra_alchemy_tea": "\u7a76\u6781\u70bc\u91d1\u8336",
  "/items/ultra_enhancing_tea": "\u7a76\u6781\u5f3a\u5316\u8336",
  "/items/ultra_cheesesmithing_tea": "\u7a76\u6781\u5976\u916a\u953b\u9020\u8336",
  "/items/ultra_crafting_tea": "\u7a76\u6781\u5236\u4f5c\u8336",
  "/items/ultra_tailoring_tea": "\u7a76\u6781\u7f1d\u7eab\u8336",
  "/items/gathering_tea": "\u91c7\u96c6\u8336",
  "/items/gourmet_tea": "\u7f8e\u98df\u8336",
  "/items/wisdom_tea": "\u7ecf\u9a8c\u8336",
  "/items/processing_tea": "\u52a0\u5de5\u8336",
  "/items/efficiency_tea": "\u6548\u7387\u8336",
  "/items/artisan_tea": "\u5de5\u5320\u8336",
  "/items/catalytic_tea": "\u50ac\u5316\u8336",
  "/items/blessed_tea": "\u798f\u6c14\u8336",
  "/items/stamina_coffee": "\u8010\u529b\u5496\u5561",
  "/items/intelligence_coffee": "\u667a\u529b\u5496\u5561",
  "/items/defense_coffee": "\u9632\u5fa1\u5496\u5561",
  "/items/attack_coffee": "\u653b\u51fb\u5496\u5561",
  "/items/power_coffee": "\u529b\u91cf\u5496\u5561",
  "/items/ranged_coffee": "\u8fdc\u7a0b\u5496\u5561",
  "/items/magic_coffee": "\u9b54\u6cd5\u5496\u5561",
  "/items/super_stamina_coffee": "\u8d85\u7ea7\u8010\u529b\u5496\u5561",
  "/items/super_intelligence_coffee": "\u8d85\u7ea7\u667a\u529b\u5496\u5561",
  "/items/super_defense_coffee": "\u8d85\u7ea7\u9632\u5fa1\u5496\u5561",
  "/items/super_attack_coffee": "\u8d85\u7ea7\u653b\u51fb\u5496\u5561",
  "/items/super_power_coffee": "\u8d85\u7ea7\u529b\u91cf\u5496\u5561",
  "/items/super_ranged_coffee": "\u8d85\u7ea7\u8fdc\u7a0b\u5496\u5561",
  "/items/super_magic_coffee": "\u8d85\u7ea7\u9b54\u6cd5\u5496\u5561",
  "/items/ultra_stamina_coffee": "\u7a76\u6781\u8010\u529b\u5496\u5561",
  "/items/ultra_intelligence_coffee": "\u7a76\u6781\u667a\u529b\u5496\u5561",
  "/items/ultra_defense_coffee": "\u7a76\u6781\u9632\u5fa1\u5496\u5561",
  "/items/ultra_attack_coffee": "\u7a76\u6781\u653b\u51fb\u5496\u5561",
  "/items/ultra_power_coffee": "\u7a76\u6781\u529b\u91cf\u5496\u5561",
  "/items/ultra_ranged_coffee": "\u7a76\u6781\u8fdc\u7a0b\u5496\u5561",
  "/items/ultra_magic_coffee": "\u7a76\u6781\u9b54\u6cd5\u5496\u5561",
  "/items/wisdom_coffee": "\u7ecf\u9a8c\u5496\u5561",
  "/items/lucky_coffee": "\u5e78\u8fd0\u5496\u5561",
  "/items/swiftness_coffee": "\u8fc5\u6377\u5496\u5561",
  "/items/channeling_coffee": "\u541f\u5531\u5496\u5561",
  "/items/critical_coffee": "\u66b4\u51fb\u5496\u5561",
  "/items/poke": "\u7834\u80c6\u4e4b\u523a",
  "/items/impale": "\u900f\u9aa8\u4e4b\u523a",
  "/items/puncture": "\u7834\u7532\u4e4b\u523a",
  "/items/penetrating_strike": "\u8d2f\u5fc3\u4e4b\u523a",
  "/items/scratch": "\u722a\u5f71\u65a9",
  "/items/cleave": "\u5206\u88c2\u65a9",
  "/items/maim": "\u8840\u5203\u65a9",
  "/items/crippling_slash": "\u81f4\u6b8b\u65a9",
  "/items/smack": "\u91cd\u78be",
  "/items/sweep": "\u91cd\u626b",
  "/items/stunning_blow": "\u91cd\u9524",
  "/items/quick_shot": "\u5feb\u901f\u5c04\u51fb",
  "/items/aqua_arrow": "\u6d41\u6c34\u7bad",
  "/items/flame_arrow": "\u70c8\u7130\u7bad",
  "/items/rain_of_arrows": "\u7bad\u96e8",
  "/items/silencing_shot": "\u6c89\u9ed8\u4e4b\u7bad",
  "/items/steady_shot": "\u7a33\u5b9a\u5c04\u51fb",
  "/items/pestilent_shot": "\u75ab\u75c5\u5c04\u51fb",
  "/items/penetrating_shot": "\u8d2f\u7a7f\u5c04\u51fb",
  "/items/water_strike": "\u6d41\u6c34\u51b2\u51fb",
  "/items/ice_spear": "\u51b0\u67aa\u672f",
  "/items/frost_surge": "\u51b0\u971c\u7206\u88c2",
  "/items/mana_spring": "\u6cd5\u529b\u55b7\u6cc9",
  "/items/entangle": "\u7f20\u7ed5",
  "/items/toxic_pollen": "\u5267\u6bd2\u7c89\u5c18",
  "/items/natures_veil": "\u81ea\u7136\u83cc\u5e55",
  "/items/fireball": "\u706b\u7403",
  "/items/flame_blast": "\u7194\u5ca9\u7206\u88c2",
  "/items/firestorm": "\u706b\u7130\u98ce\u66b4",
  "/items/smoke_burst": "\u70df\u7206\u706d\u5f71",
  "/items/minor_heal": "\u521d\u7ea7\u81ea\u6108\u672f",
  "/items/heal": "\u81ea\u6108\u672f",
  "/items/quick_aid": "\u5feb\u901f\u6cbb\u7597\u672f",
  "/items/rejuvenate": "\u7fa4\u4f53\u6cbb\u7597\u672f",
  "/items/taunt": "\u5632\u8bbd",
  "/items/provoke": "\u6311\u8845",
  "/items/toughness": "\u575a\u97e7",
  "/items/elusiveness": "\u95ea\u907f",
  "/items/precision": "\u7cbe\u786e",
  "/items/berserk": "\u72c2\u66b4",
  "/items/elemental_affinity": "\u5143\u7d20\u589e\u5e45",
  "/items/frenzy": "\u72c2\u901f",
  "/items/spike_shell": "\u5c16\u523a\u9632\u62a4",
  "/items/arcane_reflection": "\u5965\u672f\u53cd\u5c04",
  "/items/vampirism": "\u5438\u8840",
  "/items/revive": "\u590d\u6d3b",
  "/items/insanity": "\u75af\u72c2",
  "/items/invincible": "\u65e0\u654c",
  "/items/fierce_aura": "\u7269\u7406\u5149\u73af",
  "/items/aqua_aura": "\u6d41\u6c34\u5149\u73af",
  "/items/sylvan_aura": "\u81ea\u7136\u5149\u73af",
  "/items/flame_aura": "\u706b\u7130\u5149\u73af",
  "/items/speed_aura": "\u901f\u5ea6\u5149\u73af",
  "/items/critical_aura": "\u66b4\u51fb\u5149\u73af",
  "/items/gobo_stabber": "\u54e5\u5e03\u6797\u957f\u5251",
  "/items/gobo_slasher": "\u54e5\u5e03\u6797\u5173\u5200",
  "/items/gobo_smasher": "\u54e5\u5e03\u6797\u72fc\u7259\u68d2",
  "/items/spiked_bulwark": "\u5c16\u523a\u76fe",
  "/items/werewolf_slasher": "\u72fc\u4eba\u5173\u5200",
  "/items/griffin_bulwark": "\u72ee\u9e6b\u91cd\u76fe",
  "/items/gobo_shooter": "\u54e5\u5e03\u6797\u5f39\u5f13",
  "/items/vampiric_bow": "\u5438\u8840\u5f13",
  "/items/cursed_bow": "\u5492\u6028\u4e4b\u5f13",
  "/items/gobo_boomstick": "\u54e5\u5e03\u6797\u706b\u68cd",
  "/items/cheese_bulwark": "\u5976\u916a\u91cd\u76fe",
  "/items/verdant_bulwark": "\u7fe0\u7eff\u91cd\u76fe",
  "/items/azure_bulwark": "\u851a\u84dd\u91cd\u76fe",
  "/items/burble_bulwark": "\u6df1\u7d2b\u91cd\u76fe",
  "/items/crimson_bulwark": "\u7edb\u7ea2\u91cd\u76fe",
  "/items/rainbow_bulwark": "\u5f69\u8679\u91cd\u76fe",
  "/items/holy_bulwark": "\u795e\u5723\u91cd\u76fe",
  "/items/wooden_bow": "\u6728\u5f13",
  "/items/birch_bow": "\u6866\u6728\u5f13",
  "/items/cedar_bow": "\u96ea\u677e\u5f13",
  "/items/purpleheart_bow": "\u7d2b\u5fc3\u5f13",
  "/items/ginkgo_bow": "\u94f6\u674f\u5f13",
  "/items/redwood_bow": "\u7ea2\u6749\u5f13",
  "/items/arcane_bow": "\u795e\u79d8\u5f13",
  "/items/stalactite_spear": "\u77f3\u949f\u957f\u67aa",
  "/items/granite_bludgeon": "\u82b1\u5c97\u5ca9\u5927\u68d2",
  "/items/regal_sword": "\u541b\u738b\u4e4b\u5251",
  "/items/chaotic_flail": "\u6df7\u6c8c\u8fde\u67b7",
  "/items/soul_hunter_crossbow": "\u7075\u9b42\u730e\u624b\u5f29",
  "/items/sundering_crossbow": "\u88c2\u7a7a\u4e4b\u5f29",
  "/items/frost_staff": "\u51b0\u971c\u6cd5\u6756",
  "/items/infernal_battlestaff": "\u70bc\u72f1\u6cd5\u6756",
  "/items/jackalope_staff": "\u9e7f\u89d2\u5154\u4e4b\u6756",
  "/items/cheese_sword": "\u5976\u916a\u5251",
  "/items/verdant_sword": "\u7fe0\u7eff\u5251",
  "/items/azure_sword": "\u851a\u84dd\u5251",
  "/items/burble_sword": "\u6df1\u7d2b\u5251",
  "/items/crimson_sword": "\u7edb\u7ea2\u5251",
  "/items/rainbow_sword": "\u5f69\u8679\u5251",
  "/items/holy_sword": "\u795e\u5723\u5251",
  "/items/cheese_spear": "\u5976\u916a\u957f\u67aa",
  "/items/verdant_spear": "\u7fe0\u7eff\u957f\u67aa",
  "/items/azure_spear": "\u851a\u84dd\u957f\u67aa",
  "/items/burble_spear": "\u6df1\u7d2b\u957f\u67aa",
  "/items/crimson_spear": "\u7edb\u7ea2\u957f\u67aa",
  "/items/rainbow_spear": "\u5f69\u8679\u957f\u67aa",
  "/items/holy_spear": "\u795e\u5723\u957f\u67aa",
  "/items/cheese_mace": "\u5976\u916a\u9489\u5934\u9524",
  "/items/verdant_mace": "\u7fe0\u7eff\u9489\u5934\u9524",
  "/items/azure_mace": "\u851a\u84dd\u9489\u5934\u9524",
  "/items/burble_mace": "\u6df1\u7d2b\u9489\u5934\u9524",
  "/items/crimson_mace": "\u7edb\u7ea2\u9489\u5934\u9524",
  "/items/rainbow_mace": "\u5f69\u8679\u9489\u5934\u9524",
  "/items/holy_mace": "\u795e\u5723\u9489\u5934\u9524",
  "/items/wooden_crossbow": "\u6728\u5f29",
  "/items/birch_crossbow": "\u6866\u6728\u5f29",
  "/items/cedar_crossbow": "\u96ea\u677e\u5f29",
  "/items/purpleheart_crossbow": "\u7d2b\u5fc3\u5f29",
  "/items/ginkgo_crossbow": "\u94f6\u674f\u5f29",
  "/items/redwood_crossbow": "\u7ea2\u6749\u5f29",
  "/items/arcane_crossbow": "\u795e\u79d8\u5f29",
  "/items/wooden_water_staff": "\u6728\u5236\u6c34\u6cd5\u6756",
  "/items/birch_water_staff": "\u6866\u6728\u6c34\u6cd5\u6756",
  "/items/cedar_water_staff": "\u96ea\u677e\u6c34\u6cd5\u6756",
  "/items/purpleheart_water_staff": "\u7d2b\u5fc3\u6c34\u6cd5\u6756",
  "/items/ginkgo_water_staff": "\u94f6\u674f\u6c34\u6cd5\u6756",
  "/items/redwood_water_staff": "\u7ea2\u6749\u6c34\u6cd5\u6756",
  "/items/arcane_water_staff": "\u795e\u79d8\u6c34\u6cd5\u6756",
  "/items/wooden_nature_staff": "\u6728\u5236\u81ea\u7136\u6cd5\u6756",
  "/items/birch_nature_staff": "\u6866\u6728\u81ea\u7136\u6cd5\u6756",
  "/items/cedar_nature_staff": "\u96ea\u677e\u81ea\u7136\u6cd5\u6756",
  "/items/purpleheart_nature_staff": "\u7d2b\u5fc3\u81ea\u7136\u6cd5\u6756",
  "/items/ginkgo_nature_staff": "\u94f6\u674f\u81ea\u7136\u6cd5\u6756",
  "/items/redwood_nature_staff": "\u7ea2\u6749\u81ea\u7136\u6cd5\u6756",
  "/items/arcane_nature_staff": "\u795e\u79d8\u81ea\u7136\u6cd5\u6756",
  "/items/wooden_fire_staff": "\u6728\u706b\u6cd5\u6756",
  "/items/birch_fire_staff": "\u6866\u6728\u706b\u6cd5\u6756",
  "/items/cedar_fire_staff": "\u96ea\u677e\u706b\u6cd5\u6756",
  "/items/purpleheart_fire_staff": "\u7d2b\u5fc3\u706b\u6cd5\u6756",
  "/items/ginkgo_fire_staff": "\u94f6\u674f\u706b\u6cd5\u6756",
  "/items/redwood_fire_staff": "\u7ea2\u6749\u706b\u6cd5\u6756",
  "/items/arcane_fire_staff": "\u795e\u79d8\u706b\u6cd5\u6756",
  "/items/eye_watch": "\u638c\u4e0a\u76d1\u5de5",
  "/items/snake_fang_dirk": "\u86c7\u7259\u77ed\u5251",
  "/items/vision_shield": "\u89c6\u89c9\u76fe",
  "/items/gobo_defender": "\u54e5\u5e03\u6797\u9632\u5fa1\u8005",
  "/items/vampire_fang_dirk": "\u5438\u8840\u9b3c\u77ed\u5251",
  "/items/knights_aegis": "\u9a91\u58eb\u76fe",
  "/items/treant_shield": "\u6811\u4eba\u76fe",
  "/items/manticore_shield": "\u874e\u72ee\u76fe",
  "/items/tome_of_healing": "\u6cbb\u7597\u4e4b\u4e66",
  "/items/tome_of_the_elements": "\u5143\u7d20\u4e4b\u4e66",
  "/items/watchful_relic": "\u8b66\u6212\u9057\u7269",
  "/items/bishops_codex": "\u4e3b\u6559\u6cd5\u5178",
  "/items/cheese_buckler": "\u5976\u916a\u5706\u76fe",
  "/items/verdant_buckler": "\u7fe0\u7eff\u5706\u76fe",
  "/items/azure_buckler": "\u851a\u84dd\u5706\u76fe",
  "/items/burble_buckler": "\u6df1\u7d2b\u5706\u76fe",
  "/items/crimson_buckler": "\u7edb\u7ea2\u5706\u76fe",
  "/items/rainbow_buckler": "\u5f69\u8679\u5706\u76fe",
  "/items/holy_buckler": "\u795e\u5723\u5706\u76fe",
  "/items/wooden_shield": "\u6728\u76fe",
  "/items/birch_shield": "\u6866\u6728\u76fe",
  "/items/cedar_shield": "\u96ea\u677e\u76fe",
  "/items/purpleheart_shield": "\u7d2b\u5fc3\u76fe",
  "/items/ginkgo_shield": "\u94f6\u674f\u76fe",
  "/items/redwood_shield": "\u7ea2\u6749\u76fe",
  "/items/arcane_shield": "\u795e\u79d8\u76fe",
  "/items/sinister_cape": "\u9634\u68ee\u6597\u7bf7",
  "/items/chimerical_quiver": "\u5947\u5e7b\u7bad\u888b",
  "/items/enchanted_cloak": "\u79d8\u6cd5\u62ab\u98ce",
  "/items/red_culinary_hat": "\u7ea2\u8272\u53a8\u5e08\u5e3d",
  "/items/snail_shell_helmet": "\u8717\u725b\u58f3\u5934\u76d4",
  "/items/vision_helmet": "\u89c6\u89c9\u5934\u76d4",
  "/items/fluffy_red_hat": "\u84ec\u677e\u7ea2\u5e3d\u5b50",
  "/items/acrobatic_hood": "\u6742\u6280\u5e08\u515c\u5e3d",
  "/items/magicians_hat": "\u9b54\u672f\u5e08\u5e3d",
  "/items/cheese_helmet": "\u5976\u916a\u5934\u76d4",
  "/items/verdant_helmet": "\u7fe0\u7eff\u5934\u76d4",
  "/items/azure_helmet": "\u851a\u84dd\u5934\u76d4",
  "/items/burble_helmet": "\u6df1\u7d2b\u5934\u76d4",
  "/items/crimson_helmet": "\u7edb\u7ea2\u5934\u76d4",
  "/items/rainbow_helmet": "\u5f69\u8679\u5934\u76d4",
  "/items/holy_helmet": "\u795e\u5723\u5934\u76d4",
  "/items/rough_hood": "\u7c97\u7cd9\u515c\u5e3d",
  "/items/reptile_hood": "\u722c\u884c\u52a8\u7269\u515c\u5e3d",
  "/items/gobo_hood": "\u54e5\u5e03\u6797\u515c\u5e3d",
  "/items/beast_hood": "\u91ce\u517d\u515c\u5e3d",
  "/items/umbral_hood": "\u6697\u5f71\u515c\u5e3d",
  "/items/cotton_hat": "\u68c9\u5e3d",
  "/items/linen_hat": "\u4e9a\u9ebb\u5e3d",
  "/items/bamboo_hat": "\u7af9\u5e3d",
  "/items/silk_hat": "\u4e1d\u5e3d",
  "/items/radiant_hat": "\u5149\u8f89\u5e3d",
  "/items/dairyhands_top": "\u6324\u5976\u5de5\u4e0a\u8863",
  "/items/foragers_top": "\u91c7\u6458\u8005\u4e0a\u8863",
  "/items/lumberjacks_top": "\u4f10\u6728\u5de5\u4e0a\u8863",
  "/items/cheesemakers_top": "\u5976\u916a\u5e08\u4e0a\u8863",
  "/items/crafters_top": "\u5de5\u5320\u4e0a\u8863",
  "/items/tailors_top": "\u88c1\u7f1d\u4e0a\u8863",
  "/items/chefs_top": "\u53a8\u5e08\u4e0a\u8863",
  "/items/brewers_top": "\u996e\u54c1\u5e08\u4e0a\u8863",
  "/items/alchemists_top": "\u70bc\u91d1\u5e08\u4e0a\u8863",
  "/items/enhancers_top": "\u5f3a\u5316\u5e08\u4e0a\u8863",
  "/items/gator_vest": "\u9cc4\u9c7c\u9a6c\u7532",
  "/items/turtle_shell_body": "\u9f9f\u58f3\u80f8\u7532",
  "/items/colossus_plate_body": "\u5de8\u50cf\u80f8\u7532",
  "/items/demonic_plate_body": "\u6076\u9b54\u80f8\u7532",
  "/items/marine_tunic": "\u6d77\u6d0b\u76ae\u8863",
  "/items/revenant_tunic": "\u4ea1\u7075\u76ae\u8863",
  "/items/griffin_tunic": "\u72ee\u9e6b\u76ae\u8863",
  "/items/icy_robe_top": "\u51b0\u971c\u888d\u670d",
  "/items/flaming_robe_top": "\u70c8\u7130\u888d\u670d",
  "/items/luna_robe_top": "\u6708\u795e\u888d\u670d",
  "/items/royal_water_robe_top": "\u7687\u5bb6\u6c34\u7cfb\u888d\u670d",
  "/items/royal_nature_robe_top": "\u7687\u5bb6\u81ea\u7136\u7cfb\u888d\u670d",
  "/items/royal_fire_robe_top": "\u7687\u5bb6\u706b\u7cfb\u888d\u670d",
  "/items/cheese_plate_body": "\u5976\u916a\u80f8\u7532",
  "/items/verdant_plate_body": "\u7fe0\u7eff\u80f8\u7532",
  "/items/azure_plate_body": "\u851a\u84dd\u80f8\u7532",
  "/items/burble_plate_body": "\u6df1\u7d2b\u80f8\u7532",
  "/items/crimson_plate_body": "\u7edb\u7ea2\u80f8\u7532",
  "/items/rainbow_plate_body": "\u5f69\u8679\u80f8\u7532",
  "/items/holy_plate_body": "\u795e\u5723\u80f8\u7532",
  "/items/rough_tunic": "\u7c97\u7cd9\u76ae\u8863",
  "/items/reptile_tunic": "\u722c\u884c\u52a8\u7269\u76ae\u8863",
  "/items/gobo_tunic": "\u54e5\u5e03\u6797\u76ae\u8863",
  "/items/beast_tunic": "\u91ce\u517d\u76ae\u8863",
  "/items/umbral_tunic": "\u6697\u5f71\u76ae\u8863",
  "/items/cotton_robe_top": "\u68c9\u5e03\u888d\u670d",
  "/items/linen_robe_top": "\u4e9a\u9ebb\u888d\u670d",
  "/items/bamboo_robe_top": "\u7af9\u888d\u670d",
  "/items/silk_robe_top": "\u4e1d\u7ef8\u888d\u670d",
  "/items/radiant_robe_top": "\u5149\u8f89\u888d\u670d",
  "/items/dairyhands_bottoms": "\u6324\u5976\u5de5\u4e0b\u88c5",
  "/items/foragers_bottoms": "\u91c7\u6458\u8005\u4e0b\u88c5",
  "/items/lumberjacks_bottoms": "\u4f10\u6728\u5de5\u4e0b\u88c5",
  "/items/cheesemakers_bottoms": "\u5976\u916a\u5e08\u4e0b\u88c5",
  "/items/crafters_bottoms": "\u5de5\u5320\u4e0b\u88c5",
  "/items/tailors_bottoms": "\u88c1\u7f1d\u4e0b\u88c5",
  "/items/chefs_bottoms": "\u53a8\u5e08\u4e0b\u88c5",
  "/items/brewers_bottoms": "\u996e\u54c1\u5e08\u4e0b\u88c5",
  "/items/alchemists_bottoms": "\u70bc\u91d1\u5e08\u4e0b\u88c5",
  "/items/enhancers_bottoms": "\u5f3a\u5316\u5e08\u4e0b\u88c5",
  "/items/turtle_shell_legs": "\u9f9f\u58f3\u817f\u7532",
  "/items/colossus_plate_legs": "\u5de8\u50cf\u817f\u7532",
  "/items/demonic_plate_legs": "\u6076\u9b54\u817f\u7532",
  "/items/marine_chaps": "\u822a\u6d77\u76ae\u88e4",
  "/items/revenant_chaps": "\u4ea1\u7075\u76ae\u88e4",
  "/items/griffin_chaps": "\u72ee\u9e6b\u76ae\u88e4",
  "/items/icy_robe_bottoms": "\u51b0\u971c\u888d\u88d9",
  "/items/flaming_robe_bottoms": "\u70c8\u7130\u888d\u88d9",
  "/items/luna_robe_bottoms": "\u6708\u795e\u888d\u88d9",
  "/items/royal_water_robe_bottoms": "\u7687\u5bb6\u6c34\u7cfb\u888d\u88d9",
  "/items/royal_nature_robe_bottoms": "\u7687\u5bb6\u81ea\u7136\u7cfb\u888d\u88d9",
  "/items/royal_fire_robe_bottoms": "\u7687\u5bb6\u706b\u7cfb\u888d\u88d9",
  "/items/cheese_plate_legs": "\u5976\u916a\u817f\u7532",
  "/items/verdant_plate_legs": "\u7fe0\u7eff\u817f\u7532",
  "/items/azure_plate_legs": "\u851a\u84dd\u817f\u7532",
  "/items/burble_plate_legs": "\u6df1\u7d2b\u817f\u7532",
  "/items/crimson_plate_legs": "\u7edb\u7ea2\u817f\u7532",
  "/items/rainbow_plate_legs": "\u5f69\u8679\u817f\u7532",
  "/items/holy_plate_legs": "\u795e\u5723\u817f\u7532",
  "/items/rough_chaps": "\u7c97\u7cd9\u76ae\u88e4",
  "/items/reptile_chaps": "\u722c\u884c\u52a8\u7269\u76ae\u88e4",
  "/items/gobo_chaps": "\u54e5\u5e03\u6797\u76ae\u88e4",
  "/items/beast_chaps": "\u91ce\u517d\u76ae\u88e4",
  "/items/umbral_chaps": "\u6697\u5f71\u76ae\u88e4",
  "/items/cotton_robe_bottoms": "\u68c9\u888d\u88d9",
  "/items/linen_robe_bottoms": "\u4e9a\u9ebb\u888d\u88d9",
  "/items/bamboo_robe_bottoms": "\u7af9\u888d\u88d9",
  "/items/silk_robe_bottoms": "\u4e1d\u7ef8\u888d\u88d9",
  "/items/radiant_robe_bottoms": "\u5149\u8f89\u888d\u88d9",
  "/items/enchanted_gloves": "\u9644\u9b54\u624b\u5957",
  "/items/pincer_gloves": "\u87f9\u94b3\u624b\u5957",
  "/items/panda_gloves": "\u718a\u732b\u624b\u5957",
  "/items/magnetic_gloves": "\u78c1\u529b\u624b\u5957",
  "/items/dodocamel_gauntlets": "\u6e21\u6e21\u9a7c\u62a4\u624b",
  "/items/sighted_bracers": "\u7784\u51c6\u62a4\u8155",
  "/items/chrono_gloves": "\u65f6\u7a7a\u624b\u5957",
  "/items/cheese_gauntlets": "\u5976\u916a\u62a4\u624b",
  "/items/verdant_gauntlets": "\u7fe0\u7eff\u62a4\u624b",
  "/items/azure_gauntlets": "\u851a\u84dd\u62a4\u624b",
  "/items/burble_gauntlets": "\u6df1\u7d2b\u62a4\u624b",
  "/items/crimson_gauntlets": "\u7edb\u7ea2\u62a4\u624b",
  "/items/rainbow_gauntlets": "\u5f69\u8679\u62a4\u624b",
  "/items/holy_gauntlets": "\u795e\u5723\u62a4\u624b",
  "/items/rough_bracers": "\u7c97\u7cd9\u62a4\u8155",
  "/items/reptile_bracers": "\u722c\u884c\u52a8\u7269\u62a4\u8155",
  "/items/gobo_bracers": "\u54e5\u5e03\u6797\u62a4\u8155",
  "/items/beast_bracers": "\u91ce\u517d\u62a4\u8155",
  "/items/umbral_bracers": "\u6697\u5f71\u62a4\u8155",
  "/items/cotton_gloves": "\u68c9\u624b\u5957",
  "/items/linen_gloves": "\u4e9a\u9ebb\u624b\u5957",
  "/items/bamboo_gloves": "\u7af9\u624b\u5957",
  "/items/silk_gloves": "\u4e1d\u624b\u5957",
  "/items/radiant_gloves": "\u5149\u8f89\u624b\u5957",
  "/items/collectors_boots": "\u6536\u85cf\u5bb6\u9774",
  "/items/shoebill_shoes": "\u9cb8\u5934\u9e73\u978b",
  "/items/black_bear_shoes": "\u9ed1\u718a\u978b",
  "/items/grizzly_bear_shoes": "\u68d5\u718a\u978b",
  "/items/polar_bear_shoes": "\u5317\u6781\u718a\u978b",
  "/items/centaur_boots": "\u534a\u4eba\u9a6c\u9774",
  "/items/sorcerer_boots": "\u5deb\u5e08\u9774",
  "/items/cheese_boots": "\u5976\u916a\u9774",
  "/items/verdant_boots": "\u7fe0\u7eff\u9774",
  "/items/azure_boots": "\u851a\u84dd\u9774",
  "/items/burble_boots": "\u6df1\u7d2b\u9774",
  "/items/crimson_boots": "\u7edb\u7ea2\u9774",
  "/items/rainbow_boots": "\u5f69\u8679\u9774",
  "/items/holy_boots": "\u795e\u5723\u9774",
  "/items/rough_boots": "\u7c97\u7cd9\u9774",
  "/items/reptile_boots": "\u722c\u884c\u52a8\u7269\u9774",
  "/items/gobo_boots": "\u54e5\u5e03\u6797\u9774",
  "/items/beast_boots": "\u91ce\u517d\u9774",
  "/items/umbral_boots": "\u6697\u5f71\u9774",
  "/items/cotton_boots": "\u68c9\u9774",
  "/items/linen_boots": "\u4e9a\u9ebb\u9774",
  "/items/bamboo_boots": "\u7af9\u9774",
  "/items/silk_boots": "\u4e1d\u9774",
  "/items/radiant_boots": "\u5149\u8f89\u9774",
  "/items/small_pouch": "\u5c0f\u888b\u5b50",
  "/items/medium_pouch": "\u4e2d\u888b\u5b50",
  "/items/large_pouch": "\u5927\u888b\u5b50",
  "/items/giant_pouch": "\u5de8\u5927\u888b\u5b50",
  "/items/gluttonous_pouch": "\u8d2a\u98df\u4e4b\u888b",
  "/items/guzzling_pouch": "\u66b4\u996e\u4e4b\u56ca",
  "/items/necklace_of_efficiency": "\u6548\u7387\u9879\u94fe",
  "/items/fighter_necklace": "\u6218\u58eb\u9879\u94fe",
  "/items/ranger_necklace": "\u5c04\u624b\u9879\u94fe",
  "/items/wizard_necklace": "\u5deb\u5e08\u9879\u94fe",
  "/items/necklace_of_wisdom": "\u7ecf\u9a8c\u9879\u94fe",
  "/items/necklace_of_speed": "\u901f\u5ea6\u9879\u94fe",
  "/items/philosophers_necklace": "\u8d24\u8005\u9879\u94fe",
  "/items/earrings_of_gathering": "\u91c7\u96c6\u8033\u73af",
  "/items/earrings_of_essence_find": "\u7cbe\u534e\u53d1\u73b0\u8033\u73af",
  "/items/earrings_of_armor": "\u62a4\u7532\u8033\u73af",
  "/items/earrings_of_regeneration": "\u6062\u590d\u8033\u73af",
  "/items/earrings_of_resistance": "\u6297\u6027\u8033\u73af",
  "/items/earrings_of_rare_find": "\u7a00\u6709\u53d1\u73b0\u8033\u73af",
  "/items/earrings_of_critical_strike": "\u66b4\u51fb\u8033\u73af",
  "/items/philosophers_earrings": "\u8d24\u8005\u8033\u73af",
  "/items/ring_of_gathering": "\u91c7\u96c6\u6212\u6307",
  "/items/ring_of_essence_find": "\u7cbe\u534e\u53d1\u73b0\u6212\u6307",
  "/items/ring_of_armor": "\u62a4\u7532\u6212\u6307",
  "/items/ring_of_regeneration": "\u6062\u590d\u6212\u6307",
  "/items/ring_of_resistance": "\u6297\u6027\u6212\u6307",
  "/items/ring_of_rare_find": "\u7a00\u6709\u53d1\u73b0\u6212\u6307",
  "/items/ring_of_critical_strike": "\u66b4\u51fb\u6212\u6307",
  "/items/philosophers_ring": "\u8d24\u8005\u6212\u6307",
  "/items/basic_task_badge": "\u57fa\u7840\u4efb\u52a1\u5fbd\u7ae0",
  "/items/advanced_task_badge": "\u9ad8\u7ea7\u4efb\u52a1\u5fbd\u7ae0",
  "/items/expert_task_badge": "\u4e13\u5bb6\u4efb\u52a1\u5fbd\u7ae0",
  "/items/celestial_brush": "\u661f\u7a7a\u5237\u5b50",
  "/items/cheese_brush": "\u5976\u916a\u5237\u5b50",
  "/items/verdant_brush": "\u7fe0\u7eff\u5237\u5b50",
  "/items/azure_brush": "\u851a\u84dd\u5237\u5b50",
  "/items/burble_brush": "\u6df1\u7d2b\u5237\u5b50",
  "/items/crimson_brush": "\u7edb\u7ea2\u5237\u5b50",
  "/items/rainbow_brush": "\u5f69\u8679\u5237\u5b50",
  "/items/holy_brush": "\u795e\u5723\u5237\u5b50",
  "/items/celestial_shears": "\u661f\u7a7a\u526a\u5200",
  "/items/cheese_shears": "\u5976\u916a\u526a\u5200",
  "/items/verdant_shears": "\u7fe0\u7eff\u526a\u5200",
  "/items/azure_shears": "\u851a\u84dd\u526a\u5200",
  "/items/burble_shears": "\u6df1\u7d2b\u526a\u5200",
  "/items/crimson_shears": "\u7edb\u7ea2\u526a\u5200",
  "/items/rainbow_shears": "\u5f69\u8679\u526a\u5200",
  "/items/holy_shears": "\u795e\u5723\u526a\u5200",
  "/items/celestial_hatchet": "\u661f\u7a7a\u65a7\u5934",
  "/items/cheese_hatchet": "\u5976\u916a\u65a7\u5934",
  "/items/verdant_hatchet": "\u7fe0\u7eff\u65a7\u5934",
  "/items/azure_hatchet": "\u851a\u84dd\u65a7\u5934",
  "/items/burble_hatchet": "\u6df1\u7d2b\u65a7\u5934",
  "/items/crimson_hatchet": "\u7edb\u7ea2\u65a7\u5934",
  "/items/rainbow_hatchet": "\u5f69\u8679\u65a7\u5934",
  "/items/holy_hatchet": "\u795e\u5723\u65a7\u5934",
  "/items/celestial_hammer": "\u661f\u7a7a\u9524\u5b50",
  "/items/cheese_hammer": "\u5976\u916a\u9524\u5b50",
  "/items/verdant_hammer": "\u7fe0\u7eff\u9524\u5b50",
  "/items/azure_hammer": "\u851a\u84dd\u9524\u5b50",
  "/items/burble_hammer": "\u6df1\u7d2b\u9524\u5b50",
  "/items/crimson_hammer": "\u7edb\u7ea2\u9524\u5b50",
  "/items/rainbow_hammer": "\u5f69\u8679\u9524\u5b50",
  "/items/holy_hammer": "\u795e\u5723\u9524\u5b50",
  "/items/celestial_chisel": "\u661f\u7a7a\u51ff\u5b50",
  "/items/cheese_chisel": "\u5976\u916a\u51ff\u5b50",
  "/items/verdant_chisel": "\u7fe0\u7eff\u51ff\u5b50",
  "/items/azure_chisel": "\u851a\u84dd\u51ff\u5b50",
  "/items/burble_chisel": "\u6df1\u7d2b\u51ff\u5b50",
  "/items/crimson_chisel": "\u7edb\u7ea2\u51ff\u5b50",
  "/items/rainbow_chisel": "\u5f69\u8679\u51ff\u5b50",
  "/items/holy_chisel": "\u795e\u5723\u51ff\u5b50",
  "/items/celestial_needle": "\u661f\u7a7a\u9488",
  "/items/cheese_needle": "\u5976\u916a\u9488",
  "/items/verdant_needle": "\u7fe0\u7eff\u9488",
  "/items/azure_needle": "\u851a\u84dd\u9488",
  "/items/burble_needle": "\u6df1\u7d2b\u9488",
  "/items/crimson_needle": "\u7edb\u7ea2\u9488",
  "/items/rainbow_needle": "\u5f69\u8679\u9488",
  "/items/holy_needle": "\u795e\u5723\u9488",
  "/items/celestial_spatula": "\u661f\u7a7a\u9505\u94f2",
  "/items/cheese_spatula": "\u5976\u916a\u9505\u94f2",
  "/items/verdant_spatula": "\u7fe0\u7eff\u9505\u94f2",
  "/items/azure_spatula": "\u851a\u84dd\u9505\u94f2",
  "/items/burble_spatula": "\u6df1\u7d2b\u9505\u94f2",
  "/items/crimson_spatula": "\u7edb\u7ea2\u9505\u94f2",
  "/items/rainbow_spatula": "\u5f69\u8679\u9505\u94f2",
  "/items/holy_spatula": "\u795e\u5723\u9505\u94f2",
  "/items/celestial_pot": "\u661f\u7a7a\u58f6",
  "/items/cheese_pot": "\u5976\u916a\u58f6",
  "/items/verdant_pot": "\u7fe0\u7eff\u58f6",
  "/items/azure_pot": "\u851a\u84dd\u58f6",
  "/items/burble_pot": "\u6df1\u7d2b\u58f6",
  "/items/crimson_pot": "\u7edb\u7ea2\u58f6",
  "/items/rainbow_pot": "\u5f69\u8679\u58f6",
  "/items/holy_pot": "\u795e\u5723\u58f6",
  "/items/celestial_alembic": "\u661f\u7a7a\u84b8\u998f\u5668",
  "/items/cheese_alembic": "\u5976\u916a\u84b8\u998f\u5668",
  "/items/verdant_alembic": "\u7fe0\u7eff\u84b8\u998f\u5668",
  "/items/azure_alembic": "\u851a\u84dd\u84b8\u998f\u5668",
  "/items/burble_alembic": "\u6df1\u7d2b\u84b8\u998f\u5668",
  "/items/crimson_alembic": "\u7edb\u7ea2\u84b8\u998f\u5668",
  "/items/rainbow_alembic": "\u5f69\u8679\u84b8\u998f\u5668",
  "/items/holy_alembic": "\u795e\u5723\u84b8\u998f\u5668",
  "/items/celestial_enhancer": "\u661f\u7a7a\u5f3a\u5316\u5668",
  "/items/cheese_enhancer": "\u5976\u916a\u5f3a\u5316\u5668",
  "/items/verdant_enhancer": "\u7fe0\u7eff\u5f3a\u5316\u5668",
  "/items/azure_enhancer": "\u851a\u84dd\u5f3a\u5316\u5668",
  "/items/burble_enhancer": "\u6df1\u7d2b\u5f3a\u5316\u5668",
  "/items/crimson_enhancer": "\u7edb\u7ea2\u5f3a\u5316\u5668",
  "/items/rainbow_enhancer": "\u5f69\u8679\u5f3a\u5316\u5668",
  "/items/holy_enhancer": "\u795e\u5723\u5f3a\u5316\u5668",
  "/items/milk": "\u725b\u5976",
  "/items/verdant_milk": "\u7fe0\u7eff\u725b\u5976",
  "/items/azure_milk": "\u851a\u84dd\u725b\u5976",
  "/items/burble_milk": "\u6df1\u7d2b\u725b\u5976",
  "/items/crimson_milk": "\u7edb\u7ea2\u725b\u5976",
  "/items/rainbow_milk": "\u5f69\u8679\u725b\u5976",
  "/items/holy_milk": "\u795e\u5723\u725b\u5976",
  "/items/cheese": "\u5976\u916a",
  "/items/verdant_cheese": "\u7fe0\u7eff\u5976\u916a",
  "/items/azure_cheese": "\u851a\u84dd\u5976\u916a",
  "/items/burble_cheese": "\u6df1\u7d2b\u5976\u916a",
  "/items/crimson_cheese": "\u7edb\u7ea2\u5976\u916a",
  "/items/rainbow_cheese": "\u5f69\u8679\u5976\u916a",
  "/items/holy_cheese": "\u795e\u5723\u5976\u916a",
  "/items/log": "\u539f\u6728",
  "/items/birch_log": "\u767d\u6866\u539f\u6728",
  "/items/cedar_log": "\u96ea\u677e\u539f\u6728",
  "/items/purpleheart_log": "\u7d2b\u5fc3\u539f\u6728",
  "/items/ginkgo_log": "\u94f6\u674f\u539f\u6728",
  "/items/redwood_log": "\u7ea2\u6749\u539f\u6728",
  "/items/arcane_log": "\u795e\u79d8\u539f\u6728",
  "/items/lumber": "\u6728\u677f",
  "/items/birch_lumber": "\u767d\u6866\u6728\u677f",
  "/items/cedar_lumber": "\u96ea\u677e\u6728\u677f",
  "/items/purpleheart_lumber": "\u7d2b\u5fc3\u6728\u677f",
  "/items/ginkgo_lumber": "\u94f6\u674f\u6728\u677f",
  "/items/redwood_lumber": "\u7ea2\u6749\u6728\u677f",
  "/items/arcane_lumber": "\u795e\u79d8\u6728\u677f",
  "/items/rough_hide": "\u7c97\u7cd9\u517d\u76ae",
  "/items/reptile_hide": "\u722c\u884c\u52a8\u7269\u76ae",
  "/items/gobo_hide": "\u54e5\u5e03\u6797\u76ae",
  "/items/beast_hide": "\u91ce\u517d\u76ae",
  "/items/umbral_hide": "\u6697\u5f71\u76ae",
  "/items/rough_leather": "\u7c97\u7cd9\u76ae\u9769",
  "/items/reptile_leather": "\u722c\u884c\u52a8\u7269\u76ae\u9769",
  "/items/gobo_leather": "\u54e5\u5e03\u6797\u76ae\u9769",
  "/items/beast_leather": "\u91ce\u517d\u76ae\u9769",
  "/items/umbral_leather": "\u6697\u5f71\u76ae\u9769",
  "/items/cotton": "\u68c9\u82b1",
  "/items/flax": "\u4e9a\u9ebb",
  "/items/bamboo_branch": "\u7af9\u5b50",
  "/items/cocoon": "\u8695\u8327",
  "/items/radiant_fiber": "\u5149\u8f89\u7ea4\u7ef4",
  "/items/cotton_fabric": "\u68c9\u82b1\u5e03\u6599",
  "/items/linen_fabric": "\u4e9a\u9ebb\u5e03\u6599",
  "/items/bamboo_fabric": "\u7af9\u5b50\u5e03\u6599",
  "/items/silk_fabric": "\u4e1d\u7ef8",
  "/items/radiant_fabric": "\u5149\u8f89\u5e03\u6599",
  "/items/egg": "\u9e21\u86cb",
  "/items/wheat": "\u5c0f\u9ea6",
  "/items/sugar": "\u7cd6",
  "/items/blueberry": "\u84dd\u8393",
  "/items/blackberry": "\u9ed1\u8393",
  "/items/strawberry": "\u8349\u8393",
  "/items/mooberry": "\u54de\u6885",
  "/items/marsberry": "\u706b\u661f\u6885",
  "/items/spaceberry": "\u592a\u7a7a\u6885",
  "/items/apple": "\u82f9\u679c",
  "/items/orange": "\u6a59\u5b50",
  "/items/plum": "\u674e\u5b50",
  "/items/peach": "\u6843\u5b50",
  "/items/dragon_fruit": "\u706b\u9f99\u679c",
  "/items/star_fruit": "\u6768\u6843",
  "/items/arabica_coffee_bean": "\u4f4e\u7ea7\u5496\u5561\u8c46",
  "/items/robusta_coffee_bean": "\u4e2d\u7ea7\u5496\u5561\u8c46",
  "/items/liberica_coffee_bean": "\u9ad8\u7ea7\u5496\u5561\u8c46",
  "/items/excelsa_coffee_bean": "\u7279\u7ea7\u5496\u5561\u8c46",
  "/items/fieriosa_coffee_bean": "\u706b\u5c71\u5496\u5561\u8c46",
  "/items/spacia_coffee_bean": "\u592a\u7a7a\u5496\u5561\u8c46",
  "/items/green_tea_leaf": "\u7eff\u8336\u53f6",
  "/items/black_tea_leaf": "\u9ed1\u8336\u53f6",
  "/items/burble_tea_leaf": "\u7d2b\u8336\u53f6",
  "/items/moolong_tea_leaf": "\u54de\u9f99\u8336\u53f6",
  "/items/red_tea_leaf": "\u7ea2\u8336\u53f6",
  "/items/emp_tea_leaf": "\u865a\u7a7a\u8336\u53f6",
  "/items/catalyst_of_coinification": "\u70b9\u91d1\u50ac\u5316\u5242",
  "/items/catalyst_of_decomposition": "\u5206\u89e3\u50ac\u5316\u5242",
  "/items/catalyst_of_transmutation": "\u8f6c\u5316\u50ac\u5316\u5242",
  "/items/prime_catalyst": "\u81f3\u9ad8\u50ac\u5316\u5242",
  "/items/snake_fang": "\u86c7\u7259",
  "/items/shoebill_feather": "\u9cb8\u5934\u9e73\u7fbd\u6bdb",
  "/items/snail_shell": "\u8717\u725b\u58f3",
  "/items/crab_pincer": "\u87f9\u94b3",
  "/items/turtle_shell": "\u4e4c\u9f9f\u58f3",
  "/items/marine_scale": "\u6d77\u6d0b\u9cde\u7247",
  "/items/treant_bark": "\u6811\u76ae",
  "/items/centaur_hoof": "\u534a\u4eba\u9a6c\u8e44",
  "/items/luna_wing": "\u6708\u795e\u7ffc",
  "/items/gobo_rag": "\u54e5\u5e03\u6797\u62b9\u5e03",
  "/items/goggles": "\u62a4\u76ee\u955c",
  "/items/magnifying_glass": "\u653e\u5927\u955c",
  "/items/eye_of_the_watcher": "\u89c2\u5bdf\u8005\u4e4b\u773c",
  "/items/icy_cloth": "\u51b0\u971c\u7ec7\u7269",
  "/items/flaming_cloth": "\u70c8\u7130\u7ec7\u7269",
  "/items/sorcerers_sole": "\u9b54\u6cd5\u5e08\u978b\u5e95",
  "/items/chrono_sphere": "\u65f6\u7a7a\u7403",
  "/items/frost_sphere": "\u51b0\u971c\u7403",
  "/items/panda_fluff": "\u718a\u732b\u7ed2",
  "/items/black_bear_fluff": "\u9ed1\u718a\u7ed2",
  "/items/grizzly_bear_fluff": "\u68d5\u718a\u7ed2",
  "/items/polar_bear_fluff": "\u5317\u6781\u718a\u7ed2",
  "/items/red_panda_fluff": "\u5c0f\u718a\u732b\u7ed2",
  "/items/magnet": "\u78c1\u94c1",
  "/items/stalactite_shard": "\u949f\u4e73\u77f3\u788e\u7247",
  "/items/living_granite": "\u82b1\u5c97\u5ca9",
  "/items/colossus_core": "\u5de8\u50cf\u6838\u5fc3",
  "/items/vampire_fang": "\u5438\u8840\u9b3c\u4e4b\u7259",
  "/items/werewolf_claw": "\u72fc\u4eba\u4e4b\u722a",
  "/items/revenant_anima": "\u4ea1\u8005\u4e4b\u9b42",
  "/items/soul_fragment": "\u7075\u9b42\u788e\u7247",
  "/items/infernal_ember": "\u5730\u72f1\u4f59\u70ec",
  "/items/demonic_core": "\u6076\u9b54\u6838\u5fc3",
  "/items/griffin_leather": "\u72ee\u9e6b\u4e4b\u76ae",
  "/items/manticore_sting": "\u874e\u72ee\u4e4b\u523a",
  "/items/jackalope_antler": "\u9e7f\u89d2\u5154\u4e4b\u89d2",
  "/items/dodocamel_plume": "\u6e21\u6e21\u9a7c\u4e4b\u7fce",
  "/items/griffin_talon": "\u72ee\u9e6b\u4e4b\u722a",
  "/items/acrobats_ribbon": "\u6742\u6280\u5e08\u5f69\u5e26",
  "/items/magicians_cloth": "\u9b54\u672f\u5e08\u7ec7\u7269",
  "/items/chaotic_chain": "\u6df7\u6c8c\u9501\u94fe",
  "/items/cursed_ball": "\u8bc5\u5492\u4e4b\u7403",
  "/items/royal_cloth": "\u7687\u5bb6\u7ec7\u7269",
  "/items/knights_ingot": "\u9a91\u58eb\u4e4b\u952d",
  "/items/bishops_scroll": "\u4e3b\u6559\u5377\u8f74",
  "/items/regal_jewel": "\u541b\u738b\u5b9d\u77f3",
  "/items/sundering_jewel": "\u88c2\u7a7a\u5b9d\u77f3",
  "/items/butter_of_proficiency": "\u7cbe\u901a\u4e4b\u6cb9",
  "/items/thread_of_expertise": "\u4e13\u7cbe\u4e4b\u7ebf",
  "/items/branch_of_insight": "\u6d1e\u5bdf\u4e4b\u679d",
  "/items/gluttonous_energy": "\u8d2a\u98df\u80fd\u91cf",
  "/items/guzzling_energy": "\u66b4\u996e\u80fd\u91cf",
  "/items/milking_essence": "\u6324\u5976\u7cbe\u534e",
  "/items/foraging_essence": "\u91c7\u6458\u7cbe\u534e",
  "/items/woodcutting_essence": "\u4f10\u6728\u7cbe\u534e",
  "/items/cheesesmithing_essence": "\u5976\u916a\u953b\u9020\u7cbe\u534e",
  "/items/crafting_essence": "\u5236\u4f5c\u7cbe\u534e",
  "/items/tailoring_essence": "\u7f1d\u7eab\u7cbe\u534e",
  "/items/cooking_essence": "\u70f9\u996a\u7cbe\u534e",
  "/items/brewing_essence": "\u51b2\u6ce1\u7cbe\u534e",
  "/items/alchemy_essence": "\u70bc\u91d1\u7cbe\u534e",
  "/items/enhancing_essence": "\u5f3a\u5316\u7cbe\u534e",
  "/items/swamp_essence": "\u6cbc\u6cfd\u7cbe\u534e",
  "/items/aqua_essence": "\u6d77\u6d0b\u7cbe\u534e",
  "/items/jungle_essence": "\u4e1b\u6797\u7cbe\u534e",
  "/items/gobo_essence": "\u54e5\u5e03\u6797\u7cbe\u534e",
  "/items/eyessence": "\u773c\u7cbe\u534e",
  "/items/sorcerer_essence": "\u6cd5\u5e08\u7cbe\u534e",
  "/items/bear_essence": "\u718a\u718a\u7cbe\u534e",
  "/items/golem_essence": "\u9b54\u50cf\u7cbe\u534e",
  "/items/twilight_essence": "\u66ae\u5149\u7cbe\u534e",
  "/items/abyssal_essence": "\u5730\u72f1\u7cbe\u534e",
  "/items/chimerical_essence": "\u5947\u5e7b\u7cbe\u534e",
  "/items/sinister_essence": "\u9634\u68ee\u7cbe\u534e",
  "/items/enchanted_essence": "\u79d8\u6cd5\u7cbe\u534e",
  "/items/task_crystal": "\u4efb\u52a1\u6c34\u6676",
  "/items/star_fragment": "\u661f\u5149\u788e\u7247",
  "/items/pearl": "\u73cd\u73e0",
  "/items/amber": "\u7425\u73c0",
  "/items/garnet": "\u77f3\u69b4\u77f3",
  "/items/jade": "\u7fe1\u7fe0",
  "/items/amethyst": "\u7d2b\u6c34\u6676",
  "/items/moonstone": "\u6708\u4eae\u77f3",
  "/items/sunstone": "\u592a\u9633\u77f3",
  "/items/philosopher's_stone": "\u8d24\u8005\u4e4b\u77f3",
  "/items/crushed_pearl": "\u73cd\u73e0\u788e\u7247",
  "/items/crushed_amber": "\u7425\u73c0\u788e\u7247",
  "/items/crushed_garnet": "\u77f3\u69b4\u77f3\u788e\u7247",
  "/items/crushed_jade": "\u7fe1\u7fe0\u788e\u7247",
  "/items/crushed_amethyst": "\u7d2b\u6c34\u6676\u788e\u7247",
  "/items/crushed_moonstone": "\u6708\u4eae\u77f3\u788e\u7247",
  "/items/crushed_sunstone": "\u592a\u9633\u77f3\u788e\u7247",
  "/items/crushed_philosopher's_stone": "\u8d24\u8005\u4e4b\u77f3\u788e\u7247",
  "/items/shard_of_protection": "\u4fdd\u62a4\u788e\u7247",
  "/items/mirror_of_protection": "\u4fdd\u62a4\u4e4b\u955c"
  };
})();
