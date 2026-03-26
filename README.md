# Clavis

An adaptive learning platform for students with gamified practice sessions, parental monitoring, and admin curriculum management.

## Features

**Students**
- Practice questions across a structured curriculum (grade level > subject > topic > sub-topic)
- Track progress and review past sessions
- Earn rewards through gamification: virtual pets, gacha, collections, and leaderboard rankings

**Parents**
- Link to children and monitor their learning progress
- View detailed practice session results and statistics
- Manage subscriptions

**Admins**
- Manage curriculum hierarchy, question banks, and bulk uploads
- View analytics on question performance and student progress
- Administer pets, announcements, leaderboard, and subscriptions

## Tech Stack

- **Frontend:** Vue 3 (Composition API), TypeScript, TailwindCSS 4
- **UI Components:** shadcn-vue
- **Backend & Auth:** Supabase (PostgreSQL, Row Level Security, Edge Functions)
- **Payments:** Stripe

## Getting Started

```bash
# Install dependencies
pnpm install

# Start development server
pnpm dev

# Type-check and build for production
pnpm build
```

## License

All rights reserved.
