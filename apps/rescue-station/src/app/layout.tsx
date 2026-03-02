import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
    title: "Rescue Station — Rootstock Refuel Kit",
    description:
        "Stranded on Rootstock with no RBTC for gas? Rescue Station lets you swap your ERC20 tokens for RBTC — completely gasless. Powered by EIP-2612 Permit signatures.",
    keywords: [
        "Rootstock",
        "RBTC",
        "gas",
        "refuel",
        "EIP-2612",
        "permit",
        "gasless",
        "meta-transaction",
        "RIF",
        "USDC",
    ],
};

export default function RootLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <html lang="en">
            <body>{children}</body>
        </html>
    );
}
