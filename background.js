// note Analytics - Background Service Worker
// note.com非公式APIからデータを取得し、chrome.storage.localに保存する

const API_BASE = "https://note.com/api/v2";
const FETCH_INTERVAL_MINUTES = 360; // 6時間
const MAX_SNAPSHOTS = 90; // 90日分保持

// インストール時
chrome.runtime.onInstalled.addListener(() => {
  chrome.alarms.create("fetchData", { periodInMinutes: FETCH_INTERVAL_MINUTES });
  fetchAndStore();
});

// Chrome起動時に即取得
chrome.runtime.onStartup.addListener(() => {
  chrome.alarms.create("fetchData", { periodInMinutes: FETCH_INTERVAL_MINUTES });
  fetchAndStore();
});

// アラーム発火時
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "fetchData") {
    fetchAndStore();
  }
});

// popup.jsからの手動取得リクエスト
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === "fetchNow") {
    fetchAndStore().then(() => sendResponse({ ok: true })).catch(e => sendResponse({ error: e.message }));
    return true; // async response
  }
});

async function fetchAndStore() {
  const { urlname } = await chrome.storage.sync.get("urlname");
  if (!urlname) {
    console.log("urlname未設定。オプション画面で設定してください。");
    return;
  }

  try {
    const [creatorInfo, articles] = await Promise.all([
      fetchCreatorInfo(urlname),
      fetchAllArticles(urlname),
    ]);

    const today = new Date().toISOString().slice(0, 10);
    const snapshot = {
      follower_count: creatorInfo.followerCount,
      note_count: creatorInfo.noteCount,
      articles: articles.map(a => ({
        key: a.key,
        title: a.name,
        publish_at: a.publishAt,
        like_count: a.likeCount,
        comment_count: a.commentCount || 0,
        is_premium: a.price > 0,
        price: a.price || 0,
        url: `https://note.com/${urlname}/n/${a.key}`,
      })),
    };

    // 既存データを取得
    const { snapshots = {} } = await chrome.storage.local.get("snapshots");

    // 当日の初回データを保持（前日比計算のベースライン）
    if (!snapshots[today + '_base']) {
      snapshots[today + '_base'] = snapshot;
    }
    // 最新データは常に上書き
    snapshots[today] = snapshot;

    // 古いスナップショットを削除（90日超）
    const dates = Object.keys(snapshots).sort();
    while (dates.length > MAX_SNAPSHOTS) {
      const oldest = dates.shift();
      delete snapshots[oldest];
    }

    await chrome.storage.local.set({ snapshots, lastFetched: today });
    console.log(`[note Analytics] ${today} snapshot saved: ${articles.length} articles, ${creatorInfo.followerCount} followers`);

  } catch (e) {
    console.error("[note Analytics] Fetch error:", e);
  }
}

async function fetchCreatorInfo(urlname) {
  const res = await fetch(`${API_BASE}/creators/${urlname}`, {
    headers: { "Accept": "application/json" },
  });
  if (!res.ok) throw new Error(`Creator API error: ${res.status}`);
  const json = await res.json();
  console.log("[note Analytics] Creator info:", JSON.stringify(json.data).slice(0, 200));
  return json.data;
}

async function fetchAllArticles(urlname) {
  const allArticles = [];
  let page = 1;
  const maxPages = 50;

  while (page <= maxPages) {
    const res = await fetch(
      `${API_BASE}/creators/${urlname}/contents?kind=note&page=${page}`,
      {
        headers: { "Accept": "application/json" },
      }
    );
    if (!res.ok) {
      console.error(`[note Analytics] Articles page ${page} error: ${res.status}`);
      break;
    }
    const json = await res.json();
    const contents = json.data?.contents || [];
    console.log(`[note Analytics] Page ${page}: ${contents.length} articles`);
    if (contents.length === 0) break;
    allArticles.push(...contents);
    page++;
    await new Promise(r => setTimeout(r, 300));
  }

  return allArticles;
}
