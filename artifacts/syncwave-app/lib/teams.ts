export const TEAM_DEFS = [
  { id: "team1", label: "Team 1", color: "#3b82f6" },
  { id: "team2", label: "Team 2", color: "#f59e0b" },
  { id: "team3", label: "Team 3", color: "#ef4444" },
  { id: "team4", label: "Team 4", color: "#8b5cf6" },
] as const;

export type TeamId = (typeof TEAM_DEFS)[number]["id"];

export function getTeamDef(teamId: string) {
  return TEAM_DEFS.find((t) => t.id === teamId) ?? null;
}
