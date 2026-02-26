"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import {
    Button,
    Typography,
    Container,
    Box,
    Card,
    CardContent,
    TextField,
    CircularProgress,
    Alert,
    Chip,
    Dialog,
    IconButton
} from "@mui/material";
import {
    QrCodeScanner,
    Group,
    EmojiEvents,
    Search,
    Logout as LogoutIcon,
    Close
} from "@mui/icons-material";
import { useRouter } from "next/navigation";
import ProtectedRoute from "@/components/ProtectedRoute";
import { teamAPI, gameAPI } from "@/lib/api";
import socket from "@/lib/socket";
import QRScanner from "@/components/QRScanner";
import GameTimer from "@/components/GameTimer";
import TraitorControls from "@/components/TraitorControls";
import TeamInfoCard from "@/components/TeamInfoCard";
import ClueDisplay from "@/components/ClueDisplay";
import PlayerLeaderboard from "@/components/PlayerLeaderboard";

interface TeamMember {
    id: number;
    email: string;
    role: string;
}

interface Team {
    id: number;
    team_name: string;
    team_code: string;
    team_type: "innocent" | "traitor";
    total_score: number;
    members: TeamMember[];
}

export default function MemberDashboard() {
    const { user, userData, signOut } = useAuth();
    const router = useRouter();
    const [loading, setLoading] = useState(true);
    const [team, setTeam] = useState<Team | null>(null);
    const [teamCode, setTeamCode] = useState("");
    const [error, setError] = useState("");
    const [success, setSuccess] = useState("");
    const [showScanner, setShowScanner] = useState(false);
    const [scanMode, setScanMode] = useState<"join" | "gold" | null>(null);
    const [currentClue, setCurrentClue] = useState<string | null>(null);
    const [gameState, setGameState] = useState<any>(null);
    const [showRoundStart, setShowRoundStart] = useState(false);
    const [showRoundEnd, setShowRoundEnd] = useState(false);
    const [sabotageAlert, setSabotageAlert] = useState<{ open: boolean; endTime: string | null }>({ open: false, endTime: null });
    const [entryCode, setEntryCode] = useState("");
    const [showEntryCode, setShowEntryCode] = useState(false);
    const [submittingCode, setSubmittingCode] = useState(false);

    // Join team room for real-time updates
    useEffect(() => {
        if (team?.id && socket.connected) {
            socket.emit("join_team", team.id);
        }
    }, [team?.id]);

    useEffect(() => {
        if (user) {
            fetchData();
        }
        fetchGameState();

        if (!socket.connected) socket.connect();

        socket.on("round_started", (data) => {
            setGameState((prev: any) => ({
                ...prev,
                current_round: data.round,
                round_start_time: data.start_time,
                round_end_time: data.end_time,
                game_status: "in_progress"
            }));
            setShowRoundStart(true);
            fetchData();
        });

        socket.on("sabotaged", (data) => {
            setSabotageAlert({ open: true, endTime: data.sabotage_end_time });
            // Maybe clear success message if any?
            setSuccess("");
        });

        socket.on("sabotage_ended", () => {
            setSabotageAlert({ open: false, endTime: null });
        });

        socket.on("round_ended", (data) => {
            setGameState((prev: any) => ({
                ...prev,
                game_status: "completed"
            }));
            setSuccess(`Round ${data.round} has ended!`);
            setShowRoundEnd(true);
            fetchData();
        });

        socket.on("game_reset", () => {
            setGameState((prev: any) => ({
                ...prev,
                current_round: 0,
                game_status: "not_started"
            }));
            fetchData();
        });

        return () => {
            socket.off("round_started");
            socket.off("sabotaged");
            socket.off("sabotage_ended");
            socket.off("game_reset");
        };
    }, [user]);

    // Auto-refresh fallback
    useEffect(() => {
        const interval = setInterval(() => {
            if (user) {
                fetchData(true);
                fetchGameState();
            }
        }, 5000);
        return () => clearInterval(interval);
    }, [user]);

    // Separate effect for score updates to avoid re-binding issues or just include in main if careful
    useEffect(() => {
        const handleScoreUpdate = (data: { points: number, total_score: number, next_clue: string | null }) => {
            setTeam((prev) => prev ? { ...prev, total_score: data.total_score } : null);
            if (data.next_clue) setCurrentClue(data.next_clue);
            // Optional: setSuccess(`Teammate scored! +${data.points} points`);
        };

        socket.on("score_update", handleScoreUpdate);

        return () => {
            socket.off("score_update", handleScoreUpdate);
        };
    }, []);

    const fetchGameState = async () => {
        try {
            const res = await gameAPI.getGameState();
            setGameState(res.data);
        } catch (error) {
            console.error("Error fetching game state:", error);
        }
    };

    const fetchData = async (background = false) => {
        if (!background) setLoading(true);
        try {
            // Fetch team
            try {
                const teamResponse = await teamAPI.getMyTeam();
                if (teamResponse.data) {
                    setTeam(teamResponse.data);
                    // If has team, fetch clue
                    fetchClue();

                    // Check initial sabotage status
                    try {
                        const sabStatus = await gameAPI.getSabotageStatus();
                        if (sabStatus.data.is_sabotaged) {
                            setSabotageAlert({ open: true, endTime: sabStatus.data.sabotage_end_time });
                        }
                    } catch (e) {
                        // Ignore if error
                    }
                }
            } catch (err: any) {
                if (err.response && err.response.status === 404) {
                    setTeam(null);
                } else {
                    console.error("Error fetching team:", err);
                }
            }
        } catch (error) {
            console.error("Error in dashboard:", error);
        } finally {
            setLoading(false);
        }
    };

    const fetchClue = async () => {
        try {
            const clueResponse = await teamAPI.getCurrentClue();
            if (clueResponse.data && clueResponse.data.clue_text) {
                setCurrentClue(clueResponse.data.clue_text);
            } else {
                setCurrentClue("No active clue via API");
            }
        } catch (err) {
            // Clue might not be available or team finished
            setCurrentClue("Wait for the next round or clue!");
        }
    };

    const handleSignOut = async () => {
        await signOut();
        router.push("/");
    };

    const handleJoinTeam = async () => {
        if (!teamCode.trim()) {
            setError("Please enter a team code");
            return;
        }
        setLoading(true);
        setError("");
        try {
            await teamAPI.joinTeam({ team_code: teamCode });
            setSuccess("Joined team successfully!");
            await fetchData();
        } catch (err: any) {
            setError(err.response?.data?.message || "Failed to join team");
        } finally {
            setLoading(false);
        }
    };

    const handleScan = async (data: string) => {
        setShowScanner(false);
        setLoading(true);
        setError("");
        setSuccess("");

        try {
            if (scanMode === "join") {
                // Expecting team code or full JSON? assuming simple code or specific format
                // If it's a JSON from Team Creation QR, it might be { team_code: "..." }
                let code = data;
                try {
                    const parsed = JSON.parse(data);
                    if (parsed.team_code) code = parsed.team_code;
                } catch (e) {
                    // Not JSON, treat as raw code
                }

                await teamAPI.joinTeam({ team_code: code });
                setSuccess("Joined team successfully!");
                await fetchData();
            } else if (scanMode === "gold") {
                // Scan gold bar
                const response = await teamAPI.scanGoldBar({ qr_code: data });

                if (response.data.success === false) {
                    setError(response.data.message);
                    return;
                }

                if (response.data.was_sabotaged) {
                    // Handle Sabotage
                    setSabotageAlert({ open: true, endTime: response.data.sabotage_end_time });
                    // No success message, show alert
                } else {
                    setSuccess("Gold bar collected! Points added.");
                }

                if (response.data.next_clue) {
                    setCurrentClue(response.data.next_clue);
                }
                await fetchData(); // Refresh score and clue
            }
        } catch (err: any) {
            setError(err.response?.data?.message || "Scan failed");
        } finally {
            setLoading(false);
            setScanMode(null);
        }
    };

    const startScan = (mode: "join" | "gold") => {
        setScanMode(mode);
        setShowScanner(true);
        setError("");
        setSuccess("");
    };

    const handleEntryCodeSubmit = async () => {
        const code = entryCode.trim();
        if (code.length !== 6 || !/^\d{6}$/.test(code)) {
            setError("Please enter a valid 6-digit code");
            return;
        }
        setSubmittingCode(true);
        setError("");
        setSuccess("");
        try {
            const response = await teamAPI.scanGoldBar({ qr_code: code });
            if (response.data.success === false) {
                setError(response.data.message);
            } else if (response.data.was_sabotaged) {
                setSabotageAlert({ open: true, endTime: response.data.sabotage_end_time });
            } else {
                setSuccess(`Gold bar collected! +${response.data.points} points`);
            }
            if (response.data.next_clue) setCurrentClue(response.data.next_clue);
            setEntryCode("");
            setShowEntryCode(false);
            await fetchData();
        } catch (err: any) {
            setError(err.response?.data?.message || "Invalid code. Try again.");
        } finally {
            setSubmittingCode(false);
        }
    };

    if (loading && !team && !error) {
        return (
            <Box sx={{ minHeight: "100vh", display: "flex", justifyContent: "center", alignItems: "center", bgcolor: "#0F172A" }}>
                <CircularProgress />
            </Box>
        );
    }

    return (
        <ProtectedRoute allowedRoles={["member"]}>
            <Box sx={{
                minHeight: "100vh",
                bgcolor: "#0F172A",
                color: "white",
                pb: 8
            }}>
                {/* Header */}
                <Box sx={{
                    p: 2,
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    borderBottom: "1px solid rgba(255,255,255,0.1)",
                    background: "rgba(30, 41, 59, 0.5)",
                    backdropFilter: "blur(10px)"
                }}>
                    <Typography variant="h6" sx={{ fontWeight: 700, color: "#3B82F6" }}>
                        Borderland
                    </Typography>
                    <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
                        {gameState && (
                            <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                                <GameTimer
                                    endTime={gameState.round_end_time}
                                    isActive={gameState.game_status === "in_progress"}
                                />
                            </Box>
                        )}
                        <IconButton onClick={handleSignOut} sx={{ color: "rgba(255,255,255,0.7)" }}>
                            <LogoutIcon />
                        </IconButton>
                    </Box>
                </Box>

                <Container maxWidth="sm" sx={{ mt: 4 }}>
                    {error && (
                        <Alert severity="error" sx={{ mb: 3, borderRadius: 2 }} onClose={() => setError("")}>
                            {error}
                        </Alert>
                    )}
                    {success && (
                        <Alert severity="success" sx={{ mb: 3, borderRadius: 2 }} onClose={() => setSuccess("")}>
                            {success}
                        </Alert>
                    )}

                    {!team ? (
                        /* NO TEAM STATE */
                        <Card sx={{
                            bgcolor: "rgba(30, 41, 59, 0.6)",
                            border: "1px solid rgba(255,255,255,0.1)",
                            backdropFilter: "blur(10px)",
                            borderRadius: 4
                        }}>
                            <CardContent sx={{ textAlign: "center", p: 4 }}>
                                <Typography variant="h4" sx={{ mb: 2, fontWeight: 800 }}>
                                    Join a Team
                                </Typography>
                                <Typography variant="body1" sx={{ mb: 4, color: "rgba(255,255,255,0.7)" }}>
                                    Find your team lead and join the squad to start the hunt.
                                </Typography>

                                <Box sx={{ mb: 4 }}>
                                    <TextField
                                        fullWidth
                                        label="Enter Team Code"
                                        value={teamCode}
                                        onChange={(e) => setTeamCode(e.target.value)}
                                        sx={{
                                            mb: 2,
                                            "& .MuiOutlinedInput-root": {
                                                color: "white",
                                                "& fieldset": { borderColor: "rgba(255,255,255,0.2)" },
                                                "&:hover fieldset": { borderColor: "rgba(255,255,255,0.4)" },
                                            },
                                            "& .MuiInputLabel-root": { color: "rgba(255,255,255,0.5)" }
                                        }}
                                    />
                                    <Button
                                        fullWidth
                                        variant="contained"
                                        size="large"
                                        onClick={handleJoinTeam}
                                        sx={{
                                            py: 1.5,
                                            background: "linear-gradient(135deg, #3B82F6 0%, #2563EB 100%)"
                                        }}
                                    >
                                        Join with Code
                                    </Button>
                                </Box>

                                <Typography variant="body2" sx={{ mb: 2, color: "rgba(255,255,255,0.5)" }}>
                                    OR
                                </Typography>

                                <Button
                                    fullWidth
                                    variant="outlined"
                                    size="large"
                                    onClick={() => startScan("join")}
                                    startIcon={<QrCodeScanner />}
                                    sx={{
                                        py: 1.5,
                                        borderColor: "rgba(255,255,255,0.3)",
                                        color: "white",
                                        "&:hover": { borderColor: "white", bgcolor: "rgba(255,255,255,0.05)" }
                                    }}
                                >
                                    Scan Team QR
                                </Button>
                            </CardContent>
                        </Card>
                    ) : (
                        /* HAS TEAM STATE */
                        <Box className="fade-in">
                            {/* Team Info */}
                            <TeamInfoCard team={team} />

                            {/* Traitor Controls */}
                            {team.team_type === "traitor" && (
                                <TraitorControls teamId={team.id} />
                            )}

                            {/* Current Clue */}
                            <ClueDisplay clue={currentClue} />

                            {/* Action Button */}
                            <Button
                                fullWidth
                                variant="contained"
                                size="large"
                                onClick={() => startScan("gold")}
                                startIcon={<QrCodeScanner />}
                                sx={{
                                    py: 2.5,
                                    fontSize: "1.2rem",
                                    borderRadius: 3,
                                    background: "linear-gradient(135deg, #EAB308 0%, #CA8A04 100%)",
                                    boxShadow: "0 10px 30px rgba(234, 179, 8, 0.3)",
                                    "&:hover": {
                                        background: "linear-gradient(135deg, #CA8A04 0%, #A16207 100%)",
                                    }
                                }}
                            >
                                Scan Gold Bar
                            </Button>

                            {/* Manual Entry Code */}
                            <Box sx={{ mt: 1.5 }}>
                                <Button
                                    fullWidth
                                    variant="text"
                                    size="small"
                                    onClick={() => { setShowEntryCode(!showEntryCode); setEntryCode(""); setError(""); }}
                                    sx={{
                                        color: "rgba(255,255,255,0.45)",
                                        fontSize: "0.78rem",
                                        textTransform: "none",
                                        "&:hover": { color: "#EAB308" }
                                    }}
                                >
                                    {showEntryCode ? "▲ Hide manual entry" : "Can't scan? Enter 6-digit code"}
                                </Button>

                                {showEntryCode && (
                                    <Box sx={{
                                        mt: 1.5,
                                        p: 2.5,
                                        borderRadius: 3,
                                        bgcolor: "rgba(234,179,8,0.06)",
                                        border: "1px solid rgba(234,179,8,0.2)",
                                    }}>
                                        <Typography variant="caption" sx={{ color: "#EAB308", letterSpacing: 2, display: "block", mb: 1.5 }}>
                                            MANUAL ENTRY CODE
                                        </Typography>
                                        <Box sx={{ display: "flex", gap: 1.5 }}>
                                            <TextField
                                                fullWidth
                                                value={entryCode}
                                                onChange={(e) => {
                                                    const val = e.target.value.replace(/\D/g, "").slice(0, 6);
                                                    setEntryCode(val);
                                                }}
                                                onKeyDown={(e) => e.key === "Enter" && handleEntryCodeSubmit()}
                                                placeholder="_ _ _ _ _ _"
                                                inputProps={{
                                                    maxLength: 6,
                                                    style: {
                                                        textAlign: "center",
                                                        fontFamily: "monospace",
                                                        fontSize: "1.8rem",
                                                        fontWeight: 700,
                                                        letterSpacing: 12,
                                                        color: "#EAB308",
                                                        padding: "12px 8px"
                                                    }
                                                }}
                                                sx={{
                                                    "& .MuiOutlinedInput-root": {
                                                        bgcolor: "rgba(0,0,0,0.3)",
                                                        "& fieldset": { borderColor: "rgba(234,179,8,0.3)" },
                                                        "&:hover fieldset": { borderColor: "rgba(234,179,8,0.6)" },
                                                        "&.Mui-focused fieldset": { borderColor: "#EAB308" },
                                                    }
                                                }}
                                            />
                                            <Button
                                                variant="contained"
                                                onClick={handleEntryCodeSubmit}
                                                disabled={submittingCode || entryCode.length !== 6}
                                                sx={{
                                                    minWidth: 80,
                                                    background: "linear-gradient(135deg, #EAB308 0%, #CA8A04 100%)",
                                                    fontWeight: 700,
                                                    "&:disabled": { opacity: 0.4 }
                                                }}
                                            >
                                                {submittingCode ? "..." : "GO"}
                                            </Button>
                                        </Box>
                                    </Box>
                                )}
                            </Box>

                            {/* Leaderboard Section */}
                            <Box sx={{ mt: 4 }}>
                                <PlayerLeaderboard />
                            </Box>
                        </Box>
                    )}
                </Container>

                {/* Round Start Dialog */}
                <Dialog
                    open={showRoundStart}
                    onClose={() => setShowRoundStart(false)}
                    maxWidth="sm"
                    fullWidth
                    PaperProps={{
                        sx: {
                            borderRadius: 3,
                            background: "linear-gradient(135deg, #1E293B 0%, #0F172A 100%)",
                            border: "1px solid rgba(255, 255, 255, 0.1)",
                        }
                    }}
                >
                    <Box sx={{ p: 4, textAlign: "center" }}>
                        <Typography variant="h4" sx={{ fontWeight: 800, mb: 2, color: "#3B82F6" }}>
                            ROUND {gameState?.current_round} STARTED!
                        </Typography>
                        <Typography variant="body1" color="text.secondary" sx={{ mb: 4 }}>
                            Check your clue and start hunting!
                        </Typography>
                        <Button
                            variant="contained"
                            onClick={() => setShowRoundStart(false)}
                            sx={{ px: 4, borderRadius: 2 }}
                        >
                            OK
                        </Button>
                    </Box>
                </Dialog>

                {/* Round End Dialog */}
                <Dialog
                    open={showRoundEnd}
                    onClose={() => setShowRoundEnd(false)}
                    maxWidth="sm"
                    fullWidth
                    PaperProps={{
                        sx: {
                            borderRadius: 3,
                            background: "linear-gradient(135deg, #475569 0%, #1E293B 100%)",
                            border: "1px solid rgba(255, 255, 255, 0.1)",
                        }
                    }}
                >
                    <Box sx={{ p: 4, textAlign: "center" }}>
                        <Typography variant="h4" sx={{ fontWeight: 800, mb: 2, color: "#94A3B8" }}>
                            ROUND {gameState?.current_round} ENDED!
                        </Typography>
                        <Typography variant="body1" color="text.secondary" sx={{ mb: 4 }}>
                            Check the leaderboard and wait for the next round to start.
                        </Typography>
                        <Button
                            variant="contained"
                            onClick={() => setShowRoundEnd(false)}
                            sx={{ px: 4, borderRadius: 2 }}
                        >
                            OK
                        </Button>
                    </Box>
                </Dialog>

                {/* Sabotage Alert Dialog */}
                <Dialog
                    open={sabotageAlert.open}
                    // Prevent closing by clicking outside if needed? Or allow close but alert remains active in state?
                    // User said "message showing like they sabotaged and a sabotage timer should be shown".
                    // Better to keep it open or show a persistent banner. Dialog is good for immediate feedback.
                    onClose={() => setSabotageAlert(prev => ({ ...prev, open: false }))}
                    maxWidth="sm"
                    fullWidth
                    PaperProps={{
                        sx: {
                            borderRadius: 3,
                            background: "linear-gradient(135deg, #7F1D1D 0%, #450A0A 100%)", // Red background
                            border: "1px solid rgba(255, 99, 71, 0.3)",
                            color: "white"
                        }
                    }}
                >
                    <Box sx={{ p: 4, textAlign: "center" }}>
                        <Typography variant="h4" sx={{ fontWeight: 800, mb: 2, color: "#FCA5A5" }}>
                            SABOTAGED!
                        </Typography>
                        <Typography variant="body1" sx={{ mb: 4, color: "rgba(255,255,255,0.8)" }}>
                            Your team has been sabotaged! You receive 0 points for this scan.
                            <br />
                            Wait for the sabotage to end.
                        </Typography>

                        <Box sx={{ display: 'flex', justifyContent: 'center', mb: 4 }}>
                            <GameTimer
                                endTime={sabotageAlert.endTime}
                                isActive={true}
                            />
                        </Box>

                        <Button
                            variant="outlined"
                            onClick={() => setSabotageAlert(prev => ({ ...prev, open: false }))}
                            sx={{
                                px: 4,
                                borderRadius: 2,
                                color: "white",
                                borderColor: "rgba(255,255,255,0.5)",
                                "&:hover": { borderColor: "white", bgcolor: "rgba(255,255,255,0.1)" }
                            }}
                        >
                            Dismiss
                        </Button>
                    </Box>
                </Dialog>

                {/* Scanner Dialog */}
                <Dialog
                    open={showScanner}
                    onClose={() => setShowScanner(false)}
                    maxWidth="sm"
                    fullWidth
                    PaperProps={{
                        sx: { bgcolor: "transparent", boxShadow: "none" }
                    }}
                >
                    <QRScanner
                        onScan={handleScan}
                        onClose={() => setShowScanner(false)}
                    />
                </Dialog>
            </Box >
        </ProtectedRoute >
    );
}
