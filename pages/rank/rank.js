// rank.js - 实时排行榜页面逻辑
const app = getApp()
const db = app.db

Page({
  data: {
    players: [],
    connected: false,
    watcher: null
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
            that.setData({
              players: snapshot.docs,
              connected: true
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
            
            that.setData({
              players: players,
              connected: true
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
      
      this.setData({ players: data })
    } catch (err) {
      console.error('刷新失败:', err)
      wx.showToast({ title: '刷新失败', icon: 'none' })
    }
  }
})