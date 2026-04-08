// 云函数入口文件
const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()
const _ = db.command

// 云函数入口函数
exports.main = async (event, context) => {
  try {
    const { gameId } = event

    // 校验对局记录是否存在
    const gameRes = await db.collection('team_games').doc(gameId).get()
    if (!gameRes.data) {
      throw new Error('对局记录不存在，无法删除')
    }
    const game = gameRes.data

    // 回滚玩家数据
    for (const player of game.players) {
      try {
        // 从 team_members 集合中获取玩家数据
        const { data: members } = await db.collection('team_members')
          .where({ member_id: player.name })
          .get()

        if (members && members.length > 0) {
          const member = members[0]
          // 计算需要回滚的数据
          const updateData = {
            total_score: _.inc(-player.finalScore),
            games_played: _.inc(-1),
            update_time: db.serverDate()
          }

          // 回滚各顺位次数
          if (player.position === 1) {
            updateData.first_place = _.inc(-1)
          } else if (player.position === 2) {
            updateData.second_place = _.inc(-1)
          } else if (player.position === 3) {
            updateData.third_place = _.inc(-1)
          } else if (player.position === 4) {
            updateData.fourth_place = _.inc(-1)
          }

          // 回滚玩家数据
          const memberUpdateResult = await db.collection('team_members').doc(member._id).update({
            data: updateData
          })

          if (!memberUpdateResult.stats || memberUpdateResult.stats.updated < 1) {
            throw new Error(`回滚玩家 ${player.name} 数据失败`)
          }
        }
      } catch (err) {
        console.log(`回滚玩家 ${player.name} 数据失败:`, err)
      }
    }

    // 回滚队伍数据
    const teamScores = {}
    const teamPositionSums = {}
    const teamFirstPlaces = {}
    const teamSecondPlaces = {}
    const teamThirdPlaces = {}
    const teamFourthPlaces = {}

    // 计算每个队伍的得分、顺位总和、各顺位次数
    game.players.forEach(player => {
      if (!teamScores[player.team_id]) {
        teamScores[player.team_id] = 0
        teamPositionSums[player.team_id] = 0
        teamFirstPlaces[player.team_id] = 0
        teamSecondPlaces[player.team_id] = 0
        teamThirdPlaces[player.team_id] = 0
        teamFourthPlaces[player.team_id] = 0
      }
      teamScores[player.team_id] += player.finalScore
      teamPositionSums[player.team_id] += player.position
      if (player.position === 1) {
        teamFirstPlaces[player.team_id] += 1
      } else if (player.position === 2) {
        teamSecondPlaces[player.team_id] += 1
      } else if (player.position === 3) {
        teamThirdPlaces[player.team_id] += 1
      } else if (player.position === 4) {
        teamFourthPlaces[player.team_id] += 1
      }
    })

    // 按得分排序队伍
    const sortedTeams = Object.entries(teamScores)
      .map(([teamId, score]) => ({ teamId, score }))
      .sort((a, b) => b.score - a.score)

    // 回滚队伍数据
    for (const { teamId, score } of sortedTeams) {
      try {
        // 从 teams 集合中获取队伍数据
        const teamRes = await db.collection('teams').doc(teamId).get()
        if (teamRes.data) {
          // 计算需要回滚的数据
          const updateData = {
            total_score: _.inc(-score),
            games_played: _.inc(-1),
            total_positions: _.inc(-teamPositionSums[teamId]),
            first_place: _.inc(-teamFirstPlaces[teamId]),
            second_place: _.inc(-teamSecondPlaces[teamId]),
            third_place: _.inc(-teamThirdPlaces[teamId]),
            fourth_place: _.inc(-teamFourthPlaces[teamId]),
            update_time: db.serverDate()
          }

          // 回滚队伍数据
          const teamUpdateResult = await db.collection('teams').doc(teamId).update({
            data: updateData
          })

          if (!teamUpdateResult.stats || teamUpdateResult.stats.updated < 1) {
            throw new Error(`回滚队伍 ${teamId} 数据失败`)
          }
        }
      } catch (err) {
        console.log(`回滚队伍 ${teamId} 数据失败:`, err)
      }
    }

    // 删除对局记录
    await db.collection('team_games').doc(gameId).remove()

    console.log('删除对局记录成功')

    return {
      success: true,
      message: '删除成功'
    }
  } catch (err) {
    console.error('删除失败:', err)
    return {
      success: false,
      error: err.message
    }
  }
}
