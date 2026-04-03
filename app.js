// app.js - 云开发版本
App({
  onLaunch: function () {
    // 云开发初始化
    if (!wx.cloud) {
      console.error('请使用 2.2.3 或以上的基础库以使用云能力')
    } else {
      wx.cloud.init({
        env: 'cloud1-3gkgb0dj7e12ab40',
        traceUser: true
      })
      this.db = wx.cloud.database()
      console.log('云开发初始化成功')
    }
  },

  // 本地存储备用方法
  getPlayers() {
    const data = wx.getStorageSync('players') || []
    return data
  },

  savePlayers(players) {
    wx.setStorageSync('players', players)
  },

  globalData: {
    userInfo: null
  }
});
