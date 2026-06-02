// pages/home/home.js
Page({
  data: {},
  
  onLoad() {
    // 页面加载
  },
  
  // 跳转到个人战（tabBar页面用switchTab）
  goToPersonal() {
    wx.switchTab({
      url: '/pages/index/index'
    })
  },

  goToPersonalStats() {
    wx.navigateTo({
      url: '/pages/personal-stats/personal-stats'
    })
  },
  
  // 跳转到团队战
  goToTeam() {
    wx.navigateTo({
      url: '/pages/team-game/team-game'
    })
  },

  goToTableFee() {
    wx.navigateTo({
      url: '/pages/table-fee/table-fee'
    })
  }
})