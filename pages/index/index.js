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
    
    // 计算顺位（result已按得点排序，同分共享高位次）
    // 例：30000/30000/20000/20000 → 1位/1位/3位/3位
    let i = 0
    while (i < result.length) {
      let j = i + 1
      // 找出所有与第i位同分的玩家
      while (j < result.length && result[j].scoreNum === result[i].scoreNum) {
        j++
      }
      // 从i到j-1的玩家共享第i+1位（高位次）
      const sharedRank = i + 1
      for (let k = i; k < j; k++) {
        result[k].rank = sharedRank
      }
      i = j
    }
    
    console.log('开始更新玩家数据, 共', result.length, '位玩家')
    
    for (let i = 0; i < result.length; i++) {
      const p = result[i]
      console.log(`处理第${i+1}位玩家:`, p.name, '顺位:', p.rank, '得分:', p.finalScore)
      
      try {
        // 使用玩家名字作为_id，保证唯一性
        const playerDoc = playersCollection.doc(p.name)
        const { data: existingData } = await playerDoc.get().catch(() => ({ data: null }))
        
        // 准备顺位更新字段
        const rankField = `rank_${p.rank}_count`
        
        if (!existingData) {
          // 新玩家 - 使用set创建，_id为玩家名字
          console.log(`新增玩家: ${p.name}`)
          await playerDoc.set({
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
          console.log(`新增玩家 ${p.name} 成功`)
        } else {
          // 已有玩家 - 更新（使用直接set替代_.inc()排查bug）
          const newTotalScore = (existingData.total_score || 0) + p.finalScore
          const newGamesPlayed = (existingData.games_played || 0) + 1
          const newRankCount = (existingData[rankField] || 0) + 1
          
          const updateData = {
            total_score: newTotalScore,
            games_played: newGamesPlayed,
            [rankField]: newRankCount,
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
          
          console.log(`更新玩家 ${p.name}, 原数据:`, existingData.total_score, '新数据:', newTotalScore)
          await playerDoc.update({
            data: updateData
          })
          console.log(`更新玩家 ${p.name} 成功`)
        }
      } catch (err) {
        console.error(`更新玩家 ${p.name} 失败:`, err)
      }
    }
    console.log('所有玩家更新完成')
    
    // 保存对局记录到games集合
    await this.saveGameRecord(result, players)
    
    // 通知rank页面刷新数据
    const pages = getCurrentPages()
    const rankPage = pages.find(p => p.route === 'pages/rank/rank')
    if (rankPage && rankPage.manualRefresh) {
      console.log('触发rank页面手动刷新')
      rankPage.manualRefresh()
    }
  },

  // 保存对局记录
  async saveGameRecord(result, players) {
    const app = getApp()
    const db = app.db
    
    try {
      await db.collection('games').add({
        data: {
          players: players.map(p => ({
            name: p.name,
            score: p.score,
            scoreNum: (parseInt(p.score) || 0) * 100
          })),
          result: result.map(p => ({
            name: p.name,
            scoreNum: p.scoreNum,
            finalScore: p.finalScore,
            rank: p.rank
          })),
          create_time: db.serverDate()
        }
      })
      console.log('对局记录保存成功')
    } catch (err) {
      console.error('保存对局记录失败:', err)
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
