// index.js - 录入页面逻辑
const app = getApp()

// 常量配置
const START_POINT = 25000
const HORSE_POINTS = [50, 10, -20, -40] // 顺位马点

Page({
  data: {
    windPositions: ['东', '南', '西', '北'],
    players: [
      { name: '', score: '' },
      { name: '', score: '' },
      { name: '', score: '' },
      { name: '', score: '' }
    ],
    result: [],
    loading: false
  },

  onLoad() {
    // db 和 _ 在使用时动态获取
  },

  // 姓名输入处理
  onNameInput(e) {
    const index = e.currentTarget.dataset.index
    const value = e.detail.value
    this.setData({
      [`players[${index}].name`]: value
    })
  },

  // 得点输入处理
  onScoreInput(e) {
    const index = e.currentTarget.dataset.index
    const value = e.detail.value
    this.setData({
      [`players[${index}].score`]: value
    })
  },

  // 核心算法：计算平分马点
  calculateScores(players) {
    let rankedPlayers = players.map((p, originalIndex) => ({
      ...p,
      originalIndex,
      scoreNum: parseInt(p.score) || 0,
      rawScore: 0,
      horsePoint: 0,
      finalScore: 0
    }))
    rankedPlayers.sort((a, b) => b.scoreNum - a.scoreNum)
    rankedPlayers.forEach(p => {
      p.rawScore = (p.scoreNum - START_POINT) / 1000
    })
    let i = 0
    while (i < rankedPlayers.length) {
      let j = i + 1
      while (j < rankedPlayers.length && rankedPlayers[j].scoreNum === rankedPlayers[i].scoreNum) {
        j++
      }
      let horseSum = 0
      for (let k = i; k < j; k++) {
        horseSum += HORSE_POINTS[k]
      }
      const avgHorse = horseSum / (j - i)
      for (let k = i; k < j; k++) {
        rankedPlayers[k].horsePoint = avgHorse
      }
      i = j
    }
    rankedPlayers.forEach(p => {
      p.finalScore = Math.round((p.rawScore + p.horsePoint) * 10) / 10
    })
    return rankedPlayers
  },

  // 结算按钮
  async onSettle() {
    const { players } = this.data
    let totalScore = 0
    for (let p of players) {
      if (!p.name.trim()) {
        wx.showToast({ title: '请填写所有玩家姓名', icon: 'none' })
        return
      }
      if (p.score === '' || p.score === null || p.score === undefined) {
        wx.showToast({ title: '请填写所有玩家得点', icon: 'none' })
        return
      }
      const scoreNum = parseInt(p.score)
      if (isNaN(scoreNum)) {
        wx.showToast({ title: '得点必须是数字', icon: 'none' })
        return
      }
      totalScore += scoreNum
    }
    if (totalScore !== 100000) {
      wx.showToast({ title: '总点数应为100000，当前为' + totalScore, icon: 'none', duration: 2000 })
      return
    }
    this.setData({ loading: true })
    try {
      const result = this.calculateScores(players)
      await this.updatePlayerScores(result)
      this.setData({ result: result, loading: false })
      wx.showToast({ title: '结算成功', icon: 'success' })
    } catch (err) {
      console.error('结算失败:', err)
      wx.showToast({ title: '结算失败: ' + err.message, icon: 'none' })
      this.setData({ loading: false })
    }
  },

  async updatePlayerScores(result) {
    const app = getApp()
    const db = app.db
    const _ = db.command
    const playersCollection = db.collection('players')
    for (let p of result) {
      const { data } = await playersCollection.where({ name: p.name }).limit(1).get()
      if (data.length === 0) {
        await playersCollection.add({
          data: {
            name: p.name,
            total_score: p.finalScore,
            games_played: 1,
            create_time: db.serverDate(),
            update_time: db.serverDate()
          }
        })
      } else {
        const playerId = data[0]._id
        await playersCollection.doc(playerId).update({
          data: {
            total_score: _.inc(p.finalScore),
            games_played: _.inc(1),
            update_time: db.serverDate()
          }
        })
      }
    }
  },

  resetInputs() {
    this.setData({
      players: [
        { name: '', score: '' },
        { name: '', score: '' },
        { name: '', score: '' },
        { name: '', score: '' }
      ]
    })
  }
})
