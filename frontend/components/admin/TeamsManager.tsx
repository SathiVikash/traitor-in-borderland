"use client";

import { useState, useEffect } from "react";
import {
    Card,
    CardContent,
    Typography,
    Box,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    Paper,
    Button,
    Chip,
    CircularProgress,
    Tooltip,
    IconButton,
    Dialog,
    TextField,
    List,
    ListItem,
    ListItemText,
    ListItemSecondaryAction,
} from "@mui/material";
import { Delete, PersonAdd, Settings, Close, PersonRemove } from "@mui/icons-material";
import { adminAPI } from "@/lib/api";

interface TeamMember {
    user_id: number;
    email: string;
    role: string;
}

interface Team {
    id: number;
    team_name: string;
    team_code: string;
    team_type: string;
    total_score: number;
    team_lead_email: string;
    team_lead_id: number;
    member_count: number;
    created_at: string;
    members: TeamMember[];
}

export default function TeamsManager() {
    const [teams, setTeams] = useState<Team[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedTeam, setSelectedTeam] = useState<Team | null>(null);
    const [manageDialogOpen, setManageDialogOpen] = useState(false);
    const [newMemberEmail, setNewMemberEmail] = useState("");
    const [extraPoints, setExtraPoints] = useState("");
    const [pointsReason, setPointsReason] = useState("");
    const [addingPoints, setAddingPoints] = useState(false);

    const fetchTeams = async () => {
        try {
            const response = await adminAPI.getDetailedTeams();
            setTeams(response.data);

            // Update selected team if open
            if (selectedTeam) {
                const updated = response.data.find((t: Team) => t.id === selectedTeam.id);
                if (updated) setSelectedTeam(updated);
            }
        } catch (error) {
            console.error("Error fetching teams:", error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchTeams();
    }, []);

    const handleDisqualify = async (id: number) => {
        if (!confirm("Are you sure you want to DISQUALIFY this team? This will set their score to -9999.")) return;
        try {
            await adminAPI.disqualifyTeam(id);
            fetchTeams();
        } catch (error) {
            console.error("Error disqualifying team:", error);
            alert("Failed to disqualify team");
        }
    };

    const handleDeleteTeam = async (id: number) => {
        if (!confirm("Are you sure you want to DELETE this team? This cannot be undone.")) return;
        try {
            await adminAPI.deleteTeam(id);
            // If deleting selected team, close dialog
            if (selectedTeam?.id === id) {
                setManageDialogOpen(false);
                setSelectedTeam(null);
            }
            fetchTeams();
        } catch (error) {
            console.error("Error deleting team:", error);
            alert("Failed to delete team");
        }
    };

    const openManageDialog = (team: Team) => {
        setSelectedTeam(team);
        setManageDialogOpen(true);
        setNewMemberEmail("");
        setExtraPoints("");
        setPointsReason("");
    };

    const handleAddMember = async () => {
        if (!selectedTeam || !newMemberEmail) return;
        try {
            await adminAPI.addTeamMember(selectedTeam.id, newMemberEmail);
            setNewMemberEmail("");
            fetchTeams();
        } catch (error: any) {
            console.error("Error adding member:", error);
            alert(error.response?.data?.message || "Failed to add member");
        }
    };

    const handleRemoveMember = async (userId: number) => {
        if (!selectedTeam) return;
        if (!confirm("Remove this member?")) return;
        try {
            await adminAPI.removeTeamMember(selectedTeam.id, userId);
            fetchTeams();
        } catch (error: any) {
            console.error("Error removing member:", error);
            alert(error.response?.data?.message || "Failed to remove member");
        }
    };

    const handleAddExtraPoints = async () => {
        if (!selectedTeam || !extraPoints) return;
        setAddingPoints(true);
        try {
            await adminAPI.addExtraPoints(selectedTeam.id, {
                points: parseInt(extraPoints),
                reason: pointsReason || "Penalty game/Admin adjustment"
            });
            setExtraPoints("");
            setPointsReason("");
            fetchTeams();
            alert("Extra points added successfully!");
        } catch (error: any) {
            console.error("Error adding extra points:", error);
            alert(error.response?.data?.message || "Failed to add extra points");
        } finally {
            setAddingPoints(false);
        }
    };

    return (
        <Card
            sx={{
                background: "linear-gradient(135deg, #1E293B 0%, #334155 100%)",
                border: "1px solid rgba(255, 255, 255, 0.1)",
            }}
        >
            <CardContent>
                <Typography variant="h6" sx={{ mb: 3, fontWeight: 700 }}>
                    Teams Manager
                </Typography>

                {loading ? (
                    <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
                        <CircularProgress />
                    </Box>
                ) : (
                    <TableContainer component={Paper} sx={{ background: "transparent" }}>
                        <Table sx={{ minWidth: 650 }} aria-label="teams table">
                            <TableHead>
                                <TableRow>
                                    <TableCell sx={{ color: "text.secondary" }}>Team Name</TableCell>
                                    <TableCell sx={{ color: "text.secondary" }}>Type</TableCell>
                                    <TableCell sx={{ color: "text.secondary" }}>Score</TableCell>
                                    <TableCell sx={{ color: "text.secondary" }}>Lead</TableCell>
                                    <TableCell sx={{ color: "text.secondary" }}>Members</TableCell>
                                    <TableCell sx={{ color: "text.secondary" }}>Actions</TableCell>
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {teams.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={6} align="center" sx={{ color: "text.secondary" }}>
                                            No teams formed yet
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    teams.map((team) => (
                                        <TableRow
                                            key={team.id}
                                            sx={{ "&:last-child td, &:last-child th": { border: 0 } }}
                                        >
                                            <TableCell sx={{ color: "white", fontWeight: "bold" }}>
                                                {team.team_name}
                                                <Typography variant="caption" display="block" color="text.secondary">
                                                    {team.team_code}
                                                </Typography>
                                            </TableCell>
                                            <TableCell>
                                                <Chip
                                                    label={team.team_type}
                                                    size="small"
                                                    color={team.team_type === "innocent" ? "primary" : "error"}
                                                />
                                            </TableCell>
                                            <TableCell sx={{ color: "white" }}>{team.total_score}</TableCell>
                                            <TableCell sx={{ color: "text.secondary" }}>{team.team_lead_email}</TableCell>
                                            <TableCell sx={{ color: "text.secondary" }}>
                                                <Tooltip title={team.members.map(m => m.email).join(", ")}>
                                                    <span style={{ cursor: 'pointer', textDecoration: 'underline' }}>
                                                        {team.member_count} members
                                                    </span>
                                                </Tooltip>
                                            </TableCell>
                                            <TableCell>
                                                <Box sx={{ display: 'flex', gap: 1 }}>
                                                    <Button
                                                        variant="outlined"
                                                        color="error"
                                                        size="small"
                                                        onClick={() => handleDisqualify(team.id)}
                                                        disabled={team.total_score <= -9999}
                                                    >
                                                        {team.total_score <= -9999 ? "Disqualified" : "Disqualify"}
                                                    </Button>
                                                    <IconButton
                                                        size="small"
                                                        sx={{ color: 'primary.main', border: '1px solid rgba(59, 130, 246, 0.5)' }}
                                                        onClick={() => openManageDialog(team)}
                                                        title="Manage Team"
                                                    >
                                                        <Settings fontSize="small" />
                                                    </IconButton>
                                                    <IconButton
                                                        size="small"
                                                        sx={{ color: 'error.main', border: '1px solid rgba(239, 68, 68, 0.5)' }}
                                                        onClick={() => handleDeleteTeam(team.id)}
                                                        title="Delete Team"
                                                    >
                                                        <Delete fontSize="small" />
                                                    </IconButton>
                                                </Box>
                                            </TableCell>
                                        </TableRow>
                                    ))
                                )}
                            </TableBody>
                        </Table>
                    </TableContainer>
                )}
            </CardContent>

            {/* Manage Team Dialog */}
            <Dialog
                open={manageDialogOpen}
                onClose={() => setManageDialogOpen(false)}
                maxWidth="sm"
                fullWidth
                PaperProps={{
                    sx: { bgcolor: "#1E293B", color: "white", border: "1px solid rgba(255,255,255,0.1)" }
                }}
            >
                {selectedTeam && (
                    <Box sx={{ p: 3 }}>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
                            <Typography variant="h6">Manage {selectedTeam.team_name}</Typography>
                            <IconButton onClick={() => setManageDialogOpen(false)} sx={{ color: 'text.secondary' }}>
                                <Close />
                            </IconButton>
                        </Box>

                        {/* Extra Points Section */}
                        <Box sx={{ mb: 4, p: 2, bgcolor: "rgba(59, 130, 246, 0.05)", borderRadius: 2, border: "1px solid rgba(59, 130, 246, 0.2)" }}>
                            <Typography variant="subtitle2" sx={{ mb: 2, color: "primary.light", fontWeight: 700 }}>
                                Add Extra Points (Penalty Game / Manual)
                            </Typography>
                            <Box sx={{ display: 'flex', gap: 2, flexDirection: 'column' }}>
                                <Box sx={{ display: 'flex', gap: 1 }}>
                                    <TextField
                                        label="Points"
                                        type="number"
                                        size="small"
                                        sx={{ width: '100px' }}
                                        value={extraPoints}
                                        onChange={(e) => setExtraPoints(e.target.value)}
                                        InputProps={{ sx: { color: 'white' } }}
                                        InputLabelProps={{ sx: { color: 'text.secondary' } }}
                                    />
                                    <TextField
                                        label="Reason (Optional)"
                                        size="small"
                                        fullWidth
                                        value={pointsReason}
                                        onChange={(e) => setPointsReason(e.target.value)}
                                        InputProps={{ sx: { color: 'white' } }}
                                        InputLabelProps={{ sx: { color: 'text.secondary' } }}
                                    />
                                    <Button
                                        variant="contained"
                                        color="primary"
                                        onClick={handleAddExtraPoints}
                                        disabled={addingPoints || !extraPoints}
                                    >
                                        {addingPoints ? "..." : "Add"}
                                    </Button>
                                </Box>
                                <Typography variant="caption" color="text.secondary">
                                    Current Score: <b>{selectedTeam.total_score}</b>
                                </Typography>
                            </Box>
                        </Box>

                        <Box sx={{ display: 'flex', gap: 1, mb: 3 }}>
                            <TextField
                                label="Add Member Email"
                                size="small"
                                fullWidth
                                value={newMemberEmail}
                                onChange={(e) => setNewMemberEmail(e.target.value)}
                                sx={{
                                    input: { color: 'white' },
                                    label: { color: 'text.secondary' },
                                    fieldset: { borderColor: 'rgba(255,255,255,0.2)' }
                                }}
                            />
                            <Button
                                variant="contained"
                                onClick={handleAddMember}
                                startIcon={<PersonAdd />}
                            >
                                Add
                            </Button>
                        </Box>

                        <Typography variant="subtitle2" sx={{ mb: 1, color: "text.secondary" }}>
                            Current Members
                        </Typography>
                        <List dense sx={{ bgcolor: "rgba(0,0,0,0.2)", borderRadius: 1 }}>
                            {selectedTeam.members.map((member) => (
                                <ListItem key={member.user_id}>
                                    <ListItemText
                                        primary={member.email}
                                        secondary={member.user_id === selectedTeam.team_lead_id ? "Team Lead" : member.role}
                                        primaryTypographyProps={{ color: "white" }}
                                        secondaryTypographyProps={{ color: "text.secondary" }}
                                    />
                                    {member.user_id !== selectedTeam.team_lead_id && (
                                        <ListItemSecondaryAction>
                                            <IconButton
                                                edge="end"
                                                aria-label="delete"
                                                onClick={() => handleRemoveMember(member.user_id)}
                                                sx={{ color: "error.main" }}
                                            >
                                                <PersonRemove />
                                            </IconButton>
                                        </ListItemSecondaryAction>
                                    )}
                                </ListItem>
                            ))}
                            {selectedTeam.members.length === 0 && (
                                <ListItem>
                                    <ListItemText primary="No members yet" sx={{ fontStyle: 'italic', color: 'text.secondary' }} />
                                </ListItem>
                            )}
                        </List>

                        <Box sx={{ mt: 3, pt: 2, borderTop: '1px solid rgba(255,255,255,0.1)' }}>
                            <Button
                                color="error"
                                variant="outlined"
                                fullWidth
                                startIcon={<Delete />}
                                onClick={() => handleDeleteTeam(selectedTeam.id)}
                            >
                                Delete Team
                            </Button>
                        </Box>
                    </Box>
                )}
            </Dialog>
        </Card>
    );
}
