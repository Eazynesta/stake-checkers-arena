# Checkers Arena - Technical Documentation

## Table of Contents
1. [Project Overview](#project-overview)
2. [Architecture](#architecture)
3. [Technology Stack](#technology-stack)
4. [Database Schema](#database-schema)
5. [Authentication System](#authentication-system)
6. [Real-time Features](#real-time-features)
7. [Payment Integration](#payment-integration)
8. [Game Logic](#game-logic)
9. [Frontend Components](#frontend-components)
10. [Backend Functions](#backend-functions)
11. [Security Considerations](#security-considerations)
12. [Deployment & Configuration](#deployment--configuration)
13. [API Reference](#api-reference)
14. [Development Guidelines](#development-guidelines)
15. [Monitoring & Analytics](#monitoring--analytics)

## Project Overview

Checkers Arena is a real-time online checkers gaming platform with integrated M-Pesa payment system. The platform allows users to play checkers for real money stakes, featuring timed games (2-minute turns), live presence tracking, and instant payouts.

### Key Features
- **Real-time multiplayer checkers** with 2-minute turn timers
- **M-Pesa integration** for deposits and withdrawals
- **Live presence tracking** and player invitations
- **Administrative dashboard** for platform management
- **Responsive design** with dark/light theme support
- **Secure authentication** with password reset functionality
- **Leaderboards** and player statistics

## Architecture

### High-Level Architecture
```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   React Client  │◄──►│  Supabase API   │◄──►│   PostgreSQL    │
│   (Frontend)    │    │   (Backend)     │    │   (Database)    │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                       │                       │
         └───────────────────────┼───────────────────────┘
                                 │
                    ┌─────────────────┐
                    │  Edge Functions │
                    │  (M-Pesa API)   │
                    └─────────────────┘
```

### System Components
1. **Frontend (React/TypeScript)** - Single Page Application
2. **Backend (Supabase)** - Database, Authentication, Real-time
3. **Edge Functions (Deno)** - Payment processing and external API integrations
4. **M-Pesa Integration** - Payment gateway for deposits/withdrawals

## Technology Stack

### Frontend
- **React 18.3.1** - UI framework
- **TypeScript** - Type safety
- **Vite** - Build tool and development server
- **Tailwind CSS** - Styling framework
- **shadcn/ui** - Component library
- **React Router Dom** - Client-side routing
- **TanStack Query** - Data fetching and caching
- **Sonner** - Toast notifications

### Backend
- **Supabase** - Backend-as-a-Service
- **PostgreSQL** - Primary database
- **Row Level Security (RLS)** - Data access control
- **Real-time subscriptions** - Live updates
- **Edge Functions (Deno)** - Serverless functions

### External Integrations
- **Safaricom Daraja API** - M-Pesa payment processing
- **Supabase Auth** - User authentication

## Database Schema

### Core Tables

#### `profiles` Table
```sql
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY DEFAULT auth.uid(),
  username text,
  phone_number text,
  balance numeric(12,2) DEFAULT 0 NOT NULL,
  games_won integer DEFAULT 0 NOT NULL,
  games_lost integer DEFAULT 0 NOT NULL,
  earnings numeric(12,2) DEFAULT 0 NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);
```

#### `mpesa_transactions` Table
```sql
CREATE TABLE public.mpesa_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  transaction_type text NOT NULL, -- 'deposit' | 'withdrawal'
  amount numeric(12,2) NOT NULL,
  phone_number text NOT NULL,
  status text DEFAULT 'pending' NOT NULL, -- 'pending' | 'success' | 'failed' | 'cancelled'
  checkout_request_id text,
  merchant_request_id text,
  conversation_id text,
  originator_conversation_id text,
  mpesa_receipt_number text,
  error_message text,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);
```

#### `company_account` Table
```sql
CREATE TABLE public.company_account (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  balance numeric(15,2) DEFAULT 0 NOT NULL,
  total_deposits numeric(15,2) DEFAULT 0 NOT NULL,
  total_withdrawals numeric(15,2) DEFAULT 0 NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);
```

#### `company_earnings` Table
```sql
CREATE TABLE public.company_earnings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  amount numeric(12,2) NOT NULL,
  source_game text,
  created_at timestamptz DEFAULT now() NOT NULL
);
```

#### `user_roles` Table
```sql
CREATE TABLE public.user_roles (
  user_id uuid NOT NULL,
  role text DEFAULT 'user' NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);
```

### Database Functions

#### Financial Operations
- `credit_balance(amount)` - Credit user balance
- `debit_balance(amount)` - Debit user balance (with validation)
- `process_mpesa_deposit_by_checkout(checkout_id, receipt_number)` - Process M-Pesa deposit
- `process_mpesa_withdrawal(user_id, amount, phone)` - Process M-Pesa withdrawal
- `rollback_mpesa_withdrawal(tx_id)` - Rollback failed withdrawal

#### Statistics and Analytics
- `increment_stat(result, stake)` - Update player win/loss statistics
- `get_top_players(limit_count)` - Retrieve leaderboard data
- `get_earnings_summary()` - Get company earnings summary
- `get_total_users()` - Get total user count
- `get_total_auth_users()` - Get authenticated user count

#### Administrative
- `is_admin()` - Check if current user has admin role
- `record_company_earning(amount, source_game)` - Record company earnings

### Row Level Security (RLS) Policies

#### `profiles` Table
- Users can only view, insert, update, and delete their own profiles
- Admin users have full access

#### `mpesa_transactions` Table
- Users can view and insert their own transactions
- Admin users can view and update all transactions
- Users and admins can update their own transactions

#### `company_account` Table
- Only admin users can view company account
- System functions can update the account

## Authentication System

### Implementation Details
- **Supabase Auth** - Email/password authentication
- **Session Management** - Automatic token refresh
- **Password Reset** - Email-based password recovery
- **Protected Routes** - Authentication required for app access

### Auth Flow
1. User submits credentials via `/auth` page
2. Supabase validates and creates session
3. Session stored in localStorage with auto-refresh
4. `onAuthStateChange` listener updates app state
5. Protected routes redirect unauthenticated users

### Code Example
```typescript
const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
  setSession(session);
  if (session) {
    navigate("/lobby", { replace: true });
  }
});
```

## Real-time Features

### Presence Tracking
- **Lobby Presence** - Track online users in lobby
- **Game Presence** - Track players in specific games
- **Real-time Invitations** - Live invite system

### Game Synchronization
- **Move Broadcasting** - Real-time move updates
- **Timer Synchronization** - Synchronized game clocks
- **Game State Management** - Consistent board state across clients

### Implementation
```typescript
const channel = supabase.channel(`game-${gameId}`, {
  config: { 
    presence: { key: userId },
    broadcast: { self: false, ack: true }
  }
});

channel
  .on("presence", { event: "sync" }, handlePresenceSync)
  .on("broadcast", { event: "move" }, handleMoveUpdate)
  .subscribe();
```

## Payment Integration

### M-Pesa Integration Architecture
```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Frontend      │───►│  Edge Function  │───►│  Daraja API     │
│   (Deposit)     │    │  (mpesa-stk)    │    │  (Safaricom)    │
└─────────────────┘    └─────────────────┘    └─────────────────┘
                                │                       │
                                ▼                       ▼
                    ┌─────────────────┐    ┌─────────────────┐
                    │   Database      │    │   Callback      │
                    │   Transaction   │◄───│   Handler       │
                    └─────────────────┘    └─────────────────┘
```

### Edge Functions

#### `mpesa-stk-push` - Deposit Processing
- Validates user authentication
- Creates transaction record
- Initiates STK push via Daraja API
- Handles success/failure responses

#### `mpesa-callback` - Deposit Completion
- Receives M-Pesa payment callbacks
- Processes successful payments
- Updates transaction status
- Credits user balance

#### `mpesa-b2c` - Withdrawal Processing
- Validates withdrawal request
- Debits user account immediately
- Initiates B2C payment
- Handles rollback on failure

#### `mpesa-b2c-result` - Withdrawal Completion
- Processes withdrawal results
- Handles successful/failed withdrawals
- Updates transaction status

#### `mpesa-b2c-timeout` - Withdrawal Timeout
- Handles timeout scenarios
- Rolls back failed withdrawals

### Payment Flow

#### Deposit Flow
1. User initiates deposit via Dashboard
2. `mpesa-stk-push` function creates transaction
3. STK push sent to user's phone
4. User completes payment on phone
5. `mpesa-callback` receives confirmation
6. User balance updated automatically

#### Withdrawal Flow
1. User initiates withdrawal via Dashboard
2. `mpesa-b2c` function debits account
3. B2C payment request sent to Daraja
4. `mpesa-b2c-result` receives confirmation
5. Money sent to user's M-Pesa account

## Game Logic

### Game Rules Implementation
- **Standard Checkers Rules** - International rules
- **King Pieces** - Promotion at opposite end
- **Capture Logic** - Mandatory captures (simplified)
- **Win Conditions** - No pieces left or no valid moves

### Game State Management
```typescript
type Color = "black" | "red";
type Cell = { color: Color; king?: boolean } | null;
type Board = Cell[][]; // 8x8 grid

interface GameState {
  board: Board;
  turn: Color;
  clocks: { black: number; red: number };
  gameOver: string | null;
}
```

### Timer System
- **2-minute turns** - Each player gets 120 seconds per move
- **Host-based timing** - Player[0] manages the clock
- **Automatic timeout** - Game ends when time expires
- **Clock synchronization** - All clients receive timer updates

### Move Validation
```typescript
const tryMove = (fromRow: number, fromCol: number, toRow: number, toCol: number) => {
  // Validate piece ownership
  // Check move legality (diagonal, distance)
  // Handle captures
  // Promote to king if reaching end
  // Switch turns
  // Broadcast move to all clients
};
```

## Frontend Components

### Page Components

#### `Landing.tsx` - Landing Page
- Hero section with Spotify-inspired design
- Feature grid highlighting platform benefits
- Call-to-action buttons for registration
- SEO optimized with meta tags

#### `Auth.tsx` - Authentication Page
- Login/signup tabs interface
- Password reset functionality
- Form validation and error handling
- Automatic redirect on successful auth

#### `GameRoom.tsx` - Game Interface
- 8x8 checkers board with piece rendering
- Real-time player presence tracking
- Move validation and broadcasting
- Timer display and game status
- Responsive design for mobile/desktop

#### `Dashboard.tsx` - User Dashboard
- Profile management (username, phone)
- M-Pesa wallet integration
- Game statistics display
- Balance management

#### `Admin.tsx` - Administrative Panel
- User management
- Financial analytics
- Company earnings tracking
- System statistics

### Layout Components

#### `AppLayout.tsx` - Application Shell
- Sidebar navigation with collapsible design
- User session management
- Real-time invite notifications
- Admin role detection

#### `Lobby.tsx` - Game Lobby
- Online player list with presence
- Game invitation system
- Stake amount configuration
- Leaderboard display

### UI Components (shadcn/ui)
- **Forms** - Input, Label, Button components
- **Navigation** - Sidebar, Tabs, Navigation Menu
- **Feedback** - Toast, Alert, Progress components
- **Layout** - Card, Separator, Sheet components
- **Data Display** - Table, Badge, Avatar components

## Backend Functions

### Supabase Edge Functions

All edge functions are written in TypeScript for Deno runtime and include:
- CORS headers for web compatibility
- Authentication validation
- Error handling and logging
- Structured JSON responses

### Function Deployment
Edge functions are automatically deployed when code is pushed to the repository. Configuration is managed via `supabase/config.toml`:

```toml
project_id = "xznqsklwrodetxxvrcoc"

[functions.mpesa-stk-push]
verify_jwt = true

[functions.mpesa-callback]
verify_jwt = false

[functions.mpesa-b2c]
verify_jwt = true

[functions.mpesa-b2c-result]
verify_jwt = false

[functions.mpesa-b2c-timeout]
verify_jwt = false
```

## Security Considerations

### Authentication Security
- **JWT Token Validation** - All protected endpoints verify tokens
- **Session Persistence** - Secure localStorage with auto-refresh
- **Password Requirements** - Minimum 6 characters enforced
- **Email Verification** - Optional but recommended

### Database Security
- **Row Level Security (RLS)** - All tables have appropriate policies
- **User Isolation** - Users can only access their own data
- **Admin Verification** - Admin-only functions check `is_admin()`
- **Input Validation** - All user inputs validated and sanitized

### Payment Security
- **Immediate Debit** - Withdrawals debit before M-Pesa call
- **Transaction Rollback** - Failed payments are automatically reversed
- **Idempotent Operations** - Prevent duplicate payments
- **Secure Credentials** - API keys stored in Supabase secrets

### API Security
- **CORS Configuration** - Proper cross-origin resource sharing
- **Rate Limiting** - Built-in Supabase rate limits
- **Error Handling** - No sensitive data in error messages
- **Audit Logging** - All transactions logged for audit

## Deployment & Configuration

### Environment Setup
- **Development** - Vite dev server with hot reload
- **Production** - Static build deployed to Lovable platform
- **Supabase** - Managed backend with auto-scaling

### Required Secrets (Supabase)
```
DARAJA_CONSUMER_KEY - M-Pesa API consumer key
DARAJA_CONSUMER_SECRET - M-Pesa API consumer secret
DARAJA_SHORTCODE - M-Pesa business shortcode
DARAJA_PASSKEY - M-Pesa passkey for authentication
SUPABASE_URL - Supabase project URL
SUPABASE_SERVICE_ROLE_KEY - Service role key
SUPABASE_PUBLISHABLE_KEY - Public anon key
SUPABASE_ANON_KEY - Anonymous access key
SUPABASE_DB_URL - Database connection URL
```

### Build Configuration

#### `vite.config.ts`
```typescript
export default defineConfig({
  server: { host: "::", port: 8080 },
  plugins: [react(), componentTagger()],
  resolve: { alias: { "@": path.resolve(__dirname, "./src") } }
});
```

#### `tailwind.config.ts`
- Custom color system with HSL values
- Dark/light theme support
- Responsive breakpoints
- Animation utilities

## API Reference

### Supabase Client Usage
```typescript
import { supabase } from "@/integrations/supabase/client";

// Authentication
await supabase.auth.signInWithPassword({ email, password });
await supabase.auth.signUp({ email, password });
await supabase.auth.signOut();

// Database Operations
const { data, error } = await supabase
  .from('profiles')
  .select('*')
  .eq('id', userId);

// Real-time Subscriptions
const channel = supabase.channel('lobby')
  .on('presence', { event: 'sync' }, callback)
  .subscribe();

// Function Calls
const { data, error } = await supabase.functions.invoke('mpesa-stk-push', {
  body: { amount: 100, phone_number: '254700000000' }
});
```

### Database RPC Functions
```typescript
// Credit user balance
await supabase.rpc('credit_balance', { amount: 100 });

// Get leaderboard
const { data } = await supabase.rpc('get_top_players', { limit_count: 10 });

// Process withdrawal
const { data } = await supabase.rpc('process_mpesa_withdrawal', {
  user_id_param: userId,
  amount_param: 50,
  phone_param: '254700000000'
});
```

## Development Guidelines

### Code Organization
```
src/
├── components/           # Reusable UI components
│   ├── ui/              # shadcn/ui components
│   ├── layout/          # Layout components
│   └── lobby/           # Lobby-specific components
├── pages/               # Page components
├── hooks/               # Custom React hooks
├── lib/                 # Utility functions
├── assets/              # Static assets
└── integrations/        # External service integrations
    └── supabase/        # Supabase client and types
```

### Styling Guidelines
- **Design System** - Use semantic tokens from `index.css`
- **HSL Colors** - All colors must be HSL format
- **Responsive Design** - Mobile-first approach
- **Dark Theme** - Support for dark/light themes
- **Component Variants** - Use shadcn/ui variant system

### Development Best Practices
- **TypeScript** - Strict type checking enabled
- **Component Composition** - Prefer composition over inheritance
- **Error Boundaries** - Proper error handling throughout
- **Performance** - Lazy loading for heavy components
- **Accessibility** - ARIA labels and keyboard navigation

### Testing Strategy
- **Unit Tests** - Critical business logic
- **Integration Tests** - API endpoints and database functions
- **E2E Tests** - Core user journeys
- **Manual Testing** - Payment flows and real-time features

## Monitoring & Analytics

### Application Monitoring
- **Supabase Dashboard** - Database performance and usage
- **Edge Function Logs** - Payment processing monitoring
- **Real-time Metrics** - Connection and presence tracking
- **Error Tracking** - Client-side error reporting

### Business Analytics
- **User Metrics** - Registration, retention, activity
- **Game Analytics** - Matches played, completion rate
- **Financial Metrics** - Revenue, deposits, withdrawals
- **Performance KPIs** - Response times, success rates

### Audit Trail
- **Transaction Logs** - All financial transactions logged
- **User Actions** - Game moves and outcomes tracked
- **Admin Activities** - Administrative actions audited
- **Security Events** - Authentication and authorization events

---

## Conclusion

This documentation provides a comprehensive overview of the Checkers Arena platform's technical implementation. The system is designed for scalability, security, and real-time performance, leveraging modern web technologies and robust backend services.

For additional technical details or implementation questions, refer to the source code and inline documentation throughout the project.

**Last Updated:** January 2025  
**Version:** 1.0  
**Author:** Development Team