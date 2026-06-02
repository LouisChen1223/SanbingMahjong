// 个人赛赛季更替：封存当前赛季玩家排行快照，重置 players，开启新赛季（不删除对局记录）
const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()
const _ = db.command

const SEASONS = 'seasons'
const SNAPSHOTS = 'season_player_snapshots'
const PLAYERS = 'players'

function isCollectionNotExistError(e) {
  const code = e && (e.errCode || e.errorCode)
  const msg = (e && (e.errMsg || e.message)) || ''
  return code === -502005 || /collection not exists|Db or Table not exist/i.test(msg)
}

async function initSeasonCollections() {
  for (const name of [SEASONS, SNAPSHOTS]) {
    try {
      await db.collection(name).limit(1).get()
    } catch (e) {
      if (!isCollectionNotExistError(e)) throw e
      const res = await db.collection(name).add({
        data: { _init: true, create_time: db.serverDate() }
      })
      try {
        await db.collection(name).doc(res._id).remove()
      } catch (removeErr) {
        console.warn('init cleanup skipped:', name, removeErr.message)
      }
    }
  }
}

async function fetchAllPlayers() {
  const pageSize = 100
  const all = []
  let offset = 0
  while (true) {
    const { data } = await db.collection(PLAYERS)
      .orderBy('total_score', 'desc')
      .skip(offset)
      .limit(pageSize)
      .get()
    if (!data || !data.length) break
    all.push(...data)
    if (data.length < pageSize) break
    offset += data.length
    if (offset >= 10000) break
  }
  return all
}

async function batchAddSnapshots(snapshots) {
  const batchSize = 20
  for (let i = 0; i < snapshots.length; i += batchSize) {
    const chunk = snapshots.slice(i, i + batchSize)
    await Promise.all(chunk.map(item => db.collection(SNAPSHOTS).add({ data: item })))
  }
}

async function batchResetPlayers(players) {
  const resetData = {
    total_score: 0,
    games_played: 0,
    first_place: 0,
    second_place: 0,
    third_place: 0,
    fourth_place: 0,
    max_score: _.remove(),
    min_score: _.remove(),
    update_time: db.serverDate()
  }
  const batchSize = 20
  for (let i = 0; i < players.length; i += batchSize) {
    const chunk = players.slice(i, i + batchSize)
    await Promise.all(chunk.map(p => db.collection(PLAYERS).doc(p._id).update({ data: resetData })))
  }
}

async function getNextSeasonNumber() {
  try {
    const { total } = await db.collection(SEASONS).count()
    return (total || 0) + 1
  } catch (e) {
    if (isCollectionNotExistError(e)) return 1
    throw e
  }
}

exports.main = async (event) => {
  const newSeasonName = (event && event.newSeasonName) ? String(event.newSeasonName).trim() : ''

  try {
    await initSeasonCollections()

    let { data: activeList } = await db.collection(SEASONS).where({ status: 'active' }).limit(1).get()
    let activeSeason = activeList && activeList[0]

    if (!activeSeason) {
      const addRes = await db.collection(SEASONS).add({
        data: {
          name: '第1赛季',
          status: 'active',
          start_time: db.serverDate(),
          create_time: db.serverDate()
        }
      })
      activeSeason = { _id: addRes._id, name: '第1赛季', status: 'active' }
    }

    const players = await fetchAllPlayers()
    players.sort((a, b) => (b.total_score || 0) - (a.total_score || 0))

    const snapshots = players.map((p, idx) => ({
      season_id: activeSeason._id,
      season_name: activeSeason.name,
      player_name: p.name || p._id,
      total_score: p.total_score || 0,
      games_played: p.games_played || 0,
      first_place: p.first_place || 0,
      second_place: p.second_place || 0,
      third_place: p.third_place || 0,
      fourth_place: p.fourth_place || 0,
      max_score: p.max_score,
      min_score: p.min_score,
      avatar_url: p.avatar_url || '',
      rank: idx + 1,
      create_time: db.serverDate()
    }))

    if (snapshots.length > 0) {
      await batchAddSnapshots(snapshots)
    }

    await db.collection(SEASONS).doc(activeSeason._id).update({
      data: {
        status: 'archived',
        end_time: db.serverDate(),
        player_count: players.length,
        update_time: db.serverDate()
      }
    })

    await batchResetPlayers(players)

    const nextNum = await getNextSeasonNumber()
    const name = newSeasonName || `第${nextNum}赛季`
    const newRes = await db.collection(SEASONS).add({
      data: {
        name,
        status: 'active',
        start_time: db.serverDate(),
        create_time: db.serverDate()
      }
    })

    return {
      ok: true,
      archivedSeasonId: activeSeason._id,
      archivedSeasonName: activeSeason.name,
      newSeasonId: newRes._id,
      newSeasonName: name,
      playerCount: players.length
    }
  } catch (e) {
    return { ok: false, error: e.message || String(e) }
  }
}
