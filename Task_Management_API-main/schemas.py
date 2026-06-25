from pydantic import BaseModel


class UserCreate(BaseModel):
    name: str


class UserResponse(BaseModel):
    id: int
    name: str

    class Config:
        from_attributes = True


class TaskCreate(BaseModel):
    title: str
    description: str
    priority: str
    due_date: str


class AssignTask(BaseModel):
    user_id: int


class TaskUpdate(BaseModel):
    title: str
    description: str
    priority: str
    status: str
    due_date: str


class TaskResponse(BaseModel):
    id: int
    title: str
    description: str
    priority: str
    status: str
    due_date: str
    assigned_user_id: int | None = None

    class Config:
        from_attributes = True