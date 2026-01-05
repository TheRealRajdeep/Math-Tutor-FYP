import os
import inngest

# Create the Inngest client
inngest_client = inngest.Inngest(
    app_id="math_tutor_backend",
    signing_key=os.getenv("INNGEST_SIGNING_KEY"),
    event_key=os.getenv("INNGEST_EVENT_KEY"),
)

