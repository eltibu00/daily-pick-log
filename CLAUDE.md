# CLAUDE.md - Daily Pickup Log

## Project Overview

A single-page web application for tracking daily pickup operations in logistics/transportation. The app manages pickup scheduling, completion tracking, BOL (Bill of Lading) file uploads, and archiving for NJ3 transportation and customer service operations.

## Architecture

### Single-File Application
- **`index.html`** - The entire application: HTML structure, CSS (Tailwind), and JavaScript
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
  AUTO_ARCHIVE_DAYS: 30
}
```

### Data Lists
- **`CLIENTS`** (line 27) - Dropdown list of client companies
- **`CARRIERS`** (line 45) - Dropdown list of freight carriers

### Core Classes

#### `GoogleSheetsDB` (line 66)
API wrapper for Google Apps Script backend. Methods:
- `getAllEntries()` / `getArchivedEntries()` - Fetch data
- `addEntry(entry)` / `updateEntryById(id, entry)` / `deleteEntryById(id)` - CRUD
- `archiveCompleted()` / `autoArchiveOld(days)` - Archiving
- `uploadBOL(id, fileName, fileData, mimeType)` - File uploads
- `getBOLFolderUrl()` - Get Drive folder link

#### `PickupLogApp` (line 111)
Main application class managing:
- **State Management** - User session, entries, filtering, modals
- **UI Rendering** - `render()`, `renderArchive()`, form modals
- **Event Handling** - Table interactions, file uploads

### Entry Data Model
```javascript
{
  id, date, client, shipTo, order, pallets, carrier, pickupNum,
  scheduledDate, bolProvided, printedByOps, pickupComplete,
  completedDate, qualityCheck, comments, createdBy, bolFile, bolFileName
}
```

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

### CSS
- Tailwind utility classes throughout
- Custom `@keyframes` for loading spinner only
- Responsive grid layouts (`grid-cols-2`, `md:grid-cols-4`)

### HTML Templates
- Template literals for dynamic rendering
- Event delegation for table interactions (`bindTableEvents()`)

## Important Notes for AI Assistants

### DO NOT modify:
- `CONFIG.SCRIPT_URL` - Connected to production Google Apps Script
- `CONFIG.SPREADSHEET_ID` - Production data source
- Client/Carrier lists without explicit user request

### When adding features:
- Keep everything in `index.html` - do not split into separate files
- Use Tailwind classes for styling
- Follow existing patterns for state management and rendering
- Maintain optimistic UI updates (update local state, then sync to backend)

### Testing considerations:
- No test framework exists
- Manual browser testing required
- Backend changes require editing the Google Apps Script separately

## File Structure

```
daily-pick-log/
├── index.html    # Complete application (HTML + CSS + JS)
├── README.md     # Basic project description
└── CLAUDE.md     # This file
```

## Common Tasks

### Add a new client
Add to the `CLIENTS` array (line 27):
```javascript
const CLIENTS = [
  'Existing Client',
  'New Client Name',  // Add here
  'Other'
];
```

### Add a new carrier
Add to the `CARRIERS` array (line 45):
```javascript
const CARRIERS = [
  'Existing Carrier',
  'New Carrier Name',  // Add here
  'Other(note in comments)'
];
```

### Add a new entry field
1. Add to `emptyForm()` method (line 133)
2. Add to table header in `render()` (line 464)
3. Add to table row template (line 393)
4. Add to `addModal()` and `editModal()` methods
5. Update Google Apps Script backend to handle new field

### Modify auto-archive behavior
Change `CONFIG.AUTO_ARCHIVE_DAYS` (default: 30 days)
