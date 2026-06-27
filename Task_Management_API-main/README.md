# Task Management API

A RESTful Task Management API built using FastAPI, SQLAlchemy, and SQLite.

## Features

- Create Users
- Create Tasks
- Assign Tasks to Users
- Update Task Status
- Set Task Priority
- Manage Due Dates
- Delete Tasks
- View Tasks by User
- Dashboard Statistics
- Interactive Swagger Documentation

## Tech Stack

- Python
- FastAPI
- SQLAlchemy
- SQLite
- Pydantic
- Swagger UI

## Database Design

### Users Table

| Column | Type |
|----------|----------|
| id | Integer |
| name | String |

### Tasks Table

| Column | Type |
|----------|----------|
| id | Integer |
| title | String |
| description | String |
| priority | String |
| status | String |
| due_date | String |
| assigned_user_id | Integer |

Relationship:

One User → Many Tasks

## Installation

Clone the repository:

```bash
git clone <repository-url>
cd Task_Management_API
```

Install dependencies:

```bash
pip install -r requirements.txt
```

Run the application:

```bash
uvicorn app:app --reload
```

## API Documentation

Swagger UI:

http://127.0.0.1:8000/docs

ReDoc:

http://127.0.0.1:8000/redoc

## API Endpoints

### Users

| Method | Endpoint |
|----------|----------|
| POST | /users |
| GET | /users |

### Tasks

| Method | Endpoint |
|----------|----------|
| POST | /tasks |
| GET | /tasks |
| GET | /tasks/{id} |
| PUT | /tasks/{id} |
| DELETE | /tasks/{id} |
| PATCH | /tasks/{id}/assign |

### Dashboard

| Method | Endpoint |
|----------|----------|
| GET | /dashboard |

## Example Workflow

1. Create User
2. Create Task
3. Assign Task
4. Update Task Status
5. View Dashboard

## Sample Task

```json
{
  "title": "Build Login API",
  "description": "Implement JWT Authentication",
  "priority": "High",
  "due_date": "2026-06-30"
}
```

## Learning Outcomes

- REST API Development
- Database Modeling
- CRUD Operations
- FastAPI Framework
- SQLAlchemy ORM
- API Documentation
- Backend Development

