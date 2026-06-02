// 公式战名：导出时替换用户名显示

const { fetchAllPages } = require('./dbClient.js')

function resolveDisplayName(username, nameMap) {
  const key = String(username || '').trim()
  if (!key) return ''
  const official = nameMap && nameMap[key]
  if (official && String(official).trim()) return String(official).trim()
  return key
}

async function fetchOfficialNameMap(db) {
  const map = {}
  try {
    const players = await fetchAllPages((offset, limit) =>
      db.collection('players').skip(offset).limit(limit).get()
    )
    players.forEach(p => {
      const key = String(p.name || p._id || '').trim()
      const official = String(p.official_name || '').trim()
      if (key && official) map[key] = official
    })
  } catch (e) {
    console.warn('fetchOfficialNameMap failed', e)
  }
  return map
}

module.exports = {
  resolveDisplayName,
  fetchOfficialNameMap
}
