// 个人赛排行榜计算（当前赛季与历史赛季快照共用）

function formatScore(score) {
  if (score === null || score === undefined) return '0.0'
  return Number(score).toFixed(1)
}

function formatInteger(score) {
  if (score === null || score === undefined) return '0'
  return Math.round(Number(score)).toString()
}

function calculateRankLists(players) {
  const formattedPlayers = players.map(p => ({
    ...p,
    totalScoreStr: formatScore(p.total_score),
    rate1: p.games_played > 0 ? (p.first_place || 0) / p.games_played : 0,
    rate1Str: p.games_played > 0 ? ((p.first_place || 0) / p.games_played * 100).toFixed(1) + '%' : '0.0%',
    avoid4: p.games_played > 0 ? (1 - ((p.fourth_place || 0) / p.games_played)) : 0,
    avoid4Str: p.games_played > 0 ? ((1 - ((p.fourth_place || 0) / p.games_played)) * 100).toFixed(1) + '%' : '0.0%',
    avgPosition: p.games_played > 0 ? ((p.first_place || 0) * 1 + (p.second_place || 0) * 2 + (p.third_place || 0) * 3 + (p.fourth_place || 0) * 4) / p.games_played : 0,
    avgPositionStr: p.games_played > 0 ? (((p.first_place || 0) * 1 + (p.second_place || 0) * 2 + (p.third_place || 0) * 3 + (p.fourth_place || 0) * 4) / p.games_played).toFixed(2) : '0.00'
  }))

  const rate1List = players
    .filter(p => p.games_played >= 5)
    .map(p => ({
      ...p,
      rate1: (p.first_place || 0) / p.games_played,
      rate1Str: ((p.first_place || 0) / p.games_played * 100).toFixed(1) + '%'
    }))
    .sort((a, b) => b.rate1 - a.rate1)

  const avoid4List = players
    .filter(p => p.games_played >= 5)
    .map(p => ({
      ...p,
      avoid4: 1 - ((p.fourth_place || 0) / p.games_played),
      avoid4Str: ((1 - ((p.fourth_place || 0) / p.games_played)) * 100).toFixed(1) + '%'
    }))
    .sort((a, b) => b.avoid4 - a.avoid4)

  const avgPositionList = players
    .filter(p => p.games_played >= 5)
    .map(p => ({
      ...p,
      avgPosition: ((p.first_place || 0) * 1 + (p.second_place || 0) * 2 + (p.third_place || 0) * 3 + (p.fourth_place || 0) * 4) / p.games_played,
      avgPositionStr: (((p.first_place || 0) * 1 + (p.second_place || 0) * 2 + (p.third_place || 0) * 3 + (p.fourth_place || 0) * 4) / p.games_played).toFixed(2)
    }))
    .sort((a, b) => a.avgPosition - b.avgPosition)

  const maxScoreList = players
    .filter(p => p.max_score !== undefined)
    .map(p => ({
      ...p,
      maxScoreStr: formatInteger(p.max_score)
    }))
    .sort((a, b) => (b.max_score || 0) - (a.max_score || 0))

  const minScoreList = players
    .filter(p => p.min_score !== undefined)
    .map(p => ({
      ...p,
      minScoreStr: formatInteger(p.min_score)
    }))
    .sort((a, b) => (a.min_score || 999999) - (b.min_score || 999999))

  return { formattedPlayers, rate1List, avoid4List, maxScoreList, minScoreList, avgPositionList }
}

function snapshotsToPlayers(snapshots) {
  return snapshots.map(s => ({
    _id: s.player_name,
    name: s.player_name,
    total_score: s.total_score,
    games_played: s.games_played,
    first_place: s.first_place,
    second_place: s.second_place,
    third_place: s.third_place,
    fourth_place: s.fourth_place,
    max_score: s.max_score,
    min_score: s.min_score
  }))
}

module.exports = {
  formatScore,
  formatInteger,
  calculateRankLists,
  snapshotsToPlayers
}
