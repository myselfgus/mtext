# Cloudflare Workers React Template

[cloudflarebutton]

A production-ready full-stack template featuring a React frontend with shadcn/ui components, powered by Cloudflare Workers, Hono, and Durable Objects for persistent state management. Includes built-in support for entities like users and chats with transactional indexes.

## Description

This template provides a complete development environment for building scalable web applications on Cloudflare's edge network. It combines a modern React + TypeScript frontend with a robust backend leveraging Durable Objects for stateful logic, all deployable in seconds.

## Key Features

- Responsive React UI with Tailwind CSS and shadcn/ui components
- Full-stack TypeScript with shared types between client and worker
- Durable Objects for entity management (Users, ChatBoards) with automatic seeding and indexing
- RESTful API using Hono with CORS, logging, and error handling
- Theme toggle with system preference detection
- Client-side error reporting and comprehensive boundaries
- Optimistic updates and React Query for data fetching
- Ready-to-use chat and user demo with message persistence

## Technology Stack

- **Frontend**: React 18, Vite, TypeScript, Tailwind CSS, shadcn/ui, TanStack React Query, React Router
- **Backend**: Cloudflare Workers, Hono, Durable Objects
- **Tooling**: Bun, ESLint, PostCSS, Wrangler
- **UI/UX**: Lucide icons, Sonner toasts, Immer for state

## Prerequisites

- Bun (v1.0+)
- Cloudflare account (for deployment)

## Installation

Clone the repository and install dependencies using Bun:

```bash
bun install
```

## Development

Start the local development server:

```bash
bun dev
```

The application runs at `http://localhost:3000` (or the port specified by `$PORT`).

Build for production:

```bash
bun run build
```

## Usage

The app includes a live demo homepage with interactive elements. API endpoints are available under `/api`:

- `GET /api/users` - List users
- `POST /api/users` - Create user
- `GET /api/chats` - List chats
- `POST /api/chats` - Create chat
- `GET /api/chats/:chatId/messages` - List messages
- `POST /api/chats/:chatId/messages` - Send message

Extend functionality by modifying `worker/user-routes.ts` for new endpoints or `worker/entities.ts` for additional Durable Object entities.

## Deployment

Deploy to Cloudflare Workers with a single command:

```bash
bun run deploy
```

[cloudflarebutton]

After deployment, the Worker handles both the React frontend and API routes automatically via `wrangler.jsonc` asset configuration.

## License

MIT License. See LICENSE for details.