# DESIGN.md — FilmMakerStudio Design System & Visual Strategy

> Generated via `vibe-to-ui` exploration for FilmMakerStudio.
> Last updated: 2026-10-28

---

## 1. Overview & Product Strategy

### Product Definition
- **Product Name**: FilmMakerStudio
- **One-liner**: A local-first, browser-based craft desk for screenwriting, scene breakdown, stripboard scheduling, budgeting, and shoot call sheets.
- **Core Value Proposition**: Everything writes to the user's browser `localStorage` first (100% private, zero cloud lock-in, offline resilient). Cloud sync (Supabase) is optional.
- **Audience**: Independent and first-time filmmakers, screenwriters, line producers, and small crews (with specialized reference support for Indian cinema, Chennai rate cards, Tanglish/Tamil screenplays, and standard international formats).

### Conversion Goals (Owner Directive)
- **Primary Goal**: High-conversion landing and marketing experience ("users buy after seeing this product").
- **Aesthetic Tone**: Premium, elegant, authoritative, and immediately easy to comprehend.
- **Conversion Levers**:
  1. *Immediate Tangibility*: Showcase the real, dense, beautiful workspace (screenplay editor + live auto-breakdown elements + shoot schedule) right in the hero view.
  2. *Trust & Privacy*: Emphasize local-first data ownership (no studio leaks, no unapproved training, no cloud downtime).
  3. *Zero-Friction Trial*: Clear 7-day free trial CTA (no credit card required) alongside a pre-loaded sample film (*Por Thozhil*).
  4. *Transparent Pricing*: Flat, clear monthly/annual tiers with no per-page surcharges.

---

## 2. Page Archetype Classification (Stage 0)

| Dimension | Classification |
|---|---|
| **Primary Page Type** | Landing & Public Marketing Gateway (`start.html`, `pricing.html`, `product-*.html`) |
| **Secondary Modifier** | Interactive Craft Tool Showcase & Conversion Funnel |
| **Information Density** | Medium (Breathing room for typography and hero drama, balanced with high-fidelity UI previews) |
| **Confidence** | High |
| **Operating Mode** | Vibe Translation & Reference Fidelity (Translating cinematic prestige into modern SaaS conversion) |

---

## 3. The Three Visual Directions Explored

### Direction 1: The Auteur's Atelier (Cinematic Luxury & Tungsten Glow)
*Recommended for Maximum Emotional Resonance & Prestige*
- **Atmosphere**: Evokes A24, Panavision, 35mm celluloid, and classic director desks.
- **Palette**:
  - Base Ground: `#0A0B0E` (Deep Celluloid Obsidian)
  - Card Surface: `#13141A`
  - Elevated Surface: `#1A1C24`
  - Primary Accent: `#F59E0B` (Warm Tungsten Amber)
  - Deep Brand: `#D97706` (Golden Hour Bronze)
  - Glow: `rgba(245, 158, 11, 0.22)`
  - Ink: `#FCF9F2` (Warm Ivory)
  - Muted Ink: `#A39E93`
- **Typography**:
  - Display: `Cinzel` / `Playfair Display` (Prestige Editorial Serif)
  - Body: `Inter`
  - Data / Script: `JetBrains Mono`
- **Conversion Angle**: Elevates the software from a "web app" to a filmmaker's sacred craft instrument, justifying premium pricing and inspiring deep creative commitment.

### Direction 2: Pro Hollywood Suite (Precision Titanium & Luminescent Violet)
- **Atmosphere**: Apple Pro Apps, DaVinci Resolve, and Linear-grade speed.
- **Palette**:
  - Base Ground: `#0B0D13` (Deep Midnight Slate)
  - Card Surface: `#121520`
  - Elevated Surface: `#1A1E2E`
  - Primary Accent: `#8B5CF6` (Electric Luminescent Violet)
  - Deep Brand: `#7C3AED`
  - Glow: `rgba(139, 92, 246, 0.30)`
  - Ink: `#FFFFFF` (Titanium White)
  - Muted Ink: `#94A3B8`
- **Typography**:
  - Display: `Plus Jakarta Sans` / `Space Grotesk` (Sleek Geometric Modern)
  - Body: `Inter`
  - Data / Script: `JetBrains Mono`
- **Conversion Angle**: Inspires confidence in speed, modern engineering, seamless cloud sync, and effortless pre-production efficiency.

### Direction 3: Nordic Minimal Studio (Stark Platinum & Ultra-Noir)
- **Atmosphere**: Brutalist clarity, high-contrast monochrome, Swiss grid discipline.
- **Palette**:
  - Base Ground: `#050507` (Pure Velvet Noir)
  - Card Surface: `#0E0F14`
  - Elevated Surface: `#161820`
  - Primary Accent: `#E2E8F0` (Stark Platinum)
  - Deep Brand: `#FFFFFF`
  - Glow: `rgba(255, 255, 255, 0.15)`
  - Ink: `#F8FAFC`
  - Muted Ink: `#64748B`
- **Typography**:
  - Display: `Space Grotesk` (Swiss Technical)
  - Body: `Inter`
  - Data / Script: `JetBrains Mono`
- **Conversion Angle**: Directly attacks competitor bloat (Celtx, clunky legacy software) with radical simplicity, zero distraction, and instant clarity.

---

## 4. Component & Layout Rules
- **Hero Section**: 
  - Eyebrow badge with pulse dot indicating local-first engine status.
  - Value proposition headline emphasizing "First draft to final call sheet".
  - Dual CTAs: Primary "Start Free 7-Day Trial" + Secondary "Explore Live Demo Film".
- **Interactive Product Desk**:
  - Split-screen window showcasing real script action + live auto-tagged breakdown cards (Cast, Props, Locations, Stripboard status).
- **Pricing Matrix**:
  - 3 Tiers (Free 7-Day Pass, Pro Filmmaker with "Most Popular" glow, Studio Crew).
  - High contrast on the primary tier card to draw conversion attention.
