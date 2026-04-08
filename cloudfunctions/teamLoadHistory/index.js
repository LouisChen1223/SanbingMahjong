// 云函数入口文件
const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()

// 云函数入口函数
exports.main = async (event, context) => {
  try {
    const { limit = 100, offset = 0 } = event

    // 获取队伍信息
    const { data: teamsData } = await db.collection('teams').get()
    const teamMap = new Map()
    teamsData.forEach(team => {
      teamMap.set(team._id, team.team_name || team._id)
    })

    // 加载对局历史，支持分页
    const { data: gamesData } = await db.collection('team_games')
      .orderBy('create_time', 'desc')
      .skip(offset)
      .limit(limit)
      .get()

    // 格式化数据
    const formattedGames = gamesData.map(game => {
      const playersWithTeam = game.players.map(player => ({
        ...player,
        team: teamMap.get(player.team_id) || '无队伍',
        scoreNum: player.scoreNum || 0
      }))

      return {
        ...game,
        players: playersWithTeam,
        formattedDate: formatDate(game.create_time)
      }
    })

    return {
      success: true,
      data: formattedGames
    }
  } catch (err) {
    console.error('加载对局历史失败:', err)
    return {
      success: false,
      error: err.message
    }
  }
}

// 格式化日期
function formatDate(timestamp) {
  if (!timestamp) return ''
  const date = new Date(timestamp)
  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  })
}
