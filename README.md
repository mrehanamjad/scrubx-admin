# ScrubX Admin — Next.js 16 App Router

Admin dashboard and store management platform for ScrubX Pakistan medical apparel storefront, fully converted to **Next.js 16** with **React 19** and the **App Router**.

## Tech Stack

- **Framework**: Next.js 16 (Turbopack, App Router, React Server Components)
- **UI Library**: React 19
- **Styling**: Tailwind CSS v4 with PostCSS
- **Components & Icons**: Radix UI, Lucide React
- **Database & ORM**: PostgreSQL 17 (Supabase Managed), Drizzle ORM
- **Authentication**: Better Auth with RBAC (`super_admin`, `admin`, `staff`)
- **Media**: ImageKit direct client upload & server SDK
- **Data & Charts**: Recharts, Server Actions (`createSafeAction`), Zod validation
- **Typography**: `next/font/google` (Inter, Plus Jakarta Sans, JetBrains Mono)

## Getting Started

Run the development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

## Available Scripts

- `npm run dev`: Starts Next.js in development mode with Turbopack and Fast Refresh.
- `npm run build`: Compiles and builds the production application with static optimization.
- `npm run start`: Starts Next.js in production server mode.
- `npm run lint`: Runs ESLint to check for code quality and Next.js best practices.

## Project Structure

```
├── public/                 # Static assets (images, logos, proofs)
├── src/
│   ├── app/                # Next.js 16 App Router (RSC page shells, root layout)
│   │   ├── (routes)/       # Route segments (products, orders, customers, etc.)
│   │   ├── globals.css     # Tailwind CSS v4 design tokens and theme
│   │   └── layout.tsx      # Root layout with fonts, metadata, and providers
│   ├── components/         # Reusable UI & layout components
│   │   ├── layout/         # AppShell, Topbar, Sidebar
│   │   ├── shared/         # Common widgets (Pagination, StatusBadges, etc.)
│   │   ├── ui/             # Radix UI primitives
│   │   └── providers.tsx   # Client context providers wrapper
│   ├── data/               # State store and mock catalog
│   ├── lib/                # Shared utilities, formatting, and types
│   └── views/              # Interactive page views ('use client' leaves)
├── next.config.ts          # Native TypeScript Next.js configuration
├── postcss.config.mjs      # Tailwind CSS v4 PostCSS plugin configuration
└── tsconfig.json           # Next.js TypeScript configuration with path aliases
```
