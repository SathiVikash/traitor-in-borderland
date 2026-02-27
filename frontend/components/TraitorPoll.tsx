"use client";

import { useState, useEffect, useCallback } from "react";
import {
    Dialog,
    Box,
    Typography,
    Button,
    LinearProgress,
    Chip,
    Avatar,
    Divider,
    CircularProgress,
    Alert,
} from "@mui/material";
import { HowToVote, EmojiEvents, Search, Close, CheckCircle, Dangerous } from "@mui/icons-material";
import { gameAPI } from "@/lib/api";
import socket from "@/lib/socket";

interface Team {
    id: number;
    team_name: string;
}

interface PollResult {
    team_id: number;
    team_name: string;
    team_type: string;
    vote_count: number;
}

interface PollData {
    poll: {
        id: number;
        round_number: number;
        status: string;
        ends_at: string;
        is_active: boolean;
    };
    teams: Team[];
    has_voted: boolean;
    my_vote_team_id: number | null;
    my_team_id: number | null;
    my_team_type: "innocent" | "traitor" | null;
    results: PollResult[] | null;
}

interface PollEndedPayload {
    poll_id: number;
    status: string;
}

export default function TraitorPoll() {
    const [open, setOpen] = useState(false);
    const [pollData, setPollData] = useState<PollData | null>(null);
    const [selectedTeam, setSelectedTeam] = useState<number | null>(null);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState("");
    const [timeLeft, setTimeLeft] = useState(0);
    const [totalDuration, setTotalDuration] = useState(105);
    const [result, setResult] = useState<PollEndedPayload | null>(null);
    const [showResult, setShowResult] = useState(false);

    const loadPoll = useCallback(async () => {
        try {
            const res = await gameAPI.getCurrentPoll();
            const data: PollData = res.data;
            if (data.poll) {
                setPollData(data);
                if (data.poll.is_active) {
                    const remaining = Math.max(
                        0,
                        Math.floor((new Date(data.poll.ends_at).getTime() - Date.now()) / 1000)
                    );
                    setTimeLeft(remaining);
                    setOpen(true);
                }
            }
        } catch (e) {
            // silently ignore
        }
    }, []);

    // Countdown timer
    useEffect(() => {
        if (!open || timeLeft <= 0) return;
        const interval = setInterval(() => {
            setTimeLeft(prev => {
                if (prev <= 1) {
                    clearInterval(interval);
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);
        return () => clearInterval(interval);
    }, [open, timeLeft > 0]);

    // Socket listeners
    useEffect(() => {
        socket.on("poll_started", (data: { poll_id: number; round_number: number; ends_at: string; duration_seconds: number }) => {
            setTotalDuration(data.duration_seconds);
            setTimeLeft(data.duration_seconds);
            setResult(null);
            setShowResult(false);
            setSelectedTeam(null);
            setError("");
            setOpen(true);
            loadPoll();
        });

        socket.on("poll_ended", (data: PollEndedPayload) => {
            setResult(data);
            setShowResult(true);
            setOpen(true);
            setTimeLeft(0);
            loadPoll();
        });

        return () => {
            socket.off("poll_started");
            socket.off("poll_ended");
        };
    }, [loadPoll]);

    // Check for ongoing poll on mount
    useEffect(() => {
        loadPoll();
    }, []);

    const handleVote = async () => {
        if (!selectedTeam) return;
        setSubmitting(true);
        setError("");
        try {
            await gameAPI.castVote({ voted_for_team_id: selectedTeam });
            await loadPoll();
        } catch (err: any) {
            setError(err.response?.data?.message || "Failed to submit vote");
        } finally {
            setSubmitting(false);
        }
    };

    const formatTime = (secs: number) => {
        const m = Math.floor(secs / 60);
        const s = secs % 60;
        return `${m}:${s.toString().padStart(2, "0")}`;
    };

    const progress = totalDuration > 0 ? ((totalDuration - timeLeft) / totalDuration) * 100 : 100;

    if (!open) return null;

    // ── RESULT VIEW (Simplified - No results revealed) ────────────────
    if (showResult) {
        return (
            <Dialog
                open={open}
                maxWidth="sm"
                fullWidth
                PaperProps={{
                    sx: {
                        borderRadius: 4,
                        background: "linear-gradient(135deg, #0F172A 0%, #1E293B 100%)",
                        border: "1px solid rgba(234,179,8,0.3)",
                        color: "white",
                        overflow: "hidden",
                    }
                }}
            >
                <Box sx={{ p: 4, textAlign: "center" }}>
                    <Box sx={{
                        mb: 3,
                        p: 2.5,
                        borderRadius: 3,
                        bgcolor: "rgba(234,179,8,0.12)",
                        border: "1px solid rgba(234,179,8,0.3)",
                    }}>
                        <Typography variant="h3" sx={{
                            fontWeight: 900,
                            color: "#EAB308",
                            mb: 1,
                            fontSize: { xs: "1.8rem", sm: "2.5rem" }
                        }}>
                            POLL ENDED
                        </Typography>
                        <Typography variant="h6" sx={{ color: "rgba(255,255,255,0.8)" }}>
                            The voting period has concluded. The results have been sent to the Admin for review.
                        </Typography>
                    </Box>

                    <Typography variant="body2" sx={{ color: "rgba(255,255,255,0.5)", mb: 3 }}>
                        Stay alert and continue your mission. The game continues.
                    </Typography>

                    <Button variant="contained" onClick={() => setOpen(false)} sx={{
                        background: "linear-gradient(135deg, #EAB308 0%, #CA8A04 100%)",
                        color: "#000",
                        fontWeight: 700,
                        px: 4
                    }}>
                        Dismiss
                    </Button>
                </Box>
            </Dialog>
        );
    }

    // ── ACTIVE VOTING VIEW ───────────────────────────────────────────
    const isActive = pollData?.poll?.is_active;
    const hasVoted = pollData?.has_voted;
    const myTeamId = pollData?.my_team_id;
    const teams = pollData?.teams || [];
    const urgent = timeLeft <= 20;

    return (
        <Dialog
            open={open}
            maxWidth="sm"
            fullWidth
            disableEscapeKeyDown
            PaperProps={{
                sx: {
                    borderRadius: 4,
                    background: "linear-gradient(135deg, #0F172A 0%, #1E293B 100%)",
                    border: "1px solid rgba(234,179,8,0.3)",
                    color: "white",
                    overflow: "hidden"
                }
            }}
        >
            {/* Gold progress bar */}
            <LinearProgress
                variant="determinate"
                value={progress}
                sx={{
                    height: 5,
                    bgcolor: "rgba(234,179,8,0.15)",
                    "& .MuiLinearProgress-bar": {
                        bgcolor: urgent ? "#EF4444" : "#EAB308",
                        transition: "background-color 0.3s"
                    }
                }}
            />

            <Box sx={{ p: 3 }}>
                {/* Header */}
                <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 2 }}>
                    <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
                        <Search sx={{ color: "#EAB308", fontSize: 28 }} />
                        <Box>
                            <Typography variant="h6" sx={{ fontWeight: 800, lineHeight: 1 }}>
                                Find The Traitor
                            </Typography>
                            <Typography variant="caption" sx={{ color: "rgba(255,255,255,0.5)" }}>
                                Round {pollData?.poll?.round_number} · Vote ends in
                            </Typography>
                        </Box>
                    </Box>
                    <Box sx={{
                        px: 2, py: 0.5,
                        borderRadius: 2,
                        bgcolor: urgent ? "rgba(239,68,68,0.15)" : "rgba(234,179,8,0.1)",
                        border: `1px solid ${urgent ? "rgba(239,68,68,0.4)" : "rgba(234,179,8,0.3)"}`,
                    }}>
                        <Typography variant="h5" sx={{
                            fontFamily: "monospace", fontWeight: 900,
                            color: urgent ? "#EF4444" : "#EAB308",
                        }}>
                            {formatTime(timeLeft)}
                        </Typography>
                    </Box>
                </Box>

                <Divider sx={{ borderColor: "rgba(255,255,255,0.08)", mb: 2 }} />

                {error && (
                    <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError("")}>{error}</Alert>
                )}

                {hasVoted ? (
                    /* Already voted */
                    <Box sx={{ textAlign: "center", py: 3 }}>
                        <CheckCircle sx={{ fontSize: 56, color: "#22C55E", mb: 1.5 }} />
                        <Typography variant="h6" sx={{ fontWeight: 700, mb: 0.5 }}>Vote Submitted!</Typography>
                        <Typography variant="body2" sx={{ color: "rgba(255,255,255,0.5)" }}>
                            You voted for <strong style={{ color: "#EAB308" }}>
                                {teams.find(t => t.id === pollData?.my_vote_team_id)?.team_name || "a team"}
                            </strong>
                        </Typography>
                        <Typography variant="caption" sx={{ color: "rgba(255,255,255,0.35)", display: "block", mt: 2 }}>
                            Results will be reviewed by the Admin when the poll ends.
                        </Typography>
                        <Box sx={{ mt: 2, display: "flex", alignItems: "center", gap: 1, justifyContent: "center" }}>
                            <CircularProgress size={14} sx={{ color: "#EAB308" }} />
                            <Typography variant="caption" sx={{ color: "rgba(255,255,255,0.4)" }}>
                                Waiting for others to vote...
                            </Typography>
                        </Box>
                    </Box>
                ) : (
                    /* Voting UI */
                    <>
                        <Typography variant="body2" sx={{ color: "rgba(255,255,255,0.5)", mb: 2 }}>
                            {pollData?.my_team_type === "traitor"
                                ? "Throw suspicion on an innocent team! Vote carefully — votes are hidden."
                                : "Which team do you think is the traitor? Vote carefully — votes are hidden."}
                        </Typography>

                        <Box sx={{ display: "grid", gap: 1, maxHeight: 320, overflowY: "auto", pr: 0.5, mb: 2 }}>
                            {teams
                                .filter(t => t.id !== myTeamId)
                                .map(team => {
                                    const isSelected = selectedTeam === team.id;
                                    return (
                                        <Box
                                            key={team.id}
                                            onClick={() => setSelectedTeam(team.id)}
                                            sx={{
                                                p: 2,
                                                borderRadius: 2,
                                                cursor: "pointer",
                                                display: "flex",
                                                alignItems: "center",
                                                gap: 2,
                                                border: `1.5px solid ${isSelected ? "#EAB308" : "rgba(255,255,255,0.08)"}`,
                                                bgcolor: isSelected ? "rgba(234,179,8,0.1)" : "rgba(255,255,255,0.03)",
                                                transition: "all 0.2s",
                                                "&:hover": {
                                                    borderColor: "rgba(234,179,8,0.4)",
                                                    bgcolor: "rgba(234,179,8,0.06)",
                                                },
                                                userSelect: "none"
                                            }}
                                        >
                                            <Avatar sx={{
                                                width: 36, height: 36,
                                                bgcolor: isSelected ? "#EAB308" : "rgba(255,255,255,0.1)",
                                                color: isSelected ? "#000" : "white",
                                                fontWeight: 700, fontSize: "0.85rem"
                                            }}>
                                                {team.team_name.charAt(0).toUpperCase()}
                                            </Avatar>
                                            <Typography sx={{ fontWeight: 600, flex: 1 }}>
                                                {team.team_name}
                                            </Typography>
                                            {isSelected && (
                                                <HowToVote sx={{ color: "#EAB308", fontSize: 20 }} />
                                            )}
                                        </Box>
                                    );
                                })}
                        </Box>

                        <Button
                            fullWidth
                            variant="contained"
                            size="large"
                            onClick={handleVote}
                            disabled={!selectedTeam || submitting}
                            startIcon={submitting ? <CircularProgress size={16} color="inherit" /> : <HowToVote />}
                            sx={{
                                py: 1.8,
                                fontWeight: 800,
                                fontSize: "1rem",
                                borderRadius: 3,
                                background: selectedTeam
                                    ? "linear-gradient(135deg, #EAB308 0%, #CA8A04 100%)"
                                    : "rgba(255,255,255,0.08)",
                                color: selectedTeam ? "#000" : "rgba(255,255,255,0.3)",
                                "&:disabled": { opacity: 0.6 },
                                "&:hover": selectedTeam ? {
                                    background: "linear-gradient(135deg, #CA8A04 0%, #A16207 100%)",
                                } : {},
                            }}
                        >
                            {submitting ? "Submitting..." : selectedTeam
                                ? `Vote for ${teams.find(t => t.id === selectedTeam)?.team_name}`
                                : "Select a Team to Vote"}
                        </Button>
                    </>
                )}
            </Box>
        </Dialog>
    );
}
