// team-game.js - 组队赛录入页面
// 功能：录入组队赛对局，包含身份校验、马点计算、数据更新

const db = wx.cloud.database()
const _ = db.command

Page({
  data: {
    // 四位玩家输入数据
    players: [
      { name: '', score: '', isNegative: false, placeholder: '第一位' },
      { name: '', score: '', isNegative: false, placeholder: '第二位' },
      { name: '', score: '', isNegative: false, placeholder: '第三位' },
      { name: '', score: '', isNegative: false, placeholder: '第四位' }
    ],
    // 马点配置：1位+50, 2位+10, 3位-20, 4位-40
    umaPoints: [50, 10, -20, -40],
    // 起始点数
    startPoints: 25000,
    // 是否正在提交
    submitting: false
  },

  onLoad() {
    // 页面加载时初始化
    console.log('组队赛录入页面加载')
  },

  // 输入玩家姓名
  onNameInput(e) {
    const index = e.currentTarget.dataset.index
    const value = e.detail.value
    // 更新对应玩家的姓名
    this.setData({
      [`players[${index}].name`]: value
    })
  },

  // 输入点棒数值
  onScoreInput(e) {
    const index = e.currentTarget.dataset.index
    const value = e.detail.value
    // 更新对应玩家的点棒数值
    this.setData({
      [`players[${index}].score`]: value
    })
  },

  // 切换正负号（解决手机键盘无负号问题）
  toggleNegative(e) {
    const index = e.currentTarget.dataset.index
    const players = this.data.players
    // 切换正负状态
    players[index].isNegative = !players[index].isNegative
    this.setData({ players })
  },

  // 计算平分后的马点
  // 参数：scores - 四位玩家的原始点棒数组（已转换为得分）
  // 返回：四位玩家平分后的马点数组
  calculateUma(scores) {
    const uma = this.data.umaPoints
    const result = [0, 0, 0, 0]
    
    // 按得分降序排列，获取原始索引
    const indexed = scores.map((s, i) => ({ score: s, index: i }))
    indexed.sort((a, b) => b.score - a.score)
    
    // 找出同分玩家组，平分马点
    let i = 0
    while (i < 4) {
      // 找出与当前玩家同分的所有玩家
      let j = i
      while (j < 4 && indexed[j].score === indexed[i].score) {
        j++
      }
      // 计算这些玩家应得的马点总和
      let umaSum = 0
      for (let k = i; k < j; k++) {
        umaSum += uma[k]
      }
      // 平分马点
      const avgUma = umaSum / (j - i)
      for (let k = i; k < j; k++) {
        result[indexed[k].index] = avgUma
      }
      i = j
    }
    
    return result
  },

  // 计算单局得分
  // 公式：单局得分 = (点棒 - 25000)/1000 + 平分后的马点
  calculateScores() {
    const players = this.data.players
    const startPoints = this.data.startPoints
    
    // 计算原始得分（点棒 - 起始点）/1000
    const rawScores = players.map(p => {
      let score = parseFloat(p.score) || 0
      // 如果是负分，取负值
      if (p.isNegative) {
        score = -score
      }
      return (score * 1000 - startPoints) / 1000
    })
    
    // 计算平分后的马点
    const umaScores = this.calculateUma(rawScores)
    
    // 最终得分 = 原始得分 + 马点，保留1位小数
    const finalScores = rawScores.map((s, i) => {
      return parseFloat((s + umaScores[i]).toFixed(1))
    })
    
    return finalScores
  },

  // 校验玩家身份（关键功能）
  // 检查输入的4个名字是否都在team_members集合中
  async validatePlayers() {
    const players = this.data.players
    const names = players.map(p => p.name.trim()).filter(n => n)
    
    // 检查是否填写了4个名字
    if (names.length !== 4) {
      wx.showToast({
        title: '请填写4位玩家姓名',
        icon: 'none'
      })
      return null
    }
    
    // 检查是否有重名
    const uniqueNames = [...new Set(names)]
    if (uniqueNames.length !== 4) {
      wx.showToast({
        title: '玩家姓名不能重复',
        icon: 'none'
      })
      return null
    }
    
    // 从数据库查询这些名字是否存在于team_members集合
    try {
      const res = await db.collection('team_members')
        .where({
          name: _.in(names)
        })
        .get()
      
      // 检查是否所有名字都找到了
      const foundNames = res.data.map(d => d.name)
      const missingNames = names.filter(n => !foundNames.includes(n))
      
      if (missingNames.length > 0) {
        // 有名字不在team_members中，弹窗提示
        wx.showModal({
          title: '身份校验失败',
          content: `${missingNames[0]} 未加入任何战队，请先前往管理页面添加。`,
          showCancel: false
        })
        return null
      }
      
      // 返回玩家信息映射（名字 -> 战队ID）
      const playerInfo = {}
      res.data.forEach(d => {
        playerInfo[d.name] = {
          team_id: d.team_id,
          _id: d._id
        }
      })
      return playerInfo
      
    } catch (err) {
      console.error('查询玩家失败:', err)
      wx.showToast({
        title: '查询失败，请重试',
        icon: 'none'
      })
      return null
    }
  },

  // 提交对局
  async submitGame() {
    // 防止重复提交
    if (this.data.submitting) return
    
    // 校验点棒输入
    const players = this.data.players
    for (let i = 0; i < 4; i++) {
      if (!players[i].score) {
        wx.showToast({
          title: `请输入第${i + 1}位点棒`,
          icon: 'none'
        })
        return
      }
    }
    
    // 校验玩家身份
    this.setData({ submitting: true })
    const playerInfo = await this.validatePlayers()
    if (!playerInfo) {
      this.setData({ submitting: false })
      return
    }
    
    // 计算得分
    const scores = this.calculateScores()
    const names = players.map(p => p.name.trim())
    
    try {
      // 更新team_members集合中每个玩家的数据
      const updatePromises = names.map((name, i) => {
        return db.collection('team_members')
          .where({
            name: name
          })
          .update({
            data: {
              // 累加个人组队分
              member_score: _.inc(scores[i]),
              // 累加场次
              games_played: _.inc(1)
            }
          })
      })
      
      await Promise.all(updatePromises)
      
      // 更新teams集合中的战队数据
      // 统计每个战队的一位数和四位数
      const teamStats = {}
      names.forEach((name, i) => {
        const teamId = playerInfo[name].team_id
        if (!teamStats[teamId]) {
          teamStats[teamId] = {
            total_points: 0,
            first_place: 0,
            fourth_place: 0,
            total_games: 0
          }
        }
        // 累加总分
        teamStats[teamId].total_points += scores[i]
        // 统计一位数（得分最高的是第一位）
        // 统计四位数（得分最低的是第四位）
        // 这里需要根据顺位判断
      })
      
      // 根据得分确定顺位
      const indexed = scores.map((s, i) => ({ score: s, index: i, name: names[i] }))
      indexed.sort((a, b) => b.score - a.score)
      
      // 第一位和第四位
      const firstPlaceName = indexed[0].name
      const fourthPlaceName = indexed[3].name
      const firstPlaceTeam = playerInfo[firstPlaceName].team_id
      const fourthPlaceTeam = playerInfo[fourthPlaceName].team_id
      
      // 更新战队数据
      const teamUpdatePromises = []
      
      // 所有参与的战队都需要更新总分和场次
      const participatedTeams = [...new Set(names.map(n => playerInfo[n].team_id))]
      participatedTeams.forEach(teamId => {
        // 计算该战队本局总得分
        let teamScore = 0
        names.forEach((name, i) => {
          if (playerInfo[name].team_id === teamId) {
            teamScore += scores[i]
          }
        })
        
        const updateData = {
          total_points: _.inc(teamScore),
          total_games: _.inc(1)
        }
        
        // 如果是一位的战队，累加一位数
        if (teamId === firstPlaceTeam) {
          updateData.first_place = _.inc(1)
        }
        
        // 如果是四位的战队，累加四位数
        if (teamId === fourthPlaceTeam) {
          updateData.fourth_place = _.inc(1)
        }
        
        teamUpdatePromises.push(
          db.collection('teams')
            .where({ team_id: teamId })
            .update({ data: updateData })
        )
      })
      
      await Promise.all(teamUpdatePromises)
      
      // 保存对局记录到team_games集合
      await db.collection('team_games').add({
        data: {
          players: names.map((name, i) => ({
            name: name,
            team_id: playerInfo[name].team_id,
            score: scores[i]
          })),
          created_at: db.serverDate()
        }
      })
      
      wx.showToast({
        title: '录入成功',
        icon: 'success'
      })
      
      // 清空输入
      this.setData({
        players: [
          { name: '', score: '', isNegative: false, placeholder: '第一位' },
          { name: '', score: '', isNegative: false, placeholder: '第二位' },
          { name: '', score: '', isNegative: false, placeholder: '第三位' },
          { name: '', score: '', isNegative: false, placeholder: '第四位' }
        ],
        submitting: false
      })
      
    } catch (err) {
      console.error('提交失败:', err)
      wx.showToast({
        title: '提交失败，请重试',
        icon: 'none'
      })
      this.setData({ submitting: false })
    }
  }
})