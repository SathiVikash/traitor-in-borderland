"use client";

import { useState } from "react";
import {
    Card,
    CardContent,
    Typography,
    TextField,
    Button,
    Box,
    Grid,
    Alert,
    Dialog,
    DialogTitle,
    DialogContent,
    ImageList,
    ImageListItem,
} from "@mui/material";
import { QrCode2 } from "@mui/icons-material";
import { adminAPI } from "@/lib/api";

interface AssignmentCard {
    card_id: string;
    team_type: string;
    qr_code_image: string;
}

export default function AssignmentCardsGenerator() {
    const [numInnocents, setNumInnocents] = useState("15");
    const [numTraitors, setNumTraitors] = useState("5");
    const [cards, setCards] = useState<AssignmentCard[]>([]);
    const [loading, setLoading] = useState(false);
    const [dialogOpen, setDialogOpen] = useState(false);

    const handleGenerate = async () => {
        setLoading(true);
        try {
            const response = await adminAPI.generateCards({
                num_innocents: parseInt(numInnocents),
                num_traitors: parseInt(numTraitors),
            });
            setCards(response.data);
            setDialogOpen(true);
        } catch (error: any) {
            console.error("Error generating cards:", error);
            alert(error.response?.data?.message || "Failed to generate cards");
        } finally {
            setLoading(false);
        }
    };

    const downloadAllCards = () => {
        cards.forEach((card, index) => {
            setTimeout(() => {
                const link = document.createElement("a");
                link.href = card.qr_code_image;
                link.download = `${card.team_type}_card_${index + 1}.png`;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
            }, index * 200);
        });
    };

    return (
        <>
            <Card
                sx={{
                    background: "linear-gradient(135deg, #1E293B 0%, #334155 100%)",
                    border: "1px solid rgba(255, 255, 255, 0.1)",
                }}
            >
                <CardContent>
                    <Typography variant="h6" sx={{ mb: 3, fontWeight: 700 }}>
                        Assignment Cards Generator
                    </Typography>

                    <Alert severity="info" sx={{ mb: 3 }}>
                        Generate QR code assignment cards for team leads. Each card reveals whether the team is
                        innocent or traitor when scanned.
                    </Alert>

                    <Grid container spacing={2} sx={{ mb: 3 }}>
                        <Grid size={{ xs: 12, md: 6 }}>
                            <TextField
                                fullWidth
                                label="Number of Innocent Cards"
                                type="number"
                                value={numInnocents}
                                onChange={(e) => setNumInnocents(e.target.value)}
                                inputProps={{ min: 1 }}
                            />
                        </Grid>
                        <Grid size={{ xs: 12, md: 6 }}>
                            <TextField
                                fullWidth
                                label="Number of Traitor Cards"
                                type="number"
                                value={numTraitors}
                                onChange={(e) => setNumTraitors(e.target.value)}
                                inputProps={{ min: 1 }}
                            />
                        </Grid>
                    </Grid>

                    <Box sx={{ mb: 3 }}>
                        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                            Total Cards: {parseInt(numInnocents || "0") + parseInt(numTraitors || "0")}
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                            Enter any number of innocents and traitors to generate QR cards.
                        </Typography>
                    </Box>

                    <Button
                        fullWidth
                        variant="contained"
                        size="large"
                        startIcon={<QrCode2 />}
                        onClick={handleGenerate}
                        disabled={loading}
                        sx={{
                            background: "linear-gradient(135deg, #3B82F6 0%, #8B5CF6 100%)",
                            "&:hover": {
                                background: "linear-gradient(135deg, #2563EB 0%, #7C3AED 100%)",
                            },
                        }}
                    >
                        {loading ? "Generating..." : "Generate Assignment Cards"}
                    </Button>
                </CardContent>
            </Card>

            {/* Cards Dialog */}
            <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="lg" fullWidth>
                <DialogTitle>
                    <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <Typography variant="h6">Assignment Cards ({cards.length})</Typography>
                        <Button variant="contained" onClick={downloadAllCards}>
                            Download All
                        </Button>
                    </Box>
                </DialogTitle>
                <DialogContent>
                    <Grid container spacing={2}>
                        {/* Innocents */}
                        <Grid size={{ xs: 12, md: 6 }}>
                            <Typography variant="h6" sx={{ mb: 2, color: "primary.main" }}>
                                Innocent Cards ({cards.filter((c) => c.team_type === "innocent").length})
                            </Typography>
                            <ImageList cols={2} gap={16}>
                                {cards
                                    .filter((c) => c.team_type === "innocent")
                                    .map((card, index) => (
                                        <ImageListItem key={card.card_id}>
                                            <Box
                                                sx={{
                                                    p: 2,
                                                    border: "2px solid #3B82F6",
                                                    borderRadius: 2,
                                                    background: "rgba(59, 130, 246, 0.1)",
                                                }}
                                            >
                                                <img
                                                    src={card.qr_code_image}
                                                    alt={`Innocent ${index + 1}`}
                                                    style={{ width: "100%", borderRadius: 8 }}
                                                />
                                                <Typography variant="caption" align="center" display="block" sx={{ mt: 1 }}>
                                                    Innocent #{index + 1}
                                                </Typography>
                                            </Box>
                                        </ImageListItem>
                                    ))}
                            </ImageList>
                        </Grid>

                        {/* Traitors */}
                        <Grid size={{ xs: 12, md: 6 }}>
                            <Typography variant="h6" sx={{ mb: 2, color: "secondary.main" }}>
                                Traitor Cards ({cards.filter((c) => c.team_type === "traitor").length})
                            </Typography>
                            <ImageList cols={2} gap={16}>
                                {cards
                                    .filter((c) => c.team_type === "traitor")
                                    .map((card, index) => (
                                        <ImageListItem key={card.card_id}>
                                            <Box
                                                sx={{
                                                    p: 2,
                                                    border: "2px solid #EF4444",
                                                    borderRadius: 2,
                                                    background: "rgba(239, 68, 68, 0.1)",
                                                }}
                                            >
                                                <img
                                                    src={card.qr_code_image}
                                                    alt={`Traitor ${index + 1}`}
                                                    style={{ width: "100%", borderRadius: 8 }}
                                                />
                                                <Typography variant="caption" align="center" display="block" sx={{ mt: 1 }}>
                                                    Traitor #{index + 1}
                                                </Typography>
                                            </Box>
                                        </ImageListItem>
                                    ))}
                            </ImageList>
                        </Grid>
                    </Grid>
                </DialogContent>
            </Dialog>
        </>
    );
}
