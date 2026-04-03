// rank.js - 实时排行榜页面逻辑
const app = getApp()
const db = app.db

Page({
  data: {
    players: [],
    connected: false,
    watcher: null,
    currentTab: 'total',
    rate1List: [],
    avoid4List: [],
    maxScoreList: [],
    minScoreList: []
  },

  onLoad() {
    this.db = app.db
    this.initWatcher()
  },

  onUnload() {
    // 页面卸载时关闭监听
    if (this.data.watcher) {
      this.data.watcher.close()
    }
  },

  // 切换标签
  switchTab(e) {
    const tab = e.currentTarget.dataset.tab
    this.setData({ currentTab: tab })
  },

  // 计算各项排行榜数据
  calculateRankLists(players) {
    // 一位率榜
    const rate1List = players
      .filter(p => p.games_played > 0)
      .map(p => ({
        ...p,
        rate1: (p.rank_1_count || 0) / p.games_played,
        rate1Str: ((p.rank_1_count || 0) / p.games_played * 100).toFixed(1) + '%'
      }))
      .sort((a, b) => b.rate1 - a.rate1)
    
    // 避四率榜
    const avoid4List = players
      .filter(p => p.games_played > 0)
      .map(p => ({
        ...p,
        avoid4: (p.games_played - (p.rank_4_count || 0)) / p.games_played,
        avoid4Str: ((p.games_played - (p.rank_4_count || 0)) / p.games_played * 100).toFixed(1) + '%'
      }))
      .sort((a, b) => b.avoid4 - a.avoid4)
    
    // 最高打点榜
    const maxScoreList = players
      .filter(p => p.max_score && p.max_score > 0)
      .sort((a, b) => (b.max_score || 0) - (a.max_score || 0))
    
    // 最低打点榜
    const minScoreList = players
      .filter(p => p.min_score && p.min_score > 0)
      .sort((a, b) => (a.min_score || 999999) - (b.min_score || 999999))
    
    return { rate1List, avoid4List, maxScoreList, minScoreList }
  },

  // 初始化实时监听
  initWatcher() {
    const that = this
    
    // 使用 watch() 实现实时数据同步
    const watcher = this.db.collection('players')
      .orderBy('total_score', 'desc')
      .limit(100)
      .watch({
        onChange: function(snapshot) {
          console.log('数据变更:', snapshot)
          
          // 处理数据变更
          if (snapshot.type === 'init') {
            // 初始化数据
            const players = snapshot.docs
            const rankLists = that.calculateRankLists(players)
            that.setData({
              players: players,
              connected: true,
              ...rankLists
            })
          } else {
            // 增量更新
            let players = [...that.data.players]
            
            snapshot.docChanges.forEach(change => {
              if (change.queueType === 'init') {
                // 初始化时不处理，已在上面处理
              } else if (change.queueType === 'update') {
                // 更新数据
                const index = players.findIndex(p => p._id === change.doc._id)
                if (index !== -1) {
                  players[index] = change.doc
                }
              } else if (change.queueType === 'enqueue') {
                // 新增数据
                players.push(change.doc)
              } else if (change.queueType === 'dequeue') {
                // 删除数据
                players = players.filter(p => p._id !== change.doc._id)
              }
            })
            
            // 重新排序
            players.sort((a, b) => b.total_score - a.total_score)
            
            // 重新计算各项排行榜
            const rankLists = that.calculateRankLists(players)
            
            that.setData({
              players: players,
              connected: true,
              ...rankLists
            })
          }
        },
        onError: function(err) {
          console.error('监听错误:', err)
          that.setData({ connected: false })
          
          // 尝试重新连接
          setTimeout(() => {
            that.initWatcher()
          }, 3000)
        }
      })
    
    this.setData({ watcher })
  },

  // 手动刷新（备用）
  async refreshData() {
    try {
      const { data } = await this.db.collection('players')
        .orderBy('total_score', 'desc')
        .limit(100)
        .get()
      
      const rankLists = this.calculateRankLists(data)
      this.setData({ 
        players: data,
        ...rankLists
      })
    } catch (err) {
      console.error('刷新失败:', err)
      wx.showToast({ title: '刷新失败', icon: 'none' })
    }
  },

  // 清空所有历史记录
  clearAllData() {
    const that = this
    wx.showModal({
      title: '确认清空',
      content: '确定要清空所有排行榜数据吗？此操作不可恢复！',
      confirmText: '清空',
      confirmColor: '#ff4d4f',
      success(res) {
        if (res.confirm) {
          that.doClearAllData()
        }
      }
    })
  },

  // 执行清空操作
  async doClearAllData() {
    wx.showLoading({ title: '清空中...' })
    try {
      // 获取所有玩家
      const { data: players } = await this.db.collection('players').get()
      
      // 逐个删除
      const deletePromises = players.map(player => 
        this.db.collection('players').doc(player._id).remove()
      )
      
      await Promise.all(deletePromises)
      
      // 清空本地数据
      this.setData({
        players: [],
        rate1List: [],
        avoid4List: [],
        maxScoreList: [],
        minScoreList: []
      })
      
      wx.hideLoading()
      wx.showToast({ title: '已清空', icon: 'success' })
    } catch (err) {
      wx.hideLoading()
      console.error('清空失败:', err)
      wx.showToast({ title: '清空失败', icon: 'none' })
    }
  }
})