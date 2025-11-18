import { DatabaseClient } from "@liga/backend/lib";
import { Constants } from "@liga/shared";

type MatchPlayerLite = {
  id: number;
  name: string;
};

/**
 * Saves all FACEIT post-match data after GAME_OVER.
 *
 * Called ONLY after game.start() resolves (so scorebot populated result & events).
 */
export async function saveFaceitResult(
  gameServer: any,
  dbMatchId: number,
  profile: any
) {
  const prisma = DatabaseClient.prisma;

  // ---------------------------------------------------------------------------
  // 1) SAFE SCORE EXTRACTION (SIDE-AGNOSTIC)
  // ---------------------------------------------------------------------------
  let scoreTeam1 = 0;
  let scoreTeam2 = 0;

  if (gameServer?.result && Array.isArray(gameServer.result.score)) {
    [scoreTeam1, scoreTeam2] = gameServer.result.score as [number, number];
  } else {
    gameServer?.log?.warn?.(
      `FACEIT: saveFaceitResult called without gameServer.result. ` +
      `Events=${gameServer?.scorebotEvents?.length ?? 0}`
    );
  }

  // We treat index 0 = "Team A", index 1 = "Team B".
  // Overtime / side swaps do not matter here because the winner
  // is simply the higher total score.
  const isWinTeamA = scoreTeam1 > scoreTeam2;

  // ---------------------------------------------------------------------------
  // 2) PLAYER LIST (team A, team B, plus user)
  // ---------------------------------------------------------------------------

  // Players as they existed on the server (we only need id + name here)
  let teamA: MatchPlayerLite[] =
    (gameServer?.competitors?.[0]?.team?.players ?? []).map((p: any) => ({
      id: p.id,
      name: p.name,
    }));

  let teamB: MatchPlayerLite[] =
    (gameServer?.competitors?.[1]?.team?.players ?? []).map((p: any) => ({
      id: p.id,
      name: p.name,
    }));

  // Represent the user as a lightweight player
  const userPlayer: MatchPlayerLite = {
    id: profile.player.id,
    name: profile.player.name,
  };

  // Ensure user is treated as Team A member
  if (!teamA.find((p) => p.id === userPlayer.id)) {
    teamA = [...teamA, userPlayer];
  }

  // Build final unified player list (no duplicates)
  let players: MatchPlayerLite[] = [...teamA, ...teamB];
  if (!players.find((p) => p.id === userPlayer.id)) {
    players = [...players, userPlayer];
  }

  // ---------------------------------------------------------------------------
  // 3) EVENT MAPPING (Scorebot → MatchEvent rows)
  // ---------------------------------------------------------------------------
  const events = Array.isArray(gameServer.scorebotEvents)
    ? gameServer.scorebotEvents
    : [];

  const eventsToCreate = events.map((event: any) => {
    const attackerName = event.payload.attacker?.name;
    const victimName = event.payload.victim?.name;
    const assistName = event.payload.assist?.name;

    return {
      payload: JSON.stringify(event),
      timestamp: event.payload.timestamp,
      half: 0, // FACEIT PUGs: we don't track halves

      attackerId: players.find((p) => p.name === attackerName)?.id ?? null,
      victimId: players.find((p) => p.name === victimName)?.id ?? null,
      assistId: players.find((p) => p.name === assistName)?.id ?? null,

      headshot: event.payload.headshot ?? false,
    };
  });

  gameServer?.log?.info?.(
    `FACEIT: Persisting match ${dbMatchId} — events=${eventsToCreate.length
    }, scoreTeam1=${scoreTeam1}, scoreTeam2=${scoreTeam2}`
  );

  // ---------------------------------------------------------------------------
  // 4) UPDATE MATCH CORE DATA (STATUS, EVENTS, PLAYERS, SCORES)
  // ---------------------------------------------------------------------------
  await prisma.match.update({
    where: { id: dbMatchId },
    data: {
      status: Constants.MatchStatus.COMPLETED,

      // attach all players
      players: {
        connect: players.map((p) => ({ id: p.id })),
      },

      // insert every scorebot event
      events: {
        create: eventsToCreate,
      },

      // mark all games inside this match completed (your pseudo-match only has one)
      games: {
        updateMany: {
          where: {},
          data: {
            status: Constants.MatchStatus.COMPLETED,
          },
        },
      },

      // update competitors scores (teamId 1 = Team A, 2 = Team B)
      competitors: {
        updateMany: [
          {
            where: { teamId: 1 },
            data: {
              score: scoreTeam1,
              result:
                scoreTeam1 > scoreTeam2
                  ? Constants.MatchResult.WIN
                  : scoreTeam1 < scoreTeam2
                    ? Constants.MatchResult.LOSS
                    : Constants.MatchResult.DRAW,
            },
          },
          {
            where: { teamId: 2 },
            data: {
              score: scoreTeam2,
              result:
                scoreTeam2 > scoreTeam1
                  ? Constants.MatchResult.WIN
                  : scoreTeam2 < scoreTeam1
                    ? Constants.MatchResult.LOSS
                    : Constants.MatchResult.DRAW,
            },
          },
        ],
      },
    },
  });

  // ---------------------------------------------------------------------------
  // 5) APPLY FACEIT ELO CHANGES (USER + BOTS)
  // ---------------------------------------------------------------------------

  // Load original FACEIT match payload to access eloGain / eloLoss used in matchroom
  const dbMatch = await prisma.match.findFirst({
    where: { id: dbMatchId },
  });

  let eloGain = 0;
  let eloLoss = 0;

  try {
    const payload = JSON.parse(dbMatch?.payload ?? "{}");
    eloGain = payload.eloGain ?? 0;
    eloLoss = payload.eloLoss ?? 0;
  } catch (err) {
    console.error("Failed to parse FACEIT match payload:", err);
  }

  // Your team = Team A
  const deltaTeamA = isWinTeamA ? eloGain : -eloLoss;
  const deltaTeamB = isWinTeamA ? -eloLoss : eloGain; // opposite for enemies

  // ---- Update USER first ----
  const newUserElo = profile.faceitElo + deltaTeamA;
  await prisma.profile.update({
    where: { id: profile.id },
    data: { faceitElo: newUserElo },
  });

  // ---- Update TEAM A bots ----
  await Promise.all(
    teamA
      .filter((p) => p.id !== profile.player.id)
      .map(async (bot) => {
        await prisma.player.update({
          where: { id: bot.id },
          data: { elo: { increment: deltaTeamA } },
        });
      })
  );

  // ---- Update TEAM B bots ----
  await Promise.all(
    teamB.map(async (bot) => {
      await prisma.player.update({
        where: { id: bot.id },
        data: { elo: { increment: deltaTeamB } },
      });
    })
  );

  // Also store some FACEIT metadata on the match
  await prisma.match.update({
    where: { id: dbMatchId },
    data: {
      faceitIsWin: isWinTeamA,
      faceitTeammates: JSON.stringify(teamA),
      faceitOpponents: JSON.stringify(teamB),
      faceitRating: null,
      faceitEloDelta: deltaTeamA,
    },
  });

  return true;
}
