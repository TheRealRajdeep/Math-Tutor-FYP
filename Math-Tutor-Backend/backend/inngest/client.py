import os
import inngest

# Create the Inngest client
inngest_client = inngest.Inngest(
    app_id="math_tutor_backend",
    logger=logging.getLogger("uvicorn"),
)


