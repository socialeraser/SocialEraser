// SocialEraser i18n - Multi-language Support
// 8 languages: en, zh-CN, zh-TW, ja, ko, es, de, fr

(function() {
  'use strict';

  console.log('[SocialEraser] i18n.js loading...');

  // 中文文案需要更细粒度的处理
  // 使用 {var} 作为占位符
  const TRANSLATIONS = {
    en: {
      // UI 标签
      openXWebsite: 'Open X Website',
      pleaseLogin: 'Please Login First',
      checking: 'Checking...',
      checkingLogin: 'Checking login status...',
      pleaseRefreshXPage: 'Login status stuck. Please refresh the X page (F5)',
      xWebsiteDetected: 'X website detected',
      pleaseOpenX: 'Please open X website',
      loggedIn: 'Logged in',
      notLoggedIn: 'Not logged in',
      notLoggedInHint: 'Please login first',
      selectOptions: 'Select items to delete',
      originalTweets: 'Original Tweets',
      // Original Tweets 备份提示（不可逆操作警告，含 {link} 占位符 → 替换为 <a>X archive help</a>）
      originalTweetsBackupTip: 'Tweets are permanently deleted and cannot be recovered. We recommend downloading your {link} first.',
      archiveLinkText: 'X archive',
      replies: 'Replies',
      retweets: 'Retweets',
      likes: 'Likes',
      bookmarks: 'Bookmarks',
      following: 'Following',
      filterOptions: 'Filter options',
      fromDate: 'From date',
      toDate: 'To date',
      keywordPlaceholder: 'Filter by keyword...',
      startCleanup: 'Start Cleanup',
      pause: 'Pause',
      resume: 'Resume',
      stop: 'Stop',
      processing: 'Processing...',
      processed: 'Processed',
      waiting: 'Waiting for start...',
      completed: 'Completed',
      paused: 'Paused',
      stopped: 'Stopped',
      activity: 'Activity',
      privacy: 'Privacy',
      terms: 'Terms',
      help: 'Help',
      trustTitle: '100% Local Processing',
      trustText: 'Your data is processed locally. We never store your credentials or personal information.',

      // 弹窗/警告
      noItemsSelected: 'Please select at least one option',
      confirmStop: 'Stop cleanup? Progress will be lost.',

      // 日志消息
      refreshingConfig: 'Refreshing config from remote...',
      configRefreshed: 'Config refreshed.',
      configRefreshFailed: 'Failed to refresh config, status re-checked',
      startingCleanup: 'Starting cleanup...',
      cleanupCompleted: 'Cleanup completed. Total processed: {count}',
      stoppedByUser: 'Stopped by user. Processed: {count}',
      pausedLog: 'Paused',
      resumedLog: 'Resumed',
      likesRequiresNav: 'Likes requires /likes page, navigating...',
      bookmarksRequiresNav: 'Bookmarks requires /bookmarks page, navigating...',
      followingRequiresNav: 'Following requires /following page, navigating...',
      tweetsRequiresNav: 'Tweets requires your profile page, navigating...',
      originalTweetsRequiresNav: 'Original Tweets requires your profile page, navigating...',
      repliesRequiresNav: 'Replies requires /with_replies page, navigating...',
      retweetsRequiresNav: 'Retweets requires /with_replies page, navigating...',
      navigatingTo: 'Navigating to: {url}',
      pageLoadedResuming: 'Page loaded, resuming cleanup...',
      cleanupAutoResumed: 'Cleanup auto-resumed',
      pageTypeMismatch: 'Page type mismatch, aborting',
      startingLikesCleanup: 'Starting likes cleanup',
      noUnlikeButtons: 'No processable content found',
      noMoreLikes: 'No more likes',
      endOfLikes: 'End of likes',
      clickedUnlike: 'Clicked unlike button #{count}',
      unlikeFailed: 'Unlike failed: {error}',
      clickReturnedFalse: 'Click returned false for unlike button',

      // 诊断
      pageDiagnostics: '=== Page Diagnostics ===',
      endDiagnostics: '=== End Diagnostics ===',
      totalTestIdElements: 'Total data-testid elements: {count}',
      topTestIds: 'Top data-testids: {list}',
      totalLabeledButtons: 'Total labeled buttons: {count}',
      topAriaLabels: 'Top aria-labels: {list}',

      // 每日额度
      dailyLimitReached: 'Daily free limit reached ({used}/{limit})',
      dailyLimitReachedHint: 'You have used all {limit} free actions today.\nUpgrade to Premium for unlimited cleanup!',
      upgradeToPremium: 'Upgrade to Premium',
      maybeLater: 'Maybe Later',
      usedToday: 'Used today: {used} / {limit}',
      cleanupSkipped: 'Cleanup skipped due to daily limit',

      // 过滤
      invalidDateRange: 'Start date cannot be later than end date',
      noItemsMatched: 'No items matched the filter',
      dateFilterSkipped: 'Date filter skipped for {type}: no timestamp found on some items',
      cleanupStuck: 'No progress for 30s, stopping (X UI may have changed)',
      dailyBudgetExhausted: 'Daily budget reached, skipping {type}',
      noRemoveBookmarkButtons: 'No processable content found',
      foundButtonsCount: 'Found {count} items to process',
      processedNavigatingTo: 'Switching to {next} page...',
      startingBookmarksCleanup: 'Starting bookmarks cleanup',
      noMoreBookmarks: 'No more bookmarks',
      endOfBookmarks: 'End of bookmarks',
      clickedRemoveBookmark: 'Removed bookmark #{count}',
      clickReturnedFalseRemoveBookmark: 'Click failed for remove bookmark',
      removeBookmarkFailed: 'Remove bookmark failed: {error}',
      startingFollowingCleanup: 'Starting following cleanup',
      noUnfollowButtons: 'No unfollow buttons found',
      clickedUnfollow: 'Unfollowed #{count}',
      clickReturnedFalseConfirm: 'Click failed for confirm button',
      unfollowedNoConfirm: 'Unfollowed #{count} (no confirm dialog)',
      unfollowFailed: 'Unfollow failed: {error}',
      noMoreFollowing: 'No more following',
      // Tweets 清理日志 + 提示
      startingTweetsCleanup: 'Starting tweets cleanup',
      noMoreTweets: 'No more tweets',
      endOfTweets: 'End of tweets list',
      tweetDeleteFailed: 'Tweet delete failed: {error}',
      unretweetFailed: 'Undo repost failed: {error}',
      pinnedTweetSkipped: 'Pinned tweet skipped (unpin first)',
      unreTweetSuccess: 'Retweet undone #{count}',
      tweetDeleted: 'Deleted tweet #{count}',
      undoRepost: 'Undo repost',
      retweetNotDeleted: 'Retweets can only be undone, not deleted',
      tweetSkipped: 'Tweet skipped',
      pinnedTweetHint: 'Pinned tweets must be unpinned first',
      endOfFollowing: 'End of following list',
      copyDiagnosticLog: 'Copy Diagnostic Log',
      copiedToClipboard: 'Diagnostic log copied to clipboard',
      copyFailed: 'Failed to copy: {error}',
      sessionWriteFailed: 'Warning: failed to save cleanup state, cross-page resume may not work',

      // Auto-resume retry limit reached (page mismatch)
      cleanupAbortedPageNotFound: 'Cleanup aborted: could not reach the target page after 3 retries. Please navigate manually and try again.',
    },

    'zh-CN': {
      openXWebsite: '打开 X 网站',
      pleaseLogin: '请先登录',
      checking: '检查中...',
      checkingLogin: '正在检测登录状态...',
      xWebsiteDetected: '已检测到 X 网站',
      pleaseOpenX: '请打开 X 网站',
      loggedIn: '已登录',
      notLoggedIn: '未登录',
      notLoggedInHint: '请先登录',
      selectOptions: '选择要删除的内容',
      originalTweets: '原创推文',
      originalTweetsBackupTip: '推文一旦删除无法恢复，建议先去 {link} 申请归档下载再清理。',
      archiveLinkText: 'X 申请归档下载',
      replies: '回复',
      retweets: '转发',
      likes: '点赞',
      bookmarks: '书签',
      following: '关注',
      filterOptions: '筛选条件',
      fromDate: '开始日期',
      toDate: '结束日期',
      keywordPlaceholder: '按关键词筛选...',
      startCleanup: '开始清理',
      pause: '暂停',
      resume: '继续',
      stop: '停止',
      processing: '处理中...',
      processed: '已处理',
      waiting: '等待开始...',
      completed: '已完成',
      paused: '已暂停',
      stopped: '已停止',
      activity: '活动日志',
      privacy: '隐私',
      terms: '条款',
      help: '帮助',
      trustTitle: '100% 本地处理',
      trustText: '您的数据在本地处理，我们绝不存储您的凭证或个人信息。',

      noItemsSelected: '请至少选择一项',
      confirmStop: '确定停止清理？进度将丢失。',

      refreshingConfig: '正在从远程刷新配置...',
      configRefreshed: '配置已刷新。',
      configRefreshFailed: '刷新配置失败，状态已重新检测',
      startingCleanup: '开始清理...',
      cleanupCompleted: '清理完成，共处理: {count}',
      stoppedByUser: '用户已停止。已处理: {count}',
      pausedLog: '已暂停',
      resumedLog: '已继续',
      likesRequiresNav: '点赞需要在 /likes 页面，正在跳转...',
      bookmarksRequiresNav: '书签需要在 /bookmarks 页面，正在跳转...',
      followingRequiresNav: '关注列表需要在 /following 页面，正在跳转...',
      tweetsRequiresNav: '推文需要在个人主页，正在跳转...',
      originalTweetsRequiresNav: '原创推文需要在个人主页，正在跳转...',
      repliesRequiresNav: '回复需要在 /with_replies 页面，正在跳转...',
      retweetsRequiresNav: '转发需要在 /with_replies 页面，正在跳转...',
      navigatingTo: '正在跳转至: {url}',
      pageLoadedResuming: '页面已加载，正在恢复清理...',
      cleanupAutoResumed: '清理已自动恢复',
      pageTypeMismatch: '页面类型不匹配，中止',
      startingLikesCleanup: '开始清理点赞',
      noUnlikeButtons: '未找到可处理的内容',
      triedSelectors: '已尝试: {selectors}',
      noMoreLikes: '没有更多点赞了',
      endOfLikes: '点赞已全部处理',
      foundButtons: '找到 {count} 个按钮，选择器: {selector}',
      clickedUnlike: '已点击 unlike 按钮 #{count}',
      unlikeFailed: '取消点赞失败: {error}',
      clickReturnedFalse: 'unlike 按钮点击返回 false',

      pageDiagnostics: '=== 页面诊断 ===',
      endDiagnostics: '=== 诊断结束 ===',
      totalTestIdElements: 'data-testid 元素总数: {count}',
      topTestIds: '常用 data-testid: {list}',
      totalLabeledButtons: '可处理的带 aria-label 按钮总数: {count}',
      topAriaLabels: '常用 aria-label: {list}',

      // 每日额度
      dailyLimitReached: '已达到每日免费额度限制 ({used}/{limit})',
      dailyLimitReachedHint: '您今日已使用全部 {limit} 次免费操作。\n升级到高级版享受无限清理！',
      upgradeToPremium: '升级到高级版',
      maybeLater: '稍后再说',
      usedToday: '今日已使用: {used} / {limit}',
      cleanupSkipped: '已达每日额度限制，跳过清理',

      // 过滤
      invalidDateRange: '开始日期不能晚于结束日期',
      noItemsMatched: '没有匹配筛选条件的内容',
      dateFilterSkipped: '{type} 日期过滤已跳过：部分内容未找到时间戳',
      cleanupStuck: '30 秒无进展，已停止（X 改版或选择器可能失效）',
      dailyBudgetExhausted: '今日额度已用完，跳过 {type}',
      noRemoveBookmarkButtons: '未找到可处理的内容',
      foundButtonsCount: '找到 {count} 个待处理项',
      processedNavigatingTo: '正在切换到 {next} 页面...',
      startingBookmarksCleanup: '开始清理书签',
      noMoreBookmarks: '没有更多书签',
      endOfBookmarks: '书签清理完成',
      clickedRemoveBookmark: '已移除书签 #{count}',
      clickReturnedFalseRemoveBookmark: '点击移除书签失败',
      removeBookmarkFailed: '移除书签失败：{error}',
      startingFollowingCleanup: '开始清理关注列表',
      noUnfollowButtons: '未找到取消关注按钮',
      clickedUnfollow: '已取消关注 #{count}',
      clickReturnedFalseConfirm: '点击确认按钮失败',
      unfollowedNoConfirm: '已取消关注 #{count}（未弹出确认框）',
      unfollowFailed: '取消关注失败：{error}',
      noMoreFollowing: '没有更多关注了',
      // Tweets 清理日志 + 提示
      startingTweetsCleanup: '开始清理推文',
      noMoreTweets: '无更多推文',
      endOfTweets: '推文清理完成',
      tweetDeleteFailed: '删除推文失败：{error}',
      unretweetFailed: '撤销转发失败：{error}',
      pinnedTweetSkipped: '已跳过置顶推文（请先取消置顶）',
      unreTweetSuccess: '已撤销转发 #{count}',
      tweetDeleted: '已删除推文 #{count}',
      undoRepost: '撤销转发',
      retweetNotDeleted: '转发只能撤销，无法删除',
      tweetSkipped: '已跳过推文',
      pinnedTweetHint: '置顶推文需先取消置顶',
      endOfFollowing: '关注列表清理完成',
      copyDiagnosticLog: '复制诊断日志',
      copiedToClipboard: '诊断日志已复制到剪贴板',
      copyFailed: '复制失败：{error}',
      sessionWriteFailed: '警告：保存清理状态失败，跨页恢复可能不工作',

      // Auto-resume retry limit reached (page mismatch)
      cleanupAbortedPageNotFound: '清理已中止：3 次重试后仍无法到达目标页面，请手动导航后重试。',
    },

    'zh-TW': {
      openXWebsite: '打開 X 網站',
      pleaseLogin: '請先登入',
      checking: '檢查中...',
      checkingLogin: '正在偵測登入狀態...',
      xWebsiteDetected: '已偵測到 X 網站',
      pleaseOpenX: '請打開 X 網站',
      loggedIn: '已登入',
      notLoggedIn: '未登入',
      notLoggedInHint: '請先登入',
      selectOptions: '選擇要刪除的內容',
      originalTweets: '原創推文',
      originalTweetsBackupTip: '推文一旦刪除無法恢復，建議先去 {link} 申請歸檔下載再清理。',
      archiveLinkText: 'X 申請歸檔下載',
      replies: '回覆',
      retweets: '轉發',
      likes: '讚',
      bookmarks: '書籤',
      following: '追蹤',
      filterOptions: '篩選條件',
      fromDate: '開始日期',
      toDate: '結束日期',
      keywordPlaceholder: '按關鍵字篩選...',
      startCleanup: '開始清理',
      pause: '暫停',
      resume: '繼續',
      stop: '停止',
      processing: '處理中...',
      processed: '已處理',
      waiting: '等待開始...',
      completed: '已完成',
      paused: '已暫停',
      stopped: '已停止',
      activity: '活動記錄',
      privacy: '隱私',
      terms: '條款',
      help: '說明',
      trustTitle: '100% 本地處理',
      trustText: '您的資料在本地處理，我們絕不儲存您的憑證或個人資訊。',

      noItemsSelected: '請至少選擇一項',
      confirmStop: '確定停止清理？進度將遺失。',

      refreshingConfig: '正在從遠端刷新設定...',
      configRefreshed: '設定已刷新。',
      configRefreshFailed: '刷新設定失敗，狀態已重新偵測',
      startingCleanup: '開始清理...',
      cleanupCompleted: '清理完成，共處理: {count}',
      stoppedByUser: '使用者已停止。已處理: {count}',
      pausedLog: '已暫停',
      resumedLog: '已繼續',
      likesRequiresNav: '讚需要在 /likes 頁面，正在跳轉...',
      bookmarksRequiresNav: '書籤需要在 /bookmarks 頁面，正在跳轉...',
      followingRequiresNav: '追蹤列表需要在 /following 頁面，正在跳轉...',
      tweetsRequiresNav: '推文需要在個人主頁，正在跳轉...',
      originalTweetsRequiresNav: '原創推文需要在個人主頁，正在跳轉...',
      repliesRequiresNav: '回覆需要在 /with_replies 頁面，正在跳轉...',
      retweetsRequiresNav: '轉發需要在 /with_replies 頁面，正在跳轉...',
      navigatingTo: '正在跳轉至: {url}',
      pageLoadedResuming: '頁面已載入，正在恢復清理...',
      cleanupAutoResumed: '清理已自動恢復',
      pageTypeMismatch: '頁面類型不符，中止',
      startingLikesCleanup: '開始清理讚',
      noUnlikeButtons: '未找到可處理的內容',
      noMoreLikes: '沒有更多讚了',
      endOfLikes: '讚已全部處理',
      clickedUnlike: '已點擊 unlike 按鈕 #{count}',
      unlikeFailed: '取消讚失敗: {error}',
      clickReturnedFalse: 'unlike 按鈕點擊返回 false',

      pageDiagnostics: '=== 頁面診斷 ===',
      endDiagnostics: '=== 診斷結束 ===',
      totalTestIdElements: 'data-testid 元素總數: {count}',
      topTestIds: '常用 data-testid: {list}',
      totalLabeledButtons: '可處理的帶 aria-label 按鈕總數: {count}',
      topAriaLabels: '常用 aria-label: {list}',

      // 每日額度
      dailyLimitReached: '已達到每日免費額度限制 ({used}/{limit})',
      dailyLimitReachedHint: '您今日已使用全部 {limit} 次免費操作。\n升級到高級版享受無限清理！',
      upgradeToPremium: '升級到高級版',
      maybeLater: '稍後再說',
      usedToday: '今日已使用: {used} / {limit}',
      cleanupSkipped: '已達每日額度限制，跳過清理',

      // 過濾
      invalidDateRange: '開始日期不能晚於結束日期',
      noItemsMatched: '沒有符合篩選條件的內容',
      dateFilterSkipped: '{type} 日期過濾已跳過：部分內容未找到時間戳',
      cleanupStuck: '30 秒無進展，已停止（X 改版或選擇器可能失效）',
      dailyBudgetExhausted: '今日額度已用完，跳過 {type}',
      noRemoveBookmarkButtons: '未找到可處理的內容',
      foundButtonsCount: '找到 {count} 個待處理項',
      processedNavigatingTo: '正在切換到 {next} 頁面...',
      startingBookmarksCleanup: '開始清理書籤',
      noMoreBookmarks: '沒有更多書籤',
      endOfBookmarks: '書籤清理完成',
      clickedRemoveBookmark: '已移除書籤 #{count}',
      clickReturnedFalseRemoveBookmark: '點擊移除書籤失敗',
      removeBookmarkFailed: '移除書籤失敗：{error}',
      startingFollowingCleanup: '開始清理追蹤列表',
      noUnfollowButtons: '未找到取消追蹤按鈕',
      clickedUnfollow: '已取消追蹤 #{count}',
      clickReturnedFalseConfirm: '點擊確認按鈕失敗',
      unfollowedNoConfirm: '已取消追蹤 #{count}（未彈出確認框）',
      unfollowFailed: '取消追蹤失敗：{error}',
      noMoreFollowing: '沒有更多追蹤了',
      // Tweets 清理日志 + 提示
      startingTweetsCleanup: '開始清理推文',
      noMoreTweets: '無更多推文',
      endOfTweets: '推文清理完成',
      tweetDeleteFailed: '刪除推文失敗：{error}',
      unretweetFailed: '撤銷轉發失敗：{error}',
      pinnedTweetSkipped: '已跳過置頂推文（請先取消置頂）',
      unreTweetSuccess: '已撤銷轉發 #{count}',
      tweetDeleted: '已刪除推文 #{count}',
      undoRepost: '撤銷轉發',
      retweetNotDeleted: '轉發只能撤銷，無法刪除',
      tweetSkipped: '已跳過推文',
      pinnedTweetHint: '置頂推文需先取消置頂',
      endOfFollowing: '追蹤列表清理完成',
      copyDiagnosticLog: '複製診斷日誌',
      copiedToClipboard: '診斷日誌已複製到剪貼簿',
      copyFailed: '複製失敗：{error}',
      sessionWriteFailed: '警告：儲存清理狀態失敗，跨頁恢復可能無法運作',

      // Auto-resume retry limit reached (page mismatch)
      cleanupAbortedPageNotFound: '清理已中止：3 次重試後仍無法到達目標頁面，請手動導航後重試。',
    },

    ja: {
      openXWebsite: 'X ウェブサイトを開く',
      pleaseLogin: '先にログインしてください',
      checking: '確認中...',
      checkingLogin: 'ログイン状態を確認中...',
      pleaseRefreshXPage: 'ログイン状態を確認できません。Xページを再読み込みしてください（F5）',
      xWebsiteDetected: 'X ウェブサイト検出',
      pleaseOpenX: 'X ウェブサイトを開いてください',
      loggedIn: 'ログイン済み',
      notLoggedIn: '未ログイン',
      notLoggedInHint: '先にログインしてください',
      selectOptions: '削除する項目を選択',
      originalTweets: 'オリジナルポスト',
      originalTweetsBackupTip: '投稿は削除すると復元できません。クリーンアップの前に {link} をダウンロードすることをおすすめします。',
      archiveLinkText: 'X アーカイブをダウンロード',
      replies: '返信',
      retweets: 'リポスト',
      likes: 'いいね',
      bookmarks: 'ブックマーク',
      following: 'フォロー',
      filterOptions: 'フィルターオプション',
      fromDate: '開始日',
      toDate: '終了日',
      keywordPlaceholder: 'キーワードでフィルター...',
      startCleanup: 'クリーンアップ開始',
      pause: '一時停止',
      resume: '再開',
      stop: '停止',
      processing: '処理中...',
      processed: '処理済み',
      waiting: '開始を待機中...',
      completed: '完了',
      paused: '一時停止中',
      stopped: '停止',
      activity: 'アクティビティ',
      privacy: 'プライバシー',
      terms: '利用規約',
      help: 'ヘルプ',
      trustTitle: '100% ローカル処理',
      trustText: 'データはローカルで処理されます。認証情報や個人情報は保存しません。',

      noItemsSelected: '少なくとも1つ選択してください',
      confirmStop: 'クリーンアップを停止しますか？進捗は失われます。',

      refreshingConfig: 'リモートから設定を更新中...',
      configRefreshed: '設定を更新しました。',
      configRefreshFailed: '設定の更新に失敗、状態は再確認済み',
      startingCleanup: 'クリーンアップ開始...',
      cleanupCompleted: 'クリーンアップ完了。処理数: {count}',
      stoppedByUser: 'ユーザーにより停止。処理数: {count}',
      pausedLog: '一時停止',
      resumedLog: '再開',
      likesRequiresNav: 'いいねは /likes ページが必要です、ナビゲート中...',
      bookmarksRequiresNav: 'ブックマークは /bookmarks ページが必要です、ナビゲート中...',
      followingRequiresNav: 'フォロー一覧は /following ページが必要です、ナビゲート中...',
      tweetsRequiresNav: 'プロフィールページに移動中...',
      originalTweetsRequiresNav: 'オリジナルポストはプロフィールページに移動中...',
      repliesRequiresNav: '返信は /with_replies ページに移動中...',
      retweetsRequiresNav: 'リポストは /with_replies ページに移動中...',
      navigatingTo: 'ナビゲート先: {url}',
      pageLoadedResuming: 'ページロード完了、クリーンアップを再開中...',
      cleanupAutoResumed: 'クリーンアップを自動再開',
      pageTypeMismatch: 'ページタイプ不一致、中止',
      startingLikesCleanup: 'いいねのクリーンアップを開始',
      noUnlikeButtons: '処理対象が見つかりません',
      triedSelectors: '試行: {selectors}',
      noMoreLikes: 'もういいねはありません',
      endOfLikes: 'いいねの処理完了',
      foundButtons: '{count} 個のボタンを発見: {selector}',
      clickedUnlike: 'unlike ボタン #{count} をクリック',
      unlikeFailed: 'いいね解除失敗: {error}',
      clickReturnedFalse: 'unlike ボタンクリックが false を返しました',

      pageDiagnostics: '=== ページ診断 ===',
      endDiagnostics: '=== 診断終了 ===',
      totalTestIdElements: 'data-testid 要素総数: {count}',
      topTestIds: '主要 data-testid: {list}',
      totalLabeledButtons: '処理対象の aria-label 付きボタン総数: {count}',
      topAriaLabels: '主要 aria-label: {list}',

      // 毎日の上限
      dailyLimitReached: '1日の無料上限に達しました ({used}/{limit})',
      dailyLimitReachedHint: '本日 {limit} 回の無料操作をすべて使用しました。\nプレミアムにアップグレードして無制限のクリーンアップを！',
      upgradeToPremium: 'プレミアムにアップグレード',
      maybeLater: '後で',
      usedToday: '本日の使用: {used} / {limit}',
      cleanupSkipped: '1日の上限に達したためスキップ',

      // フィルター
      invalidDateRange: '開始日は終了日より後にできません',
      noItemsMatched: 'フィルター条件に一致する項目がありません',
      dateFilterSkipped: '{type} の日付フィルターをスキップ：一部の項目にタイムスタンプがありません',
      cleanupStuck: '30秒間進展なし、停止しました（Xの仕様変更またはセレクタ無効の可能性）',
      dailyBudgetExhausted: '本日の上限に達しました、{type} をスキップ',
      noRemoveBookmarkButtons: '処理対象が見つかりません',
      foundButtonsCount: '{count} 件の処理対象を検出',
      processedNavigatingTo: '{next} ページに切り替え中...',
      startingBookmarksCleanup: 'ブックマークのクリーンアップを開始',
      noMoreBookmarks: 'ブックマークはありません',
      endOfBookmarks: 'ブックマークのクリーンアップが完了',
      clickedRemoveBookmark: 'ブックマーク #{count} を削除しました',
      clickReturnedFalseRemoveBookmark: 'ブックマーク削除のクリックに失敗',
      removeBookmarkFailed: 'ブックマーク削除に失敗しました：{error}',
      startingFollowingCleanup: 'フォロー一覧のクリーンアップを開始',
      noUnfollowButtons: 'フォロー解除ボタンが見つかりません',
      clickedUnfollow: 'フォロー解除 #{count}',
      clickReturnedFalseConfirm: '確認ボタンのクリックに失敗',
      unfollowedNoConfirm: 'フォロー解除 #{count}（確認ダイアログなし）',
      unfollowFailed: 'フォロー解除に失敗しました：{error}',
      noMoreFollowing: 'フォローはもうありません',
      // Tweets 清理日志 + 提示
      startingTweetsCleanup: 'ツイートのクリーンアップを開始',
      noMoreTweets: 'これ以上のツイートはありません',
      endOfTweets: 'ツイートのクリーンアップが完了',
      tweetDeleteFailed: 'ツイート削除失敗：{error}',
      unretweetFailed: 'リツイート取り消し失敗：{error}',
      pinnedTweetSkipped: 'ピン留めツイートをスキップしました（先にピン留めを解除してください）',
      unreTweetSuccess: 'リツイートを取り消しました #{count}',
      tweetDeleted: 'ツイートを削除しました #{count}',
      undoRepost: 'リツイートを取り消す',
      retweetNotDeleted: 'リツイートは取り消すことしかできません',
      tweetSkipped: 'ツイートをスキップしました',
      pinnedTweetHint: 'ピン留めツイートは先にピン留めを解除する必要があります',
      endOfFollowing: 'フォロー一覧のクリーンアップが完了',
      copyDiagnosticLog: '診断ログをコピー',
      copiedToClipboard: '診断ログをクリップボードにコピーしました',
      copyFailed: 'コピー失敗：{error}',
      sessionWriteFailed: '警告：クリーンアップ状態の保存に失敗しました、ページ遷移後の再開が機能しない可能性があります',

      // Auto-resume retry limit reached (page mismatch)
      cleanupAbortedPageNotFound: 'クリーンアップ中止：3 回再試行しても対象ページに到達できません。手動で移動して再試行してください。',
    },

    ko: {
      openXWebsite: 'X 웹사이트 열기',
      pleaseLogin: '먼저 로그인하세요',
      checking: '확인 중...',
      checkingLogin: '로그인 상태 확인 중...',
      xWebsiteDetected: 'X 웹사이트 감지됨',
      pleaseOpenX: 'X 웹사이트를 열어주세요',
      loggedIn: '로그인됨',
      notLoggedIn: '로그인 안됨',
      notLoggedInHint: '먼저 로그인하세요',
      selectOptions: '삭제할 항목 선택',
      originalTweets: '원본 트윗',
      originalTweetsBackupTip: '트윗은 삭제되면 복구할 수 없습니다. 정리하기 전에 먼저 {link} 신청을 권장합니다.',
      archiveLinkText: 'X 아카이브 신청',
      replies: '답글',
      retweets: '리트윗',
      likes: '좋아요',
      bookmarks: '북마크',
      following: '팔로잉',
      filterOptions: '필터 옵션',
      fromDate: '시작일',
      toDate: '종료일',
      keywordPlaceholder: '키워드로 필터...',
      startCleanup: '정리 시작',
      pause: '일시정지',
      resume: '재개',
      stop: '중지',
      processing: '처리 중...',
      processed: '처리됨',
      waiting: '시작 대기 중...',
      completed: '완료',
      paused: '일시정지됨',
      stopped: '중지됨',
      activity: '활동',
      privacy: '개인정보',
      terms: '이용약관',
      help: '도움말',
      trustTitle: '100% 로컬 처리',
      trustText: '데이터는 로컬에서 처리됩니다. 자격 증명이나 개인 정보를 저장하지 않습니다.',

      noItemsSelected: '최소 하나의 항목을 선택하세요',
      confirmStop: '정리를 중지하시겠습니까? 진행 상황이 손실됩니다.',

      refreshingConfig: '원격에서 설정 새로 고침 중...',
      configRefreshed: '설정이 새로 고쳐졌습니다.',
      configRefreshFailed: '설정 새로 고침 실패, 상태 재확인됨',
      startingCleanup: '정리 시작...',
      cleanupCompleted: '정리 완료. 처리됨: {count}',
      stoppedByUser: '사용자가 중지함. 처리됨: {count}',
      pausedLog: '일시정지',
      resumedLog: '재개',
      likesRequiresNav: '좋아요는 /likes 페이지 필요, 이동 중...',
      bookmarksRequiresNav: '북마크는 /bookmarks 페이지 필요, 이동 중...',
      followingRequiresNav: '팔로잉은 /following 페이지 필요, 이동 중...',
      tweetsRequiresNav: '트윗은 프로필 페이지 필요, 이동 중...',
      originalTweetsRequiresNav: '원본 트윗은 프로필 페이지 필요, 이동 중...',
      repliesRequiresNav: '답글은 /with_replies 페이지 필요, 이동 중...',
      retweetsRequiresNav: '리트윗은 /with_replies 페이지 필요, 이동 중...',
      navigatingTo: '이동 중: {url}',
      pageLoadedResuming: '페이지 로드 완료, 정리 재개 중...',
      cleanupAutoResumed: '정리 자동 재개됨',
      pageTypeMismatch: '페이지 유형 불일치, 중단',
      startingLikesCleanup: '좋아요 정리 시작',
      noUnlikeButtons: '처리할 내용을 찾을 수 없음',
      triedSelectors: '시도함: {selectors}',
      noMoreLikes: '더 이상 좋아요 없음',
      endOfLikes: '좋아요 처리 완료',
      foundButtons: '{count}개 버튼 발견: {selector}',
      clickedUnlike: 'unlike 버튼 #{count} 클릭함',
      unlikeFailed: '좋아요 취소 실패: {error}',
      clickReturnedFalse: 'unlike 버튼 클릭이 false 반환',

      pageDiagnostics: '=== 페이지 진단 ===',
      endDiagnostics: '=== 진단 종료 ===',
      totalTestIdElements: 'data-testid 요소 총계: {count}',
      topTestIds: '주요 data-testid: {list}',
      totalLabeledButtons: 'aria-label 버튼 총계: {count}',
      topAriaLabels: '주요 aria-label: {list}',

      // 일일 한도
      dailyLimitReached: '일일 무료 한도 도달 ({used}/{limit})',
      dailyLimitReachedHint: '오늘 {limit}회 무료 작업을 모두 사용했습니다.\n무제한 정리를 위해 프리미엄으로 업그레이드하세요!',
      upgradeToPremium: '프리미엄으로 업그레이드',
      maybeLater: '나중에',
      usedToday: '오늘 사용: {used} / {limit}',
      cleanupSkipped: '일일 한도 도달로 정리 건너뜀',

      // 필터
      invalidDateRange: '시작 날짜는 종료 날짜보다 늦을 수 없습니다',
      noItemsMatched: '필터 조건과 일치하는 항목이 없습니다',
      dateFilterSkipped: '{type} 날짜 필터 건너뜀: 일부 항목에 타임스탬프가 없습니다',
      cleanupStuck: '30초간 진행 없음, 중지 (X UI 변경 또는 선택기 실패 가능성)',
      dailyBudgetExhausted: '오늘 한도 도달, {type} 건너뜀',
      noRemoveBookmarkButtons: '처리할 내용을 찾을 수 없음',
      foundButtonsCount: '{count}개 항목 발견',
      processedNavigatingTo: '{next} 페이지로 전환 중...',
      startingBookmarksCleanup: '북마크 정리 시작',
      noMoreBookmarks: '북마크 없음',
      endOfBookmarks: '북마크 정리 완료',
      clickedRemoveBookmark: '북마크 #{count} 제거됨',
      clickReturnedFalseRemoveBookmark: '북마크 제거 클릭 실패',
      removeBookmarkFailed: '북마크 제거 실패: {error}',
      startingFollowingCleanup: '팔로잉 정리 시작',
      noUnfollowButtons: '언팔로우 버튼을 찾을 수 없음',
      clickedUnfollow: '언팔로우 #{count}',
      clickReturnedFalseConfirm: '확인 버튼 클릭 실패',
      unfollowedNoConfirm: '언팔로우 #{count} (확인 대화상자 없음)',
      unfollowFailed: '언팔로우 실패: {error}',
      noMoreFollowing: '더 이상 팔로잉 없음',
      // Tweets 清理日志 + 提示
      startingTweetsCleanup: '트윗 정리 시작',
      noMoreTweets: '더 이상 트윗 없음',
      endOfTweets: '트윗 정리 완료',
      tweetDeleteFailed: '트윗 삭제 실패: {error}',
      unretweetFailed: '리트윗 취소 실패: {error}',
      pinnedTweetSkipped: '고정 트윗 건너뜀 (먼저 고정을 해제하세요)',
      unreTweetSuccess: '리트윗 취소됨 #{count}',
      tweetDeleted: '트윗 삭제됨 #{count}',
      undoRepost: '리트윗 취소',
      retweetNotDeleted: '리트윗은 취소만 가능하며 삭제 불가',
      tweetSkipped: '트윗 건너뜀',
      pinnedTweetHint: '고정 트윗은 먼저 고정 해제 필요',
      endOfFollowing: '팔로잉 정리 완료',
      copyDiagnosticLog: '진단 로그 복사',
      copiedToClipboard: '진단 로그가 클립보드에 복사됨',
      copyFailed: '복사 실패: {error}',
      sessionWriteFailed: '경고: 정리 상태 저장 실패, 페이지 간 재개가 작동하지 않을 수 있음',

      // Auto-resume retry limit reached (page mismatch)
      cleanupAbortedPageNotFound: '정리 중단: 3회 재시도 후에도 대상 페이지에 도달할 수 없습니다. 수동으로 이동 후 다시 시도하세요.',
    },

    es: {
      openXWebsite: 'Abrir sitio web de X',
      pleaseLogin: 'Por favor inicia sesión primero',
      checking: 'Verificando...',
      checkingLogin: 'Verificando estado de inicio de sesión...',
      xWebsiteDetected: 'Sitio web X detectado',
      pleaseOpenX: 'Por favor abre el sitio web de X',
      loggedIn: 'Conectado',
      notLoggedIn: 'No conectado',
      notLoggedInHint: 'Por favor inicia sesión primero',
      selectOptions: 'Seleccionar elementos para eliminar',
      originalTweets: 'Tweets originales',
      originalTweetsBackupTip: 'Los tweets eliminados no se pueden recuperar. Te recomendamos descargar tu {link} antes de limpiar.',
      archiveLinkText: 'archivo de X',
      replies: 'Respuestas',
      retweets: 'Retweets',
      likes: 'Me gusta',
      bookmarks: 'Marcadores',
      following: 'Siguiendo',
      filterOptions: 'Opciones de filtro',
      fromDate: 'Desde fecha',
      toDate: 'Hasta fecha',
      keywordPlaceholder: 'Filtrar por palabra clave...',
      startCleanup: 'Iniciar limpieza',
      pause: 'Pausar',
      resume: 'Reanudar',
      stop: 'Detener',
      processing: 'Procesando...',
      processed: 'Procesado',
      waiting: 'Esperando inicio...',
      completed: 'Completado',
      paused: 'Pausado',
      stopped: 'Detenido',
      activity: 'Actividad',
      privacy: 'Privacidad',
      terms: 'Términos',
      help: 'Ayuda',
      trustTitle: '100% Procesamiento Local',
      trustText: 'Tus datos se procesan localmente. Nunca almacenamos tus credenciales ni información personal.',

      noItemsSelected: 'Por favor selecciona al menos una opción',
      confirmStop: '¿Detener la limpieza? Se perderá el progreso.',

      refreshingConfig: 'Actualizando configuración remota...',
      configRefreshed: 'Configuración actualizada.',
      configRefreshFailed: 'Error al actualizar configuración, estado re-verificado',
      startingCleanup: 'Iniciando limpieza...',
      cleanupCompleted: 'Limpieza completada. Total procesado: {count}',
      stoppedByUser: 'Detenido por el usuario. Procesado: {count}',
      pausedLog: 'Pausado',
      resumedLog: 'Reanudado',
      likesRequiresNav: 'Likes requiere página /likes, navegando...',
      bookmarksRequiresNav: 'Marcadores requiere página /bookmarks, navegando...',
      followingRequiresNav: 'Siguiendo requiere página /following, navegando...',
      tweetsRequiresNav: 'Tweets requiere tu página de perfil, navegando...',
      originalTweetsRequiresNav: 'Tweets originales requiere tu página de perfil, navegando...',
      repliesRequiresNav: 'Respuestas requiere página /with_replies, navegando...',
      retweetsRequiresNav: 'Retweets requiere página /with_replies, navegando...',
      navigatingTo: 'Navegando a: {url}',
      pageLoadedResuming: 'Página cargada, reanudando limpieza...',
      cleanupAutoResumed: 'Limpieza auto-reanudada',
      pageTypeMismatch: 'Tipo de página no coincide, abortando',
      startingLikesCleanup: 'Iniciando limpieza de likes',
      noUnlikeButtons: 'No se encontró contenido procesable',
      noMoreLikes: 'No hay más likes',
      endOfLikes: 'Likes terminados',
      clickedUnlike: 'Clic en botón unlike #{count}',
      unlikeFailed: 'Error al quitar like: {error}',
      clickReturnedFalse: 'El clic en unlike devolvió false',

      pageDiagnostics: '=== Diagnóstico de Página ===',
      endDiagnostics: '=== Fin del Diagnóstico ===',
      totalTestIdElements: 'Total elementos data-testid: {count}',
      topTestIds: 'Top data-testids: {list}',
      totalLabeledButtons: 'Total botones con aria-label: {count}',
      topAriaLabels: 'Top aria-labels: {list}',

      // Límite diario
      dailyLimitReached: 'Límite diario gratuito alcanzado ({used}/{limit})',
      dailyLimitReachedHint: 'Has usado las {limit} acciones gratuitas de hoy.\n¡Actualiza a Premium para limpieza ilimitada!',
      upgradeToPremium: 'Actualizar a Premium',
      maybeLater: 'Quizás más tarde',
      usedToday: 'Usado hoy: {used} / {limit}',
      cleanupSkipped: 'Limpieza omitida por límite diario',

      // Filtro
      invalidDateRange: 'La fecha de inicio no puede ser posterior a la fecha de fin',
      noItemsMatched: 'Ningún elemento coincide con el filtro',
      dateFilterSkipped: 'Filtro de fecha omitido para {type}: no se encontró marca temporal en algunos elementos',
      cleanupStuck: 'Sin progreso en 30s, deteniendo (posible cambio de UI o selector inválido)',
      dailyBudgetExhausted: 'Presupuesto diario agotado, omitiendo {type}',
      noRemoveBookmarkButtons: 'No se encontró contenido procesable',
      foundButtonsCount: 'Se encontraron {count} elementos',
      processedNavigatingTo: 'Cambiando a página {next}...',
      startingBookmarksCleanup: 'Iniciando limpieza de marcadores',
      noMoreBookmarks: 'No hay más marcadores',
      endOfBookmarks: 'Limpieza de marcadores completada',
      clickedRemoveBookmark: 'Marcador #{count} eliminado',
      clickReturnedFalseRemoveBookmark: 'Error al hacer clic en eliminar marcador',
      removeBookmarkFailed: 'Error al eliminar marcador: {error}',
      startingFollowingCleanup: 'Iniciando limpieza de seguidos',
      noUnfollowButtons: 'No se encontraron botones de dejar de seguir',
      clickedUnfollow: 'Dejado de seguir a #{count}',
      clickReturnedFalseConfirm: 'Error al hacer clic en el botón de confirmación',
      unfollowedNoConfirm: 'Dejado de seguir a #{count} (sin diálogo de confirmación)',
      unfollowFailed: 'Error al dejar de seguir: {error}',
      noMoreFollowing: 'No hay más seguidos',
      // Tweets 清理日志 + 提示
      startingTweetsCleanup: 'Iniciando limpieza de tweets',
      noMoreTweets: 'No hay más tweets',
      endOfTweets: 'Limpieza de tweets completada',
      tweetDeleteFailed: 'Error al eliminar tweet: {error}',
      unretweetFailed: 'Error al deshacer repost: {error}',
      pinnedTweetSkipped: 'Tweet fijado omitido (desfijar primero)',
      unreTweetSuccess: 'Retweet deshecho #{count}',
      tweetDeleted: 'Tweet eliminado #{count}',
      undoRepost: 'Deshacer repost',
      retweetNotDeleted: 'Los retweets solo se pueden deshacer, no eliminar',
      tweetSkipped: 'Tweet omitido',
      pinnedTweetHint: 'Los tweets fijados deben desfijarse primero',
      endOfFollowing: 'Limpieza de seguidos completada',
      copyDiagnosticLog: 'Copiar registro de diagnóstico',
      copiedToClipboard: 'Registro de diagnóstico copiado al portapapeles',
      copyFailed: 'Error al copiar: {error}',
      sessionWriteFailed: 'Advertencia: fallo al guardar el estado de limpieza, la reanudación entre páginas puede no funcionar',

      // Auto-resume retry limit reached (page mismatch)
      cleanupAbortedPageNotFound: 'Limpieza abortada: no se pudo llegar a la página objetivo después de 3 reintentos. Navega manualmente y vuelve a intentarlo.',
    },

    de: {
      openXWebsite: 'X-Website öffnen',
      pleaseLogin: 'Bitte zuerst anmelden',
      checking: 'Überprüfe...',
      checkingLogin: 'Überprüfe Anmeldestatus...',
      xWebsiteDetected: 'X-Website erkannt',
      pleaseOpenX: 'Bitte öffne die X-Website',
      loggedIn: 'Angemeldet',
      notLoggedIn: 'Nicht angemeldet',
      notLoggedInHint: 'Bitte zuerst anmelden',
      selectOptions: 'Zu löschende Elemente auswählen',
      originalTweets: 'Eigene Tweets',
      originalTweetsBackupTip: 'Tweets sind nach dem Löschen nicht wiederherstellbar. Wir empfehlen, vorher dein {link} herunterzuladen.',
      archiveLinkText: 'X-Archiv',
      replies: 'Antworten',
      retweets: 'Retweets',
      likes: 'Likes',
      bookmarks: 'Lesezeichen',
      following: 'Gefolgte',
      filterOptions: 'Filteroptionen',
      fromDate: 'Von Datum',
      toDate: 'Bis Datum',
      keywordPlaceholder: 'Nach Stichwort filtern...',
      startCleanup: 'Bereinigung starten',
      pause: 'Pause',
      resume: 'Fortsetzen',
      stop: 'Stoppen',
      processing: 'Verarbeite...',
      processed: 'Verarbeitet',
      waiting: 'Warte auf Start...',
      completed: 'Abgeschlossen',
      paused: 'Pausiert',
      stopped: 'Gestoppt',
      activity: 'Aktivität',
      privacy: 'Datenschutz',
      terms: 'Bedingungen',
      help: 'Hilfe',
      trustTitle: '100% Lokale Verarbeitung',
      trustText: 'Deine Daten werden lokal verarbeitet. Wir speichern niemals deine Anmeldedaten oder persönlichen Informationen.',

      noItemsSelected: 'Bitte mindestens eine Option auswählen',
      confirmStop: 'Bereinigung stoppen? Fortschritt geht verloren.',

      refreshingConfig: 'Konfiguration wird remote aktualisiert...',
      configRefreshed: 'Konfiguration aktualisiert.',
      configRefreshFailed: 'Aktualisierung fehlgeschlagen, Status neu geprüft',
      startingCleanup: 'Starte Bereinigung...',
      cleanupCompleted: 'Bereinigung abgeschlossen. Verarbeitet: {count}',
      stoppedByUser: 'Vom Benutzer gestoppt. Verarbeitet: {count}',
      pausedLog: 'Pausiert',
      resumedLog: 'Fortgesetzt',
      likesRequiresNav: 'Likes benötigt /likes-Seite, navigiere...',
      bookmarksRequiresNav: 'Lesezeichen benötigt /bookmarks-Seite, navigiere...',
      followingRequiresNav: 'Folge ich benötigt /following-Seite, navigiere...',
      tweetsRequiresNav: 'Tweets benötigt Profilseite, navigiere...',
      originalTweetsRequiresNav: 'Eigene Tweets benötigt Profilseite, navigiere...',
      repliesRequiresNav: 'Antworten benötigt /with_replies-Seite, navigiere...',
      retweetsRequiresNav: 'Retweets benötigt /with_replies-Seite, navigiere...',
      navigatingTo: 'Navigiere zu: {url}',
      pageLoadedResuming: 'Seite geladen, setze Bereinigung fort...',
      cleanupAutoResumed: 'Bereinigung automatisch fortgesetzt',
      pageTypeMismatch: 'Seitentyp stimmt nicht, abgebrochen',
      startingLikesCleanup: 'Starte Likes-Bereinigung',
      noUnlikeButtons: 'Kein verarbeitbarer Inhalt gefunden',
      noMoreLikes: 'Keine weiteren Likes',
      endOfLikes: 'Likes beendet',
      clickedUnlike: 'unlike-Button #{count} geklickt',
      unlikeFailed: 'Unlike fehlgeschlagen: {error}',
      clickReturnedFalse: 'unlike-Klick gab false zurück',

      pageDiagnostics: '=== Seiten-Diagnose ===',
      endDiagnostics: '=== Diagnose Ende ===',
      totalTestIdElements: 'data-testid Elemente gesamt: {count}',
      topTestIds: 'Top data-testids: {list}',
      totalLabeledButtons: 'Buttons mit aria-label gesamt: {count}',
      topAriaLabels: 'Top aria-labels: {list}',

      // Tageslimit
      dailyLimitReached: 'Tägliches kostenloses Limit erreicht ({used}/{limit})',
      dailyLimitReachedHint: 'Du hast alle {limit} kostenlosen Aktionen heute verbraucht.\nUpgrade auf Premium für unbegrenzte Bereinigung!',
      upgradeToPremium: 'Auf Premium upgraden',
      maybeLater: 'Vielleicht später',
      usedToday: 'Heute verwendet: {used} / {limit}',
      cleanupSkipped: 'Bereinigung wegen Tageslimit übersprungen',

      // Filter
      invalidDateRange: 'Das Startdatum darf nicht nach dem Enddatum liegen',
      noItemsMatched: 'Keine Elemente entsprechen dem Filter',
      dateFilterSkipped: 'Datumsfilter für {type} übersprungen: bei einigen Elementen wurde kein Zeitstempel gefunden',
      cleanupStuck: 'Keine Fortschritte seit 30s, wird beendet (UI-Änderung oder Selektor-Fehler möglich)',
      dailyBudgetExhausted: 'Tagesbudget erschöpft, überspringe {type}',
      noRemoveBookmarkButtons: 'Kein verarbeitbarer Inhalt gefunden',
      foundButtonsCount: '{count} Elemente zur Verarbeitung gefunden',
      processedNavigatingTo: 'Wechsle zur {next}-Seite...',
      startingBookmarksCleanup: 'Lesezeichen-Bereinigung wird gestartet',
      noMoreBookmarks: 'Keine weiteren Lesezeichen',
      endOfBookmarks: 'Lesezeichen-Bereinigung abgeschlossen',
      clickedRemoveBookmark: 'Lesezeichen #{count} entfernt',
      clickReturnedFalseRemoveBookmark: 'Klick zum Entfernen des Lesezeichens fehlgeschlagen',
      removeBookmarkFailed: 'Lesezeichen-Entfernung fehlgeschlagen: {error}',
      startingFollowingCleanup: 'Folge ich-Bereinigung wird gestartet',
      noUnfollowButtons: 'Keine Entfolgen-Buttons gefunden',
      clickedUnfollow: 'Entfolgt #{count}',
      clickReturnedFalseConfirm: 'Klick auf Bestätigungsbutton fehlgeschlagen',
      unfollowedNoConfirm: 'Entfolgt #{count} (kein Bestätigungsdialog)',
      unfollowFailed: 'Entfolgen fehlgeschlagen: {error}',
      noMoreFollowing: 'Keine weiteren Folge ich',
      // Tweets 清理日志 + 提示
      startingTweetsCleanup: 'Tweet-Bereinigung wird gestartet',
      noMoreTweets: 'Keine weiteren Tweets',
      endOfTweets: 'Tweet-Bereinigung abgeschlossen',
      tweetDeleteFailed: 'Tweet-Löschung fehlgeschlagen: {error}',
      unretweetFailed: 'Repost rückgängig machen fehlgeschlagen: {error}',
      pinnedTweetSkipped: 'Angepinnter Tweet übersprungen (zuerst lösen)',
      unreTweetSuccess: 'Retweet rückgängig gemacht #{count}',
      tweetDeleted: 'Tweet gelöscht #{count}',
      undoRepost: 'Repost rückgängig machen',
      retweetNotDeleted: 'Retweets können nur rückgängig gemacht werden',
      tweetSkipped: 'Tweet übersprungen',
      pinnedTweetHint: 'Angepinnte Tweets müssen zuerst gelöst werden',
      endOfFollowing: 'Folge ich-Bereinigung abgeschlossen',
      copyDiagnosticLog: 'Diagnoseprotokoll kopieren',
      copiedToClipboard: 'Diagnoseprotokoll in Zwischenablage kopiert',
      copyFailed: 'Kopieren fehlgeschlagen: {error}',
      sessionWriteFailed: 'Warnung: Bereinigungsstatus konnte nicht gespeichert werden, seitenübergreifende Wiederaufnahme funktioniert möglicherweise nicht',

      // Auto-resume retry limit reached (page mismatch)
      cleanupAbortedPageNotFound: 'Bereinigung abgebrochen: Zielseite nach 3 Versuchen nicht erreichbar. Bitte manuell navigieren und erneut versuchen.',
    },

    fr: {
      openXWebsite: 'Ouvrir le site X',
      pleaseLogin: 'Veuillez vous connecter d\'abord',
      checking: 'Vérification...',
      checkingLogin: 'Vérification du statut de connexion...',
      pleaseRefreshXPage: 'Statut de connexion bloqué. Veuillez actualiser la page X (F5)',
      xWebsiteDetected: 'Site X détecté',
      pleaseOpenX: 'Veuillez ouvrir le site X',
      loggedIn: 'Connecté',
      notLoggedIn: 'Non connecté',
      notLoggedInHint: 'Veuillez vous connecter d\'abord',
      selectOptions: 'Sélectionner les éléments à supprimer',
      originalTweets: 'Tweets originaux',
      originalTweetsBackupTip: 'Les tweets supprimés ne peuvent pas être récupérés. Nous vous recommandons de télécharger votre {link} avant le nettoyage.',
      archiveLinkText: 'archive X',
      replies: 'Réponses',
      retweets: 'Retweets',
      likes: 'J\'aime',
      bookmarks: 'Signets',
      following: 'Abonnements',
      filterOptions: 'Options de filtre',
      fromDate: 'Du',
      toDate: 'Au',
      keywordPlaceholder: 'Filtrer par mot-clé...',
      startCleanup: 'Démarrer le nettoyage',
      pause: 'Pause',
      resume: 'Reprendre',
      stop: 'Arrêter',
      processing: 'Traitement...',
      processed: 'Traité',
      waiting: 'En attente...',
      completed: 'Terminé',
      paused: 'En pause',
      stopped: 'Arrêté',
      activity: 'Activité',
      privacy: 'Confidentialité',
      terms: 'Conditions',
      help: 'Aide',
      trustTitle: '100% Traitement Local',
      trustText: 'Vos données sont traitées localement. Nous ne stockons jamais vos identifiants ni informations personnelles.',

      noItemsSelected: 'Veuillez sélectionner au moins une option',
      confirmStop: 'Arrêter le nettoyage ? La progression sera perdue.',

      refreshingConfig: 'Actualisation de la configuration distante...',
      configRefreshed: 'Configuration actualisée.',
      configRefreshFailed: 'Échec d\'actualisation, statut re-vérifié',
      startingCleanup: 'Démarrage du nettoyage...',
      cleanupCompleted: 'Nettoyage terminé. Total traité: {count}',
      stoppedByUser: 'Arrêté par l\'utilisateur. Traité: {count}',
      pausedLog: 'En pause',
      resumedLog: 'Repris',
      likesRequiresNav: 'J\'aime nécessite la page /likes, navigation...',
      bookmarksRequiresNav: 'Signets nécessite la page /bookmarks, navigation...',
      followingRequiresNav: 'Abonnements nécessite la page /following, navigation...',
      tweetsRequiresNav: 'Tweets nécessite votre page de profil, navigation...',
      originalTweetsRequiresNav: 'Tweets originaux nécessite votre page de profil, navigation...',
      repliesRequiresNav: 'Réponses nécessite la page /with_replies, navigation...',
      retweetsRequiresNav: 'Retweets nécessite la page /with_replies, navigation...',
      navigatingTo: 'Navigation vers: {url}',
      pageLoadedResuming: 'Page chargée, reprise du nettoyage...',
      cleanupAutoResumed: 'Nettoyage auto-repris',
      pageTypeMismatch: 'Type de page incorrect, annulé',
      startingLikesCleanup: 'Démarrage nettoyage des j\'aime',
      noUnlikeButtons: 'Aucun contenu traitable trouvé',
      noMoreLikes: 'Plus de j\'aime',
      endOfLikes: 'J\'aime terminés',
      clickedUnlike: 'Clic sur bouton unlike #{count}',
      unlikeFailed: 'Échec unlike: {error}',
      clickReturnedFalse: 'Le clic unlike a renvoyé false',

      pageDiagnostics: '=== Diagnostic de Page ===',
      endDiagnostics: '=== Fin Diagnostic ===',
      totalTestIdElements: 'Total éléments data-testid: {count}',
      topTestIds: 'Top data-testids: {list}',
      totalLabeledButtons: 'Total boutons avec aria-label: {count}',
      topAriaLabels: 'Top aria-labels: {list}',

      // Limite quotidienne
      dailyLimitReached: 'Limite quotidienne gratuite atteinte ({used}/{limit})',
      dailyLimitReachedHint: 'Vous avez utilisé toutes les {limit} actions gratuites aujourd\'hui.\nPassez à Premium pour un nettoyage illimité !',
      upgradeToPremium: 'Passer à Premium',
      maybeLater: 'Peut-être plus tard',
      usedToday: 'Utilisé aujourd\'hui: {used} / {limit}',
      cleanupSkipped: 'Nettoyage ignoré (limite quotidienne)',

      // Filtre
      invalidDateRange: 'La date de début ne peut pas être postérieure à la date de fin',
      noItemsMatched: 'Aucun élément ne correspond au filtre',
      dateFilterSkipped: 'Filtre de date ignoré pour {type} : aucun horodatage trouvé sur certains éléments',
      cleanupStuck: 'Aucun progrès depuis 30s, arrêt (changement d\'UI ou sélecteur invalide possible)',
      dailyBudgetExhausted: 'Budget quotidien épuisé, ignoré {type}',
      noRemoveBookmarkButtons: 'Aucun contenu à traiter trouvé',
      foundButtonsCount: '{count} éléments trouvés',
      processedNavigatingTo: 'Passage à la page {next}...',
      startingBookmarksCleanup: 'Démarrage du nettoyage des signets',
      noMoreBookmarks: 'Plus de signets',
      endOfBookmarks: 'Nettoyage des signets terminé',
      clickedRemoveBookmark: 'Signet #{count} supprimé',
      clickReturnedFalseRemoveBookmark: 'Échec du clic pour supprimer le signet',
      removeBookmarkFailed: 'Échec de la suppression du signet : {error}',
      startingFollowingCleanup: 'Démarrage du nettoyage des abonnements',
      noUnfollowButtons: 'Aucun bouton de désabonnement trouvé',
      clickedUnfollow: 'Désabonné à #{count}',
      clickReturnedFalseConfirm: 'Échec du clic sur le bouton de confirmation',
      unfollowedNoConfirm: 'Désabonné à #{count} (sans dialogue de confirmation)',
      unfollowFailed: 'Échec du désabonnement : {error}',
      noMoreFollowing: 'Plus d\'abonnements',
      // Tweets 清理日志 + 提示
      startingTweetsCleanup: 'Nettoyage des tweets',
      noMoreTweets: 'Plus de tweets',
      endOfTweets: 'Nettoyage des tweets terminé',
      tweetDeleteFailed: 'Échec de la suppression du tweet : {error}',
      unretweetFailed: 'Échec de l\'annulation du repost : {error}',
      pinnedTweetSkipped: 'Tweet épinglé ignoré (désépingler d\'abord)',
      unreTweetSuccess: 'Retweet annulé #{count}',
      tweetDeleted: 'Tweet supprimé #{count}',
      undoRepost: 'Annuler le repost',
      retweetNotDeleted: 'Les retweets ne peuvent qu\'être annulés',
      tweetSkipped: 'Tweet ignoré',
      pinnedTweetHint: 'Les tweets épinglés doivent d\'abord être désépinglés',
      endOfFollowing: 'Nettoyage des abonnements terminé',
      copyDiagnosticLog: 'Copier le journal de diagnostic',
      copiedToClipboard: 'Journal de diagnostic copié dans le presse-papiers',
      copyFailed: 'Échec de la copie : {error}',
      sessionWriteFailed: 'Attention : échec de l\'enregistrement de l\'état du nettoyage, la reprise entre pages peut ne pas fonctionner',

      // Auto-resume retry limit reached (page mismatch)
      cleanupAbortedPageNotFound: 'Nettoyage annulé : impossible d\'atteindre la page cible après 3 tentatives. Naviguez manuellement et réessayez.',
    },
  };

  // ============================================================================
  // DEFAULT_I18N：8 语言 selector 关键字默认集合
  //   - 这些不是 UI 文案，是「X 改版时要改的 selector 关键字」（Delete / 撤销转推 / Cancel 等）
  //   - 项目惯例：i18n.js = 所有 8 语言数据的家
  //   - 运行时合并：injector.js 的 setConfig 用 window.XEraseri18n.DEFAULT_I18N 作默认值
  //     再叠加 remote-example.json 的 selectors.i18n 覆盖
  //   - X 改版改了翻译时，改这里或远程配置即可（不用动 injector.js）
  // ============================================================================
  const DEFAULT_I18N = {
    // 推文删除菜单的 "Delete" 菜单项（role=menuitem）
    deleteKeywords: [
      'Delete',                  // en
      '删除',                    // zh-CN
      '刪除',                    // zh-TW
      '削除',                    // ja
      '삭제',                    // ko
      'Eliminar',                // es
      'Löschen',                 // de
      'Supprimer',               // fr
      'Elimina'                  // it
    ],
    // 撤销 repost 菜单项（role=menuitem）
    unretweetKeywords: [
      'Undo repost', 'Undo Repost', // en（两种大小写 X 都用）
      '撤销转推',                    // zh-CN
      '取消轉推',                    // zh-TW
      'リポストを取り消す',          // ja
      '리트윗 취소',                  // ko
      'Cancelar repost',             // es
      'Repost rückgängig machen',    // de
      'Annuler le repost',           // fr
      'Annulla repost'               // it
    ],
    // 确认 unfollow 弹窗中的 "Unfollow" 按钮文字（X 2026 改版后弹框可能改 testid，文字兜底）
    //   关联：tweets-bug-7 (2026-06-18) - user 报告 following 弹框出现但 confirm button 找不到
    unfollowKeywords: [
      'Unfollow',                   // en
      '取消关注',                    // zh-CN
      '取消追蹤',                    // zh-TW
      'フォロー解除',                // ja
      '언팔로우',                    // ko
      'Dejar de seguir',             // es
      'Entfolgen',                   // de
      'Ne plus suivre',              // fr
      'Non seguire più'              // it
    ],
    // 置顶推文 socialContext 文字（X 旧版行为 + X 不显示 socialContext 时的兜底）
    pinnedKeywords: [
      'pinned',                    // en
      '已置顶',                    // zh-CN
      '已釘選',                    // zh-TW
      'ピン留め',                  // ja
      '고정',                      // ko
      'fijado',                    // es
      'angeheftet',                // de
      'épinglé'                    // fr
    ],
    // 回复卡片 socialContext 文字（X 旧版行为 + X 不显示 socialContext 时的兜底）
    replyKeywords: [
      'replying to', 'in reply to', // en
      '回复',                       // zh-CN
      '回覆',                       // zh-TW
      '返信',                       // ja
      '답장',                       // ko
      'respondiendo a',             // es
      'antworten',                  // de
      'répondre',                   // fr
      'rispondendo a'               // it
    ],
    // 弹窗 Cancel 按钮（role=button）
    cancelKeywords: [
      'Cancel',                    // en
      '取消',                      // zh-CN / zh-TW
      'キャンセル',                // ja
      '취소',                      // ko
      'Cancelar',                  // es
      'Abbrechen',                 // de
      'Annuler',                   // fr
      'Annulla'                    // it
    ],
    // 弹窗 Confirm 按钮（role=button）—— 仅放"确认删除"流程最稳的几个
    // 不用 "Confirm" / "确认" 这种通用词（容易误匹配普通确认按钮）
    confirmKeywords: [
      'Delete',                    // en
      '删除',                      // zh-CN
      '刪除',                      // zh-TW
      '削除',                      // ja
      '삭제',                      // ko
      'Eliminar',                  // es
      'Löschen',                   // de
      'Supprimer',                 // fr
      'Elimina'                    // it
    ]
  };

  // 检测浏览器语言
  function detectLanguage() {
    var lang = (navigator.language || 'en').toLowerCase();
    if (lang.startsWith('zh')) {
      return lang.includes('tw') || lang.includes('hant') ? 'zh-TW' : 'zh-CN';
    }
    if (lang.startsWith('ja')) return 'ja';
    if (lang.startsWith('ko')) return 'ko';
    if (lang.startsWith('es')) return 'es';
    if (lang.startsWith('de')) return 'de';
    if (lang.startsWith('fr')) return 'fr';
    if (TRANSLATIONS[lang]) return lang;
    return 'en';
  }

  // 语言元数据：国旗 + 原生名称
  var LANG_META = {
    'en':     { flag: '🇺🇸', name: 'English' },
    'zh-CN':  { flag: '🇨🇳', name: '简体中文' },
    'zh-TW':  { flag: '🇹🇼', name: '繁體中文' },
    'ja':     { flag: '🇯🇵', name: '日本語' },
    'ko':     { flag: '🇰🇷', name: '한국어' },
    'es':     { flag: '🇪🇸', name: 'Español' },
    'de':     { flag: '🇩🇪', name: 'Deutsch' },
    'fr':     { flag: '🇫🇷', name: 'Français' }
  };

  // 支持的语言代码列表
  var SUPPORTED_LANGS = ['en', 'zh-CN', 'zh-TW', 'ja', 'ko', 'es', 'de', 'fr'];

  var currentLang = detectLanguage();
  console.log('[SocialEraser] Detected language:', currentLang);

  // 翻译函数 - 支持 {var} 占位符
  function t(key, vars) {
    vars = vars || {};
    var langDict = TRANSLATIONS[currentLang] || TRANSLATIONS.en;
    var text = langDict[key] || TRANSLATIONS.en[key] || key;
    return text.replace(/\{(\w+)\}/g, function(match, name) {
      return vars[name] !== undefined ? vars[name] : match;
    });
  }

  // 暴露到全局
  window.XEraseri18n = {
    t: t,
    DEFAULT_I18N: DEFAULT_I18N,
    setLanguage: function(lang) {
      if (TRANSLATIONS[lang]) {
        currentLang = lang;
      }
    },
    getLanguage: function() { return currentLang; },
    getSupportedLanguages: function() { return SUPPORTED_LANGS; },
    getLangMeta: function(lang) { return LANG_META[lang]; },
    detectLanguage: detectLanguage
  };

  // 兼容老代码：content.js 直接调 t()，挂到 window.t
  window.t = t;

  console.log('[SocialEraser] i18n.js ready, language:', currentLang);

  // 关键修复：用户保存的 preferredLang 必须覆盖 navigator.language 自动检测
  // 否则用户选了 English，但 content.js / injector.js 跑在 X 页面上下文，
  // navigator.language 是中文时仍会显示中文。
  //
  // 工作流程：
  // 1. i18n.js 加载时立刻读 chrome.storage.local.preferredLang 并 setLanguage
  // 2. 监听 chrome.storage.onChanged，用户在 sidepanel 切换语言后自动同步
  //
  // 注意：storage.get 是 async，最初几个 t() 调用可能仍在 auto-detect 的语言，
  // 但 content.js 第一次 t() 通常在 setTimeout(1000) 之后（waitForArticles 等），
  // storage 读取 < 100ms 完成，所以后续调用都是正确语言。
  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
    chrome.storage.local.get(['preferredLang'], function(result) {
      if (result && result.preferredLang && TRANSLATIONS[result.preferredLang]) {
        if (result.preferredLang !== currentLang) {
          currentLang = result.preferredLang;
          console.log('[SocialEraser] Applied preferred language:', currentLang);
        }
      }
    });
    if (chrome.storage.onChanged && chrome.storage.onChanged.addListener) {
      chrome.storage.onChanged.addListener(function(changes, area) {
        if (area === 'local' && changes.preferredLang) {
          var newLang = changes.preferredLang.newValue;
          if (newLang && TRANSLATIONS[newLang]) {
            currentLang = newLang;
            console.log('[SocialEraser] Language changed to:', currentLang);
          }
        }
      });
    }
  }
})();
