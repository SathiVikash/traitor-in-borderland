"use client";

import { useState, useEffect } from "react";
import {
    Card,
    CardContent,
    Typography,
    TextField,
    Button,
    Box,
    Grid,
    Select,
    MenuItem,
    FormControl,
    InputLabel,
    List,
    ListItem,
    ListItemText,
    Chip,
    CircularProgress,
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    IconButton,
} from "@mui/material";
import { Add, QrCode2, Download, Close, Delete } from "@mui/icons-material";
import { adminAPI } from "@/lib/api";

interface Location {
    id: number;
    location_name: string;
}

interface GoldBar {
    id: number;
    points: number;
    location_name: string;
    clue_text: string;
    clue_location_name: string;
    is_scanned: boolean;
    qr_code: string;
    entry_code?: string;
}

export default function GoldBarsManager() {
    const [locations, setLocations] = useState<Location[]>([]);
    const [goldBars, setGoldBars] = useState<GoldBar[]>([]);
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [qrDialogOpen, setQrDialogOpen] = useState(false);
    const [selectedQR, setSelectedQR] = useState("");
    const [selectedGoldBar, setSelectedGoldBar] = useState<GoldBar | null>(null);
    const [loadingQR, setLoadingQR] = useState(false);

    const [formData, setFormData] = useState({
        points: "",
        location_id: "",
        clue_text: "",
        clue_location_id: "",
    });

    useEffect(() => {
        const fetchData = async () => {
            try {
                const [locationsRes, goldBarsRes] = await Promise.all([
                    adminAPI.getLocations(),
                    adminAPI.getGoldBars(),
                ]);
                setLocations(locationsRes.data);
                setGoldBars(goldBarsRes.data);
            } catch (error) {
                console.error("Error fetching data:", error);
            } finally {
                setLoading(false);
            }
        };
        fetchData();
    }, []);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setSubmitting(true);

        try {
            const response = await adminAPI.createGoldBar({
                points: parseInt(formData.points),
                location_id: parseInt(formData.location_id),
                clue_text: formData.clue_text,
                clue_location_id: parseInt(formData.clue_location_id),
            });

            // Show QR code
            setSelectedQR(response.data.qr_code_image);
            setSelectedGoldBar({
                ...response.data,
                location_name: locations.find((l) => l.id === parseInt(formData.location_id))?.location_name || "",
                clue_location_name: locations.find((l) => l.id === parseInt(formData.clue_location_id))?.location_name || "",
            });
            setQrDialogOpen(true);

            // Reset form
            setFormData({
                points: "",
                location_id: "",
                clue_text: "",
                clue_location_id: "",
            });

            // Refresh list
            const goldBarsRes = await adminAPI.getGoldBars();
            setGoldBars(goldBarsRes.data);
        } catch (error: any) {
            console.error("Error creating gold bar:", error);
            alert(error.response?.data?.message || "Failed to create gold bar");
        } finally {
            setSubmitting(false);
        }
    };

    const handleViewQR = async (goldBar: GoldBar) => {
        setLoadingQR(true);
        setSelectedGoldBar(goldBar);
        setQrDialogOpen(true);

        try {
            const response = await adminAPI.getGoldBarQR(goldBar.id);
            setSelectedQR(response.data.qr_code_image);
            // Update entry_code from the QR response if not already on the bar object
            if (response.data.entry_code) {
                setSelectedGoldBar({ ...goldBar, entry_code: response.data.entry_code });
            }
        } catch (error) {
            console.error("Error fetching QR code:", error);
            alert("Failed to load QR code");
            setQrDialogOpen(false);
        } finally {
            setLoadingQR(false);
        }
    };

    const handleDownloadQR = () => {
        if (!selectedQR || !selectedGoldBar) return;

        const CARD_W = 700;
        const CARD_H = 950;
        const QR_SIZE = 480;

        const canvas = document.createElement("canvas");
        canvas.width = CARD_W;
        canvas.height = CARD_H;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        // White background
        ctx.fillStyle = "#FFFFFF";
        ctx.fillRect(0, 0, CARD_W, CARD_H);

        // Top gold accent bar
        ctx.fillStyle = "#D97706";
        ctx.fillRect(0, 0, CARD_W, 8);
        ctx.fillRect(0, CARD_H - 8, CARD_W, 8);

        // ─── Health Club Logo top-left ───
        const logo = new Image();
        logo.crossOrigin = "anonymous";

        // ─── QR image ───
        const qrImg = new Image();
        qrImg.crossOrigin = "anonymous";

        const drawCard = () => {
            ctx.clearRect(0, 0, CARD_W, CARD_H);

            // Background
            ctx.fillStyle = "#FFFFFF";
            ctx.fillRect(0, 0, CARD_W, CARD_H);

            // Gold accent bars
            ctx.fillStyle = "#D97706";
            ctx.fillRect(0, 0, CARD_W, 8);
            ctx.fillRect(0, CARD_H - 8, CARD_W, 8);

            // Logo top-left (max 90px height)
            const logoH = 70;
            const logoW = logo.naturalWidth ? (logo.naturalWidth / logo.naturalHeight) * logoH : 120;
            ctx.drawImage(logo, 24, 20, logoW, logoH);

            // Game title — centered
            ctx.fillStyle = "#111827";
            ctx.font = "bold 30px Arial";
            ctx.textAlign = "center";
            ctx.fillText("TRAITORS IN BORDERLAND", CARD_W / 2, 70);

            // Thin divider
            ctx.strokeStyle = "#E5E7EB";
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.moveTo(40, 100);
            ctx.lineTo(CARD_W - 40, 100);
            ctx.stroke();

            // QR code centered
            const qrX = (CARD_W - QR_SIZE) / 2;
            const qrY = 120;
            ctx.drawImage(qrImg, qrX, qrY, QR_SIZE, QR_SIZE);

            // Entry code label — just below QR
            ctx.fillStyle = "#6B7280";
            ctx.font = "18px Arial";
            ctx.textAlign = "center";
            ctx.fillText("Manual Entry Code", CARD_W / 2, qrY + QR_SIZE + 36);

            // Entry code value — big, spaced
            ctx.fillStyle = "#D97706";
            ctx.font = "bold 52px monospace";
            ctx.letterSpacing = "8px";
            ctx.textAlign = "center";
            const code = selectedGoldBar!.entry_code || "------";
            ctx.fillText(code.split("").join(" "), CARD_W / 2, qrY + QR_SIZE + 92);

            ctx.letterSpacing = "0px";

            // Divider before location
            ctx.strokeStyle = "#D1D5DB";
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(80, qrY + QR_SIZE + 114);
            ctx.lineTo(CARD_W - 80, qrY + QR_SIZE + 114);
            ctx.stroke();

            // Location label — bottom section (wrapped to stay inside frame)
            ctx.fillStyle = "#1F2937";
            ctx.font = "bold 28px Arial";
            ctx.textAlign = "center";
            const locationText = `📍 ${selectedGoldBar!.location_name}`;
            const maxWidth = CARD_W - 80; // 40px padding each side
            const lineHeight = 36;
            const words = locationText.split(" ");
            const locLines: string[] = [];
            let currentLine = "";
            for (const word of words) {
                const testLine = currentLine ? `${currentLine} ${word}` : word;
                if (ctx.measureText(testLine).width > maxWidth && currentLine) {
                    locLines.push(currentLine);
                    currentLine = word;
                } else {
                    currentLine = testLine;
                }
            }
            if (currentLine) locLines.push(currentLine);
            const locStartY = qrY + QR_SIZE + 152;
            locLines.forEach((line, idx) => {
                ctx.fillText(line, CARD_W / 2, locStartY + idx * lineHeight);
            });

            // Bottom footer
            ctx.fillStyle = "#9CA3AF";
            ctx.font = "14px Arial";
            ctx.textAlign = "center";
            ctx.fillText("Health Club · VIT Vellore", CARD_W / 2, CARD_H - 22);

            // Download
            const link = document.createElement("a");
            link.href = canvas.toDataURL("image/png");
            link.download = `gold_bar_${selectedGoldBar!.id}_${selectedGoldBar!.location_name.replace(/\s+/g, "_")}.png`;
            link.click();
        };

        let loaded = 0;
        const onLoad = () => { loaded++; if (loaded === 2) drawCard(); };

        logo.onload = onLoad;
        logo.onerror = onLoad; // proceed even if logo fails
        qrImg.onload = onLoad;

        logo.src = "/healthclub-logo-black.png";
        qrImg.src = selectedQR;
    };

    const handleCloseDialog = () => {
        setQrDialogOpen(false);
        setSelectedQR("");
        setSelectedGoldBar(null);
    };

    return (
        <>
            <Grid container spacing={3}>
                <Grid size={{ xs: 12, md: 6 }}>
                    <Card
                        sx={{
                            background: "linear-gradient(135deg, #1E293B 0%, #334155 100%)",
                            border: "1px solid rgba(255, 255, 255, 0.1)",
                        }}
                    >
                        <CardContent>
                            <Typography variant="h6" sx={{ mb: 3, fontWeight: 700 }}>
                                Create Gold Bar
                            </Typography>

                            <Box component="form" onSubmit={handleSubmit}>
                                <TextField
                                    fullWidth
                                    label="Points"
                                    type="number"
                                    value={formData.points}
                                    onChange={(e) => setFormData({ ...formData, points: e.target.value })}
                                    required
                                    sx={{ mb: 2 }}
                                />

                                <FormControl fullWidth sx={{ mb: 2 }}>
                                    <InputLabel>Gold Bar Location</InputLabel>
                                    <Select
                                        value={formData.location_id}
                                        onChange={(e) => setFormData({ ...formData, location_id: e.target.value })}
                                        required
                                    >
                                        {locations.map((loc) => (
                                            <MenuItem key={loc.id} value={loc.id}>
                                                {loc.location_name}
                                            </MenuItem>
                                        ))}
                                    </Select>
                                </FormControl>

                                <TextField
                                    fullWidth
                                    label="Clue Text"
                                    value={formData.clue_text}
                                    onChange={(e) => setFormData({ ...formData, clue_text: e.target.value })}
                                    required
                                    multiline
                                    rows={2}
                                    sx={{ mb: 2 }}
                                    placeholder="Where knowledge meets wisdom..."
                                />

                                <FormControl fullWidth sx={{ mb: 3 }}>
                                    <InputLabel>Clue Points To</InputLabel>
                                    <Select
                                        value={formData.clue_location_id}
                                        onChange={(e) => setFormData({ ...formData, clue_location_id: e.target.value })}
                                        required
                                    >
                                        {locations
                                            .filter((loc) => loc.id.toString() !== formData.location_id)
                                            .map((loc) => (
                                                <MenuItem key={loc.id} value={loc.id}>
                                                    {loc.location_name}
                                                </MenuItem>
                                            ))}
                                    </Select>
                                </FormControl>

                                <Button
                                    type="submit"
                                    variant="contained"
                                    startIcon={<Add />}
                                    disabled={submitting || locations.length < 2}
                                    fullWidth
                                >
                                    {submitting ? "Creating..." : "Create Gold Bar"}
                                </Button>

                                {locations.length < 2 && (
                                    <Typography variant="caption" color="error" sx={{ mt: 1, display: "block" }}>
                                        You need at least 2 locations to create a gold bar
                                    </Typography>
                                )}
                            </Box>
                        </CardContent>
                    </Card>
                </Grid>

                <Grid size={{ xs: 12, md: 6 }}>
                    <Card
                        sx={{
                            background: "linear-gradient(135deg, #1E293B 0%, #334155 100%)",
                            border: "1px solid rgba(255, 255, 255, 0.1)",
                        }}
                    >
                        <CardContent>
                            <Typography variant="h6" sx={{ mb: 3, fontWeight: 700 }}>
                                Gold Bars ({goldBars.length})
                            </Typography>

                            {loading ? (
                                <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
                                    <CircularProgress />
                                </Box>
                            ) : (
                                <List sx={{ maxHeight: 400, overflow: "auto" }}>
                                    {goldBars.length === 0 ? (
                                        <Typography color="text.secondary" align="center" sx={{ py: 2 }}>
                                            No gold bars yet
                                        </Typography>
                                    ) : (
                                        goldBars.map((bar) => (
                                            <ListItem
                                                key={bar.id}
                                                sx={{
                                                    mb: 1,
                                                    borderRadius: 2,
                                                    background: bar.is_scanned
                                                        ? "rgba(239, 68, 68, 0.1)"
                                                        : "rgba(16, 185, 129, 0.1)",
                                                    border: `1px solid ${bar.is_scanned ? "rgba(239, 68, 68, 0.3)" : "rgba(16, 185, 129, 0.3)"
                                                        }`,
                                                    display: "flex",
                                                    alignItems: "center",
                                                    gap: 2,
                                                }}
                                            >
                                                <ListItemText
                                                    primary={
                                                        <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 0.5 }}>
                                                            <Typography sx={{ fontWeight: 600 }}>
                                                                {bar.points} pts
                                                            </Typography>
                                                            {bar.entry_code && (
                                                                <Typography
                                                                    variant="caption"
                                                                    sx={{
                                                                        fontFamily: "monospace",
                                                                        fontWeight: 700,
                                                                        bgcolor: "rgba(234,179,8,0.15)",
                                                                        color: "#EAB308",
                                                                        px: 1,
                                                                        py: 0.2,
                                                                        borderRadius: 1,
                                                                        letterSpacing: 2,
                                                                    }}
                                                                >
                                                                    #{bar.entry_code}
                                                                </Typography>
                                                            )}
                                                            <Chip
                                                                label={bar.is_scanned ? "Scanned" : "Available"}
                                                                size="small"
                                                                color={bar.is_scanned ? "error" : "success"}
                                                            />
                                                        </Box>
                                                    }
                                                    secondary={
                                                        <>
                                                            <Typography variant="caption" display="block">
                                                                📍 {bar.location_name}
                                                            </Typography>
                                                            <Typography variant="caption" display="block">
                                                                💡 {bar.clue_text.substring(0, 40)}...
                                                            </Typography>
                                                        </>
                                                    }
                                                />
                                                <Box sx={{ display: 'flex', gap: 1 }}>
                                                    <Button
                                                        variant="outlined"
                                                        size="small"
                                                        startIcon={<QrCode2 />}
                                                        onClick={() => handleViewQR(bar)}
                                                        sx={{
                                                            minWidth: "120px",
                                                            borderColor: "primary.main",
                                                            color: "primary.main",
                                                            "&:hover": {
                                                                borderColor: "primary.light",
                                                                background: "rgba(59, 130, 246, 0.1)",
                                                            },
                                                        }}
                                                    >
                                                        View QR
                                                    </Button>
                                                    <IconButton
                                                        color="error"
                                                        onClick={async () => {
                                                            if (confirm("Are you sure you want to delete this gold bar?")) {
                                                                try {
                                                                    await adminAPI.deleteGoldBar(bar.id);
                                                                    const goldBarsRes = await adminAPI.getGoldBars();
                                                                    setGoldBars(goldBarsRes.data);
                                                                } catch (error) {
                                                                    console.error("Delete error", error);
                                                                    alert("Failed to delete gold bar: It might have been scanned already.");
                                                                }
                                                            }
                                                        }}
                                                    >
                                                        <Delete />
                                                    </IconButton>
                                                </Box>
                                            </ListItem>
                                        ))
                                    )}
                                </List>
                            )}
                        </CardContent>
                    </Card>
                </Grid>
            </Grid>

            {/* QR Code Dialog */}
            <Dialog open={qrDialogOpen} onClose={handleCloseDialog} maxWidth="sm" fullWidth>
                <DialogTitle>
                    <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <Typography variant="h6">Gold Bar QR Code</Typography>
                        <IconButton onClick={handleCloseDialog} size="small">
                            <Close />
                        </IconButton>
                    </Box>
                </DialogTitle>
                <DialogContent>
                    {loadingQR ? (
                        <Box sx={{ display: "flex", justifyContent: "center", py: 8 }}>
                            <CircularProgress />
                        </Box>
                    ) : (
                        <Box sx={{ textAlign: "center", py: 2 }}>
                            {selectedQR && (
                                <>
                                    <img
                                        src={selectedQR}
                                        alt="QR Code"
                                        style={{ maxWidth: "100%", borderRadius: 8, marginBottom: 16 }}
                                    />
                                    {selectedGoldBar && (
                                        <Box sx={{ mb: 2, textAlign: "left", p: 2, bgcolor: "rgba(255, 255, 255, 0.05)", borderRadius: 2 }}>
                                            <Typography variant="body2" sx={{ mb: 1 }}>
                                                <strong>Location:</strong> {selectedGoldBar.location_name}
                                            </Typography>
                                            <Typography variant="body2" sx={{ mb: 1 }}>
                                                <strong>Clue:</strong> {selectedGoldBar.clue_text}
                                            </Typography>
                                            <Typography variant="body2" sx={{ mb: 2 }}>
                                                <strong>Points to:</strong> {selectedGoldBar.clue_location_name}
                                            </Typography>
                                            {selectedGoldBar.entry_code && (
                                                <Box sx={{
                                                    p: 2,
                                                    bgcolor: "rgba(234,179,8,0.08)",
                                                    border: "1px solid rgba(234,179,8,0.3)",
                                                    borderRadius: 2,
                                                    textAlign: "center"
                                                }}>
                                                    <Typography variant="caption" sx={{ color: "#EAB308", display: "block", mb: 0.5, letterSpacing: 2 }}>
                                                        MANUAL ENTRY CODE
                                                    </Typography>
                                                    <Typography variant="h4" sx={{
                                                        fontFamily: "monospace",
                                                        fontWeight: 900,
                                                        letterSpacing: 8,
                                                        color: "#EAB308"
                                                    }}>
                                                        {selectedGoldBar.entry_code}
                                                    </Typography>
                                                </Box>
                                            )}
                                        </Box>
                                    )}
                                </>
                            )}
                        </Box>
                    )}
                </DialogContent>
                <DialogActions>
                    <Button onClick={handleCloseDialog}>Close</Button>
                    <Button
                        variant="contained"
                        startIcon={<Download />}
                        onClick={handleDownloadQR}
                        disabled={!selectedQR || loadingQR}
                        sx={{
                            background: "linear-gradient(135deg, #3B82F6 0%, #8B5CF6 100%)",
                            "&:hover": {
                                background: "linear-gradient(135deg, #2563EB 0%, #7C3AED 100%)",
                            },
                        }}
                    >
                        Download QR Code
                    </Button>
                </DialogActions>
            </Dialog>
        </>
    );
}
