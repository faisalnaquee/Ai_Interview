/**
 * MockHire Background Asset Presets
 * Stored in Client/public/backgrounds/ for fast, direct static serving.
 */
export const BACKGROUNDS = {
  /**
   * Use Case: Live Voice/Video AI Interview Room (/interview/:id)
   * Theme: Immersive dark soundstage, obsidian studio walls with warm amber & cyan ambient lighting.
   */
  interviewStudioDark: '/backgrounds/interview-studio-dark.jpg',

  /**
   * Use Case: Landing Hero, ATS Checker, or Marketing Pages (/, /ats)
   * Theme: Premium editorial warm paper & ribbon waves (cream, terracotta, sage green).
   */
  landingEditorialWarm: '/backgrounds/landing-editorial-warm.jpg',

  /**
   * Use Case: Assessment Agent Pipeline HUD & Orchestrator (/assessment/:id/progress)
   * Theme: Cybernetic neural network, deep navy glass, glowing data synaptic nodes.
   */
  agentNetworkHud: '/backgrounds/agent-network-hud.jpg',

  /**
   * Use Case: Candidate Dashboard & Scorecard Reports (/dashboard, /result/:id)
   * Theme: Executive bento glass grid with smooth sapphire, emerald, and gold ambient ribbon.
   */
  dashboardBentoMesh: '/backgrounds/dashboard-bento-mesh.jpg',
} as const;

export type BackgroundKey = keyof typeof BACKGROUNDS;
