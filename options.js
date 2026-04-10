// Load saved urlname
chrome.storage.sync.get('urlname', function(data) {
  if (data.urlname) {
    document.getElementById('urlname').value = data.urlname;
  }
});

// Save
document.getElementById('btnSave').addEventListener('click', function() {
  var urlname = document.getElementById('urlname').value.trim();
  if (!urlname) return;

  // @やURLが入力された場合のクリーニング
  urlname = urlname.replace(/^https?:\/\/note\.com\//, '').replace(/^@/, '').replace(/\/.*$/, '');

  chrome.storage.sync.set({ urlname: urlname }, function() {
    document.getElementById('urlname').value = urlname;
    var status = document.getElementById('status');
    status.style.display = 'block';
    status.textContent = '保存しました: ' + urlname;
    setTimeout(function() { status.style.display = 'none'; }, 2000);

    // 保存後すぐにデータ取得開始
    chrome.runtime.sendMessage({ action: 'fetchNow' });
  });
});

// インポート
document.getElementById('btnImport').addEventListener('click', function() {
  var importStatus = document.getElementById('importStatus');
  importStatus.style.display = 'block';
  importStatus.style.color = '#8e8e93';
  importStatus.textContent = 'インポート中...';

  fetch(chrome.runtime.getURL('import_data.json'))
    .then(function(res) { return res.json(); })
    .then(function(snapshots) {
      var dates = Object.keys(snapshots).sort();
      chrome.storage.local.set(
        { snapshots: snapshots, lastFetched: dates[dates.length - 1] },
        function() {
          importStatus.style.color = '#22c55e';
          importStatus.textContent = 'インポート完了: ' + dates.length + '日分 (' + dates[0] + ' ~ ' + dates[dates.length - 1] + ')';
        }
      );
    })
    .catch(function(e) {
      importStatus.style.color = '#ef4444';
      importStatus.textContent = 'エラー: ' + e.message;
    });
});
