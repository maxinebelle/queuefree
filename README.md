# QueueFree

QueueFree is a campus queue management system that helps reduce long physical waiting lines in school offices. It allows users to generate digital queue tickets, track their queue status in real time, and receive updates when their turn is near.

## Live Deployment

Live URL:

```text
https://queuefree-six.vercel.app
```

GitHub Repository:

```text
https://github.com/maxinebelle/queuefree
```

## Main Features

- User, staff, and admin login
- Digital queue ticket generation
- Regular and priority lane support
- Real-time queue status tracking
- Assigned office and assigned window display
- Queue position and estimated waiting time
- User notifications and queue history
- Staff queue control: call, pause, resume, and finish tickets
- Admin management for users, staff, offices, tickets, and transactions
- Summary reports, analytics, user activity logs, and transaction history
- PDF and Excel report export
- AI-assisted estimated waiting time

## Technologies Used

- React.js
- Firebase Authentication
- Cloud Firestore
- Firebase Security Rules
- JavaScript
- CSS
- jsPDF
- xlsx-js-style
- Git and GitHub
- Vercel

## User Roles

### User
Users can create an account, generate queue tickets, monitor their queue status, view estimated waiting time, and receive queue updates.

### Staff
Staff can manage queues for their assigned office and window by calling, pausing, resuming, and finishing tickets.

### Admin
Admins can manage users, staff, offices, queue records, priority requests, reports, analytics, and system activity logs.

## Installation

Clone the repository:

```bash
git clone https://github.com/maxinebelle/queuefree.git
```

Open the project folder:

```bash
cd queuefree
```

Install dependencies:

```bash
npm install
```

Run the system locally:

```bash
npm start
```

Local URL:

```text
http://localhost:3000
```

## Build

To check the production build:

```bash
npm run build
```

## Member Pull Instructions

After pulling the latest update:

```bash
git pull origin master
npm install
npm start
```

If there is a missing module error for reports:

```bash
npm install jspdf xlsx-js-style
npm start
```

## Deployment

QueueFree is deployed using Vercel. Future updates can be applied by pushing changes to the `master` branch.

```text
Edit code → Commit changes → Push to GitHub → Vercel redeploys automatically
```

## Team Members

- Lariba, Marie Belle
- Amahan, Glyka Marie
- Seno, Ma. Jodelyn
- Dusaran, Celine Kaye