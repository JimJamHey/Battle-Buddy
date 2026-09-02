export { BattlegroundsParser, baconShopTurn, baconPhaseLabel, isPlaceholderName, isWarbandMinion, seenFromCombat, isCombatSpectatorCreateGame, isEndGameDisconnect, normalizeName, parseLoadingScreenScene, parsePowerLogTime, sceneFromMode } from './parser'
export { pickLastSeenBoard, printedStats, liveTone, catalogForSeen, isGainedKeyword } from './liveStats'
export {
  parseDeathrattleSummon,
  parseStartOfCombat,
  parseCardCombat,
  simulateCombat,
  enrichCombatInput,
  collectNamedSummonNames,
  combatInputHasGaps,
  lookupCombatKit,
  mergeCombatKits,
  COMBAT_KITS,
  COMBAT_QUICK_SAMPLES,
  COMBAT_FULL_SAMPLES
} from './combatSim'
export type { CombatInput, CombatMinion, CombatResult, CombatSide, DeathrattleSummon } from './combatSim'
export { cardArtUrls, cardFaceUrls, cardGoldenRenderUrls, cardTavernRenderUrls, boardCardUrls, cardTileUrls, cardSlug, baseCardId, poolBaseId, isTrinketCardId, heroBuddyCardId, heroHasBuddy, goldenCardId, catalogFromCardsJson, catalogHeroesFromCardsJson, catalogSummonsFromCardsJson, isBattlegroundsPoolMinion, isBattlegroundsBuddy, isBattlegroundsTrinket, toBgMinion } from './cards'
export { isBgHeroCardId, isBaconBobHero, isPickedBgHero, looksLikeHeroName, canonicalTribe, sortTribes, tribeSlug } from './heroes'
export { groupPoolCards, minionsForTier, filterPoolGroups, filterGroupsByMechanic, mechanicsInGroups, poolCopies, groupLabel, isTierGroupTitle, showPoolTierBubbles, relatedTribes, splitGroupsByTier, cardAvailableInLobby, tribeAvailableInLobby } from './pool'
export { classifyPlayerBuff, mergeBuffs, formatBuffValue, playerTagBuff, PLAYER_STAT_TAGS, PLAYER_TAG_KEYS, emptyTagBuffs } from './buffs'
export { mechanicsFromCard, cardMechanics, cardHasMechanic, MECHANIC_ORDER } from './mechanics'
export { ensureWindowedGraphics } from './hsOptions'
export { indexLeaderboard, leaderboardAccountId, leaderboardUrl, matchLobby, rowsFromPage } from './mmr'
export { applyGameMmr, applyRatingObservation, averageFinish, bindCurrentMmr, dedupeGames, emptySession, ensureToday, gamesToday, gameMmrIsSettled, hydrateGameMmr, recordFinish, MAX_RECENT_GAMES } from './session'
export { PoolTracker } from './poolTrack'
export { parsePlayRating, parseRatingObservation, mergeRatingObservations, isSessionTotalDelta, acceptObservedRating, battleTagDiscriminator, ratingCaptureRect, ratingCaptureRects, resultCaptureRects } from './playRating'
export { opponentCombatCaptureRect, friendlyHandCaptureRect } from './combatCapture'
export { combatInputNeedsHandOcr, matchCatalogCardsFromText, mergeHandOcr } from './combatHand'
export {
  COMBAT_TRIGGERS,
  COMBAT_KEYWORDS,
  UNSUPPORTED_COMBAT_MECHANICS,
  keywordsFromText,
  cardTextIsCombatRelevant
} from './combatMechanics'
export { buildSummonPools, pickRandomSummon, summonPoolHasTribe } from './combatSummonPools'
export type { SummonPools, SummonPoolBody } from './combatSummonPools'
export { combatCoverageReport, combatCoverageForCard } from './combatCoverage'
export type { CoverageReport, CoverageRow } from './combatCoverage'
export {
  strategyCandidates,
  snapshotFromCatalog,
  diffSnapshots,
  reviewCurated,
  markStale,
  parseHsjsonBuild,
  latestHsjsonBuild,
  strategyCatalog
} from './strategy'
export type { StrategyComp, PoolSnapshot, PoolDiff, CuratedFile } from './strategy'
export { loadPoolSnapshot, COMMITTED_POOL_BUILD, assertCommittedPoolBuild, poolBuildNumber } from './poolSnapshot'
export { mergeLogConfig, trackerBanner } from './logConfig'
export { resolveLogsDirectory } from './logPaths'
export { clampOverlayPos, mergeOverlayLayout, migrateOverlayLayout } from './layout'
export { isNewerVersion, isPrerelease } from './version'
export { curatedStrategies } from './curated'
export { sanitizeSettings, sanitizeTier } from './settings'
export * from './types'
