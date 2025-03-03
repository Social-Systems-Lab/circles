# Circles Repository Guide

## Build/Lint/Test Commands
- Development: `bun run dev` or `bun run dev:turbo` 
- Build: `bun run build`
- Start: `bun run start`
- Lint: `bun run lint`

## Development Environment
- Assume a local version is already running with hot reload enabled
- Local server: http://localhost:3000
- You don't need to start the development server

## Package Management
- Uses Bun as package manager: `bun install` for dependencies

## Code Style
- **Formatting**: Tab width = 4, Print width = 120 (see .prettierrc)
- **Types**: Use TypeScript with strict mode enabled. Define types with zod when possible
- **Imports**: Group imports by source (React/Next, local components, models, lib)
- **Path Aliases**: Use `@/` for src/, `@app/` for src/app/, `@images/` for public/images/
- **Component Structure**: React FC with explicit typing, functional components with hooks
- **State Management**: Use jotai for global state with atoms
- **Error Handling**: Log errors to console, display user-friendly messages via toast
- **File Naming**: Kebab-case for files, PascalCase for components, camelCase for variables
- **Form Handling**: Use react-hook-form with zod validation schemas
- **Components**: Prefer small, reusable components with clear props interfaces

## Project Structure
- Components are organized by functionality in `/src/components/`
- Pages and routes in `/src/app/` (Next.js App Router)
- Models and type definitions in `/src/models/`
- Utilities and helpers in `/src/lib/`