# QueueFree

QueueFree is a campus queue management system designed to reduce long physical waiting lines in school offices. It allows users to generate queue tickets, monitor their queue status in real time, and receive updates when their turn is near.

## Description

QueueFree helps students, staff, and office clients wait more conveniently by allowing them to track queues digitally. Instead of staying physically in line for a long time, users can view their active queue number, estimated waiting time, assigned office, assigned window, and current serving status through the system.

The system also provides staff and admin dashboards for managing queue flow, calling the next ticket, handling priority users, monitoring office activity, and generating reports.

## Features

- User account registration and login
- Role-based access for user, staff, and admin
- Digital queue ticket generation
- Regular and priority lane support
- Real-time queue status updates
- Assigned office and assigned window display
- Staff dashboard for calling, pausing, resuming, and finishing tickets
- Admin dashboard for managing users, staff, offices, and queue records
- Queue reset and queue numbering management
- Summary reports and transaction history
- User activity logs
- CSV export for reports
- AI-assisted predictive analytics for estimated waiting time

## Technologies Used

-React.js
-Firebase Authentication
-Cloud Firestore
-Firebase Security Rules
-JavaScript
-CSS
-jsPDF
-xlsx-js-style
-Git
-GitHub

## Firebase Setup

QueueFree uses Firebase for authentication and database storage.

Firebase services used:

- Firebase Authentication for login and signup
- Cloud Firestore for storing users, queue tickets, departments, staff windows, transactions, reports, and prediction data
- Firebase Security Rules for role-based database access

Main Firestore collections:

- users
- departments
- queue_tickets
- transactions
- staff_windows
- office_prediction_stats
- user_activity_logs
- reports

## User Roles

### User

Users can create an account, generate queue tickets, view their active queue, check their estimated waiting time, and receive queue status updates.

### Staff

Staff members can manage the queue for their assigned office and assigned window. They can call the next ticket, pause a current ticket, resume paused tickets, and finish served tickets.

### Admin

Admins can manage users, staff, offices, queue records, reports, analytics, and system activity logs.

## Installation Steps

Follow these steps to run the project locally.

### 1. Clone the repository

```bash
git clone https://github.com/maxinebelle/queuefree.git
