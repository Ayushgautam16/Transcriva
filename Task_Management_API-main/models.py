from sqlalchemy import Column, Integer, String, ForeignKey
from sqlalchemy.orm import relationship

from database import Base


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True, nullable=False)

    tasks = relationship(
        "Task",
        back_populates="user"
    )


class Task(Base):
    __tablename__ = "tasks"

    id = Column(Integer, primary_key=True, index=True)

    title = Column(String, nullable=False)
    description = Column(String)

    priority = Column(String, default="Medium")
    status = Column(String, default="To Do")
    due_date = Column(String)

    assigned_user_id = Column(
        Integer,
        ForeignKey("users.id"),
        nullable=True
    )

    user = relationship(
        "User",
        back_populates="tasks"
    )