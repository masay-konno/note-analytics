// note Analytics - Popup Dashboard
const ACCENT = '#d97706';
const ACCENT_LIGHT = 'rgba(217,119,6,0.15)';

Chart.defaults.font.family = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
Chart.defaults.font.size = 10;
if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
  Chart.defaults.color = '#f5f5f7';
  Chart.defaults.borderColor = '#3a3a3c';
}

document.getElementById('btnRefresh').addEventListener('click', function() {
  var btn = document.getElementById('btnRefresh');
  btn.textContent = '取得中...';
  btn.disabled = true;
  chrome.runtime.sendMessage({ action: 'fetchNow' }, function(response) {
    // データ取得完了後、3秒待ってからポップアップを再描画
    setTimeout(function() {
      btn.textContent = '更新';
      btn.disabled = false;
      // ポップアップを閉じずにデータ再読み込み
      document.getElementById('topArticlesBody').replaceChildren();
      document.getElementById('topArticlesEmpty').style.display = 'none';
      // 凡例を削除（再描画時に重複するため）
      var tc = document.getElementById('topArticlesBody').closest('.table-card');
      var oldLegend = tc.querySelector('div[style*="flex-wrap"]');
      if (oldLegend) oldLegend.remove();
      // 既存チャートを破棄
      Chart.helpers.each(Chart.instances, function(instance) { instance.destroy(); });
      init();
    }, 3000);
  });
});

document.getElementById('btnSettings').addEventListener('click', () => {
  chrome.runtime.openOptionsPage();
});

document.getElementById('btnOpenSettings').addEventListener('click', () => {
  chrome.runtime.openOptionsPage();
});

async function init() {
  const { urlname } = await chrome.storage.sync.get('urlname');
  if (!urlname) {
    document.getElementById('setupMsg').style.display = 'block';
    document.getElementById('dashboard').style.display = 'none';
    return;
  }

  document.getElementById('setupMsg').style.display = 'none';
  document.getElementById('dashboard').style.display = 'block';

  const { snapshots = {}, lastFetched } = await chrome.storage.local.get(['snapshots', 'lastFetched']);

  // フォワードフィル: 欠損日を前日値で埋める
  var rawDates = Object.keys(snapshots).filter(function(k) { return k.indexOf('_base') === -1; }).sort();
  if (rawDates.length >= 2) {
    var start = new Date(rawDates[0]);
    var end = new Date(rawDates[rawDates.length - 1]);
    var cursor = new Date(start);
    var lastKey = rawDates[0];
    while (cursor <= end) {
      var key = cursor.toISOString().slice(0, 10);
      if (snapshots[key]) {
        lastKey = key;
      } else {
        snapshots[key] = JSON.parse(JSON.stringify(snapshots[lastKey]));
      }
      cursor.setDate(cursor.getDate() + 1);
    }
  }

  // _baseキーを除外した日付リスト
  const dates = Object.keys(snapshots).filter(function(k) { return k.indexOf('_base') === -1; }).sort();

  if (dates.length === 0) {
    document.getElementById('updatedAt').textContent = 'データ取得中... 「更新」ボタンを押してください';
    return;
  }

  const latestDate = dates[dates.length - 1];
  // 前日スナップショットを基準にする（チャートと統一）
  const prevDate = dates.length >= 2 ? dates[dates.length - 2] : null;
  const latest = snapshots[latestDate];
  const prev = prevDate ? snapshots[prevDate] : null;

  document.getElementById('updatedAt').textContent = 'Last updated: ' + latestDate;

  // --- KPIs (日次が大きく、合計が小さく) ---
  var totalLikes = latest.articles.reduce(function(s, a) { return s + a.like_count; }, 0);
  var totalComments = latest.articles.reduce(function(s, a) { return s + (a.comment_count || 0); }, 0);

  if (prev) {
    var fDiff = latest.follower_count - prev.follower_count;
    // 記事数: publish_atが当日の記事を直接カウント（note_count差分はタイミングでズレるため）
    var nDiff = latest.articles.filter(function(a) { return (a.publish_at || '').slice(0, 10) === latestDate; }).length;
    var prevTotalLikes = prev.articles.reduce(function(s, a) { return s + a.like_count; }, 0);
    var lDiff = totalLikes - prevTotalLikes;
    var prevTotalComments = prev.articles.reduce(function(s, a) { return s + (a.comment_count || 0); }, 0);
    var cDiff = totalComments - prevTotalComments;
    setDiff('kpiFollowersDiff', fDiff, '');
    setDiff('kpiArticlesDiff', nDiff, '');
    setDiff('kpiLikesDiff', lDiff, '');
    setDiff('kpiCommentsDiff', cDiff, '');
  } else {
    setText('kpiFollowersDiff', '—');
    setText('kpiArticlesDiff', '—');
    setText('kpiLikesDiff', '—');
    setText('kpiCommentsDiff', '—');
  }

  document.getElementById('kpiFollowers').textContent = '(' + fmt(latest.follower_count) + ')';
  document.getElementById('kpiArticles').textContent = '(' + fmt(latest.note_count) + ')';
  document.getElementById('kpiLikes').textContent = '(' + fmt(totalLikes) + ')';
  document.getElementById('kpiComments').textContent = '(' + fmt(totalComments) + ')';


  // --- Follower Chart (bar + line) ---
  if (dates.length > 1) {
    var fLabels = [];
    var fTotals = [];
    var fDiffs = [];
    for (var i = 1; i < dates.length; i++) {
      fLabels.push(dates[i].slice(5));
      fTotals.push(snapshots[dates[i]].follower_count);
      fDiffs.push(snapshots[dates[i]].follower_count - snapshots[dates[i-1]].follower_count);
    }
    new Chart(document.getElementById('chartFollowers'), {
      type: 'bar',
      data: {
        labels: fLabels,
        datasets: [
          {
            type: 'bar', label: '日次増加', data: fDiffs,
            backgroundColor: fDiffs.map(function(v) { return v >= 0 ? '#3b82f6' : '#1e3a5f'; }),
            borderRadius: 3, yAxisID: 'yDiff', order: 2,
          },
          {
            type: 'line', label: '合計', data: fTotals,
            borderColor: '#22d3ee', fill: false, tension: 0.3,
            pointRadius: 2, borderWidth: 2, yAxisID: 'yTotal', order: 1,
          },
        ]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: true, position: 'top', labels: { boxWidth: 10, font: { size: 10 } } } },
        scales: {
          x: { grid: { display: false } },
          yDiff: { position: 'left', title: { display: true, text: '日次', font: { size: 9 } }, grid: { color: 'rgba(128,128,128,0.1)' } },
          yTotal: { position: 'right', title: { display: true, text: '合計', font: { size: 9 } }, grid: { display: false }, min: fTotals[0] },
        }
      },
    });
  }

  // --- Daily Likes Chart ---
  if (dates.length > 1) {
    var dlLabels = [];
    var dlDiffs = [];
    var dlTotals = [];
    for (var i = 1; i < dates.length; i++) {
      var curTotal = snapshots[dates[i]].articles.reduce(function(s, a) { return s + a.like_count; }, 0);
      var prvTotal = snapshots[dates[i-1]].articles.reduce(function(s, a) { return s + a.like_count; }, 0);
      dlLabels.push(dates[i].slice(5));
      dlDiffs.push(curTotal - prvTotal);
      dlTotals.push(curTotal);
    }
    new Chart(document.getElementById('chartDailyLikes'), {
      type: 'bar',
      data: {
        labels: dlLabels,
        datasets: [
          {
            type: 'bar', label: '日次増加', data: dlDiffs,
            backgroundColor: '#ef4444', borderRadius: 3, yAxisID: 'yDiff', order: 2,
          },
          {
            type: 'line', label: '合計', data: dlTotals,
            borderColor: '#fbbf24', fill: false, tension: 0.3,
            pointRadius: 2, borderWidth: 2, yAxisID: 'yTotal', order: 1,
          },
        ]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: true, position: 'top', labels: { boxWidth: 10, font: { size: 10 } } } },
        scales: {
          x: { grid: { display: false } },
          yDiff: { position: 'left', title: { display: true, text: '日次', font: { size: 9 } }, grid: { color: 'rgba(128,128,128,0.1)' } },
          yTotal: { position: 'right', title: { display: true, text: '合計', font: { size: 9 } }, grid: { display: false }, min: dlTotals[0] },
        }
      },
    });
  }

  // --- Daily Comments Chart ---
  if (dates.length > 1) {
    var dcLabels = [];
    var dcDiffs = [];
    var dcTotals = [];
    for (var i = 1; i < dates.length; i++) {
      var curComments = snapshots[dates[i]].articles.reduce(function(s, a) { return s + (a.comment_count || 0); }, 0);
      var prvComments = snapshots[dates[i-1]].articles.reduce(function(s, a) { return s + (a.comment_count || 0); }, 0);
      dcLabels.push(dates[i].slice(5));
      dcDiffs.push(curComments - prvComments);
      dcTotals.push(curComments);
    }
    new Chart(document.getElementById('chartDailyComments'), {
      type: 'bar',
      data: {
        labels: dcLabels,
        datasets: [
          {
            type: 'bar', label: '日次増加', data: dcDiffs,
            backgroundColor: '#8b5cf6', borderRadius: 3, yAxisID: 'yDiff', order: 2,
          },
          {
            type: 'line', label: '合計', data: dcTotals,
            borderColor: '#facc15', fill: false, tension: 0.3,
            pointRadius: 2, borderWidth: 2, yAxisID: 'yTotal', order: 1,
          },
        ]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: true, position: 'top', labels: { boxWidth: 10, font: { size: 10 } } } },
        scales: {
          x: { grid: { display: false } },
          yDiff: { position: 'left', title: { display: true, text: '日次', font: { size: 9 } }, grid: { color: 'rgba(128,128,128,0.1)' }, ticks: { stepSize: 1 } },
          yTotal: { position: 'right', title: { display: true, text: '合計', font: { size: 9 } }, grid: { display: false }, min: dcTotals[0] },
        }
      },
    });
  }

  // --- 投稿頻度 vs フォロワー増加（週次） ---
  if (dates.length >= 7) {
    var weekLabels = [];
    var weekPosts = [];
    var weekFollowerDiffs = [];
    // 週単位でグルーピング（末尾から7日ずつ）
    var weekSize = 7;
    var weekStart = dates.length % weekSize;
    if (weekStart === 0) weekStart = weekSize;
    for (var wi = weekStart; wi < dates.length; wi += weekSize) {
      var weekEnd = Math.min(wi + weekSize, dates.length);
      var wLabel = dates[wi].slice(5) + '~';
      // その週に公開された記事数
      var posts = 0;
      for (var di = wi; di < weekEnd; di++) {
        var dayArticles = snapshots[dates[di]].articles;
        posts += dayArticles.filter(function(a) { return (a.publish_at || '').slice(0, 10) === dates[di]; }).length;
      }
      // フォロワー純増
      var fStart = snapshots[dates[wi]].follower_count;
      var fEnd = snapshots[dates[weekEnd - 1]].follower_count;
      weekLabels.push(wLabel);
      weekPosts.push(posts);
      weekFollowerDiffs.push(fEnd - fStart);
    }
    if (weekLabels.length > 0) {
      new Chart(document.getElementById('chartFreqVsFollowers'), {
        type: 'bar',
        data: {
          labels: weekLabels,
          datasets: [
            {
              type: 'bar', label: '投稿数', data: weekPosts,
              backgroundColor: '#15803d', borderRadius: 3, yAxisID: 'yPosts', order: 2,
            },
            {
              type: 'line', label: 'フォロワー純増', data: weekFollowerDiffs,
              borderColor: '#4ade80', fill: false, tension: 0.3,
              pointRadius: 3, borderWidth: 2, yAxisID: 'yFollowers', order: 1,
            },
          ]
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: { legend: { display: true, position: 'top', labels: { boxWidth: 10, font: { size: 10 } } } },
          scales: {
            x: { grid: { display: false } },
            yPosts: { position: 'left', title: { display: true, text: '投稿数', font: { size: 9 } }, grid: { color: 'rgba(128,128,128,0.1)' }, beginAtZero: true },
            yFollowers: { position: 'right', title: { display: true, text: 'フォロワー純増', font: { size: 9 } }, grid: { display: false } },
          }
        },
      });
    }
  }


  // --- Top articles (7日間の日別積み上げ) ---
  var last7 = dates.slice(-7);
  if (last7.length >= 2) {
    // 各日の各記事の増加を計算
    var DAY_COLORS = ['#022c22','#064e3b','#047857','#10b981','#34d399','#86efac','#d1fae5'];
    var articleDiffs = {}; // key -> { title, days: [diff0, diff1, ...], total }

    for (var di = 1; di < last7.length; di++) {
      var curSnap = snapshots[last7[di]];
      var prvSnap = snapshots[last7[di - 1]];
      if (!curSnap || !prvSnap) continue;

      var prvMap = {};
      prvSnap.articles.forEach(function(a) { prvMap[a.key] = a.like_count; });

      curSnap.articles.forEach(function(a) {
        var diff = a.like_count - (prvMap[a.key] || 0);
        if (!articleDiffs[a.key]) {
          articleDiffs[a.key] = { title: a.title, likes: a.like_count, url: a.url, days: new Array(last7.length - 1).fill(0), total: 0 };
        }
        articleDiffs[a.key].days[di - 1] = Math.max(0, diff);
        articleDiffs[a.key].total += Math.max(0, diff);
        articleDiffs[a.key].likes = a.like_count;
        articleDiffs[a.key].url = a.url;
      });
    }

    var topList = Object.values(articleDiffs).filter(function(a) { return a.total > 0; });
    topList.sort(function(a, b) { return b.total - a.total; });
    var top = topList.slice(0, 20);

    if (top.length > 0) {
      // 凡例を追加
      var legendContainer = document.createElement('div');
      legendContainer.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap;margin-bottom:8px;';
      for (var li = 0; li < last7.length - 1; li++) {
        var item = document.createElement('span');
        item.style.cssText = 'display:flex;align-items:center;gap:3px;font-size:10px;color:var(--text-secondary);';
        var swatch = document.createElement('span');
        swatch.style.cssText = 'display:inline-block;width:10px;height:10px;border-radius:2px;background:' + DAY_COLORS[li % DAY_COLORS.length] + ';';
        item.appendChild(swatch);
        item.appendChild(document.createTextNode(last7[li + 1].slice(5)));
        legendContainer.appendChild(item);
      }
      var tableCard = document.getElementById('topArticlesBody').closest('.table-card');
      tableCard.insertBefore(legendContainer, tableCard.querySelector('table'));

      var maxTotal = top[0].total;
      var tbody = document.getElementById('topArticlesBody');
      top.forEach(function(r, idx) {
        var tr = document.createElement('tr');

        var tdRank = document.createElement('td');
        tdRank.className = 'num';
        tdRank.style.fontWeight = '600';
        tdRank.textContent = idx + 1;
        tr.appendChild(tdRank);

        var tdTitle = document.createElement('td');
        tdTitle.className = 'title-cell-short';
        var link = document.createElement('a');
        link.href = r.url;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        link.textContent = r.title;
        tdTitle.appendChild(link);
        tr.appendChild(tdTitle);

        var tdDiff = document.createElement('td');
        tdDiff.className = 'num';
        tdDiff.style.color = '#22c55e';
        tdDiff.style.fontWeight = '600';
        tdDiff.textContent = '+' + r.total;
        tr.appendChild(tdDiff);

        var tdLikes = document.createElement('td');
        tdLikes.className = 'num';
        tdLikes.textContent = fmt(r.likes);
        tr.appendChild(tdLikes);

        var tdBar = document.createElement('td');
        tdBar.style.width = '250px';
        var barContainer = document.createElement('div');
        barContainer.style.cssText = 'display:flex;height:14px;border-radius:3px;position:relative;';
        var barWidth = maxTotal > 0 ? (r.total / maxTotal) * 100 : 0;
        r.days.forEach(function(d, di) {
          if (d <= 0) return;
          var seg = document.createElement('div');
          seg.className = 'bar-seg';
          seg.style.width = (d / maxTotal) * 100 + '%';
          seg.style.backgroundColor = DAY_COLORS[di % DAY_COLORS.length];
          seg.setAttribute('data-tip', last7[di + 1].slice(5) + ': +' + d);
          barContainer.appendChild(seg);
        });
        tdBar.appendChild(barContainer);
        tr.appendChild(tdBar);

        tbody.appendChild(tr);
      });
    } else {
      document.getElementById('topArticlesEmpty').style.display = 'block';
    }
  } else {
    document.getElementById('topArticlesEmpty').style.display = 'block';
  }


}

function chartOpts() {
  return {
    responsive: true, maintainAspectRatio: false,
    plugins: { legend: { display: false } },
    scales: {
      x: { grid: { display: false } },
      y: { grid: { color: 'rgba(128,128,128,0.1)' } },
    }
  };
}
function fmt(n) { return n != null ? n.toLocaleString() : '—'; }
function setText(id, v) { document.getElementById(id).textContent = v; }
function setDiff(id, v, suffix) {
  var el = document.getElementById(id);
  if (v == null) return;
  el.textContent = (v >= 0 ? '+' : '') + v + (suffix || '');
  // kpi-value-bigクラスを保持したまま色だけ追加
  var base = el.className.indexOf('kpi-value-big') >= 0 ? 'kpi-value-big' : 'kpi-diff';
  el.className = base + ' ' + (v >= 0 ? 'positive' : 'negative');
}
function truncate(s, n) { return s.length > n ? s.slice(0, n) + '…' : s; }

init();
