// home.js - 首页入口页面
// 功能：提供个人竞技场和五军对决两个入口，底部战队管理入口

const app = getApp()

Page({
  data: {
    // 页面数据
  },

  onLoad() {
    // 页面加载时初始化
    console.log('首页加载完成')
  },

  // 跳转到个人竞技场（个人赛录入页）
  goToIndividual() {
    wx.navigateTo({
      url: '/pages/index/index'
    })
  },

  // 跳转到五军对决（组队赛录入页）
  goToTeamGame() {
    wx.navigateTo({
      url: '/pages/team-game/team-game'
    })
  },

  // 跳转到战队管理页
  goToTeamManage() {
    wx.navigateTo({
      url: '/pages/team-manage/team-manage'
    })
  },

  // 跳转到排行榜
  goToRank() {
    wx.navigateTo({
      url: '/pages/rank/rank'
    })
  },

  // 跳转到历史记录
  goToHistory() {
    wx.navigateTo({
      url: '/pages/history/history'
    })
  }
})