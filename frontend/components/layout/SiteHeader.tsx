"use client";

import Image from "next/image";
import { Box } from "@mui/material";

export default function SiteHeader() {
    return (
        <Box
            component="header"
            sx={{
                width: "100%",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                px: { xs: 1.5, sm: 3, md: 5 },
                py: { xs: 1, sm: 1.5 },
                background: "rgba(15, 23, 42, 0.92)",
                backdropFilter: "blur(12px)",
                WebkitBackdropFilter: "blur(12px)",
                borderBottom: "1px solid rgba(255,255,255,0.08)",
                position: "sticky",
                top: 0,
                zIndex: 1200,
            }}
        >
            {/* Left – VIT Logo (temporarily hidden) */}
            {/* <Box sx={{ display: "flex", alignItems: "center", flexShrink: 0 }}>
                <Image
                    src="/vit-logo.png"
                    alt="VIT University"
                    width={110}
                    height={60}
                    style={{
                        objectFit: "contain",
                        width: "clamp(64px, 10vw, 110px)",
                        height: "auto",
                    }}
                    priority
                />
            </Box> */}

            {/* Centre – Riviera 2026 Logo (temporarily hidden) */}
            {/* <Box
                sx={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flex: 1,
                    mx: { xs: 1, sm: 2 },
                }}
            >
                <Image
                    src="/riviera-logo.png"
                    alt="Riviera 2026"
                    width={200}
                    height={70}
                    style={{
                        objectFit: "contain",
                        width: "clamp(100px, 18vw, 200px)",
                        height: "auto",
                    }}
                    priority
                />
            </Box> */}

            {/* Right – Pepsi Logo (temporarily hidden) */}
            {/* <Box sx={{ display: "flex", alignItems: "center", flexShrink: 0 }}>
                <Image
                    src="/pepsi-logo.png"
                    alt="Pepsi – Official Sponsor"
                    width={90}
                    height={60}
                    style={{
                        objectFit: "contain",
                        width: "clamp(44px, 8vw, 90px)",
                        height: "auto",
                    }}
                    priority
                />
            </Box> */}
        </Box>
    );
}
