// 初始化队伍数据云函数
const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()

exports.main = async (event, context) => {
  try {
    // 初始化队伍数据
    const teams = [
      { _id: 'A', team_name: '' },
      { _id: 'B', team_name: '' },
      { _id: 'C', team_name: '' },
      { _id: 'D', team_name: '' },
      { _id: 'E', team_name: '' }
    ]

    // 初始化队员数据
    const members = [
      { team_id: 'A', member_id: 'czh' },
      { team_id: 'A', member_id: 'fxy' },
      { team_id: 'A', member_id: 'lzy' },
      { team_id: 'A', member_id: 'zyh' },
      { team_id: 'B', member_id: 'zzy' },
      { team_id: 'B', member_id: 'zle' },
      { team_id: 'B', member_id: 'cy' },
      { team_id: 'B', member_id: 'mm' },
      { team_id: 'C', member_id: 'wlx' },
      { team_id: 'C', member_id: 'zxy' },
      { team_id: 'C', member_id: 'zyt' },
      { team_id: 'C', member_id: 'wls' },
      { team_id: 'D', member_id: 'cjy' },
      { team_id: 'D', member_id: 'hq' },
      { team_id: 'D', member_id: 'qj' },
      { team_id: 'E', member_id: 'ly' },
      { team_id: 'E', member_id: 'gwh' },
      { team_id: 'E', member_id: 'lm' }
    ]

    // 清空并重新插入teams
    const existingTeams = await db.collection('teams').get()
    for (const t of existingTeams.data) {
      await db.collection('teams').doc(t._id).remove()
    }
    for (const team of teams) {
      await db.collection('teams').add({ data: team })
    }

    // 清空并重新插入team_members
    const existingMembers = await db.collection('team_members').get()
    for (const m of existingMembers.data) {
      await db.collection('team_members').doc(m._id).remove()
    }
    for (const member of members) {
      await db.collection('team_members').add({ data: member })
    }

    return {
      success: true,
      message: '初始化完成',
      teamsCount: teams.length,
      membersCount: members.length
    }
  } catch (err) {
    console.error(err)
    return {
      success: false,
      error: err.message
    }
  }
}