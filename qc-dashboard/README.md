# QC Dashboard - Quality Control Inspection System

A modern, multi-tenant Quality Control inspection management system built with Node.js, PostgreSQL (Neon), and vanilla JavaScript.

## Features

- **Multi-tenant Architecture** - Ready for SaaS deployment
- **Inspection Workflow** - Pending → In Progress → Pass/Fail → Resolved
- **Real-time Dashboard** - Live metrics and statistics
- **Defect Tracking** - Categorized defect types with dispositions
- **Client Management** - Track inspections by client
- **User Roles** - Admin, Manager, Inspector, Viewer

## Tech Stack

- **Backend**: Node.js + Express
- **Database**: PostgreSQL (Neon - serverless)
- **Frontend**: Vanilla HTML/CSS/JavaScript
- **Auth**: JWT tokens

## Quick Start

### 1. Create Neon Database

1. Go to [https://neon.tech](https://neon.tech)
2. Create a free account
3. Create a new project
4. Copy the connection string

### 2. Setup Database

Run the schema in your Neon SQL editor or via psql:

```bash
psql "YOUR_NEON_CONNECTION_STRING" -f schema.sql
```

### 3. Configure Environment

```bash
cp .env.example .env
```

Edit `.env` with your values:
```
DATABASE_URL=postgresql://user:pass@host.neon.tech/db?sslmode=require
JWT_SECRET=your-random-secret-key
PORT=3000
```

### 4. Install Dependencies

```bash
npm install
```

### 5. Start Server

```bash
# Development (with auto-reload)
npm run dev

# Production
npm start
```

### 6. Access Dashboard

Open [http://localhost:3000](http://localhost:3000)

**Demo Login:**
- Email: `admin@staciamericas.com`
- Password: `demo123`

## API Endpoints

### Authentication
- `POST /api/auth/login` - Login
- `GET /api/auth/verify` - Verify token

### Inspections
- `GET /api/inspections` - List inspections
- `GET /api/inspections/queue` - Get queue grouped by status
- `POST /api/inspections` - Create inspection
- `POST /api/inspections/:id/start` - Start inspection
- `POST /api/inspections/:id/complete` - Complete inspection
- `POST /api/inspections/:id/resolve` - Resolve inspection

### Dashboard
- `GET /api/dashboard` - Get dashboard metrics
- `GET /api/metrics/inspector` - Get inspector metrics

### Lookup Data
- `GET /api/clients` - List clients
- `GET /api/defect-types` - List defect types
- `GET /api/dispositions` - List dispositions
- `GET /api/inspectors` - List inspectors

### Reports
- `GET /api/reports/client-defects` - Client defect report

## Deployment

### Railway (Recommended)

1. Push code to GitHub
2. Connect Railway to your repo
3. Add environment variables
4. Deploy!

### Render

1. Create new Web Service
2. Connect GitHub repo
3. Set build command: `npm install`
4. Set start command: `npm start`
5. Add environment variables

### Vercel

1. Install Vercel CLI: `npm i -g vercel`
2. Run: `vercel`
3. Add environment variables in dashboard

## Project Structure

```
qc-dashboard/
├── public/
│   └── index.html      # Frontend dashboard
├── server.js           # Express API server
├── schema.sql          # PostgreSQL schema
├── package.json        # Dependencies
├── .env.example        # Environment template
└── README.md           # This file
```

## Customization

### Add New Defect Types

```sql
INSERT INTO defect_types (tenant_id, name, category, severity) VALUES
    ('your-tenant-id', 'New Defect', 'category', 'medium');
```

### Add New Clients

```sql
INSERT INTO clients (tenant_id, name, code) VALUES
    ('your-tenant-id', 'New Client', 'NC');
```

### Add New Users

```javascript
// Use bcrypt to hash password
const bcrypt = require('bcryptjs');
const hash = await bcrypt.hash('password123', 10);
// Insert into users table
```

## License

MIT

## Support

For issues and feature requests, please create an issue in this repository.
