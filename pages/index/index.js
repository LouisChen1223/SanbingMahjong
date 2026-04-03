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
      scoreNum: (parseInt(p.score) || 0) * 100, // 用户输入百位，程序补齐两个零
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
      const scoreNum = (parseInt(p.score) || 0) * 100 // 用户输入百位，程序补齐两个零
      if (isNaN(parseInt(p.score))) {
        wx.showToast({ title: '得点必须是数字', icon: 'none' })
        return
      }
      totalScore += parseInt(p.score) // 累加用户输入的百位数
    }
    if (totalScore !== 1000) {
      wx.showToast({ title: '总点数应为1000(百位)，当前为' + totalScore, icon: 'none', duration: 2000 })
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
    
    // 计算顺位（result已按得点排序）
    result.forEach((p, index) => {
      p.rank = index + 1 // 1/2/3/4位
    })
    
    for (let p of result) {
      const { data } = await playersCollection.where({ name: p.name }).limit(1).get()
      
      // 准备顺位更新字段
      const rankField = `rank_${p.rank}_count`
      
      if (data.length === 0) {
        // 新玩家
        await playersCollection.add({
          data: {
            name: p.name,
            total_score: p.finalScore,
            games_played: 1,
            rank_1_count: p.rank === 1 ? 1 : 0,
            rank_2_count: p.rank === 2 ? 1 : 0,
            rank_3_count: p.rank === 3 ? 1 : 0,
            rank_4_count: p.rank === 4 ? 1 : 0,
            max_score: p.scoreNum,
            min_score: p.scoreNum,
            create_time: db.serverDate(),
            update_time: db.serverDate()
          }
        })
      } else {
        // 已有玩家
        const playerId = data[0]._id
        const existingData = data[0]
        const updateData = {
          total_score: _.inc(p.finalScore),
          games_played: _.inc(1),
          [rankField]: _.inc(1),
          update_time: db.serverDate()
        }
        
        // 更新最高/最低打点
        const currentMax = existingData.max_score || 0
        const currentMin = existingData.min_score || 999999
        if (p.scoreNum > currentMax) {
          updateData.max_score = p.scoreNum
        }
        if (p.scoreNum < currentMin) {
          updateData.min_score = p.scoreNum
        }
        
        await playersCollection.doc(playerId).update({
          data: updateData
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
