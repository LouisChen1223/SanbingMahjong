// 选手统计：本赛季、总计、历史赛季展示

const { formatScore, formatInteger } = require('./personalRank.js')

function mergePlayerRecords(current, snapshots) {
  const merged = {
    games_played: 0,
    total_score: 0,
    first_place: 0,
    second_place: 0,
    third_place: 0,
    fourth_place: 0,
    max_score: undefined,
    min_score: undefined
  }

  const add = (rec) => {
    if (!rec) return
    merged.games_played += rec.games_played || 0
    merged.total_score += rec.total_score || 0
    merged.first_place += rec.first_place || 0
    merged.second_place += rec.second_place || 0
    merged.third_place += rec.third_place || 0
    merged.fourth_place += rec.fourth_place || 0
    if (rec.max_score !== undefined && rec.max_score !== null) {
      merged.max_score = merged.max_score === undefined
        ? rec.max_score
        : Math.max(merged.max_score, rec.max_score)
    }
    if (rec.min_score !== undefined && rec.min_score !== null) {
      merged.min_score = merged.min_score === undefined
        ? rec.min_score
        : Math.min(merged.min_score, rec.min_score)
    }
  }

  add(current)
  ;(snapshots || []).forEach(add)
  return merged
}

function buildStatsDisplay(rec) {
  if (!rec) {
    return {
      gamesPlayed: 0,
      totalScoreStr: '0.0',
      totalScoreSigned: '0.0',
      rate1Str: '0.0%',
      avoid4Str: '0.0%',
      avgPositionStr: '0.00',
      maxScoreStr: '0',
      minScoreStr: '0',
      placementStr: '0/0/0/0',
      hasMinScore: false,
      minScoreNegative: false
    }
  }

  const gamesPlayed = rec.games_played || 0
  const firstPlace = rec.first_place || 0
  const secondPlace = rec.second_place || 0
  const thirdPlace = rec.third_place || 0
  const fourthPlace = rec.fourth_place || 0
  const totalScore = rec.total_score || 0

  let rate1Str = '0.0%'
  let avoid4Str = '0.0%'
  let avgPositionStr = '0.00'

  if (gamesPlayed > 0) {
    rate1Str = ((firstPlace / gamesPlayed) * 100).toFixed(1) + '%'
    avoid4Str = ((1 - (fourthPlace / gamesPlayed)) * 100).toFixed(1) + '%'
    const avgPosition = (firstPlace + secondPlace * 2 + thirdPlace * 3 + fourthPlace * 4) / gamesPlayed
    avgPositionStr = avgPosition.toFixed(2)
  }

  const scoreStr = formatScore(totalScore)
  return {
    gamesPlayed,
    totalScoreStr: scoreStr,
    totalScoreSigned: (totalScore >= 0 ? '+' : '') + scoreStr,
    rate1Str,
    avoid4Str,
    avgPositionStr,
    maxScoreStr: formatInteger(rec.max_score),
    minScoreStr: formatInteger(rec.min_score),
    placementStr: `${firstPlace}/${secondPlace}/${thirdPlace}/${fourthPlace}`,
    hasMinScore: rec.min_score !== undefined && rec.min_score !== null,
    minScoreNegative: (rec.min_score || 0) < 0
  }
}

function buildSeasonHistoryItem(snapshot, seasonMeta) {
  const stats = buildStatsDisplay(snapshot)
  const season = seasonMeta || {}
  return {
    seasonId: snapshot.season_id,
    seasonName: snapshot.season_name || season.name || '未知赛季',
    rank: snapshot.rank || '-',
    endTime: season.end_time,
    rangeStr: season.rangeStr || '',
    ...stats
  }
}

module.exports = {
  mergePlayerRecords,
  buildStatsDisplay,
  buildSeasonHistoryItem
}
