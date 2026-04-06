// pages/team-history/team-history.js - 团队赛对局历史页面
const app = getApp()

Page({
  data: {
    games: [],
    connected: false
  },

  onLoad() {
    this.db = app.db
    this.loadGames()
  },

  // 加载对局历史
  async loadGames() {
    try {
      const { data } = await this.db.collection('team_games')
        .orderBy('created_at', 'desc')
        .limit(100)
        .get()
      
      // 格式化日期
      const formattedGames = data.map(game => ({
        ...game,
        formattedDate: this.formatDate(game.created_at)
      }))
      
      this.setData({ 
        games: formattedGames,
        connected: true
      })
    } catch (err) {
      console.error('加载对局历史失败:', err)
      wx.showToast({ title: '加载失败', icon: 'none' })
    }
  },

  // 格式化日期
  formatDate(timestamp) {
    if (!timestamp) return ''
    const date = new Date(timestamp)
    return date.toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    })
  },

  // 刷新数据
  async refreshData() {
    try {
      wx.showLoading({ title: '刷新中...' })
      await this.loadGames()
      wx.showToast({ title: '刷新成功', icon: 'success' })
    } catch (err) {
      console.error('刷新失败:', err)
      wx.showToast({ title: '刷新失败', icon: 'none' })
    } finally {
      wx.hideLoading()
    }
  },

  // 确认退出
  confirmExit() {
    wx.showModal({
      title: '确认退出',
      content: '确定要退出团队赛对局历史页面吗？',
      success: (res) => {
        if (res.confirm) {
          wx.navigateBack({
            delta: 1
          })
        }
      }
    })
  },

  // 跳转到团队赛
  goToTeamGame() {
    wx.navigateTo({
      url: '/pages/team-game/team-game'
    })
  },

  // 跳转到团队赛排行榜
  goToTeamRank() {
    wx.navigateTo({
      url: '/pages/team-rank/team-rank'
    })
  },

  // 跳转到队伍管理
  goToTeamManage() {
    wx.navigateTo({
      url: '/pages/team-manage/team-manage'
    })
  }
})