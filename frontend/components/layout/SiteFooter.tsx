"use client";

import Image from "next/image";
import { Box, Typography } from "@mui/material";

export default function SiteFooter() {
    return (
        <Box
            component="footer"
            sx={{
                position: "relative",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                py: { xs: 1.5, sm: 2 },
                borderTop: "1px solid rgba(255,255,255,0.06)",
                /* enough side padding so center text never runs under the logos */
                px: { xs: "72px", sm: "80px", md: "96px" },
                minHeight: { xs: 56, sm: 64 },
                background: "rgba(15, 23, 42, 0.6)",
            }}
        >
            {/* Health Club Logo – far left corner (temporarily hidden) */}
            {/* <Box
                sx={{
                    position: "absolute",
                    left: { xs: 8, sm: 16 },
                    top: "50%",
                    transform: "translateY(-50%)",
                    display: "flex",
                    alignItems: "center",
                }}
            >
                <Image
                    src="/healthclub-logo.png"
                    alt="Health Club VIT"
                    width={56}
                    height={40}
                    style={{
                        objectFit: "contain",
                        width: "clamp(36px, 6vw, 56px)",
                        height: "auto",
                    }}
                />
            </Box> */}

            {/* Centre – copyright + attribution */}
            <Box sx={{ textAlign: "center" }}>
                <Typography
                    variant="body2"
                    sx={{
                        color: "text.secondary",
                        fontSize: { xs: "0.7rem", sm: "0.875rem" },
                    }}
                >
                    © 2026 Health Club - VIT. All rights reserved.
                </Typography>
                <Typography
                    variant="caption"
                    sx={{
                        color: "rgba(255,255,255,0.35)",
                        display: "block",
                        mt: 0.3,
                        fontSize: { xs: "0.6rem", sm: "0.75rem" },
                    }}
                >
                    Created and managed by{" "}
                    <a
                        href="https://www.instagram.com/_sathya_academy_btl?igsh=cnhzbHB6a2h4bm12"
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                            color: "#E1306C",
                            textDecoration: "none",
                            fontWeight: 600,
                            transition: "opacity 0.2s ease",
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.opacity = "0.75")}
                        onMouseLeave={(e) => (e.currentTarget.style.opacity = "1")}
                    >
                        Sathya Academy Btl
                    </a>
                </Typography>
            </Box>

            {/* 40 Years VIT Logo – far right corner (temporarily hidden) */}
            {/* <Box
                sx={{
                    position: "absolute",
                    right: { xs: 8, sm: 16 },
                    top: "50%",
                    transform: "translateY(-50%)",
                    display: "flex",
                    alignItems: "center",
                }}
            >
                <Image
                    src="/vit-40years.png"
                    alt="VIT 40 Years"
                    width={56}
                    height={40}
                    style={{
                        objectFit: "contain",
                        width: "clamp(36px, 6vw, 56px)",
                        height: "auto",
                    }}
                />
            </Box> */}
        </Box>
    );
}
