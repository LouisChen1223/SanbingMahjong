// 云函数入口文件
const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()
const _ = db.command

// 常量配置
const START_POINT = 25000
const HORSE_POINTS = [50, 10, -20, -40]

// 计算分数
function calculateScores(players) {
  let rankedPlayers = players.map((p, originalIndex) => ({
    ...p,
    name: p.name.trim(),
    originalIndex,
    scoreNum: (parseInt(p.score) || 0) * 100 * (p.isNegative ? -1 : 1),
    rawScore: 0,
    horsePoint: 0,
    finalScore: 0,
    position: 0
  }))

  rankedPlayers.sort((a, b) => b.scoreNum - a.scoreNum)

  rankedPlayers.forEach(p => {
    p.rawScore = (p.scoreNum - START_POINT) / 1000
  })

  // 计算位次和马点（同分情况下共同获得较高位次）
  let i = 0
  while (i < rankedPlayers.length) {
    let j = i + 1
    while (j < rankedPlayers.length && rankedPlayers[j].scoreNum === rankedPlayers[i].scoreNum) {
      j++
    }
    // 计算位次（使用当前位置+1作为共同位次）
    const position = i + 1
    // 为所有同分玩家设置相同的位次
    for (let k = i; k < j; k++) {
      rankedPlayers[k].position = position
    }
    // 计算马点
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
}

// 验证玩家是否属于某个队伍
async function validatePlayers(players) {
  const playerNames = players.map(p => p.name.trim())
  const playerTeams = {}

  try {
    // 精确查找每个玩家
    for (const name of playerNames) {
      const { data: members } = await db.collection('team_members')
        .where({ member_id: name })
        .get()

      if (members && members.length > 0) {
        playerTeams[name] = members[0].team_id
      } else {
        throw new Error(`${name} 不是任何队伍的队员，请先添加到队伍中`)
      }
    }

    return playerTeams
  } catch (err) {
    console.error('验证玩家失败:', err)
    throw err
  }
}

// 检查是否有同队队员
function hasSameTeamPlayers(playerTeams) {
  const teams = Object.values(playerTeams)
  const uniqueTeams = new Set(teams)
  return uniqueTeams.size < teams.length
}

// 更新队伍分数
async function updateTeamScore(result, playerTeams) {
  // 计算每个队伍的总分变化、队员顺位总和、各顺位次数
  const teamScoreChanges = {}
  const teamPositionSums = {}
  const teamFirstPlaces = {}
  const teamSecondPlaces = {}
  const teamThirdPlaces = {}
  const teamFourthPlaces = {}
  
  result.forEach(p => {
    const teamId = playerTeams[p.name]
    if (!teamScoreChanges[teamId]) {
      teamScoreChanges[teamId] = 0
      teamPositionSums[teamId] = 0
      teamFirstPlaces[teamId] = 0
      teamSecondPlaces[teamId] = 0
      teamThirdPlaces[teamId] = 0
      teamFourthPlaces[teamId] = 0
    }
    teamScoreChanges[teamId] += p.finalScore
    teamPositionSums[teamId] += p.position
    if (p.position === 1) {
      teamFirstPlaces[teamId] += 1
    } else if (p.position === 2) {
      teamSecondPlaces[teamId] += 1
    } else if (p.position === 3) {
      teamThirdPlaces[teamId] += 1
    } else if (p.position === 4) {
      teamFourthPlaces[teamId] += 1
    }
  })

  // 计算队伍排名
  const teamRank = Object.entries(teamScoreChanges)
    .map(([teamId, score]) => ({ teamId, score }))
    .sort((a, b) => b.score - a.score)

  // 更新每个队伍的总分、队员顺位总和、各顺位次数
  for (let i = 0; i < teamRank.length; i++) {
    const { teamId, score } = teamRank[i]
    const updateData = {
      total_score: _.inc(score),
      games_played: _.inc(1),
      total_positions: _.inc(teamPositionSums[teamId]),
      first_place: _.inc(teamFirstPlaces[teamId]),
      second_place: _.inc(teamSecondPlaces[teamId]),
      third_place: _.inc(teamThirdPlaces[teamId]),
      fourth_place: _.inc(teamFourthPlaces[teamId]),
      update_time: db.serverDate()
    }

    const teamUpdateResult = await db.collection('teams').doc(teamId).update({
      data: updateData
    })

    if (!teamUpdateResult.stats || teamUpdateResult.stats.updated < 1) {
      throw new Error(`更新队伍 ${teamId} 数据失败`)
    }
  }

  // 更新队员个人分数（使用 team_members 集合）
  for (let p of result) {
    try {
      // 查找队员在 team_members 集合中的记录
      const playerName = p.name.trim()
      const { data: members } = await db.collection('team_members')
        .where({ member_id: playerName })
        .get()

      if (members && members.length > 0) {
        const member = members[0]
        const memberDoc = db.collection('team_members').doc(member._id)

        // 计算最高和最低打点
        const updateData = {
          total_score: _.inc(p.finalScore),
          games_played: _.inc(1),
          update_time: db.serverDate()
        }

        // 更新最高打点（使用局内得点）
        if (!member.max_score || p.scoreNum > member.max_score) {
          updateData.max_score = p.scoreNum
        }

        // 更新最低打点（使用局内得点）
        if (!member.min_score || p.scoreNum < member.min_score) {
          updateData.min_score = p.scoreNum
        }

        // 更新各顺位次数
        if (p.position === 1) {
          updateData.first_place = _.inc(1)
        } else if (p.position === 2) {
          updateData.second_place = _.inc(1)
        } else if (p.position === 3) {
          updateData.third_place = _.inc(1)
        } else if (p.position === 4) {
          updateData.fourth_place = _.inc(1)
        }

        const memberUpdateResult = await memberDoc.update({
          data: updateData
        })

        if (!memberUpdateResult.stats || memberUpdateResult.stats.updated < 1) {
          throw new Error(`更新玩家 ${p.name} 数据失败`)
        }
      } else {
        console.log(`玩家 ${p.name} 不在 team_members 集合中，跳过更新`)
      }
    } catch (err) {
      console.log(`更新团队赛玩家 ${p.name} 分数失败:`, err)
    }
  }

  // 保存对局记录
  await db.collection('team_games').add({
    data: {
      players: result.map((p) => {
        const playerName = p.name.trim()
        return {
          name: playerName,
          team_id: playerTeams[playerName],
          scoreNum: p.scoreNum,
          finalScore: p.finalScore,
          position: p.position // 记录个人顺位
        }
      }),
      create_time: db.serverDate()
    }
  })

  console.log('对局记录保存成功')
}

// 云函数入口函数
exports.main = async (event, context) => {
  try {
    const { players } = event

    // 验证输入
    let totalScore = 0
    for (let p of players) {
      if (!p.name.trim()) {
        throw new Error('请填写所有玩家姓名')
      }
      if (p.score === '' || p.score === null) {
        throw new Error('请填写所有玩家得点')
      }
      let scoreValue = parseInt(p.score) || 0
      if (p.isNegative) scoreValue = -scoreValue
      totalScore += scoreValue
    }

    if (totalScore !== 1000) {
      throw new Error(`总点数应为1000(百位)，当前为${totalScore}`)
    }

    // 验证所有玩家是否属于某个队伍
    const playerTeams = await validatePlayers(players)

    // 检查是否有同队队员
    if (hasSameTeamPlayers(playerTeams)) {
      throw new Error('不允许同队队员出现在同一场对局')
    }

    // 计算分数
    const result = calculateScores(players)

    // 更新队伍分数
    await updateTeamScore(result, playerTeams)

    return {
      success: true,
      result: result
    }
  } catch (err) {
    console.error('结算失败:', err)
    return {
      success: false,
      error: err.message
    }
  }
}
