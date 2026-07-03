from fastapi import FastAPI, Depends, HTTPException
from sqlalchemy.orm import Session
from database import SessionLocal, engine, Base
from models import User, Task
from schemas import (
    UserCreate,
    TaskCreate,
    AssignTask,
    TaskUpdate,
    UserResponse,
    TaskResponse
)

# Create tables
Base.metadata.create_all(bind=engine)

app = FastAPI(
    title="Task Management API",
    description="Task Assignment and Tracking System",
    version="1.0.0"
)


# Database Dependency
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()



# USER APIs
@app.post("/users", response_model=UserResponse)
def create_user(
    user: UserCreate,
    db: Session = Depends(get_db)
):
    existing_user = (
        db.query(User)
        .filter(User.name == user.name)
        .first()
    )

    if existing_user:
        raise HTTPException(
            status_code=400,
            detail="User already exists"
        )

    new_user = User(
        name=user.name
    )

    db.add(new_user)
    db.commit()
    db.refresh(new_user)

    return new_user


@app.get("/users", response_model=list[UserResponse])
def get_users(
    db: Session = Depends(get_db)
):
    return db.query(User).all()



# TASK APIs
@app.post("/tasks", response_model=TaskResponse)
def create_task(
    task: TaskCreate,
    db: Session = Depends(get_db)
):
    new_task = Task(
        title=task.title,
        description=task.description,
        priority=task.priority,
        due_date=task.due_date
    )

    db.add(new_task)
    db.commit()
    db.refresh(new_task)

    return new_task


@app.get("/tasks", response_model=list[TaskResponse])
def get_all_tasks(
    db: Session = Depends(get_db)
):
    return db.query(Task).all()


@app.get("/tasks/{task_id}", response_model=TaskResponse)
def get_task_by_id(
    task_id: int,
    db: Session = Depends(get_db)
):
    task = (
        db.query(Task)
        .filter(Task.id == task_id)
        .first()
    )

    if not task:
        raise HTTPException(
            status_code=404,
            detail="Task not found"
        )

    return task


@app.patch("/tasks/{task_id}/assign")
def assign_task(
    task_id: int,
    data: AssignTask,
    db: Session = Depends(get_db)
):
    task = (
        db.query(Task)
        .filter(Task.id == task_id)
        .first()
    )

    if not task:
        raise HTTPException(
            status_code=404,
            detail="Task not found"
        )

    user = (
        db.query(User)
        .filter(User.id == data.user_id)
        .first()
    )

    if not user:
        raise HTTPException(
            status_code=404,
            detail="User not found"
        )

    task.assigned_user_id = user.id

    db.commit()
    db.refresh(task)

    return {
        "message": f"Task assigned to {user.name}",
        "task_id": task.id,
        "assigned_user_id": user.id
    }


@app.put("/tasks/{task_id}")
def update_task(
    task_id: int,
    updated_task: TaskUpdate,
    db: Session = Depends(get_db)
):
    task = (
        db.query(Task)
        .filter(Task.id == task_id)
        .first()
    )

    if not task:
        raise HTTPException(
            status_code=404,
            detail="Task not found"
        )

    task.title = updated_task.title
    task.description = updated_task.description
    task.priority = updated_task.priority
    task.status = updated_task.status
    task.due_date = updated_task.due_date

    db.commit()
    db.refresh(task)

    return {
        "message": "Task updated successfully"
    }


@app.get("/users/{user_id}/tasks")
def get_tasks_by_user(
    user_id: int,
    db: Session = Depends(get_db)
):
    user = (
        db.query(User)
        .filter(User.id == user_id)
        .first()
    )

    if not user:
        raise HTTPException(
            status_code=404,
            detail="User not found"
        )

    tasks = (
        db.query(Task)
        .filter(Task.assigned_user_id == user_id)
        .all()
    )

    return {
        "user": user.name,
        "tasks": tasks
    }


@app.get("/tasks/status/{status}")
def get_tasks_by_status(
    status: str,
    db: Session = Depends(get_db)
):
    tasks = (
        db.query(Task)
        .filter(Task.status == status)
        .all()
    )

    return tasks


@app.get("/tasks/priority/{priority}")
def get_tasks_by_priority(
    priority: str,
    db: Session = Depends(get_db)
):
    tasks = (
        db.query(Task)
        .filter(Task.priority == priority)
        .all()
    )

    return tasks


@app.delete("/tasks/{task_id}")
def delete_task(
    task_id: int,
    db: Session = Depends(get_db)
):
    task = (
        db.query(Task)
        .filter(Task.id == task_id)
        .first()
    )

    if not task:
        raise HTTPException(
            status_code=404,
            detail="Task not found"
        )

    db.delete(task)
    db.commit()

    return {
        "message": "Task deleted successfully"
    }



# DASHBOARD API
@app.get("/dashboard")
def dashboard(
    db: Session = Depends(get_db)
):
    total_tasks = db.query(Task).count()

    todo_tasks = (
        db.query(Task)
        .filter(Task.status == "To Do")
        .count()
    )

    in_progress_tasks = (
        db.query(Task)
        .filter(Task.status == "In Progress")
        .count()
    )

    completed_tasks = (
        db.query(Task)
        .filter(Task.status == "Done")
        .count()
    )

    total_users = db.query(User).count()

    return {
        "total_users": total_users,
        "total_tasks": total_tasks,
        "todo_tasks": todo_tasks,
        "in_progress_tasks": in_progress_tasks,
        "completed_tasks": completed_tasks
    }
