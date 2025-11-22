# CLAUDE.md - Daily Pickup Log

## Project Overview

A single-page web application for tracking daily pickup operations in logistics/transportation. The app manages pickup scheduling, completion tracking, BOL (Bill of Lading) file uploads, and archiving for NJ3 transportation and customer service operations at Staci Americas.

## Architecture

### Single-File Application
- **`index.html`** - The entire application: HTML structure, CSS (Tailwind), and JavaScript (~770 lines)
- No build process, bundler, or external dependencies to install
- Uses Tailwind CSS via CDN (`https://cdn.tailwindcss.com`)

### Backend Integration
- **Google Apps Script** - Serves as the serverless backend via `CONFIG.SCRIPT_URL`
- **Google Sheets** - Primary data storage (spreadsheet ID in `CONFIG.SPREADSHEET_ID`)
- **Google Drive** - BOL file storage (linked via Apps Script)

## Key Components

### Configuration (`CONFIG` object, line 19)
```javascript
{
  SCRIPT_URL: 'https://script.google.com/macros/s/...',
  SPREADSHEET_ID: '...',
  SHEET_NAME: 'Sheet1',
  AUTO_ARCHIVE_DAYS: 30,
  ADMINS: ['Roberto', 'Admin', 'Kafuti Lupasa', 'Norma Sandoval', 'Norma Hernandez']
}
```

### Data Lists
- **`CLIENTS`** (line 29) - Dropdown list of client companies (14 clients)
- **`CARRIERS`** (line 47) - Dropdown list of freight carriers (16 carriers)

### Core Classes

#### `GoogleSheetsDB` (line 68)
API wrapper for Google Apps Script backend. Methods:
- `getAllEntries()` / `getArchivedEntries()` - Fetch data
- `addEntry(entry)` / `updateEntryById(id, entry)` / `deleteEntryById(id)` - CRUD
- `archiveCompleted()` / `autoArchiveOld(days)` - Archiving
- `uploadBOL(id, fileName, fileData, mimeType)` - File uploads
- `getBOLFolderUrl()` - Get Drive folder link

#### `PickupLogApp` (line 113)
Main application class managing:
- **State Management** - User session, entries, filtering, modals, update tracking
- **UI Rendering** - `render()`, `renderArchive()`, form modals
- **Event Handling** - Table interactions, file uploads
- **Access Control** - `isAdmin()` method for admin-only features

Key methods:
- `init()` (line 166) - Initializes app, loads data, sets up auto-refresh
- `load()` (line 177) - Fetches entries and computes stats
- `updateField(id, field, value)` (line 240) - Handles inline checkbox updates with optimistic UI
- `bindTableEvents()` (line 391) - Event delegation for table interactions
- `render()` (line 422) - Main render method
- `addModal()` / `editModal()` (lines 603, 673) - Form modal templates

### Entry Data Model
```javascript
{
  id,                // Unique identifier
  date,              // Entry date (YYYY-MM-DD)
  client,            // Client name (from CLIENTS dropdown)
  shipTo,            // Destination
  order,             // Order number
  pallets,           // Number of pallets
  carrier,           // Carrier name (from CARRIERS dropdown)
  pickupNum,         // Pickup number
  scheduledDate,     // Scheduled pickup date
  bolProvided,       // Boolean - BOL provided
  printedByOps,      // Boolean - Printed by operations
  pickupComplete,    // Boolean - Pickup completed
  completedDate,     // Auto-filled when pickupComplete is checked
  qualityCheck,      // Boolean - Quality check passed
  comments,          // Free text comments
  createdBy,         // User who created the entry
  bolFile,           // Google Drive URL to uploaded BOL
  bolFileName,       // Original filename of BOL
  completedBy,       // User and timestamp who marked complete
  printedBy          // User and timestamp who marked printed
}
```

## User Authentication

- Users must provide name AND email to access the app
- Email must end with `@staciamericas.com` (validated on line 318)
- Credentials stored in localStorage (`pickupLogUser`, `pickupLogEmail`)
- Logout option available in the header

### Admin Users
Admin users (defined in `CONFIG.ADMINS`, line 25) have additional privileges:
- Can delete entries (non-admins only see edit button)
- Admin check is case-insensitive

## Development Workflow

### Making Changes
1. Edit `index.html` directly - all code is in this single file
2. Test by opening the file in a browser or using a local server
3. Changes sync with Google Sheets backend automatically

### No Build Required
- No `npm install`, no compilation, no bundling
- Simply edit and deploy

### Deployment
The app is designed to be hosted as a static HTML file (e.g., GitHub Pages).

## Code Conventions

### JavaScript Style
- ES6+ syntax (classes, async/await, arrow functions, template literals)
- Inline event handlers in HTML templates (`onclick`, `onchange`)
- Single global `app` instance (`window.app`)
- Optimistic UI updates with update tracking (via `state.updating` Set)

### CSS
- Tailwind utility classes throughout
- Custom `@keyframes` for loading spinner only (line 10)
- Responsive grid layouts (`grid-cols-2`, `md:grid-cols-4`)

### HTML Templates
- Template literals for dynamic rendering
- Event delegation for table interactions (`bindTableEvents()`)
- Checkboxes disabled during pending updates

### Date Handling
- Internal storage: `YYYY-MM-DD` format
- Display format: `MM-DD-YYYY` (via `formatDate()`)
- Input conversion: `toInputDate()` ensures HTML date inputs work correctly

## Important Notes for AI Assistants

### DO NOT modify:
- `CONFIG.SCRIPT_URL` - Connected to production Google Apps Script
- `CONFIG.SPREADSHEET_ID` - Production data source
- `CONFIG.ADMINS` - Access control list (modify only if explicitly requested)
- Client/Carrier lists without explicit user request

### When adding features:
- Keep everything in `index.html` - do not split into separate files
- Use Tailwind classes for styling
- Follow existing patterns for state management and rendering
- Maintain optimistic UI updates (update local state, then sync to backend)
- Use the `updating` Set pattern to prevent duplicate requests

### Testing considerations:
- No test framework exists
- Manual browser testing required
- Backend changes require editing the Google Apps Script separately
- Test with both admin and non-admin users

## File Structure

```
daily-pick-log/
├── index.html    # Complete application (HTML + CSS + JS)
├── README.md     # Basic project description
└── CLAUDE.md     # This file
```

## Common Tasks

### Add a new client
Add to the `CLIENTS` array (line 29):
```javascript
const CLIENTS = [
  'Existing Client',
  'New Client Name',  // Add here alphabetically
  'Other'             // Keep 'Other' last
];
```

### Add a new carrier
Add to the `CARRIERS` array (line 47):
```javascript
const CARRIERS = [
  'Existing Carrier',
  'New Carrier Name',  // Add here alphabetically
  'Other(note in comments)'  // Keep 'Other' last
];
```

### Add a new admin user
Add to the `CONFIG.ADMINS` array (line 25):
```javascript
ADMINS: ['Roberto', 'Admin', 'New Admin Name']
```

### Add a new entry field
1. Add to `emptyForm()` method (line 141)
2. Add to table header in `render()` (line 519)
3. Add to table row template (line 448)
4. Add to `addModal()` (line 603) and `editModal()` (line 673) methods
5. Update Google Apps Script backend to handle new field

### Modify auto-archive behavior
Change `CONFIG.AUTO_ARCHIVE_DAYS` (default: 30 days)

## Current Features

- **User Authentication**: Name + email login with domain validation
- **CRUD Operations**: Create, read, update entries (delete admin-only)
- **Real-time Sync**: Auto-refresh every 3 minutes (180000ms)
- **Search & Filter**: By client, ship-to, order, carrier, pickup number
- **Status Tracking**: Pending, completed, issues (QC failed)
- **BOL File Upload**: PDF, PNG, JPG support (max 5MB)
- **Archiving**: Manual archive of completed + auto-archive after 30 days
- **Audit Trail**: Tracks who completed/printed pickups with timestamps

## API Endpoints (Google Apps Script)

The backend expects these actions via GET/POST:
- `GET ?action=getAllEntries` - Fetch active entries
- `GET ?action=getArchivedEntries` - Fetch archived entries
- `GET ?action=getBOLFolderUrl` - Get Drive folder URL
- `POST {action: 'addEntry', entry}` - Create new entry
- `POST {action: 'updateEntryById', id, entry}` - Update entry
- `POST {action: 'deleteEntryById', id}` - Delete entry
- `POST {action: 'archiveCompleted'}` - Archive all completed
- `POST {action: 'autoArchiveOld', days}` - Archive entries older than N days
- `POST {action: 'uploadBOL', id, fileName, fileData, mimeType}` - Upload BOL file
