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
    CircularProgress,
    Alert,
    Chip,
    Dialog,
    IconButton,
    Divider,
} from "@mui/material";
import {
    QrCodeScanner,
    Logout as LogoutIcon,
    Dangerous,
    FlashOn,
    EmojiEvents,
} from "@mui/icons-material";
import { useRouter } from "next/navigation";
import ProtectedRoute from "@/components/ProtectedRoute";
import { teamAPI, gameAPI } from "@/lib/api";
import socket from "@/lib/socket";
import QRScanner from "@/components/QRScanner";
import GameTimer from "@/components/GameTimer";
import TraitorControls from "@/components/TraitorControls";
import ClueDisplay from "@/components/ClueDisplay";
import PlayerLeaderboard from "@/components/PlayerLeaderboard";

interface TeamMember {
    id: number;
    email: string;
    role: string;
    is_lead?: boolean;
}

interface Team {
    id: number;
    team_name: string;
    team_code: string;
    team_type: "innocent" | "traitor";
    total_score: number;
    members: TeamMember[];
}

export default function TraitorDashboard() {
    const { user, userData, signOut } = useAuth();
    const router = useRouter();
    const [loading, setLoading] = useState(true);
    const [team, setTeam] = useState<Team | null>(null);
    const [currentClue, setCurrentClue] = useState<string | null>(null);
    const [gameState, setGameState] = useState<any>(null);
    const [showScanner, setShowScanner] = useState(false);
    const [error, setError] = useState("");
    const [success, setSuccess] = useState("");
    const [sabotageAlert, setSabotageAlert] = useState<{ open: boolean; endTime: string | null }>({
        open: false,
        endTime: null,
    });
    const [showRoundStart, setShowRoundStart] = useState(false);
    const [showRoundEnd, setShowRoundEnd] = useState(false);

    // Join team room for real-time updates
    useEffect(() => {
        if (team?.id && socket.connected) {
            socket.emit("join_team", team.id);
        }
    }, [team?.id]);

    useEffect(() => {
        if (user) fetchData();
        fetchGameState();

        if (!socket.connected) socket.connect();

        socket.on("round_started", (data) => {
            setGameState((prev: any) => ({
                ...prev,
                current_round: data.round,
                round_start_time: data.start_time,
                round_end_time: data.end_time,
                game_status: "in_progress",
            }));
            setShowRoundStart(true);
            fetchData();
        });

        socket.on("sabotaged", (data) => {
            setSabotageAlert({ open: true, endTime: data.sabotage_end_time });
            setSuccess("");
        });

        socket.on("sabotage_ended", () => {
            setSabotageAlert({ open: false, endTime: null });
        });

        socket.on("round_ended", (data) => {
            setGameState((prev: any) => ({ ...prev, game_status: "completed" }));
            setSuccess(`Round ${data.round} has ended!`);
            setShowRoundEnd(true);
            fetchData();
        });

        socket.on("game_reset", () => {
            setGameState((prev: any) => ({
                ...prev,
                current_round: 0,
                game_status: "not_started",
            }));
            fetchData();
        });

        return () => {
            socket.off("round_started");
            socket.off("sabotaged");
            socket.off("sabotage_ended");
            socket.off("round_ended");
            socket.off("game_reset");
        };
    }, [user]);

    useEffect(() => {
        const handleScoreUpdate = (data: {
            points: number;
            total_score: number;
            next_clue: string | null;
        }) => {
            setTeam((prev) => (prev ? { ...prev, total_score: data.total_score } : null));
            if (data.next_clue) setCurrentClue(data.next_clue);
        };

        socket.on("score_update", handleScoreUpdate);
        return () => {
            socket.off("score_update", handleScoreUpdate);
        };
    }, []);

    // Auto-refresh
    useEffect(() => {
        const interval = setInterval(() => {
            if (user) {
                fetchData(true);
                fetchGameState();
            }
        }, 5000);
        return () => clearInterval(interval);
    }, [user]);

    const fetchGameState = async () => {
        try {
            const res = await gameAPI.getGameState();
            setGameState(res.data);
        } catch (err) {
            console.error("Error fetching game state:", err);
        }
    };

    const fetchData = async (background = false) => {
        if (!background) setLoading(true);
        try {
            try {
                const teamResponse = await teamAPI.getMyTeam();
                if (teamResponse.data) {
                    setTeam(teamResponse.data);
                    fetchClue();

                    try {
                        const sabStatus = await gameAPI.getSabotageStatus();
                        if (sabStatus.data.is_sabotaged) {
                            setSabotageAlert({ open: true, endTime: sabStatus.data.sabotage_end_time });
                        }
                    } catch (e) {
                        // ignore
                    }
                }
            } catch (err: any) {
                if (err.response?.status === 404) {
                    setTeam(null);
                } else {
                    console.error("Error fetching team:", err);
                }
            }
        } catch (err) {
            console.error("Error in traitor dashboard:", err);
        } finally {
            setLoading(false);
        }
    };

    const fetchClue = async () => {
        try {
            const clueResponse = await teamAPI.getCurrentClue();
            if (clueResponse.data?.clue_text) {
                setCurrentClue(clueResponse.data.clue_text);
            } else {
                setCurrentClue(null);
            }
        } catch (err) {
            setCurrentClue(null);
        }
    };

    const handleSignOut = async () => {
        await signOut();
        router.push("/");
    };

    const handleScanGold = async (data: string) => {
        setShowScanner(false);
        setLoading(true);
        setError("");
        setSuccess("");
        try {
            const response = await teamAPI.scanGoldBar({ qr_code: data });

            if (response.data.success === false) {
                setError(response.data.message);
                return;
            }

            if (response.data.was_sabotaged) {
                setSabotageAlert({ open: true, endTime: response.data.sabotage_end_time });
            } else {
                setSuccess(`Gold bar collected! +${response.data.points} points`);
            }

            if (response.data.next_clue) {
                setCurrentClue(response.data.next_clue);
            }

            await fetchData();
        } catch (err: any) {
            setError(err.response?.data?.message || "Scan failed");
        } finally {
            setLoading(false);
        }
    };

    if (loading && !team) {
        return (
            <Box
                sx={{
                    minHeight: "100vh",
                    display: "flex",
                    justifyContent: "center",
                    alignItems: "center",
                    bgcolor: "#0D0A0A",
                }}
            >
                <CircularProgress sx={{ color: "#EF4444" }} />
            </Box>
        );
    }

    return (
        <ProtectedRoute allowedRoles={["member", "team_lead"]}>
            <Box
                sx={{
                    minHeight: "100vh",
                    bgcolor: "#0D0A0A",
                    color: "white",
                    pb: 8,
                    backgroundImage:
                        "radial-gradient(ellipse at top left, rgba(239,68,68,0.08) 0%, transparent 50%), radial-gradient(ellipse at bottom right, rgba(234,88,12,0.06) 0%, transparent 50%)",
                }}
            >
                {/* Header */}
                <Box
                    sx={{
                        p: 2,
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        borderBottom: "1px solid rgba(239,68,68,0.2)",
                        background: "rgba(127,29,29,0.2)",
                        backdropFilter: "blur(12px)",
                    }}
                >
                    <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
                        <Dangerous sx={{ color: "#EF4444", fontSize: 28 }} />
                        <Typography
                            variant="h6"
                            sx={{
                                fontWeight: 800,
                                background: "linear-gradient(135deg, #EF4444 0%, #F97316 100%)",
                                WebkitBackgroundClip: "text",
                                WebkitTextFillColor: "transparent",
                            }}
                        >
                            Traitor HQ
                        </Typography>
                    </Box>

                    <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
                        {gameState && (
                            <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                                <GameTimer
                                    endTime={gameState.round_end_time}
                                    isActive={gameState.game_status === "in_progress"}
                                />
                            </Box>
                        )}
                        <IconButton onClick={handleSignOut} sx={{ color: "rgba(255,255,255,0.6)" }}>
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
                        <Card
                            sx={{
                                bgcolor: "rgba(127,29,29,0.15)",
                                border: "1px solid rgba(239,68,68,0.2)",
                                backdropFilter: "blur(10px)",
                                borderRadius: 4,
                                textAlign: "center",
                                p: 4,
                            }}
                        >
                            <Dangerous sx={{ fontSize: 64, color: "#EF4444", mb: 2 }} />
                            <Typography variant="h5" sx={{ fontWeight: 700, mb: 1 }}>
                                No Team Found
                            </Typography>
                            <Typography variant="body2" color="text.secondary">
                                You haven&apos;t joined a team yet. Contact your team lead.
                            </Typography>
                        </Card>
                    ) : (
                        <Box className="fade-in">
                            {/* Team Status Card */}
                            <Card
                                sx={{
                                    mb: 3,
                                    background: "linear-gradient(135deg, rgba(127,29,29,0.4) 0%, rgba(69,10,10,0.6) 100%)",
                                    border: "1px solid rgba(239,68,68,0.25)",
                                    backdropFilter: "blur(10px)",
                                    borderRadius: 3,
                                    overflow: "visible",
                                    position: "relative",
                                }}
                            >
                                {/* Glow Effect */}
                                <Box
                                    sx={{
                                        position: "absolute",
                                        top: -1,
                                        left: 0,
                                        right: 0,
                                        height: 3,
                                        background: "linear-gradient(90deg, #EF4444, #F97316, #EF4444)",
                                        borderRadius: "3px 3px 0 0",
                                    }}
                                />
                                <CardContent sx={{ p: 3 }}>
                                    <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", mb: 2 }}>
                                        <Box>
                                            <Typography variant="caption" sx={{ color: "rgba(239,68,68,0.7)", fontWeight: 700, letterSpacing: 2, textTransform: "uppercase" }}>
                                                Your Team
                                            </Typography>
                                            <Typography variant="h5" sx={{ fontWeight: 800, mt: 0.5 }}>
                                                {team.team_name}
                                            </Typography>
                                        </Box>
                                        <Chip
                                            icon={<Dangerous sx={{ fontSize: 16 }} />}
                                            label="TRAITOR"
                                            size="small"
                                            sx={{
                                                background: "linear-gradient(135deg, #EF4444 0%, #DC2626 100%)",
                                                color: "white",
                                                fontWeight: 700,
                                                fontSize: "0.75rem",
                                                letterSpacing: 1,
                                            }}
                                        />
                                    </Box>

                                    <Divider sx={{ borderColor: "rgba(239,68,68,0.15)", my: 2 }} />

                                    <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                        <Box>
                                            <Typography variant="caption" sx={{ color: "rgba(255,255,255,0.5)", letterSpacing: 1, fontSize: "0.7rem" }}>
                                                TEAM CODE
                                            </Typography>
                                            <Typography
                                                variant="h6"
                                                sx={{
                                                    fontFamily: "monospace",
                                                    fontWeight: 800,
                                                    letterSpacing: 3,
                                                    color: "#F87171",
                                                }}
                                            >
                                                {team.team_code}
                                            </Typography>
                                        </Box>
                                        <Box sx={{ textAlign: "right" }}>
                                            <Typography variant="caption" sx={{ color: "rgba(255,255,255,0.5)", letterSpacing: 1, fontSize: "0.7rem" }}>
                                                SCORE
                                            </Typography>
                                            <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                                                <EmojiEvents sx={{ color: "#F59E0B", fontSize: 20 }} />
                                                <Typography
                                                    variant="h5"
                                                    sx={{ fontWeight: 900, color: "#F59E0B" }}
                                                >
                                                    {team.total_score}
                                                </Typography>
                                            </Box>
                                        </Box>
                                    </Box>

                                    {/* Members */}
                                    {team.members && team.members.length > 0 && (
                                        <Box sx={{ mt: 2, display: "flex", gap: 1, flexWrap: "wrap" }}>
                                            {team.members.map((m) => (
                                                <Chip
                                                    key={m.id}
                                                    label={m.email.split("@")[0]}
                                                    size="small"
                                                    variant="outlined"
                                                    sx={{
                                                        borderColor: "rgba(239,68,68,0.3)",
                                                        color: "rgba(255,255,255,0.7)",
                                                        fontSize: "0.7rem",
                                                    }}
                                                />
                                            ))}
                                        </Box>
                                    )}
                                </CardContent>
                            </Card>

                            {/* Traitor Controls (Sabotage) */}
                            <TraitorControls teamId={team.id} />

                            {/* Current Clue */}
                            <ClueDisplay clue={currentClue} />

                            {/* Scan Gold Bar */}
                            <Button
                                fullWidth
                                variant="contained"
                                size="large"
                                onClick={() => {
                                    setError("");
                                    setSuccess("");
                                    setShowScanner(true);
                                }}
                                startIcon={<QrCodeScanner />}
                                sx={{
                                    py: 2.5,
                                    mt: 2,
                                    fontSize: "1.1rem",
                                    fontWeight: 700,
                                    borderRadius: 3,
                                    background: "linear-gradient(135deg, #EAB308 0%, #CA8A04 100%)",
                                    boxShadow: "0 8px 30px rgba(234,179,8,0.25)",
                                    "&:hover": {
                                        background: "linear-gradient(135deg, #CA8A04 0%, #A16207 100%)",
                                        boxShadow: "0 12px 40px rgba(234,179,8,0.35)",
                                    },
                                }}
                            >
                                Scan Gold Bar
                            </Button>

                            {/* Leaderboard */}
                            <Box sx={{ mt: 4 }}>
                                <PlayerLeaderboard />
                            </Box>
                        </Box>
                    )}
                </Container>

                {/* QR Scanner Dialog */}
                <Dialog
                    open={showScanner}
                    onClose={() => setShowScanner(false)}
                    maxWidth="sm"
                    fullWidth
                    PaperProps={{ sx: { bgcolor: "transparent", boxShadow: "none" } }}
                >
                    <QRScanner onScan={handleScanGold} onClose={() => setShowScanner(false)} />
                </Dialog>

                {/* Sabotage Alert Dialog */}
                <Dialog
                    open={sabotageAlert.open}
                    onClose={() => setSabotageAlert((prev) => ({ ...prev, open: false }))}
                    maxWidth="sm"
                    fullWidth
                    PaperProps={{
                        sx: {
                            borderRadius: 3,
                            background: "linear-gradient(135deg, #7F1D1D 0%, #450A0A 100%)",
                            border: "1px solid rgba(255,99,71,0.3)",
                            color: "white",
                        },
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
                        <Box sx={{ display: "flex", justifyContent: "center", mb: 4 }}>
                            <GameTimer endTime={sabotageAlert.endTime} isActive={true} />
                        </Box>
                        <Button
                            variant="outlined"
                            onClick={() => setSabotageAlert((prev) => ({ ...prev, open: false }))}
                            sx={{
                                px: 4,
                                borderRadius: 2,
                                color: "white",
                                borderColor: "rgba(255,255,255,0.5)",
                                "&:hover": { borderColor: "white", bgcolor: "rgba(255,255,255,0.1)" },
                            }}
                        >
                            Dismiss
                        </Button>
                    </Box>
                </Dialog>

                {/* Round Start Dialog */}
                <Dialog
                    open={showRoundStart}
                    onClose={() => setShowRoundStart(false)}
                    maxWidth="sm"
                    fullWidth
                    PaperProps={{
                        sx: {
                            borderRadius: 3,
                            background: "linear-gradient(135deg, #450A0A 0%, #0D0A0A 100%)",
                            border: "1px solid rgba(239,68,68,0.3)",
                        },
                    }}
                >
                    <Box sx={{ p: 4, textAlign: "center" }}>
                        <FlashOn sx={{ fontSize: 64, color: "#EF4444", mb: 2 }} />
                        <Typography
                            variant="h3"
                            sx={{
                                fontWeight: 800,
                                mb: 2,
                                background: "linear-gradient(45deg, #EF4444 30%, #F97316 90%)",
                                WebkitBackgroundClip: "text",
                                WebkitTextFillColor: "transparent",
                            }}
                        >
                            ROUND {gameState?.current_round} STARTED!
                        </Typography>
                        <Typography variant="h6" color="text.secondary" sx={{ mb: 4 }}>
                            Sabotage the innocents. Collect gold. Dominate.
                        </Typography>
                        <Button
                            variant="contained"
                            size="large"
                            onClick={() => setShowRoundStart(false)}
                            sx={{
                                px: 4,
                                py: 1.5,
                                borderRadius: 2,
                                background: "linear-gradient(135deg, #EF4444 0%, #DC2626 100%)",
                                fontWeight: 700,
                            }}
                        >
                            UNLEASH CHAOS
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
                            border: "1px solid rgba(255,255,255,0.1)",
                        },
                    }}
                >
                    <Box sx={{ p: 4, textAlign: "center" }}>
                        <Typography variant="h3" sx={{ fontWeight: 800, mb: 2, color: "#94A3B8" }}>
                            ROUND {gameState?.current_round} ENDED!
                        </Typography>
                        <Typography variant="h6" color="text.secondary" sx={{ mb: 4 }}>
                            Wait for the admin to start the next round.
                        </Typography>
                        <Button
                            variant="contained"
                            size="large"
                            onClick={() => setShowRoundEnd(false)}
                            sx={{ px: 4, py: 1.5, borderRadius: 2, background: "#475569", fontWeight: 700 }}
                        >
                            OK
                        </Button>
                    </Box>
                </Dialog>
            </Box>
        </ProtectedRoute>
    );
}
