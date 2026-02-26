import axios from "axios";
import { auth } from "./firebase";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";

// Create axios instance
const api = axios.create({
    baseURL: API_URL,
    timeout: 15000,
});

// Add auth token to requests
api.interceptors.request.use(async (config) => {
    const user = auth?.currentUser;
    if (user) {
        const token = await user.getIdToken();
        config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
});

// Auth APIs
export const authAPI = {
    verify: () => api.post("/api/auth/verify"),
    registerMember: () => api.post("/api/auth/register-member"),
};

// Admin APIs
export const adminAPI = {
    // Locations
    createLocation: (data: { location_name: string; description?: string }) =>
        api.post("/api/admin/locations", data),
    getLocations: () => api.get("/api/admin/locations"),
    updateLocation: (id: number, data: { location_name: string; description?: string }) =>
        api.put(`/api/admin/locations/${id}`, data),
    deleteLocation: (id: number) => api.delete(`/api/admin/locations/${id}`),

    // Gold Bars
    createGoldBar: (data: {
        points: number;
        location_id: number;
        clue_text: string;
        clue_location_id: number;
    }) => api.post("/api/admin/gold-bars", data),
    getGoldBars: () => api.get("/api/admin/gold-bars"),
    getGoldBarQR: (id: number) => api.get(`/api/admin/gold-bars/${id}/qr`),
    updateGoldBar: (id: number, data: { points?: number; location_id?: number; clue_text?: string; clue_location_id?: number }) =>
        api.put(`/api/admin/gold-bars/${id}`, data),
    deleteGoldBar: (id: number) => api.delete(`/api/admin/gold-bars/${id}`),

    // Sabotages
    getSabotages: () => api.get("/api/admin/sabotages"),
    overruleSabotage: (id: number) => api.post(`/api/admin/sabotages/${id}/overrule`),

    // Analytics
    getAnalytics: () => api.get("/api/admin/analytics"),

    // Team Leads
    createTeamLead: (data: { email: string }) =>
        api.post("/api/admin/team-leads", data),
    deleteTeamLead: (id: number) => api.delete(`/api/admin/team-leads/${id}`),

    // Participants
    getParticipants: () => api.get("/api/admin/participants"),
    promoteParticipant: (id: number) => api.put(`/api/admin/participants/${id}/promote`),
    removeParticipant: (id: number) => api.delete(`/api/admin/participants/${id}`),

    // Detailed Teams
    getDetailedTeams: () => api.get("/api/admin/teams/detailed"),
    disqualifyTeam: (id: number) => api.put(`/api/admin/teams/${id}/disqualify`),
    getTeamLeads: () => api.get("/api/admin/team-leads"),

    // Cards
    generateCards: (data: { num_innocents: number; num_traitors: number }) =>
        api.post("/api/admin/generate-cards", data),

    // Leaderboard
    getLeaderboard: () => api.get("/api/admin/leaderboard"),
    getTeamsByType: () => api.get("/api/admin/teams/by-type"),

    // Game Settings
    updateGameSettings: (data: {
        total_rounds?: number;
        round_duration?: number;
        sabotage_duration?: number;
        sabotage_cooldown?: number;
        sabotage_same_person_cooldown?: number;
    }) => api.put("/api/admin/game-settings", data),
    getGameSettings: () => api.get("/api/admin/game-settings"),

    // Game Control
    startRound: () => api.post("/api/admin/start-round"),
    resetGame: () => api.post("/api/admin/reset-game"),

    // New Team Mgmt
    deleteTeam: (id: number) => api.delete(`/api/admin/teams/${id}`),
    addTeamMember: (teamId: number, email: string) => api.post(`/api/admin/teams/${teamId}/members`, { email }),
    removeTeamMember: (teamId: number, userId: number) => api.delete(`/api/admin/teams/${teamId}/members/${userId}`),

    // Leaderboard Toggle
    toggleLeaderboard: (publish: boolean) => api.put("/api/admin/leaderboard/publish", { start_publish: publish }),

    // Extra Points
    addExtraPoints: (teamId: number, data: { points: number, reason?: string }) =>
        api.post(`/api/admin/teams/${teamId}/extra-points`, data),

    // Poll Management
    startPoll: () => api.post("/api/admin/start-poll"),
    getCurrentPollAdmin: () => api.get("/api/admin/poll/current"),
    endPoll: (id: number) => api.post(`/api/admin/poll/${id}/end`),
};

// Team APIs
export const teamAPI = {
    scanAssignment: (data: { card_data: string }) =>
        api.post("/api/team/scan-assignment", data),
    createTeam: (data: { team_name: string; team_type: string }) =>
        api.post("/api/team/create", data),
    joinTeam: (data: { team_code?: string; qr_data?: string }) =>
        api.post("/api/team/join", data),
    getMyTeam: () => api.get("/api/team/my-team"),
    getCurrentClue: () => api.get("/api/team/current-clue"),
    scanGoldBar: (data: { qr_code: string }) =>
        api.post("/api/team/scan-gold-bar", data),
    getMembers: () => api.get("/api/team/members"),
};

// Game APIs
export const gameAPI = {
    getGameState: () => api.get("/api/game/state"),
    getLeaderboard: () => api.get("/api/game/leaderboard"),
    getLiveLeaderboard: () => api.get("/api/game/leaderboard/live"),
    sabotage: (data: { target_team_id: number }) =>
        api.post("/api/game/sabotage", data),
    getInnocentTeams: () => api.get("/api/game/innocent-teams"),
    getSabotageStatus: () => api.get("/api/game/sabotage-status"),
    getSabotageCooldown: () => api.get("/api/game/sabotage-cooldown"),

    // Poll
    getCurrentPoll: () => api.get("/api/game/poll/current"),
    castVote: (data: { voted_for_team_id: number }) => api.post("/api/game/poll/vote", data),
};

export default api;
