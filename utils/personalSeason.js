// 个人赛赛季工具

const { fetchAllPages } = require('./dbClient.js')

const SEASONS_COLLECTION = 'seasons'
const SNAPSHOTS_COLLECTION = 'season_player_snapshots'
const PLAYERS_COLLECTION = 'players'

function formatSeasonDate(ts) {
  if (!ts) return ''
  const d = new Date(ts)
  if (!Number.isFinite(d.getTime())) return ''
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function formatSeasonRange(season) {
  if (!season) return ''
  const start = formatSeasonDate(season.start_time)
  const end = season.status === 'active' ? '进行中' : formatSeasonDate(season.end_time)
  if (!start) return end || ''
  return end ? `${start} ~ ${end}` : start
}

function isCollectionNotExistError(e) {
  const code = e && (e.errCode || e.errorCode)
  const msg = (e && (e.errMsg || e.message)) || ''
  return code === -502005 || /collection not exists|Db or Table not exist/i.test(msg)
}

function isCloudFunctionUnavailable(e) {
  const msg = (e && (e.errMsg || e.message)) || String(e)
  return /FUNCTION_NOT_FOUND|-501000|callFunction:fail|cloud function not found/i.test(msg)
}

function extractErrorMessage(e) {
  if (!e) return '操作失败'
  return e.errMsg || e.message || String(e)
}

/** 通过 add 自动创建尚不存在的集合 */
async function initSeasonCollections(db) {
  for (const name of [SEASONS_COLLECTION, SNAPSHOTS_COLLECTION]) {
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
        console.warn('init collection cleanup skipped:', name, removeErr)
      }
    }
  }
}

async function getActiveSeason(db) {
  try {
    const { data } = await db.collection(SEASONS_COLLECTION).where({ status: 'active' }).limit(1).get()
    return data && data[0] ? data[0] : null
  } catch (e) {
    if (isCollectionNotExistError(e)) return null
    throw e
  }
}

async function ensureActiveSeason(db) {
  await initSeasonCollections(db)
  const existing = await getActiveSeason(db)
  if (existing) return existing
  const res = await db.collection(SEASONS_COLLECTION).add({
    data: {
      name: '第1赛季',
      status: 'active',
      start_time: db.serverDate(),
      create_time: db.serverDate()
    }
  })
  return { _id: res._id, name: '第1赛季', status: 'active' }
}

async function fetchArchivedSeasons(db) {
  try {
    await initSeasonCollections(db)
    const all = await fetchAllPages((offset, limit) =>
      db.collection(SEASONS_COLLECTION)
        .where({ status: 'archived' })
        .orderBy('end_time', 'desc')
        .skip(offset)
        .limit(limit)
        .get()
    )
    return all.filter(s => !s._init)
  } catch (e) {
    if (isCollectionNotExistError(e)) return []
    throw e
  }
}

async function fetchAllPlayers(db) {
  return fetchAllPages((offset, limit) =>
    db.collection(PLAYERS_COLLECTION)
      .orderBy('total_score', 'desc')
      .skip(offset)
      .limit(limit)
      .get()
  )
}

async function batchAddSnapshots(db, snapshots) {
  const batchSize = 10
  for (let i = 0; i < snapshots.length; i += batchSize) {
    const chunk = snapshots.slice(i, i + batchSize)
    await Promise.all(chunk.map(item => db.collection(SNAPSHOTS_COLLECTION).add({ data: item })))
  }
}

async function batchResetPlayers(db, players) {
  const _ = db.command
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
  const batchSize = 8
  for (let i = 0; i < players.length; i += batchSize) {
    const chunk = players.slice(i, i + batchSize)
    await Promise.all(chunk.map(p =>
      db.collection(PLAYERS_COLLECTION).doc(p._id).update({ data: resetData })
    ))
  }
}

async function getNextSeasonNumber(db) {
  try {
    const { total } = await db.collection(SEASONS_COLLECTION).count()
    return (total || 0) + 1
  } catch (e) {
    if (isCollectionNotExistError(e)) return 1
    throw e
  }
}

async function rolloverSeasonClient(db, newSeasonName) {
  const trimmedName = (newSeasonName || '').trim()
  await initSeasonCollections(db)

  let activeSeason = await getActiveSeason(db)
  if (!activeSeason) {
    activeSeason = await ensureActiveSeason(db)
  }

  const players = await fetchAllPlayers(db)
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
    await batchAddSnapshots(db, snapshots)
  }

  await db.collection(SEASONS_COLLECTION).doc(activeSeason._id).update({
    data: {
      status: 'archived',
      end_time: db.serverDate(),
      player_count: players.length,
      update_time: db.serverDate()
    }
  })

  await batchResetPlayers(db, players)

  const nextNum = await getNextSeasonNumber(db)
  const name = trimmedName || `第${nextNum}赛季`
  const newRes = await db.collection(SEASONS_COLLECTION).add({
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
}

async function rolloverSeasonViaCloud(newSeasonName) {
  const { result } = await wx.cloud.callFunction({
    name: 'personalSeasonRollover',
    data: { newSeasonName: (newSeasonName || '').trim() },
    timeout: 60000
  })
  if (!result || !result.ok) {
    throw new Error((result && result.error) || '云函数赛季更替失败')
  }
  return result
}

/**
 * 封存当前赛季并重置玩家统计（优先云函数，失败则客户端）
 */
async function rolloverSeason(db, newSeasonName) {
  await initSeasonCollections(db)
  try {
    return await rolloverSeasonViaCloud(newSeasonName)
  } catch (e) {
    if (!isCloudFunctionUnavailable(e)) {
      throw new Error(extractErrorMessage(e))
    }
    console.warn('云函数不可用，改用客户端封存:', e)
    return rolloverSeasonClient(db, newSeasonName)
  }
}

async function fetchPlayerSeasonSnapshots(db, playerName) {
  if (!playerName) return []
  try {
    await initSeasonCollections(db)
    return fetchAllPages((offset, limit) =>
      db.collection(SNAPSHOTS_COLLECTION)
        .where({ player_name: playerName })
        .skip(offset)
        .limit(limit)
        .get()
    )
  } catch (e) {
    if (isCollectionNotExistError(e)) return []
    throw e
  }
}

async function fetchSeasonsByIds(db, ids) {
  const unique = [...new Set((ids || []).filter(Boolean))]
  const map = {}
  await Promise.all(unique.map(async (id) => {
    try {
      const { data } = await db.collection(SEASONS_COLLECTION).doc(id).get()
      if (data) {
        map[id] = {
          ...data,
          rangeStr: formatSeasonRange(data)
        }
      }
    } catch (e) {
      console.warn('fetch season meta failed:', id, e)
    }
  }))
  return map
}

module.exports = {
  SEASONS_COLLECTION,
  formatSeasonDate,
  formatSeasonRange,
  getActiveSeason,
  ensureActiveSeason,
  fetchArchivedSeasons,
  initSeasonCollections,
  rolloverSeason,
  fetchPlayerSeasonSnapshots,
  fetchSeasonsByIds
}
