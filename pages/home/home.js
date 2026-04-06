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
  
  // 跳转到团队战
  goToTeam() {
    wx.navigateTo({
      url: '/pages/team-game/team-game'
    })
  }
})