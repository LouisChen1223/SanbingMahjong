// 云函数入口文件
const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()

// 云函数入口函数
exports.main = async (event, context) => {
  try {
    // 加载队伍数据
    const { data: teamsData } = await db.collection('teams')
      .orderBy('total_score', 'desc')
      .limit(100)
      .get()

    // 计算队伍排行榜数据
    const formattedTeams = teamsData.map(t => ({
      ...t,
      totalScoreStr: formatScore(t.total_score)
    }))

    // 队伍一位率榜
    const teamRate1List = teamsData
      .filter(t => t.games_played > 0)
      .map(t => ({
        ...t,
        rate1: (t.first_place || 0) / t.games_played,
        rate1Str: ((t.first_place || 0) / t.games_played * 100).toFixed(1) + '%'
      }))
      .sort((a, b) => b.rate1 - a.rate1)

    // 队伍避四率榜
    const teamAvoid4List = teamsData
      .filter(t => t.games_played > 0)
      .map(t => ({
        ...t,
        avoid4: (t.games_played - (t.fourth_place || 0)) / t.games_played,
        avoid4Str: ((t.games_played - (t.fourth_place || 0)) / t.games_played * 100).toFixed(1) + '%'
      }))
      .sort((a, b) => b.avoid4 - a.avoid4)

    // 加载队员数据
    const { data: membersData } = await db.collection('team_members')
      .get()

    // 创建队伍映射
    const teamMap = new Map()
    teamsData.forEach(team => {
      teamMap.set(team._id, team)
    })

    // 统计队员数据
    const playerStats = new Map()

    // 遍历所有队员
    membersData.forEach(member => {
      const name = member.member_id
      const teamId = member.team_id
      const team = teamMap.get(teamId)

      if (!playerStats.has(name)) {
        playerStats.set(name, {
          name: name,
          team: team ? (team.team_name || teamId) : '',
          totalScore: 0,
          firstPlace: 0,
          fourthPlace: 0,
          games: 0,
          maxScore: 0,
          minScore: 0,
          positions: {
            first: 0,
            second: 0,
            third: 0,
            fourth: 0
          }
        })
      }
    })

    // 从 team_members 集合中获取队员的详细数据
    membersData.forEach(member => {
      if (playerStats.has(member.member_id)) {
        const stats = playerStats.get(member.member_id)
        stats.totalScore = member.total_score || 0
        stats.games = member.games_played || 0
        stats.maxScore = member.max_score || 0
        stats.minScore = member.min_score || 0
        stats.firstPlace = member.first_place || 0
        stats.fourthPlace = member.fourth_place || 0
        // 直接从team_members集合中获取所有顺位数据
        stats.positions = {
          first: member.first_place || 0,
          second: member.second_place || 0,
          third: member.third_place || 0,
          fourth: member.fourth_place || 0
        }
        playerStats.set(member.member_id, stats)
      }
    })

    // 转换为数组并添加格式化字段
    const teamPlayers = Array.from(playerStats.values())
      .map(p => ({
        ...p,
        totalScoreStr: p.totalScore.toFixed(1)
      }))
      .sort((a, b) => b.totalScore - a.totalScore)

    // 一位率榜
    const teamPlayersRate1 = Array.from(playerStats.values())
      .filter(p => p.games > 0)
      .map(p => ({
        ...p,
        rate1Str: (p.firstPlace / p.games * 100).toFixed(1) + '%'
      }))
      .sort((a, b) => (b.firstPlace / b.games) - (a.firstPlace / a.games))

    // 避四率榜
    const teamPlayersAvoid4 = Array.from(playerStats.values())
      .filter(p => p.games > 0)
      .map(p => ({
        ...p,
        avoid4Str: ((p.games - p.fourthPlace) / p.games * 100).toFixed(1) + '%'
      }))
      .sort((a, b) => ((b.games - b.fourthPlace) / b.games) - ((a.games - a.fourthPlace) / a.games))

    // 最高打点榜
    const teamPlayersMaxScore = Array.from(playerStats.values())
      .map(p => ({
        ...p,
        maxScoreStr: p.maxScore ? p.maxScore.toFixed(1) : '0.0'
      }))
      .sort((a, b) => (b.maxScore || 0) - (a.maxScore || 0))

    // 最低打点榜
    const teamPlayersMinScore = Array.from(playerStats.values())
      .map(p => ({
        ...p,
        minScoreStr: p.minScore ? p.minScore.toFixed(1) : '0.0'
      }))
      .sort((a, b) => (a.minScore || 0) - (b.minScore || 0))

    return {
      success: true,
      data: {
        teams: formattedTeams,
        teamRate1List: teamRate1List,
        teamAvoid4List: teamAvoid4List,
        teamPlayers: teamPlayers,
        teamPlayersRate1: teamPlayersRate1,
        teamPlayersAvoid4: teamPlayersAvoid4,
        teamPlayersMaxScore: teamPlayersMaxScore,
        teamPlayersMinScore: teamPlayersMinScore
      }
    }
  } catch (err) {
    console.error('加载排行榜数据失败:', err)
    return {
      success: false,
      error: err.message
    }
  }
}

// 格式化分数为一位小数（用于总分）
function formatScore(score) {
  if (score === null || score === undefined) return '0.0'
  return Number(score).toFixed(1)
}
