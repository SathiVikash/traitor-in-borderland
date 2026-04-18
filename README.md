# Traitor in Borderland - Treasure Hunt Game

A real-time, multiplayer treasure hunt game system with innocents and traitors, built for 20 teams with 4 members each.

## 🎮 Game Overview

- **20 Teams** with 4 members each
- **Two Roles**: Innocents and Traitors
- **4 Rounds** of treasure hunting
- **QR Code Based** gold bar collection
- **Real-time Leaderboard** updates
- **Sabotage Mechanics** for traitors
- **VIT Email Authentication** required

## 🏗️ Architecture

### Backend
- **Node.js** with Express
- **PostgreSQL** database (Supabase)
- **Socket.IO** for real-time updates
- **Firebase Admin** for authentication
- **QR Code generation** with qrcode library

### Frontend
- **Next.js 16** with TypeScript
- **Material-UI** for components
- **Firebase Auth** for login
- **Socket.IO Client** for real-time updates
- **html5-qrcode** for scanning

## 📋 Requirements Implemented

### Master Admin Features
✅ Create gold bars with points, locations, and QR codes
✅ Generate clues for gold bars (random assignment)
✅ Set number of rounds and duration
✅ Create team leads
✅ View real-time leaderboard
✅ See teams by type (innocents/traitors)
✅ Reset entire game
✅ Start each round manually
✅ Set sabotage durations
✅ Download all QR codes
✅ Separate QR codes for innocent/traitor groups

### Team Lead Features
✅ Scan QR card to reveal team type
✅ Enter team name and get unique team code
✅ Generate team QR code for members to join
✅ View team members
✅ Scan gold bar QR codes

### Team Member Features
✅ Scan QR or enter team code to join
✅ Reveal team type after joining
✅ Scan gold bar QR codes

### Traitor Features
✅ View list of innocent teams
✅ Sabotage innocents (prevent scoring)
✅ Sabotage cooldowns enforced
✅ Cannot sabotage same person consecutively
✅ Timed sabotage restrictions

### Game Mechanics
✅ Timer controlled by master admin
✅ Unique clues for each team
✅ Score added on gold bar scan
✅ Next clue shown after scan
✅ Hidden scores (revealed on leaderboard)
✅ Real-time updates (no refresh needed)
✅ Real-time leaderboard reordering
✅ VIT email authentication
✅ Scalable for 100+ concurrent users

## 🚀 Setup Instructions

### Prerequisites
- Node.js 18+ installed
- PostgreSQL database (Supabase account)
- Firebase project created

### 1. Backend Setup

```bash
cd backend

# Install dependencies
npm install

# Configure environment variables
# Edit .env file with your credentials:
PORT=5000
DATABASE_URL=your_postgresql_connection_string
FRONTEND_URL=http://localhost:3000

# Initialize database
node init-db.js

# Start server
npm start
```

### 2. Frontend Setup

```bash
cd frontend

# Install dependencies
npm install

# Configure environment variables
# Edit .env.local file:
NEXT_PUBLIC_API_URL=http://localhost:5000
NEXT_PUBLIC_SOCKET_URL=http://localhost:5000
NEXT_PUBLIC_FIREBASE_API_KEY=your_firebase_api_key
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your_firebase_auth_domain
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your_firebase_project_id

# Start development server
npm run dev
```

### 3. Firebase Setup

1. Create a Firebase project
2. Enable Email/Password authentication
3. Download service account key and place in `backend/` directory
4. Update `backend/config/firebase.js` with correct path

### 4. Database Setup

The database schema includes:
- **users**: Authentication and roles
- **teams**: Team information
- **team_members**: Team membership
- **locations**: Physical locations for gold bars
- **gold_bars**: QR codes, points, clues
- **game_state**: Round info, timers, settings
- **sabotages**: Traitor sabotage tracking
- **team_clues**: Current clue for each team
- **scans_history**: Audit trail of all scans

## 🎯 Game Flow

### 1. Pre-Game Setup (Master Admin)
1. Create locations
2. Create gold bars with points and clues
3. Create team leads
4. Generate 20 assignment cards (innocent/traitor split)
5. Configure game settings (rounds, durations, sabotage timings)

### 2. Team Formation
1. Team leads scan assignment cards → reveal team type
2. Team leads enter team name → get team code + QR
3. Members scan team QR or enter code → join team
4. Members see their team type after joining

### 3. Game Play
1. Master admin starts round → timer begins
2. Each team sees their first clue
3. Teams find gold bars and scan QR codes
4. If innocent is sabotaged → no points earned
5. After scan → next clue appears
6. Traitors can sabotage innocents (with cooldowns)

### 4. Scoring
- Points added to team score on successful scan
- Sabotaged scans give 0 points
- Leaderboard updates in real-time
- Scores hidden from players (shown on leaderboard only)

### 5. End of Round
- Timer expires → alarm triggered
- Master admin shows leaderboard
- Teams that didn't collect 4 gold bars → physical task
- Master admin starts next round

### 6. Game End
- After 4 rounds → final leaderboard
- Team with most points wins

## 🔒 Security Features

- Firebase authentication with VIT email domain restriction
- Backend verification of all tokens
- Role-based access control (master_admin, team_lead, member)
- Database-level user registration check
- Secure QR code generation (UUID-based)

## ⚡ Real-Time Features

All updates happen instantly via Socket.IO:
- Leaderboard changes
- Score updates
- Sabotage notifications
- Round start/end
- Game state changes

## 📱 API Endpoints

### Authentication
- `POST /api/auth/verify` - Verify Firebase token
- `POST /api/auth/register-member` - Register new member

### Admin (Master Admin Only)
- `POST /api/admin/locations` - Create location
- `GET /api/admin/locations` - Get all locations
- `POST /api/admin/gold-bars` - Create gold bar
- `GET /api/admin/gold-bars` - Get all gold bars
- `GET /api/admin/gold-bars/:id/qr` - Get QR code image
- `POST /api/admin/team-leads` - Create team lead
- `GET /api/admin/team-leads` - Get all team leads
- `POST /api/admin/generate-cards` - Generate assignment cards
- `GET /api/admin/leaderboard` - Get leaderboard
- `GET /api/admin/teams/by-type` - Get teams by type
- `PUT /api/admin/game-settings` - Update game settings
- `GET /api/admin/game-settings` - Get game settings
- `POST /api/admin/start-round` - Start new round
- `POST /api/admin/reset-game` - Reset entire game

### Team
- `POST /api/team/scan-assignment` - Scan assignment card
- `POST /api/team/create` - Create team
- `POST /api/team/join` - Join team
- `GET /api/team/my-team` - Get my team info
- `GET /api/team/current-clue` - Get current clue
- `POST /api/team/scan-gold-bar` - Scan gold bar
- `GET /api/team/members` - Get team members

### Game
- `GET /api/game/state` - Get game state
- `GET /api/game/leaderboard` - Get leaderboard
- `POST /api/game/sabotage` - Sabotage a team (traitors only)
- `GET /api/game/innocent-teams` - Get innocent teams (traitors only)
- `GET /api/game/sabotage-status` - Check if sabotaged
- `GET /api/game/sabotage-cooldown` - Get sabotage cooldown

## 🎨 Frontend Pages (To Be Built)

- `/login` - Firebase authentication
- `/admin` - Master admin dashboard
- `/team-lead` - Team lead interface
- `/member` - Team member interface
- `/traitor` - Traitor sabotage interface
- `/spectator` - Live leaderboard view

## 🐛 Troubleshooting

### Database Connection Issues
- Check DATABASE_URL in .env
- Ensure Supabase database is running
- Verify SSL settings

### Firebase Authentication Issues
- Check Firebase config in .env.local
- Verify service account key path
- Ensure email domain restriction is set

### Socket.IO Connection Issues
- Check NEXT_PUBLIC_SOCKET_URL
- Verify CORS settings in server.js
- Check firewall/network settings

## 📝 Default Master Admin

Email: `admin@vit.ac.in`

You can change this in `backend/init-db.js` before running the initialization.

## 🔄 Game Reset

To reset the game completely:
1. Use the admin dashboard reset button, OR
2. Call `POST /api/admin/reset-game` endpoint

This will:
- Reset all gold bars to unscanned
- Clear all team scores
- Clear all clues
- Clear all sabotages
- Reset game state to round 0

## 📊 Database Indexes

Optimized indexes for performance:
- Team codes (for quick lookups)
- QR codes (for fast scanning)
- Team memberships (for team queries)
- Active sabotages (for real-time checks)
- Scan history (for analytics)

## 🚀 Production Deployment

### Backend
- Deploy to Heroku, Railway, or similar
- Set environment variables
- Ensure DATABASE_URL points to production DB
- Update FRONTEND_URL to production domain

### Frontend
- Deploy to Vercel (recommended for Next.js)
- Set all NEXT_PUBLIC_* environment variables
- Update API_URL to production backend

## 📄 License

This project is built for Health Club - VIT by Kamaleshwar S.

## 🤝 Support

For issues or questions, contact the development team.
