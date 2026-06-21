# Giglance Server Engine 🚀

Backend infrastructure for **Giglance**, a freelance marketplace platform that connects clients with skilled freelancers. This repository provides REST APIs, database management, authentication pipelines, and administrative control mechanisms that power the Giglance ecosystem.

---

## 🛠 Tech Stack

- **Runtime:** Node.js (LTS)
- **Framework:** Express.js
- **Database:** MongoDB
- **Database Driver:** MongoDB Native Driver
- **Data Format:** JSON
- **Authentication:** JWT
- **Environment Management:** dotenv
- **CORS Handling:** cors

---

## 📂 Database Collections Architecture

Database Name:

```txt
giglance
```

### 👤 user
Stores:

- User profile information
- Email and authentication data
- User roles:
  - `freelancer`
  - `client`
  - `admin`
- Suspension state:
  - `isSuspended`

---

### 💼 task

Stores marketplace jobs and task lifecycle states.

#### Task Status

- `open`
- `accepted`
- `On the progress`
- `completed`
- `blocked`

Contains:

- Job title
- Budget
- Category
- Deadline
- Client information
- Task status

---

### 📝 proposals

Stores:

- Freelancer applications
- Bid amount
- Cover letter
- Proposal status
- Freelancer details

---

### ✅ completedTasks

Immutable archive collection used for:

- Finished project history
- Analytics
- Reporting
- Payment records
- Completed deliverables

---

## 🔒 Business Rules & Moderation System

### User Suspension Policy

Admins can suspend users by changing:

```js
isSuspended: true
```

Suspended users cannot access protected resources.

#### Exception

Admin accounts cannot be suspended.

---

### Task Visibility Rules

Admins can:

- Block open tasks
- Unblock blocked tasks

Admins cannot:

- Block accepted tasks
- Block tasks in progress
- Block completed tasks

---

### Delete Protection

Tasks can only be deleted if:

```js
status === "open"
```

Accepted, in-progress, and completed tasks are protected from deletion.

---

# API Endpoints

---

# Freelancer APIs

---

## Get Active Projects

Returns all projects currently assigned to a freelancer.

### Endpoint

```http
GET /api/freelancer/active-projects
```

### Query

```txt
freelancerEmail=email@example.com
```

### Response

```json
[
  {
    "_id": "...",
    "title": "E-Commerce Mobile App",
    "status": "On the progress"
  }
]
```

---

## Submit Project Delivery

Allows freelancers to submit completed project assets.

### Endpoint

```http
POST /api/freelancer/projects/submit
```

### Body

```json
{
  "taskId": "64b0f...",
  "proposalId": "64b1a...",
  "taskTitle": "E-Commerce Mobile App Redesign",
  "clientEmail": "client@company.com",
  "freelancerEmail": "freelancer@giglance.com",
  "submittedLink": "https://github.com/deliverables/repo",
  "message": "Project handoff files delivered successfully."
}
```

---

# Client APIs

---

## Create Task

```http
POST /api/tasks
```

### Body

```json
{
  "title": "Build Portfolio Website",
  "budget": 500,
  "deadline": "2026-07-20",
  "category": "Web Development"
}
```

---

## Get All Tasks

```http
GET /api/tasks
```

---

## Get Single Task

```http
GET /api/tasks/:id
```

---

## Update Task

```http
PATCH /api/tasks/:id
```

---

## Delete Task

Only tasks with status:

```txt
open
```

can be deleted.

```http
DELETE /api/tasks/:id
```

---

# Proposal APIs

---

## Create Proposal

```http
POST /api/proposals
```

### Body

```json
{
  "taskId": "687...",
  "freelancerEmail": "freelancer@gmail.com",
  "bidAmount": 350,
  "coverLetter": "I can complete this project within 5 days."
}
```

---

## Get Proposal By Task

```http
GET /api/proposals/:taskId
```

---

## Accept Proposal

```http
PATCH /api/proposals/accept/:id
```

Updates:

- Proposal status
- Task status

---

# Admin APIs

---

## Suspend User

```http
PATCH /api/admin/suspend/:id
```

Changes:

```js
isSuspended: true
```

---

## Unsuspend User

```http
PATCH /api/admin/unsuspend/:id
```

---

## Block Task

Allowed only when:

```txt
open
```

```http
PATCH /api/admin/tasks/block/:id
```

---

## Unblock Task

```http
PATCH /api/admin/tasks/unblock/:id
```

---

## Delete Task

Allowed only if:

```txt
status = open
```

```http
DELETE /api/admin/tasks/:id
```

---

# Environment Variables

Create a `.env` file:

```env
PORT=5000

DB_USER=your_db_user
DB_PASS=your_db_password

JWT_SECRET=your_secret_key
```

---

# Installation

Clone the repository:

```bash
git clone https://github.com/your-username/giglance-server.git
```

Install dependencies:

```bash
npm install
```

Run development server:

```bash
npm run dev
```

Production:

```bash
npm start
```

---

# Folder Structure

```txt
giglance-server
│
├── index.js
├── package.json
├── .env
│
├── routes
├── middleware
├── utils
├── config
└── README.md
```

---

# Future Enhancements

- Real-time messaging
- Notifications
- Stripe payment integration
- Escrow system
- Admin analytics dashboard
- Ratings and reviews
- Report system
- Email notifications

---

# Author

### Robiul Khan Nayem

Full Stack Developer

---

## Giglance

Connecting clients with talented freelancers worldwide 🌎