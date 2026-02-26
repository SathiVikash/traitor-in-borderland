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
    IconButton,
    Paper,
    Badge
} from "@mui/material";
import {
    QrCodeScanner,
    Group,
    Search,
    Logout as LogoutIcon,
    AddCircle,
    PersonAdd
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
    qr_code_image?: string; // Only present on creation, but we can generate it client side or fetch from backend if available
}

export default function TeamLeadDashboard() {
    const { user, userData, signOut } = useAuth();
    const router = useRouter();
    const [loading, setLoading] = useState(true);
    const [team, setTeam] = useState<Team | null>(null);
    const [step, setStep] = useState<"dashboard" | "scan_card" | "create_team">("dashboard");
    const [teamName, setTeamName] = useState("");
    const [assignedType, setAssignedType] = useState<string>("");

    const [error, setError] = useState("");
    const [success, setSuccess] = useState("");
    const [showScanner, setShowScanner] = useState(false);
    const [scanMode, setScanMode] = useState<"assignment" | "gold">("assignment");
    const [showAddMember, setShowAddMember] = useState(false);
    const [currentClue, setCurrentClue] = useState<string | null>(null);
    const [gameState, setGameState] = useState<any>(null);
    const [showRoundStart, setShowRoundStart] = useState(false);
    const [showRoundEnd, setShowRoundEnd] = useState(false);
    const [sabotageAlert, setSabotageAlert] = useState<{ open: boolean; endTime: string | null }>({ open: false, endTime: null });

    // Join team room for real-time updates
    useEffect(() => {
        if (team?.id && socket.connected) {
            socket.emit("join_team", team.id);
        }
    }, [team]);

    useEffect(() => {
        if (user) {
            fetchData();
        }
        fetchGameState();

        if (!socket.connected) socket.connect();

        socket.on("round_started", (data) => {
            console.log("Round started:", data);
            setGameState((prev: any) => ({
                ...prev,
                current_round: data.round,
                round_start_time: data.start_time,
                round_end_time: data.end_time,
                game_status: "in_progress"
            }));
            setShowRoundStart(true);
            fetchData(); // Refresh clue
            // Re-join team room if connection was lost/reset
            if (team?.id) socket.emit("join_team", team.id);
        });

        socket.on("sabotaged", (data) => {
            setSabotageAlert({ open: true, endTime: data.sabotage_end_time });
            setSuccess("");
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

        socket.on("sabotage_ended", () => {
            setSabotageAlert({ open: false, endTime: null });
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

    // Listen for score updates
    useEffect(() => {
        const handleScoreUpdate = (data: { points: number, total_score: number, next_clue: string | null }) => {
            setTeam((prev) => prev ? { ...prev, total_score: data.total_score } : null);
            if (data.next_clue) setCurrentClue(data.next_clue);
        };

        socket.on("score_update", handleScoreUpdate);

        return () => {
            socket.off("score_update", handleScoreUpdate);
        };
    }, []);

    // Auto-refresh fallback
    useEffect(() => {
        const interval = setInterval(() => {
            if (user && step === "dashboard") {
                fetchData(true);
                fetchGameState();
            }
        }, 5000);
        return () => clearInterval(interval);
    }, [user, step]);

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
            // Check if lead already has a team
            try {
                const teamResponse = await teamAPI.getMyTeam();
                if (teamResponse.data) {
                    setTeam(teamResponse.data);
                    setStep("dashboard");
                    fetchClue();

                    // Check initial sabotage status
                    try {
                        const sabStatus = await gameAPI.getSabotageStatus();
                        if (sabStatus.data.is_sabotaged) {
                            setSabotageAlert({ open: true, endTime: sabStatus.data.sabotage_end_time });
                        }
                    } catch (e) {
                        // Ignore
                    }
                }
            } catch (err: any) {
                if (err.response && err.response.status === 404) {
                    setTeam(null);
                    setStep("scan_card"); // Default to scanning card if no team
                }
            }
        } catch (error) {
            console.error("Error in dashboard:", error);
            setError("Failed to load dashboard data. Please refresh.");
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
            setCurrentClue("Wait for the next round or clue!");
        }
    };

    const handleSignOut = async () => {
        await signOut();
        router.push("/");
    };

    const handleScanAssignment = async (data: string) => {
        setLoading(true);
        setError("");
        try {
            // data should be JSON string
            const response = await teamAPI.scanAssignment({ card_data: data });
            setAssignedType(response.data.team_type);
            setStep("create_team");
            setShowScanner(false);
            setSuccess(`Card accepted! You are assigned to: ${response.data.team_type.toUpperCase()}`);
        } catch (err: any) {
            setError(err.response?.data?.message || "Invalid Assignment Card");
            setShowScanner(false);
        } finally {
            setLoading(false);
        }
    };

    const handleCreateTeam = async () => {
        if (!teamName.trim()) {
            setError("Please enter a team name");
            return;
        }
        setLoading(true);
        try {
            const response = await teamAPI.createTeam({
                team_name: teamName,
                team_type: assignedType
            });
            setTeam(response.data); // This might contain qr_code_image
            setSuccess("Team created successfully!");
            setStep("dashboard");
            await fetchData(); // Refresh full data
        } catch (err: any) {
            setError(err.response?.data?.message || "Failed to create team");
        } finally {
            setLoading(false);
        }
    };

    const handleScanGold = async (data: string) => {
        setShowScanner(false);
        setLoading(true);
        setError("");
        try {
            const response = await teamAPI.scanGoldBar({ qr_code: data });

            if (response.data.success === false) {
                setError(response.data.message);
                return;
            }

            if (response.data.was_sabotaged) {
                setSabotageAlert({ open: true, endTime: response.data.sabotage_end_time });
            } else {
                setSuccess("Gold bar collected! Points added.");
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

    const startScan = (mode: "assignment" | "gold") => {
        setScanMode(mode);
        setShowScanner(true);
        setError("");
        setSuccess("");
    };

    if (loading && !team && step === "dashboard") {
        return (
            <Box sx={{ minHeight: "100vh", display: "flex", justifyContent: "center", alignItems: "center", bgcolor: "#0F172A" }}>
                <CircularProgress />
            </Box>
        );
    }

    return (
        <ProtectedRoute allowedRoles={["team_lead"]}>
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
                        Team Lead
                    </Typography>
                    <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
                        {gameState && (
                            <Box sx={{ display: "flex", alignItems: "center", gap: 2, mr: 1 }}>
                                <Box sx={{ textAlign: "right", display: { xs: "none", sm: "block" } }}>
                                    <Typography variant="caption" sx={{ color: "rgba(255,255,255,0.7)", display: "block" }}>
                                        ROUND
                                    </Typography>
                                    <Typography variant="h6" sx={{ fontWeight: 800, lineHeight: 1 }}>
                                        {gameState.current_round}
                                    </Typography>
                                </Box>
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
                    {error && <Alert severity="error" sx={{ mb: 3 }} onClose={() => setError("")}>{error}</Alert>}
                    {success && <Alert severity="success" sx={{ mb: 3 }} onClose={() => setSuccess("")}>{success}</Alert>}

                    {!team && step === "dashboard" && !loading && (
                        <Box sx={{ textAlign: "center", mt: 10 }}>
                            <Typography variant="h6" color="error" gutterBottom>
                                Failed to load team data or no team found.
                            </Typography>
                            <Button variant="outlined" onClick={() => fetchData()} sx={{ mt: 2 }}>
                                Retry
                            </Button>
                            <Button variant="text" onClick={() => setStep("scan_card")} sx={{ mt: 2, display: "block", mx: "auto" }}>
                                Initialize New Team
                            </Button>
                        </Box>
                    )}

                    {!team && step === "scan_card" && (
                        <Card sx={{ bgcolor: "rgba(30, 41, 59, 0.6)", borderRadius: 4, backdropFilter: "blur(10px)" }}>
                            <CardContent sx={{ textAlign: "center", p: 4 }}>
                                <Typography variant="h4" sx={{ mb: 2, fontWeight: 800 }}>Start Your Team</Typography>
                                <Typography variant="body1" sx={{ mb: 4, color: "rgba(255,255,255,0.7)" }}>
                                    Scan your Assignment Card to initialize your team and reveal your role.
                                </Typography>
                                <Button
                                    fullWidth
                                    variant="contained"
                                    size="large"
                                    onClick={() => startScan("assignment")}
                                    startIcon={<QrCodeScanner />}
                                    sx={{ py: 2, background: "linear-gradient(135deg, #3B82F6 0%, #2563EB 100%)" }}
                                >
                                    Scan Assignment Card
                                </Button>
                                {/* Dev backdoor for testing w/o camera */}
                                {/* <TextField 
                                    label="Manual JSON" 
                                    fullWidth 
                                    sx={{ mt: 2 }} 
                                    onChange={(e) => handleScanAssignment(e.target.value)} 
                                /> */}
                            </CardContent>
                        </Card>
                    )}

                    {!team && step === "create_team" && (
                        <Card sx={{ bgcolor: "rgba(30, 41, 59, 0.6)", borderRadius: 4 }}>
                            <CardContent sx={{ p: 4 }}>
                                <Typography variant="h5" sx={{ mb: 2, fontWeight: 700 }}>
                                    Create Team
                                </Typography>
                                <Chip
                                    label={`Role: ${assignedType.toUpperCase()}`}
                                    color={assignedType === 'innocent' ? 'primary' : 'error'}
                                    sx={{ mb: 3 }}
                                />
                                <TextField
                                    fullWidth
                                    label="Team Name"
                                    value={teamName}
                                    onChange={(e) => setTeamName(e.target.value)}
                                    sx={{ mb: 3 }}
                                    InputLabelProps={{ style: { color: 'rgba(255,255,255,0.7)' } }}
                                    inputProps={{ style: { color: 'white' } }}
                                />
                                <Button
                                    fullWidth
                                    variant="contained"
                                    size="large"
                                    onClick={handleCreateTeam}
                                >
                                    Create Team
                                </Button>
                            </CardContent>
                        </Card>
                    )}

                    {team && (
                        <Box className="fade-in">
                            {/* Team Card */}
                            <TeamInfoCard team={team} isTeamLead={true} />

                            {/* Traitor Controls */}
                            {team.team_type === "traitor" && (
                                <TraitorControls teamId={team.id} />
                            )}

                            {/* Current Clue */}
                            <ClueDisplay clue={currentClue} />

                            {/* Actions */}
                            {/* Actions */}
                            <Box sx={{ display: "flex", flexWrap: "wrap", gap: 2 }}>
                                <Box sx={{ flex: { xs: "1 1 100%", sm: "1 1 calc(50% - 8px)" } }}>
                                    <Button
                                        fullWidth
                                        variant="contained"
                                        size="large"
                                        onClick={() => setShowAddMember(true)}
                                        startIcon={<PersonAdd />}
                                        sx={{
                                            py: 2,
                                            background: "rgba(59, 130, 246, 0.2)",
                                            color: "#60A5FA",
                                            border: "1px solid rgba(59, 130, 246, 0.5)",
                                            "&:hover": {
                                                background: "rgba(59, 130, 246, 0.3)"
                                            }
                                        }}
                                    >
                                        Add Member
                                    </Button>
                                </Box>
                                <Box sx={{ flex: { xs: "1 1 100%", sm: "1 1 calc(50% - 8px)" } }}>
                                    <Button
                                        fullWidth
                                        variant="contained"
                                        size="large"
                                        onClick={() => startScan("gold")}
                                        startIcon={<QrCodeScanner />}
                                        sx={{
                                            py: 2,
                                            background: "linear-gradient(135deg, #EAB308 0%, #CA8A04 100%)"
                                        }}
                                    >
                                        Scan Gold Bar
                                    </Button>
                                </Box>
                            </Box>

                            <Box sx={{ mt: 4 }}>
                                <PlayerLeaderboard />
                            </Box>
                        </Box>
                    )}
                </Container>

                <Dialog
                    open={showAddMember}
                    onClose={() => setShowAddMember(false)}
                    maxWidth="sm"
                    fullWidth
                    PaperProps={{ sx: { bgcolor: "#1E293B", color: "white", borderRadius: 3, border: "1px solid rgba(255,255,255,0.1)" } }}
                >
                    <CardContent sx={{ textAlign: "center", p: 4 }}>
                        <Typography variant="h5" sx={{ mb: 2, fontWeight: 700 }}>Join Team {team?.team_name}</Typography>
                        <Typography variant="body1" sx={{ mb: 3, color: "rgba(255,255,255,0.7)" }}>
                            Share this code or QR with your team members.
                        </Typography>

                        <Box sx={{ bgcolor: "rgba(0,0,0,0.3)", p: 3, borderRadius: 2, mb: 3, display: "inline-block", width: "100%" }}>
                            <Typography variant="caption" sx={{ display: "block", color: "rgba(255,255,255,0.5)", mb: 1 }}>TEAM CODE</Typography>
                            <Typography variant="h3" sx={{ fontWeight: 800, color: "#60A5FA", letterSpacing: 4, fontFamily: "monospace" }}>
                                {team?.team_code}
                            </Typography>
                        </Box>

                        {team?.qr_code_image && (
                            <Box sx={{ mt: 2, p: 2, bgcolor: "white", borderRadius: 2, width: "fit-content", mx: "auto" }}>
                                <img src={team.qr_code_image} alt="Team QR" style={{ width: 220, height: 220 }} />
                            </Box>
                        )}

                        <Button onClick={() => setShowAddMember(false)} sx={{ mt: 4, color: "rgba(255,255,255,0.5)" }}>
                            Close
                        </Button>
                    </CardContent>
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
                            background: "linear-gradient(135deg, #1E293B 0%, #0F172A 100%)",
                            border: "1px solid rgba(255, 255, 255, 0.1)",
                        }
                    }}
                >
                    <Box sx={{ p: 4, textAlign: "center" }}>
                        <Typography variant="h3" sx={{ fontWeight: 800, mb: 2, background: "linear-gradient(45deg, #F59E0B 30%, #EF4444 90%)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
                            ROUND {gameState?.current_round} STARTED!
                        </Typography>
                        <Typography variant="h6" color="text.secondary" sx={{ mb: 4 }}>
                            Go find the gold bars and solve the clues!
                        </Typography>
                        <Button
                            variant="contained"
                            size="large"
                            onClick={() => setShowRoundStart(false)}
                            sx={{
                                px: 4,
                                py: 1.5,
                                borderRadius: 2,
                                background: "linear-gradient(135deg, #F59E0B 0%, #D97706 100%)",
                                textTransform: "none",
                                fontWeight: 700
                            }}
                        >
                            LET'S GO!
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
                            sx={{
                                px: 4,
                                py: 1.5,
                                borderRadius: 2,
                                background: "#475569",
                                textTransform: "none",
                                fontWeight: 700
                            }}
                        >
                            OK
                        </Button>
                    </Box>
                </Dialog>

                {/* Sabotage Alert Dialog */}
                <Dialog
                    open={sabotageAlert.open}
                    onClose={() => setSabotageAlert(prev => ({ ...prev, open: false }))}
                    maxWidth="sm"
                    fullWidth
                    PaperProps={{
                        sx: {
                            borderRadius: 3,
                            background: "linear-gradient(135deg, #7F1D1D 0%, #450A0A 100%)",
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

                <Dialog
                    open={showScanner}
                    onClose={() => setShowScanner(false)}
                    maxWidth="sm"
                    fullWidth
                    PaperProps={{ sx: { bgcolor: "transparent", boxShadow: "none" } }}
                >
                    <QRScanner
                        onScan={(data) => {
                            if (scanMode === "assignment") handleScanAssignment(data);
                            else handleScanGold(data);
                        }}
                        onClose={() => setShowScanner(false)}
                    />
                </Dialog>
            </Box >
        </ProtectedRoute >
    );
}
