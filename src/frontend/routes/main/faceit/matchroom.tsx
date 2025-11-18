import React, { useEffect, useState } from "react";
import { LEVEL_IMAGES } from "./faceit";
import { FaceitHeader } from "./faceit";
import Scoreboard from "./scoreboard";
import { levelFromElo } from "@liga/backend/lib/levels";
import { Constants } from "@liga/shared";

import { AppStateContext } from "@liga/frontend/redux";
import {
  faceitMatchCompleted,
  faceitRoomClear,
  faceitRoomSet,
} from "@liga/frontend/redux/actions";

// ------------------------------
// TYPES
// ------------------------------

export type MatchPlayer = {
  id: number;
  name: string;
  elo: number;
  level: number;
  role?: string | null;
  countryId: number;
};

export interface MatchRoomData {
  fakeRoomId: string;
  teamA: MatchPlayer[];
  teamB: MatchPlayer[];
  expectedWinA: number;
  expectedWinB: number;
  eloGain: number;
  eloLoss: number;
}

export interface MatchRoomProps {
  room: MatchRoomData;
  onClose: () => void;          // hide UI but keep room persisted
  onEloUpdate?: () => void;     // refresh header
  countryMap: Map<number, string>;
  elo: number;
  level: number;
  pct: number;
  low: number;
  high: number;
}

// ------------------------------
// HELPERS
// ------------------------------

function getTeamName(team: MatchPlayer[], fallback: string): string {
  return team.length > 0 ? `Team_${team[0].name}` : fallback;
}

function getTeamAvgElo(team: MatchPlayer[]): number {
  if (team.length === 0) return 0;
  return Math.round(team.reduce((sum, p) => sum + p.elo, 0) / team.length);
}

function getTeamAvgLevel(team: MatchPlayer[]): number {
  return levelFromElo(getTeamAvgElo(team));
}

// ------------------------------
// COMPONENT
// ------------------------------

export default function MatchRoom({
  room,
  onClose,
  onEloUpdate,
  countryMap,
  elo,
  level,
  pct,
  low,
  high,
}: MatchRoomProps): JSX.Element {
  const { state, dispatch } = React.useContext(AppStateContext);

  const {
    fakeRoomId,
    teamA,
    teamB,
    expectedWinA,
    eloGain,
    eloLoss,
  } = room;

  const [tab, setTab] = useState<"room" | "scoreboard">("room");

  // Read global persisted matchId from Redux
  const storedMatchId = state.faceitMatchId;

  // ------------------------------
  // Start Match (CONNECT TO SERVER)
  // ------------------------------

  const handleStartMatch = async () => {
    const result: { matchId: number } = await api.faceit.startMatch(room);

    // store match ID in redux
    dispatch(faceitRoomSet(room, result.matchId));

    if (onEloUpdate) await onEloUpdate();

    // go to scoreboard tab as soon as the game is done
    setTab("scoreboard");
  };

  // ------------------------------
  // Detect match completion → flag in Redux
  // ------------------------------

  useEffect(() => {
    if (!storedMatchId) return;

    const checkStatus = async () => {
      const data = await api.faceit.getMatchData(storedMatchId);

      if (
        data.match &&
        data.match.status === Constants.MatchStatus.COMPLETED   
      ) {
        dispatch(faceitMatchCompleted());
      }
    };

    const interval = setInterval(checkStatus, 1500);
    return () => clearInterval(interval);
  }, [storedMatchId, dispatch]);

  // When match is completed, ensure we’re on the scoreboard tab
  useEffect(() => {
    if (state.faceitMatchCompleted) {
      setTab("scoreboard");
    }
  }, [state.faceitMatchCompleted]);

  // ------------------------------
  // RENDER
  // ------------------------------

  return (
    <div className="w-full min-h-screen bg-[#0b0b0b] text-white flex flex-col">
      {/* FACEIT HEADER */}
      <FaceitHeader elo={elo} level={level} pct={pct} low={low} high={high} />

      <div className="p-6 overflow-y-auto">
        {/* TOP BAR */}
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold">
            {tab === "room" ? "MATCH ROOM" : "SCOREBOARD"}
          </h1>

          <button
            onClick={onClose}
            className="px-4 py-2 bg-neutral-700 rounded hover:bg-neutral-600"
          >
            Back
          </button>
        </div>

        {/* TABS */}
        <div className="flex gap-8 border-b border-neutral-700 mb-6 pb-2">
          <button
            className={`pb-1 ${tab === "room"
                ? "text-white border-b-2 border-orange-500"
                : "text-neutral-500 hover:text-neutral-300"
              }`}
            onClick={() => setTab("room")}
          >
            MATCH ROOM
          </button>

          <button
            disabled={!storedMatchId}
            className={`pb-1 ${tab === "scoreboard"
                ? "text-white border-b-2 border-orange-500"
                : storedMatchId
                  ? "text-neutral-500 hover:text-neutral-300"
                  : "text-neutral-700 cursor-not-allowed"
              }`}
            onClick={() => setTab("scoreboard")}
          >
            SCOREBOARD
          </button>
        </div>

        {/* MATCH ROOM TAB */}
        {tab === "room" && (
          <>
            <div className="text-center mb-4 opacity-70">
              Match ID: {fakeRoomId}
            </div>

            <div className="grid grid-cols-3 gap-4">
              {/* TEAM A */}
              <div className="bg-[#0f0f0f] p-4 rounded border border-[#222]">
                <div className="flex justify-between items-center mb-3">
                  <h2 className="text-xl font-bold">
                    {getTeamName(teamA, "Team A")}
                  </h2>

                  <div className="flex items-center gap-2">
                    <span className="opacity-80 text-sm">
                      Average ELO {getTeamAvgElo(teamA)}
                    </span>
                    <img
                      src={LEVEL_IMAGES[getTeamAvgLevel(teamA)]}
                      className="w-7 h-7"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  {teamA.map((p) => (
                    <div
                      key={p.id}
                      className="bg-neutral-800 p-3 rounded flex justify-between items-center"
                    >
                      <div className="flex items-center gap-2">
                        <span className={`fp ${countryMap.get(p.countryId)}`} />
                        <span>{p.name}</span>
                      </div>

                      <div className="flex items-center gap-2">
                        <span className="opacity-70">{p.elo}</span>
                        <img
                          src={LEVEL_IMAGES[p.level]}
                          className="w-8 h-8"
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* MATCH INFO */}
              <div className="bg-[#0f0f0f] p-4 rounded border border-[#222] flex flex-col items-center justify-center">
                <h2 className="text-xl font-bold mb-2">MATCH INFO</h2>

                <div className="mt-2 text-center">
                  <div>Win Chance: {(expectedWinA * 100).toFixed(1)}%</div>
                  <div className="mt-1 opacity-70">
                    Elo Gain: +{eloGain} / Loss: -{eloLoss}
                  </div>
                </div>

                <button
                  className="mt-6 px-8 py-3 bg-orange-600 rounded hover:bg-orange-700 text-lg"
                  onClick={handleStartMatch}
                >
                  CONNECT TO SERVER
                </button>
              </div>

              {/* TEAM B */}
              <div className="bg-[#0f0f0f] p-4 rounded border border-[#222]">
                <div className="flex justify-between items-center mb-3">
                  <h2 className="text-xl font-bold">
                    {getTeamName(teamB, "Team B")}
                  </h2>

                  <div className="flex items-center gap-2">
                    <span className="opacity-80 text-sm">
                      Average ELO {getTeamAvgElo(teamB)}
                    </span>
                    <img
                      src={LEVEL_IMAGES[getTeamAvgLevel(teamB)]}
                      className="w-7 h-7"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  {teamB.map((p) => (
                    <div
                      key={p.id}
                      className="bg-neutral-800 p-3 rounded flex justify-between items-center"
                    >
                      <div className="flex items-center gap-2">
                        <span className={`fp ${countryMap.get(p.countryId)}`} />
                        <span>{p.name}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="opacity-70">{p.elo}</span>
                        <img
                          src={LEVEL_IMAGES[p.level]}
                          className="w-8 h-8"
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </>
        )}

        {/* SCOREBOARD TAB */}
        {tab === "scoreboard" && storedMatchId && (
          <div className="mt-6">
            <Scoreboard matchId={storedMatchId} />
          </div>
        )}
      </div>
    </div>
  );
}
