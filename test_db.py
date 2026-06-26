import sys
import traceback
from datetime import datetime

# Import setup
try:
    from server import Base, engine, DBTask, SessionLocal, _task_to_dict
    print("✅ Successfully imported server modules")
except Exception as e:
    print("❌ Failed to import from server:")
    traceback.print_exc()
    sys.exit(1)

# Test DB operation
try:
    with SessionLocal() as db:
        # 1. Create a dummy task
        print("Attempting to insert a task...")
        task = DBTask(
            title="Test Task",
            description="Testing task assignment",
            assigned_to="anujha",
            assigned_by="ayush",
            meeting_title="Test Meeting",
            due_date="2026-06-30",
            priority="high",
            status="pending",
            created_at=datetime.utcnow().isoformat(),
            updated_at=datetime.utcnow().isoformat(),
        )
        db.add(task)
        db.commit()
        db.refresh(task)
        print(f"✅ Successfully inserted task! ID: {task.id}")
        
        # 2. Serialize
        print("Attempting to serialize...")
        d = _task_to_dict(task)
        print(f"✅ Serialized: {d}")
        
        # 3. Clean up
        print("Cleaning up...")
        db.delete(task)
        db.commit()
        print("✅ Cleanup complete")

except Exception as e:
    print("❌ Database/Serialization error:")
    traceback.print_exc()
