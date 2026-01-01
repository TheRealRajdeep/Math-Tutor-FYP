import inngest
import logging
from .client import inngest_client
from services.mock_test_service import (
    generate_entry_mock_test_for_user,
    generate_scheduled_test_for_batch
)

logger = logging.getLogger(__name__)

# 1. Hello World (Test function)
@inngest_client.create_function(
    fn_id="hello-world",  # Use fn_id
    trigger=inngest.TriggerEvent(event="test/hello.world")
)
async def hello_world(ctx: inngest.Context):
    return {"message": "Hello from Inngest!"}

# 2. Entry Level Mock Test Trigger
@inngest_client.create_function(
    fn_id="generate-entry-test",
    trigger=inngest.TriggerEvent(event="user/signed_up"),
)
async def generate_entry_test_function(ctx: inngest.Context):
    """
    Triggered when a user signs up.
    Generates their entry-level mock test.
    """
    # Access event data from ctx
    user_id = ctx.event.data.get("user_id")
    
    if not user_id:
        return {"status": "skipped", "reason": "No user_id provided"}

    # Use ctx.step.run to ensure reliability
    # It is recommended to pass a named function or a lambda
    result = await ctx.step.run(
        "generate-test-db", 
        lambda: generate_entry_mock_test_for_user(user_id)
    )
    
    return {"status": "success", "test_id": result}

# 3. Scheduled Weekly Mock Tests
@inngest_client.create_function(
    fn_id="schedule-weekly-mock",
    trigger=inngest.TriggerCron(cron="0 9 * * 0"),
)
async def schedule_weekly_mock_function(ctx: inngest.Context):
    """
    Runs automatically every Sunday at 9:00 AM.
    """
    logger.info("Starting weekly mock test generation...")
    
    created_ids = await ctx.step.run(
        "generate-batch-tests", 
        lambda: generate_scheduled_test_for_batch()
    )
    
    # Ensure created_ids is iterable before len() if the service might return None
    count = len(created_ids) if created_ids else 0
    return {"status": "success", "count": count}

# List of functions to register in your serve handler (e.g., FastAPI, Flask)
inngest_functions = [
    hello_world,
    generate_entry_test_function,
    schedule_weekly_mock_function
]
